"""โมเดลทำนายความเสี่ยงค้างชำระ (Binary Classification)

label = 1 ถ้าบิลนั้นถูกชำระหลังวันครบกำหนด (หรือยังไม่ชำระและเลยกำหนดแล้ว)
เทรน 2 โมเดลเพื่อเปรียบเทียบ: Logistic Regression และ Random Forest
"""
from __future__ import annotations

import io as _io
import json
import math
import os
from collections import defaultdict
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, ClassifierMixin, clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import calibration_curve
from sklearn.inspection import permutation_importance
from sklearn.metrics import (accuracy_score, brier_score_loss, confusion_matrix, f1_score, precision_score,
                             recall_score, roc_auc_score)
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from . import db
from . import explain as xp
from .features import (BEHAVIOR, CATEGORICAL, FEATURE_LABELS, NUMERIC, SEASONS, TYPE_CODES, input_features, risk_features,
                       risk_reasons)

CALIBRATION_BINS = 10   # ช่องละ 10% ของความน่าจะเป็น (reliability diagram)

MODEL_PATH = os.path.join(db.MODEL_DIR, "risk.joblib")
METRICS_PATH = os.path.join(db.MODEL_DIR, "risk_metrics.json")
_cache: dict = {}

# seen_at = ผู้ค้าเปิดดูบิลครั้งแรก · channel: เงินสดที่สำนักงาน หรือจ่ายผ่านแอป (PromptPay) จากรายการชำระของบิล
BILL_SQL = """
SELECT b.id, b.vendor_id, b.period, b.total, b.credit_used, b.issue_date, b.due_date, b.paid_date, b.status,
       (b.seen_at AT TIME ZONE 'Asia/Bangkok')::date AS seen_at,
       CASE WHEN p.provider = 'cash' THEN 'cash' WHEN p.provider IS NOT NULL THEN 'app' END AS channel,
       v.since, s.type_code
FROM bills b
JOIN vendors v ON v.id = b.vendor_id
JOIN stalls s ON s.id = b.stall_id
LEFT JOIN payments p ON p.id = b.payment_id
WHERE b.kind = 'monthly' AND b.status <> 'cancelled' {where}
ORDER BY b.vendor_id, b.period
"""


def _load_bills(vendor_ids: list[int] | None = None) -> dict[int, list[dict]]:
    if vendor_ids:
        rows = db.fetch_all(BILL_SQL.format(where="AND b.vendor_id = ANY(%s)"), (vendor_ids,))
    else:
        rows = db.fetch_all(BILL_SQL.format(where=""))
    by_vendor: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        by_vendor[r["vendor_id"]].append(r)
    return by_vendor


def build_dataset(by_vendor: dict | None = None, today=None) -> pd.DataFrame:
    """ชุดข้อมูลเทรน: หนึ่งแถวต่อบิลที่รู้ผลแล้ว
    by_vendor/today ส่งมาได้เพื่อใช้กับข้อมูลจำลอง (app.synthetic) ผ่านขั้นตอนติดป้ายเดียวกันทุกประการ
    """
    today = today or db.today()
    records = []
    for bills in (by_vendor if by_vendor is not None else _load_bills()).values():
        for i in range(1, len(bills)):
            b = bills[i]
            if b["paid_date"] is not None:
                label = int(b["paid_date"] > b["due_date"])
            elif today > b["due_date"]:
                label = 1
            else:
                continue  # ยังไม่ครบกำหนด ไม่รู้ผลจริง จึงไม่นำมาเทรน
            # ฟีเจอร์คิด ณ วันออกบิลเท่านั้น (days_late_as_of ใช้ issue_date) จึงไม่มีข้อมูลหลังวันครบกำหนดรั่วเข้ามา
            f = risk_features(b["since"], b["type_code"], bills[:i], b)
            f.update(bill_id=b["id"], label=label, due=b["due_date"])
            records.append(f)
    return pd.DataFrame.from_records(records)


