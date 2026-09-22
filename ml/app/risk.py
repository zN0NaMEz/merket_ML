"""โมเดลทำนายความเสี่ยงค้างชำระ (Binary Classification)

label = 1 ถ้าบิลนั้นถูกชำระหลังวันครบกำหนด (หรือยังไม่ชำระและเลยกำหนดแล้ว)
เทรน 2 โมเดลเพื่อเปรียบเทียบ: Logistic Regression และ Random Forest
"""
from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from . import db
from .features import CATEGORICAL, FEATURE_LABELS, NUMERIC, SEASONS, TYPE_CODES, risk_features, risk_reasons

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
            f = risk_features(b["since"], b["type_code"], bills[:i], b)
            f.update(bill_id=b["id"], label=label)
            records.append(f)
    return pd.DataFrame.from_records(records)


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


def train() -> dict:
    df = build_dataset()
    if len(df) < 40 or df["label"].nunique() < 2:
        raise RuntimeError(f"ข้อมูลไม่พอสำหรับเทรน (มี {len(df)} แถว)")
    X, y = df[NUMERIC + CATEGORICAL], df["label"].to_numpy()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, stratify=y, random_state=42)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    results, final = {}, {}
    for name, pipe in _make_models().items():
        pipe.fit(X_tr, y_tr)
        p = pipe.predict_proba(X_te)[:, 1]
        pred = (p >= 0.5).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_te, pred, labels=[0, 1]).ravel()
        cv_auc = cross_val_score(_make_models()[name], X, y, cv=cv, scoring="roc_auc")
        names = _feature_names(pipe)
        if name == "lr":
            weights = pipe.named_steps["clf"].coef_[0]
        else:
            weights = pipe.named_steps["clf"].feature_importances_
        results[name] = {
            "accuracy": float(accuracy_score(y_te, pred)),
            "precision": float(precision_score(y_te, pred, zero_division=0)),
            "recall": float(recall_score(y_te, pred, zero_division=0)),
            "f1": float(f1_score(y_te, pred, zero_division=0)),
            "auc": float(roc_auc_score(y_te, p)),
            "cv_auc_mean": float(cv_auc.mean()),
            "cv_auc_std": float(cv_auc.std()),
            "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
            "weights": [{"feature": n, "label": FEATURE_LABELS.get(n, n), "value": float(w)} for n, w in zip(names, weights)],
        }
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
    }
    joblib.dump(final, MODEL_PATH)
    with open(METRICS_PATH, "w", encoding="utf-8") as fh:
        json.dump(metrics, fh, ensure_ascii=False, indent=2)
    _cache["models"] = final
    _cache["metrics"] = metrics
    db.save_model_run("risk", metrics)
    return metrics


def _ensure():
    if "models" in _cache:
        return
    if os.path.exists(MODEL_PATH) and os.path.exists(METRICS_PATH):
        _cache["models"] = joblib.load(MODEL_PATH)
        with open(METRICS_PATH, encoding="utf-8") as fh:
            _cache["metrics"] = json.load(fh)
    else:
        train()


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
    probs = pipe.predict_proba(df[NUMERIC + CATEGORICAL])[:, 1]
    out = []
    for f, p in zip(feats, probs):
        clean = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in f.items() if k != "bill_id"}
        out.append({"bill_id": int(f["bill_id"]), "score": float(np.round(p, 4)), "features": clean, "reasons": risk_reasons(f)})
    return out
