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
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import calibration_curve
from sklearn.inspection import permutation_importance
from sklearn.metrics import (accuracy_score, brier_score_loss, confusion_matrix, f1_score, precision_score,
                             recall_score, roc_auc_score)
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from . import db
from . import explain as xp
from .features import CATEGORICAL, FEATURE_LABELS, NUMERIC, SEASONS, TYPE_CODES, risk_features, risk_reasons

CALIBRATION_BINS = 10   # ช่องละ 10% ของความน่าจะเป็น (reliability diagram)

MODEL_PATH = os.path.join(db.MODEL_DIR, "risk.joblib")
METRICS_PATH = os.path.join(db.MODEL_DIR, "risk_metrics.json")
_cache: dict = {}

BILL_SQL = """
SELECT b.id, b.vendor_id, b.period, b.total, b.credit_used, b.issue_date, b.due_date, b.paid_date, b.status,
       v.since, s.type_code
FROM bills b
JOIN vendors v ON v.id = b.vendor_id
JOIN stalls s ON s.id = b.stall_id
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


def build_dataset() -> pd.DataFrame:
    today = db.today()
    records = []
    for bills in _load_bills().values():
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


def _make_models() -> dict[str, Pipeline]:
    return {
        "lr": Pipeline([("pre", _preprocessor()), ("clf", LogisticRegression(max_iter=2000, C=1.0))]),
        "rf": Pipeline([("pre", _preprocessor()), ("clf", RandomForestClassifier(
            n_estimators=300, max_depth=6, min_samples_leaf=4, random_state=42, n_jobs=-1))]),
    }


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
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scoring = {"auc": "roc_auc", "precision": "precision", "recall": "recall", "accuracy": "accuracy"}
    results, final, probs, extra = {}, {}, {}, {}
    for name, pipe in _make_models().items():
        pipe.fit(X_tr, y_tr)
        p = pipe.predict_proba(X_te)[:, 1]
        probs[name] = p
        pred = (p >= 0.5).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_te, pred, labels=[0, 1]).ravel()
        cvr = cross_validate(_make_models()[name], X, y, cv=cv, scoring=cv_scoring)
        cv_scores = {k: [round(float(v), 4) for v in cvr[f"test_{k}"]] for k in cv_scoring}
        cv_auc = cvr["test_auc"]
        names = _feature_names(pipe)
        if name == "lr":
            weights = pipe.named_steps["clf"].coef_[0]
        else:
            weights = pipe.named_steps["clf"].feature_importances_
        # ความสำคัญระดับโมเดล: สลับค่าของปัจจัยทีละตัวในชุดทดสอบ แล้วดูว่า AUC ตกลงเท่าไร (เทียบได้ทั้งสองโมเดล)
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
            "weights": [{"feature": n, "label": FEATURE_LABELS.get(n, n), "value": float(w)} for n, w in zip(names, weights)],
            "importance": importance,
        }
        extra[name] = {"cv_scores": cv_scores, "confusion": confusion, "calibration": calibration, "global_importance": importance}
        # หลังประเมินผลแล้ว เทรนใหม่ด้วยข้อมูลทั้งหมดเพื่อใช้งานจริง
        full = _make_models()[name]
        full.fit(X, y)
        final[name] = full
    metrics = {
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "as_of": db.today().isoformat(),
        "n_samples": int(len(df)),
        "n_train": int(len(X_tr)),
        "n_test": int(len(X_te)),
        "late_rate": float(y.mean()),
        "features": NUMERIC + CATEGORICAL,
        "models": results,
        # จุดอ้างอิงของ linear contributions (ค่าเฉลี่ยของข้อมูลเทรนหลังแปลง) เก็บไว้กับโมเดล ไม่ต้องคำนวณใหม่ตอนให้คะแนน
        "explain": {"lr_mean": xp.transformed_mean(final["lr"], X)},
    }
    joblib.dump(final, MODEL_PATH)
    with open(METRICS_PATH, "w", encoding="utf-8") as fh:
        json.dump(metrics, fh, ensure_ascii=False, indent=2)
    _cache["models"] = final
    _cache["metrics"] = metrics
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
    # หนึ่งแถวต่อหนึ่งโมเดล (risk_lr, risk_rf) พร้อมรายละเอียดสำหรับหน้าเบื้องหลัง AI
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
        _cache["lr_mean"] = xp.transformed_mean(_cache["models"]["lr"], df[NUMERIC + CATEGORICAL]) if len(df) else None
    return m if m is not None else _cache.get("lr_mean")


def metrics() -> dict:
    _ensure()
    return _cache["metrics"]


def score(bill_ids: list[int], model: str = "lr") -> list[dict]:
    _ensure()
    pipe = _cache["models"].get(model) or _cache["models"]["lr"]
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
    X = df[NUMERIC + CATEGORICAL]
    probs = pipe.predict_proba(X)[:, 1]
    # คำอธิบายรายบิลคำนวณตอนให้คะแนนเท่านั้น แล้ว API เก็บลง bills.risk_features (หน้าเว็บไม่ต้องเรียก ML)
    name = model if model in _cache["models"] else "lr"
    gi = _cache["metrics"].get("models", {}).get(name, {}).get("importance")
    contribs, meta = xp.explain(name, pipe, X, feats, mean_z=_lr_mean() if name == "lr" else None, global_importance=gi)
    out = []
    for f, p, c in zip(feats, probs, contribs):
        clean = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in f.items() if k != "bill_id"}
        out.append({"bill_id": int(f["bill_id"]), "score": float(np.round(p, 4)), "features": clean,
                    "reasons": risk_reasons(f), "contributions": c, "explain": meta})
    return out