def _calibration(y_true, prob) -> dict:
    """reliability diagram: แบ่งความน่าจะเป็นเป็นช่องเท่ากัน แล้วเทียบค่าเฉลี่ยที่ทาย กับสัดส่วนที่จ่ายช้าจริง"""
    prob_true, prob_pred = calibration_curve(y_true, prob, n_bins=CALIBRATION_BINS, strategy="uniform")
    edges = np.linspace(0.0, 1.0, CALIBRATION_BINS + 1)
    counts = np.bincount(np.searchsorted(edges[1:-1], prob), minlength=CALIBRATION_BINS)
    return {
        "strategy": "uniform", "n_bins": CALIBRATION_BINS,
        "prob_pred": [round(float(v), 4) for v in prob_pred],
        "prob_true": [round(float(v), 4) for v in prob_true],
        "counts": [int(c) for c in counts if c > 0],          # ช่องว่างถูกตัดออกเหมือน calibration_curve
        "brier": round(float(brier_score_loss(y_true, prob)), 4),
    }


def _preprocessor() -> ColumnTransformer:
    return ColumnTransformer([
        ("num", StandardScaler(), NUMERIC),
        ("cat", OneHotEncoder(categories=[TYPE_CODES, SEASONS], handle_unknown="ignore"), CATEGORICAL),
    ])


# ค่าพารามิเตอร์ RF เลือกจากการค้นหาบนข้อมูลจำลอง 11 ชุด + ข้อมูลสาธิต แล้วยืนยันด้วย CV 5×3 คนละ seed
# (ลึก 10, ใบละ ≥ 10 แถว): AUC ดีขึ้นเฉลี่ย +0.0045 ใน 9/12 ชุด, t ข้ามชุด = 2.95 (df 11)  ค่าเดิมคือ ลึก 6, ใบละ ≥ 4
# LR คง C=1.0: ค่า C อื่น ๆ (0.03–10) ไม่ต่างอย่างมีนัยสำคัญ (C=0.1: +0.003, t = 1.25)
RF_PARAMS = {"n_estimators": 300, "max_depth": 10, "min_samples_leaf": 10, "max_features": "sqrt"}
# Extra Trees ใช้ขนาดต้นไม้เดียวกับ RF · Gradient Boosting เลือกจากตาราง 16 ค่าบน seed 11 (ลึก 3, เรียน 0.03, 100 รอบ, ใบ ≥ 20)
ET_PARAMS = {"n_estimators": 300, "max_depth": 10, "min_samples_leaf": 10, "max_features": "sqrt"}
GB_PARAMS = {"max_depth": 3, "learning_rate": 0.03, "max_iter": 100, "min_samples_leaf": 20, "l2_regularization": 1.0,
             "early_stopping": False}
# ผลยืนยันบน seed 7 (CV 5×3, 12 ชุด) AUC เฉลี่ย: LR 0.707 · RF 0.748 · ET 0.732 · GB 0.735 · รวม (LR+RF+GB) 0.751
# ไม่มีตัวใดดีกว่า RF อย่างมีนัยสำคัญ (โมเดลรวม +0.002, t = 0.66) แต่โมเดลรวมดีกว่า RF ใน 8/12 ชุด
# และด้อยกว่าการ "เลือกตัวที่ดีกว่าของ LR/RF ให้ถูกทุกชุด" เพียง 0.006 จึงเหมาะเมื่อไม่แน่ใจว่าข้อมูลเป็นแบบไหน
# ข้อมูลหลักร้อยถึงพันแถว การแตกเธรดเสียเวลามากกว่าที่ได้ (RF ทายช้าลง 4 เท่าเมื่อ n_jobs=-1 บนเครื่อง 20 คอร์)
# และ Render แพลนฟรีมีแค่ 0.1 CPU จึงใช้เธรดเดียว ผลเหมือนเดิมทุกประการเพราะ random_state คงที่
N_JOBS = 1
BASE_MODELS = ("lr", "rf", "et", "gb")
ENSEMBLE_OF = ("lr", "rf", "gb")
MODEL_KEYS = BASE_MODELS + ("ens",)


