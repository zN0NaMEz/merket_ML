"""อธิบายว่าทำไมบิลหนึ่งได้คะแนนความเสี่ยงนี้ (คำอธิบายระดับรายการ, RodeMap.md 3.2)

ผลของทุกวิธีเป็น "แรงที่ปัจจัยแต่ละตัวดันคะแนนขึ้นหรือลง" ของบิลนั้น เมื่อรวมกับค่าฐานแล้วได้ผลของโมเดลพอดี

  linear     Logistic Regression: φ_j = w_j × (z_j − E[z_j])  (z = ค่าที่ standardize/one-hot แล้ว)
             เป็นค่า SHAP แบบตรงตัวของโมเดลเชิงเส้น หน่วยเป็น log-odds  ฐาน + Σφ = logit ของคะแนน
  shap       Random Forest ผ่าน shap.TreeExplainer (ใช้เมื่อติดตั้งแพ็กเกจ shap ไว้เท่านั้น)
  tree_path  Random Forest แบบแยกเส้นทางในต้นไม้ (Saabas): ทุกครั้งที่บิลเดินผ่านจุดแยก
             ค่าความน่าจะเป็นของโหนดที่เปลี่ยนไปนับเป็นผลของปัจจัยที่ใช้แยก เฉลี่ยทุกต้น
             เบาและไม่ต้องติดตั้งอะไรเพิ่ม หน่วยเป็นความน่าจะเป็น  ฐาน + Σφ = คะแนนพอดี
  global     ถ้าคำนวณรายบิลไม่ได้ ใช้ความสำคัญของปัจจัยระดับโมเดล (permutation importance)
             หน้าเว็บต้องบอกว่าเป็นปัจจัยหลักของโมเดลโดยรวม ไม่ใช่ของบิลนี้

ปัจจัยที่เป็นหมวดหมู่ (ประเภทแผง ฤดูกาล) ถูก one-hot เป็นหลายคอลัมน์ จะรวมกลับเป็นปัจจัยเดียวก่อนส่งออก
"""
from __future__ import annotations

import numpy as np

from .features import CATEGORICAL

TOP_K = 5


def group_of(name: str) -> str:
    """ชื่อคอลัมน์หลังแปลง (เช่น stall_type_fresh) → ชื่อปัจจัยเดิม (stall_type)"""
    for c in CATEGORICAL:
        if name == c or name.startswith(c + "_"):
            return c
    return name


def _names(pipe) -> list[str]:
    return [n.split("__", 1)[1] for n in pipe.named_steps["pre"].get_feature_names_out()]


def _transform(pipe, X) -> np.ndarray:
    Z = pipe.named_steps["pre"].transform(X)
    return Z.toarray() if hasattr(Z, "toarray") else np.asarray(Z, dtype=float)


def _group(phi: np.ndarray, names: list[str]) -> list[dict[str, float]]:
    groups = [group_of(n) for n in names]
    out = []
    for row in phi:
        d: dict[str, float] = {}
        for g, v in zip(groups, row):
            d[g] = d.get(g, 0.0) + float(v)
        out.append(d)
    return out


def transformed_mean(pipe, X) -> list[float]:
    """E[z] ของข้อมูลที่ใช้เทรน ใช้เป็นจุดอ้างอิงของ linear contributions"""
    return [float(v) for v in _transform(pipe, X).mean(axis=0)]


def linear_contributions(pipe, X, mean_z) -> tuple[list[dict[str, float]], float]:
    clf = pipe.named_steps["clf"]
    Z = _transform(pipe, X)
    w = clf.coef_[0]
    mz = np.asarray(mean_z, dtype=float)
    phi = (Z - mz) * w
    base = float(clf.intercept_[0] + w @ mz)
    return _group(phi, _names(pipe)), base


def _positive_index(clf) -> int:
    return list(clf.classes_).index(1)


