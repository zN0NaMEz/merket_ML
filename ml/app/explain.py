"""อธิบายว่าทำไมบิลหนึ่งได้คะแนนความเสี่ยงนี้ (คำอธิบายระดับรายการ, RodeMap.md 3.2)

ผลของทุกวิธีเป็น "แรงที่ปัจจัยแต่ละตัวดันคะแนนขึ้นหรือลง" ของบิลนั้น เมื่อรวมกับค่าฐานแล้วได้ผลของโมเดลพอดี

  linear     Logistic Regression: φ_j = w_j × (z_j − E[z_j])  (z = ค่าที่ standardize/one-hot แล้ว)
             เป็นค่า SHAP แบบตรงตัวของโมเดลเชิงเส้น หน่วยเป็น log-odds  ฐาน + Σφ = logit ของคะแนน
  shap       โมเดลต้นไม้ (Random Forest, Extra Trees, Gradient Boosting) ผ่าน shap.TreeExplainer
             RF/ET หน่วยเป็นความน่าจะเป็น · Gradient Boosting หน่วยเป็น log-odds (ฐาน + Σφ = logit)
             ถ้าโหลด shap ไม่ได้ RF/ET ถอยไปใช้ tree_path ส่วน Gradient Boosting ถอยไปใช้ global
  ensemble   โมเดลรวม (เฉลี่ยความน่าจะเป็นของ LR, RF, GB): คิดคำอธิบายของสมาชิกแต่ละตัว
             แปลงตัวที่เป็น log-odds เป็นหน่วยความน่าจะเป็นด้วยการย่อส่วน φ × (p − p₀) / (logit − logit₀)
             (ผลรวมยังตรงพอดี แต่การแบ่งให้แต่ละปัจจัยเป็นค่าประมาณ) แล้วเฉลี่ย  ฐาน + Σφ = คะแนนของโมเดลรวมพอดี
  tree_path  Random Forest / Extra Trees แบบแยกเส้นทางในต้นไม้ (Saabas): ทุกครั้งที่บิลเดินผ่านจุดแยก
             ค่าความน่าจะเป็นของโหนดที่เปลี่ยนไปนับเป็นผลของปัจจัยที่ใช้แยก เฉลี่ยทุกต้น
             เบาและไม่ต้องติดตั้งอะไรเพิ่ม หน่วยเป็นความน่าจะเป็น  ฐาน + Σφ = คะแนนพอดี
  global     ถ้าคำนวณรายบิลไม่ได้ ใช้ความสำคัญของปัจจัยระดับโมเดล (permutation importance)
             หน้าเว็บต้องบอกว่าเป็นปัจจัยหลักของโมเดลโดยรวม ไม่ใช่ของบิลนี้

ปัจจัยที่เป็นหมวดหมู่ (ประเภทแผง ฤดูกาล) ถูก one-hot เป็นหลายคอลัมน์ จะรวมกลับเป็นปัจจัยเดียวก่อนส่งออก
"""
from __future__ import annotations

import math

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


def unit_of(pipe) -> str:
    """หน่วยของคำอธิบายแบบ shap: Gradient Boosting อธิบายเป็น log-odds ต้นไม้แบบเฉลี่ยโหวตเป็นความน่าจะเป็น"""
    from sklearn.ensemble import HistGradientBoostingClassifier
    return "logit" if isinstance(pipe.named_steps["clf"], HistGradientBoostingClassifier) else "probability"


def shap_contributions(pipe, X) -> tuple[list[dict[str, float]], float]:
    # import เฉพาะตอนใช้: shap + numba ใช้หน่วยความจำราว 75 MB จึงโหลดเมื่อโมเดลที่ใช้อยู่เป็นต้นไม้เท่านั้น (LR ไม่ต้องใช้)
    import shap

    clf = pipe.named_steps["clf"]
    Z = _transform(pipe, X)
    k = _positive_index(clf)
    explainer = shap.TreeExplainer(clf)
    sv = explainer.shap_values(Z)
    if isinstance(sv, list):                               # shap รุ่นเก่า: list ต่อคลาส
        sv = sv[k]
    elif np.ndim(sv) == 3:                                 # shap รุ่นใหม่: (แถว, ฟีเจอร์, คลาส)
        sv = sv[:, :, k]
    ev = np.ravel(explainer.expected_value)
    base = float(ev[0] if ev.size == 1 else ev[k])         # Gradient Boosting มีค่าฐานค่าเดียว (log-odds ของคลาสบวก)
    return _group(np.asarray(sv), _names(pipe)), base