class MeanEnsemble(ClassifierMixin, BaseEstimator):
    """โมเดลรวม: ความน่าจะเป็น = ค่าเฉลี่ยของสมาชิก (soft voting น้ำหนักเท่ากัน)
    members = [(ชื่อ, โมเดล)] · fit() เทรนสำเนาของสมาชิกทุกตัว · from_fitted() ใช้สมาชิกที่เทรนแล้วโดยไม่เทรนซ้ำ
    """

    def __init__(self, members=None):
        self.members = members

    def fit(self, X, y):
        self.members_ = [(n, clone(m).fit(X, y)) for n, m in self.members]
        self.classes_ = self.members_[0][1].classes_
        return self

    @classmethod
    def from_fitted(cls, fitted: dict) -> "MeanEnsemble":
        ens = cls(members=[(n, fitted[n]) for n in ENSEMBLE_OF])
        ens.members_ = list(ens.members)
        ens.classes_ = fitted[ENSEMBLE_OF[0]].classes_
        return ens

    def predict_proba(self, X):
        return np.mean([m.predict_proba(X) for _, m in self.members_], axis=0)

    def predict(self, X):
        return self.classes_[(self.predict_proba(X)[:, 1] >= 0.5).astype(int)]


def _make_models() -> dict[str, Pipeline]:
    """โมเดลพื้นฐานที่ยังไม่ได้เทรน (โมเดลรวมสร้างจากสมาชิกในชุดนี้ ดู _ensemble())"""
    return {
        "lr": Pipeline([("pre", _preprocessor()), ("clf", LogisticRegression(max_iter=2000, C=1.0))]),
        "rf": Pipeline([("pre", _preprocessor()), ("clf", RandomForestClassifier(**RF_PARAMS, random_state=42, n_jobs=N_JOBS))]),
        "et": Pipeline([("pre", _preprocessor()), ("clf", ExtraTreesClassifier(**ET_PARAMS, random_state=42, n_jobs=N_JOBS))]),
        "gb": Pipeline([("pre", _preprocessor()), ("clf", HistGradientBoostingClassifier(**GB_PARAMS, random_state=42))]),
    }


def _ensemble() -> MeanEnsemble:
    """โมเดลรวมแบบยังไม่ได้เทรน ใช้กับ benchmark / cross_validate"""
    base = _make_models()
    return MeanEnsemble(members=[(n, base[n]) for n in ENSEMBLE_OF])


def _cols(pipe) -> list[str]:
    """คอลัมน์ที่โมเดลเทรนมา: โมเดลรุ่นก่อนเพิ่มปัจจัยพฤติกรรมรู้จักแค่ 4 ตัวเลข ต้องส่งให้ตรงจนกว่าจะเทรนใหม่"""
    if isinstance(pipe, MeanEnsemble):
        pipe = pipe.members_[0][1]
    names = getattr(pipe, "feature_names_in_", None)
    return list(names) if names is not None else NUMERIC + CATEGORICAL


def _fit_all(X, y) -> dict:
    """เทรนโมเดลพื้นฐานทุกตัวครั้งเดียว แล้วประกอบโมเดลรวมจากสมาชิกที่เทรนแล้ว"""
    fitted = {k: m.fit(X, y) for k, m in _make_models().items()}
    fitted["ens"] = MeanEnsemble.from_fitted(fitted)
    return fitted


def _weights(name: str, pipe, importance: list[dict]) -> list[dict]:
    """น้ำหนักที่หน้า AI วาดเป็นแท่ง: LR = สัมประสิทธิ์ (มีทิศ) · RF/ET = feature_importances_
    GB และโมเดลรวมไม่มีค่าในตัว ใช้ permutation importance ของปัจจัยเดิมแทน"""
    if name == "lr":
        pairs = zip(_feature_names(pipe), pipe.named_steps["clf"].coef_[0])
    elif name in ("rf", "et"):
        pairs = zip(_feature_names(pipe), pipe.named_steps["clf"].feature_importances_)
    else:
        pairs = ((g["feature"], g["value"]) for g in importance)
    return [{"feature": n, "label": FEATURE_LABELS.get(n, n), "value": float(w)} for n, w in pairs]


def _feature_names(pipe: Pipeline) -> list[str]:
    raw = pipe.named_steps["pre"].get_feature_names_out()
    return [n.split("__", 1)[1] for n in raw]