def tree_path_contributions(pipe, X) -> tuple[list[dict[str, float]], float]:
    clf = pipe.named_steps["clf"]
    Z = _transform(pipe, X)
    k = _positive_index(clf)
    n, m = Z.shape
    contrib = np.zeros((n, m))
    base = 0.0
    for est in clf.estimators_:
        t = est.tree_
        val = t.value[:, 0, :]
        val = val / val.sum(axis=1, keepdims=True)        # ให้เป็นสัดส่วนเสมอ ไม่ว่า sklearn รุ่นไหนเก็บแบบใด
        p = val[:, k]
        base += p[0]
        path = est.decision_path(Z)
        for i in range(n):
            nodes = path.indices[path.indptr[i]:path.indptr[i + 1]]
            nodes = np.sort(nodes)                         # ลูกมีเลขโหนดมากกว่าพ่อเสมอ เรียงแล้วคือรากถึงใบ
            for parent, child in zip(nodes[:-1], nodes[1:]):
                contrib[i, t.feature[parent]] += p[child] - p[parent]
    n_trees = len(clf.estimators_)
    return _group(contrib / n_trees, _names(pipe)), base / n_trees


def shap_contributions(pipe, X) -> tuple[list[dict[str, float]], float]:
    import shap  # แพ็กเกจเสริม ไม่ได้อยู่ใน requirements เพราะหน่วยความจำของ Render แพลนฟรีจำกัด

    clf = pipe.named_steps["clf"]
    Z = _transform(pipe, X)
    k = _positive_index(clf)
    explainer = shap.TreeExplainer(clf)
    sv = explainer.shap_values(Z)
    if isinstance(sv, list):                               # shap รุ่นเก่า: list ต่อคลาส
        sv = sv[k]
    elif np.ndim(sv) == 3:                                 # shap รุ่นใหม่: (แถว, ฟีเจอร์, คลาส)
        sv = sv[:, :, k]
    ev = explainer.expected_value
    base = float(ev[k] if np.ndim(ev) else ev)
    return _group(np.asarray(sv), _names(pipe)), base


def top_contributions(phi: dict[str, float], raw: dict, k: int = TOP_K) -> list[dict]:
    """ปัจจัยที่มีแรงมากที่สุด k ตัว พร้อมค่าจริงของปัจจัยนั้นและทิศทาง"""
    items = sorted(phi.items(), key=lambda kv: abs(kv[1]), reverse=True)[:k]
    out = []
    for feat, v in items:
        value = raw.get(feat)
        if isinstance(value, float):
            value = round(value, 3)
        out.append({"feature": feat, "value": value, "contribution": round(float(v), 4),
                    "direction": "up" if v > 0 else "down" if v < 0 else "none"})
    return out


def explain(model: str, pipe, X, raw_rows: list[dict], mean_z=None, global_importance=None) -> tuple[list[list[dict]], dict]:
    """คืน (contributions รายแถว, meta) meta = {method, scope, base, unit}"""
    try:
        if model == "lr":
            if mean_z is None:
                raise ValueError("ไม่มีค่าอ้างอิงของ linear contributions")
            rows, base = linear_contributions(pipe, X, mean_z)
            meta = {"method": "linear", "scope": "local", "base": round(base, 4), "unit": "logit"}
        else:
            try:
                rows, base = shap_contributions(pipe, X)
                meta = {"method": "shap", "scope": "local", "base": round(base, 4), "unit": "probability"}
            except ImportError:
                rows, base = tree_path_contributions(pipe, X)
                meta = {"method": "tree_path", "scope": "local", "base": round(base, 4), "unit": "probability"}
        return [top_contributions(r, raw) for r, raw in zip(rows, raw_rows)], meta
    except Exception as e:                                 # คำนวณรายบิลไม่ได้ ใช้ปัจจัยหลักของโมเดลแทน และบอกให้ชัด
        gi = global_importance or []
        top = [{"feature": g["feature"], "value": None, "contribution": round(float(g["value"]), 4),
                "direction": "up" if g["value"] > 0 else "none"} for g in gi[:TOP_K]]
        return [top for _ in raw_rows], {"method": "permutation", "scope": "global", "base": None, "unit": "auc_drop",
                                         "note": str(e)[:200]}