def tree_contributions(pipe, X) -> tuple[list[dict[str, float]], float, str, str]:
    """คำอธิบายของโมเดลต้นไม้ คืน (แถว, ฐาน, หน่วย, วิธี) · ไม่มี shap แล้ว RF/ET ถอยไปใช้ tree_path"""
    try:
        rows, base = shap_contributions(pipe, X)
        return rows, base, unit_of(pipe), "shap"
    except ImportError:
        if not hasattr(pipe.named_steps["clf"], "estimators_"):
            raise
        rows, base = tree_path_contributions(pipe, X)
        return rows, base, "probability", "tree_path"


def _sigmoid(v: float) -> float:
    return 1.0 / (1.0 + math.exp(-v))


def to_probability(rows: list[dict[str, float]], base: float) -> tuple[list[dict[str, float]], float]:
    """คำอธิบายหน่วย log-odds → หน่วยความน่าจะเป็น โดยย่อส่วนทุกปัจจัยด้วยอัตราเดียวกันของแถวนั้น
    ฐานใหม่ = sigmoid(ฐาน) และ ฐานใหม่ + Σφ ใหม่ = sigmoid(ฐาน + Σφ) พอดี"""
    p0 = _sigmoid(base)
    out = []
    for phi in rows:
        total = sum(phi.values())
        p = _sigmoid(base + total)
        scale = (p - p0) / total if abs(total) > 1e-9 else p0 * (1 - p0)   # ค่าลิมิตเมื่อผลรวมเป็นศูนย์
        out.append({f: v * scale for f, v in phi.items()})
    return out, p0


def ensemble_contributions(ens, X, mean_z) -> tuple[list[dict[str, float]], float, str]:
    """เฉลี่ยคำอธิบายของสมาชิกทุกตัวในหน่วยความน่าจะเป็น (โมเดลรวมคือค่าเฉลี่ยความน่าจะเป็นของสมาชิก)"""
    parts, methods = [], []
    for name, pipe in ens.members_:
        if name == "lr":
            if mean_z is None:
                raise ValueError("ไม่มีค่าอ้างอิงของ linear contributions")
            rows, base = linear_contributions(pipe, X, mean_z)
            unit, method = "logit", "linear"
        else:
            rows, base, unit, method = tree_contributions(pipe, X)
        parts.append(to_probability(rows, base) if unit == "logit" else (rows, base))
        methods.append(f"{name}:{method}")
    n = len(parts)
    rows = [{f: sum(p[0][i].get(f, 0.0) for p in parts) / n for f in parts[0][0][i]} for i in range(len(parts[0][0]))]
    return rows, sum(p[1] for p in parts) / n, ",".join(methods)


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
        elif model == "ens":
            rows, base, parts = ensemble_contributions(pipe, X, mean_z)
            meta = {"method": "ensemble", "scope": "local", "base": round(base, 4), "unit": "probability", "members": parts}
        else:
            rows, base, unit, method = tree_contributions(pipe, X)
            meta = {"method": method, "scope": "local", "base": round(base, 4), "unit": unit}
        return [top_contributions(r, raw) for r, raw in zip(rows, raw_rows)], meta
    except Exception as e:                                 # คำนวณรายบิลไม่ได้ ใช้ปัจจัยหลักของโมเดลแทน และบอกให้ชัด
        gi = global_importance or []
        top = [{"feature": g["feature"], "value": None, "contribution": round(float(g["value"]), 4),
                "direction": "up" if g["value"] > 0 else "none"} for g in gi[:TOP_K]]
        return [top for _ in raw_rows], {"method": "permutation", "scope": "global", "base": None, "unit": "auc_drop",
                                         "note": str(e)[:200]}