def train(triggered_by: str | None = None) -> dict:
    df = build_dataset()
    if len(df) < 40 or df["label"].nunique() < 2:
        raise RuntimeError(f"ข้อมูลไม่พอสำหรับเทรน (มี {len(df)} แถว)")
    X, y = df[NUMERIC + CATEGORICAL], df["label"].to_numpy()
    # ส่ง index ของแถวเข้าไปด้วยเพื่อรู้ว่าบิลไหนอยู่ในชุดทดสอบ (การแบ่งยังเหมือนเดิมทุกประการ)
    X_tr, X_te, y_tr, y_te, _, idx_te = train_test_split(
        X, y, df.index.to_numpy(), test_size=0.25, stratify=y, random_state=42)
    # 5-fold CV: เทรนโมเดลพื้นฐานแต่ละตัวครั้งเดียวต่อพับ โมเดลรวมใช้ค่าเฉลี่ยของสมาชิกในพับเดียวกัน (ไม่ต้องเทรนซ้ำ)
    # ทุกโมเดลใช้พับชุดเดียวกัน จึงเทียบรายพับแบบจับคู่ได้ · ตัดสินที่ 0.5 แบบเดียวกับชุดทดสอบ
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = {k: {"auc": [], "precision": [], "recall": [], "accuracy": []} for k in MODEL_KEYS}
    for tr, te in cv.split(X, y):
        fold = _fit_all(X.iloc[tr], y[tr])
        for name in MODEL_KEYS:
            p = fold[name].predict_proba(X.iloc[te])[:, 1]
            pred = (p >= 0.5).astype(int)
            s = cv_scores[name]
            s["auc"].append(round(float(roc_auc_score(y[te], p)), 4))
            s["precision"].append(round(float(precision_score(y[te], pred, zero_division=0)), 4))
            s["recall"].append(round(float(recall_score(y[te], pred, zero_division=0)), 4))
            s["accuracy"].append(round(float(accuracy_score(y[te], pred)), 4))
    held = _fit_all(X_tr, y_tr)
    # หลังประเมินผลแล้ว เทรนใหม่ด้วยข้อมูลทั้งหมดเพื่อใช้งานจริง
    final = _fit_all(X, y)
    results, probs, extra = {}, {}, {}
    for name in MODEL_KEYS:
        pipe = held[name]
        p = pipe.predict_proba(X_te)[:, 1]
        probs[name] = p
        pred = (p >= 0.5).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_te, pred, labels=[0, 1]).ravel()
        cv_auc = np.asarray(cv_scores[name]["auc"])
        # ความสำคัญระดับโมเดล: สลับค่าของปัจจัยทีละตัวในชุดทดสอบ แล้วดูว่า AUC ตกลงเท่าไร (เทียบได้ทุกโมเดล)
        perm = permutation_importance(pipe, X_te, y_te, scoring="roc_auc", n_repeats=10, random_state=42)
        importance = sorted(
            [{"feature": f, "value": round(float(m), 4), "std": round(float(s), 4)}
             for f, m, s in zip(NUMERIC + CATEGORICAL, perm.importances_mean, perm.importances_std)],
            key=lambda d: d["value"], reverse=True)
        confusion = {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp), "threshold": 0.5}
        calibration = _calibration(y_te, p)
        results[name] = {
            "accuracy": float(accuracy_score(y_te, pred)),
            "precision": float(precision_score(y_te, pred, zero_division=0)),
            "recall": float(recall_score(y_te, pred, zero_division=0)),
            "f1": float(f1_score(y_te, pred, zero_division=0)),
            "auc": float(roc_auc_score(y_te, p)),
            "cv_auc_mean": float(cv_auc.mean()),
            # SD แบบตัวอย่าง (ddof=1) ให้ตรงกับที่ API คำนวณจากผลรายพับใน cv_scores
            "cv_auc_std": float(cv_auc.std(ddof=1)),
            "confusion": confusion,
            "weights": _weights(name, final[name], importance),
            "importance": importance,
        }
        extra[name] = {"cv_scores": cv_scores[name], "confusion": confusion, "calibration": calibration,
                       "global_importance": importance}
    metrics = {
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "as_of": db.today().isoformat(),
        "n_samples": int(len(df)),
        "n_train": int(len(X_tr)),
        "n_test": int(len(X_te)),
        "late_rate": float(y.mean()),
        "features": NUMERIC + CATEGORICAL,
        # ค่าเฉลี่ยของปัจจัยพฤติกรรมในข้อมูลเทรน ใช้แทนช่องที่เว้นว่างในหน้า "ทำนายจากไฟล์"
        "feature_means": {k: round(float(X[k].mean()), 4) for k in BEHAVIOR},
        # โปรไฟล์ของข้อมูลจำลอง (realistic / clear) ให้หน้าเว็บติดป้ายได้ถูก · ข้อมูลจริงเป็น None
        "sim_profile": db.sim_profile(),
        "models": results,
        # จุดอ้างอิงของ linear contributions (ค่าเฉลี่ยของข้อมูลเทรนหลังแปลง) เก็บไว้กับโมเดล ไม่ต้องคำนวณใหม่ตอนให้คะแนน
        "explain": {"lr_mean": xp.transformed_mean(final["lr"], X)},
    }
    # คะแนนของบิลในชุดทดสอบ (บิลที่โมเดลไม่เคยเห็นตอนเทรน) พร้อมผลจริงและเหตุผล
    # หน้าเว็บใช้คำนวณว่าถ้าเลื่อนเกณฑ์แล้วจะเตือนกี่ราย ถูกกี่ราย และยกเป็นตัวอย่างให้ดู
    metrics["test"] = [
        {
            "bill_id": int(df.at[i, "bill_id"]),
            "y": int(y_te[k]),
            # ปัดลงเสมอ คะแนนจึงไม่มีทางถูกปัดข้ามเกณฑ์ที่มีทศนิยมไม่เกิน 4 ตำแหน่ง
            **{name: math.floor(float(probs[name][k]) * 10000) / 10000 for name in probs},
            "reasons": risk_reasons(df.loc[i].to_dict()),
        }
        for k, i in enumerate(idx_te)
    ]
    # เขียนไฟล์หลังใส่ "test" แล้ว: ถ้าเขียนก่อน พอ ML รีสตาร์ทแล้วโหลดจากดิสก์ หน้า AI จะไม่มีตัวอย่างและขึ้นว่าต้องเทรนใหม่
    joblib.dump(final, MODEL_PATH)
    with open(METRICS_PATH, "w", encoding="utf-8") as fh:
        json.dump(metrics, fh, ensure_ascii=False, indent=2)
    _cache["models"] = final
    _cache["metrics"] = metrics
    # หนึ่งแถวต่อหนึ่งโมเดล (risk_lr, risk_rf, risk_et, risk_gb, risk_ens) พร้อมรายละเอียดสำหรับหน้าเบื้องหลัง AI
    common = {k: v for k, v in metrics.items() if k not in ("test", "models", "explain")}
    synthetic = db.is_synthetic()
    for name in results:
        db.save_model_run(
            f"risk_{name}", {**common, **results[name]},
            n_train=int(len(X_tr)), n_test=int(len(X_te)),
            data_from=min(df["due"]), data_to=max(df["due"]), is_synthetic=synthetic,
            triggered_by=triggered_by, **extra[name])
    # เก็บลงฐานข้อมูลด้วย เผื่อรันบนโฮสต์ที่ดิสก์หายเมื่อรีสตาร์ท
    try:
        buf = _io.BytesIO()
        joblib.dump(final, buf)
        db.save_model_blob("risk", buf.getvalue(), metrics)
    except Exception as e:                            # เก็บไม่ได้ก็ไม่ควรทำให้การเทรนล้ม
        print(f"[risk] เก็บโมเดลลงฐานข้อมูลไม่สำเร็จ: {e}", flush=True)
    return metrics


def _ensure():
    if "models" in _cache:
        return
    if os.path.exists(MODEL_PATH) and os.path.exists(METRICS_PATH):
        _cache["models"] = joblib.load(MODEL_PATH)
        with open(METRICS_PATH, encoding="utf-8") as fh:
            _cache["metrics"] = json.load(fh)
        return
    stored = db.load_model_blob("risk")               # ไม่มีไฟล์บนดิสก์ ลองหยิบจากฐานข้อมูลก่อน
    if stored:
        payload, meta = stored
        _cache["models"] = joblib.load(_io.BytesIO(payload))
        _cache["metrics"] = meta
        joblib.dump(_cache["models"], MODEL_PATH)     # แคชลงดิสก์ไว้ใช้รอบถัดไปของอินสแตนซ์นี้
        with open(METRICS_PATH, "w", encoding="utf-8") as fh:
            json.dump(meta, fh, ensure_ascii=False)
        return
    train(triggered_by="อัตโนมัติ (ยังไม่มีโมเดลที่เทรนไว้)")


def _lr_mean() -> list[float] | None:
    """จุดอ้างอิงของ linear contributions: เก็บมากับโมเดลรุ่นใหม่ ถ้าเป็นโมเดลรุ่นเก่าคำนวณจากข้อมูลเทรนครั้งเดียวแล้วจำไว้"""
    m = _cache.get("metrics", {}).get("explain", {}).get("lr_mean")
    if m is None and "lr_mean" not in _cache:
        df = build_dataset()
        lr = _cache["models"]["lr"]
        _cache["lr_mean"] = xp.transformed_mean(lr, df[_cols(lr)]) if len(df) else None
    return m if m is not None else _cache.get("lr_mean")


def metrics() -> dict:
    _ensure()
    return _cache["metrics"]


def available() -> list[str]:
    """โมเดลที่มีอยู่จริงในชุดที่โหลดไว้ (โมเดลที่เทรนก่อนเพิ่มตัวเลือกใหม่มีแค่ lr, rf จนกว่าจะเทรนใหม่)"""
    _ensure()
    return [k for k in MODEL_KEYS if k in _cache["models"]]


def _pipe(model: str):
    _ensure()
    pipe = _cache["models"].get(model)
    if pipe is None:
        raise RuntimeError(f"ยังไม่มีโมเดล {model} ในชุดที่เทรนไว้ กดเทรนโมเดลใหม่หนึ่งครั้งก่อน")
    return pipe


def _explain(name: str, pipe, X, feats: list[dict]):
    gi = _cache["metrics"].get("models", {}).get(name, {}).get("importance")
    return xp.explain(name, pipe, X, feats, mean_z=_lr_mean() if name in ("lr", "ens") else None, global_importance=gi)


def predict_rows(rows: list[dict]) -> dict:
    """ทำนายจากค่าที่เจ้าหน้าที่อัปโหลด (ไม่มีในฐานข้อมูล และไม่บันทึกลงที่ใด)
    คืนคะแนนของทุกโมเดลที่มี พร้อมเหตุผลและคำอธิบายรายแถวของแต่ละโมเดล หน้าเว็บสลับดูโมเดลได้โดยไม่ต้องเรียกซ้ำ
    """
    models = available()
    feats = [input_features(r, _cache["metrics"].get("feature_means")) for r in rows]
    df = pd.DataFrame.from_records(feats)
    scores, contribs, meta = {}, {}, {}
    for name in models:
        pipe = _cache["models"][name]
        X = df[_cols(pipe)]
        scores[name] = pipe.predict_proba(X)[:, 1]
        contribs[name], meta[name] = _explain(name, pipe, X, feats)
    results = []
    for i, f in enumerate(feats):
        results.append({
            "features": {k: (round(v, 3) if isinstance(v, float) else v) for k, v in f.items()},
            "reasons": risk_reasons(f),
            "scores": {m: round(float(scores[m][i]), 4) for m in models},
            "contributions": {m: contribs[m][i] for m in models},
        })
    return {"models": models, "explain": meta, "results": results}


def score(bill_ids: list[int], model: str = "lr") -> list[dict]:
    pipe = _pipe(model)
    targets = db.fetch_all("SELECT id, vendor_id FROM bills WHERE id = ANY(%s)", (bill_ids,))
    if not targets:
        return []
    by_vendor = _load_bills(sorted({t["vendor_id"] for t in targets}))
    wanted = {t["id"] for t in targets}
    feats = []
    for bills in by_vendor.values():
        for i, b in enumerate(bills):
            if b["id"] in wanted:
                f = risk_features(b["since"], b["type_code"], bills[:i], b)
                f["bill_id"] = b["id"]
                feats.append(f)
    if not feats:
        return []
    df = pd.DataFrame.from_records(feats)
    X = df[_cols(pipe)]
    probs = pipe.predict_proba(X)[:, 1]
    # คำอธิบายรายบิลคำนวณตอนให้คะแนนเท่านั้น แล้ว API เก็บลง bills.risk_features (หน้าเว็บไม่ต้องเรียก ML)
    contribs, meta = _explain(model, pipe, X, feats)
    out = []
    for f, p, c in zip(feats, probs, contribs):
        clean = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in f.items() if k != "bill_id"}
        out.append({"bill_id": int(f["bill_id"]), "score": float(np.round(p, 4)), "features": clean,
                    "reasons": risk_reasons(f), "contributions": c, "explain": meta})
    return out
