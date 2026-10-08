"""ทดสอบการคำนวณคำอธิบายรายบิล (ml/app/explain.py)

รันได้โดยไม่ต้องมีฐานข้อมูล:  cd ml && python -m unittest discover -s tests -v

คุณสมบัติหลักที่ต้องจริงเสมอ: ฐาน + ผลรวมของแรงทุกปัจจัย = ผลของโมเดลพอดี
  linear     → logit ของความน่าจะเป็น
  tree_path  → ความน่าจะเป็นของ Random Forest
"""
import math
import random
import sys
import types
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# app.risk import app.db ซึ่งต่อฐานข้อมูลตอนใช้งานเท่านั้น แต่ตั้งค่า MODEL_DIR ตอน import ให้ชี้ไปที่ temp
import os
import tempfile
os.environ.setdefault("MODEL_DIR", tempfile.mkdtemp())

from app import explain as xp                      # noqa: E402
from app.features import CATEGORICAL, NUMERIC, SEASONS, TYPE_CODES  # noqa: E402
from app.risk import _make_models                   # noqa: E402

COLS = NUMERIC + CATEGORICAL


def synthetic(n=400, seed=7) -> tuple[pd.DataFrame, np.ndarray]:
    """ข้อมูลจำลองที่มีความสัมพันธ์จริง: จ่ายช้าบ่อย/ยอดสูง → มีโอกาสจ่ายช้า"""
    rng = random.Random(seed)
    rows, y = [], []
    for _ in range(n):
        late = rng.randint(0, 6)
        avg = round(late * rng.uniform(0, 3), 2)
        ratio = round(rng.uniform(0.7, 1.6), 3)
        tenure = round(rng.uniform(0.2, 10), 2)
        st, se = rng.choice(TYPE_CODES), rng.choice(SEASONS)
        logit = -2.2 + 0.6 * late + 0.25 * avg + 2.0 * (ratio - 1) - 0.08 * tenure + (0.4 if se == "rainy" else 0)
        # ปัจจัยพฤติกรรม: คนจ่ายช้าบ่อยจ่ายก่อนกำหนดน้อยกว่า เปิดดูบิลน้อยกว่า
        rows.append({"late_count": late, "avg_days_late": avg, "bill_ratio": ratio, "tenure_years": tenure,
                     "early_days_avg": round(max(0.0, 6 - late + rng.uniform(-2, 2)), 2),
                     "seen_rate": round(min(1.0, max(0.0, 0.9 - 0.12 * late + rng.uniform(-0.2, 0.2))), 2),
                     "app_share": round(rng.random(), 2), "stall_type": st, "season": se})
        y.append(int(rng.random() < 1 / (1 + math.exp(-logit))))
    return pd.DataFrame(rows), np.array(y)


class ExplainTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.X, cls.y = synthetic()
        models = _make_models()
        cls.lr, cls.rf = models["lr"], models["rf"]
        cls.rf.named_steps["clf"].set_params(n_estimators=40, n_jobs=1)   # ทดสอบให้เร็ว
        cls.lr.fit(cls.X[COLS], cls.y)
        cls.rf.fit(cls.X[COLS], cls.y)
        cls.sample = cls.X[COLS].iloc[:12]
        cls.raw = cls.X.iloc[:12].to_dict("records")

    def test_group_of_maps_onehot_back(self):
        self.assertEqual(xp.group_of("stall_type_fresh"), "stall_type")
        self.assertEqual(xp.group_of("season_rainy"), "season")
        self.assertEqual(xp.group_of("late_count"), "late_count")

    def test_linear_sums_to_logit(self):
        mean_z = xp.transformed_mean(self.lr, self.X[COLS])
        rows, base = xp.linear_contributions(self.lr, self.sample, mean_z)
        p = self.lr.predict_proba(self.sample)[:, 1]
        for phi, prob in zip(rows, p):
            self.assertAlmostEqual(base + sum(phi.values()), math.log(prob / (1 - prob)), places=6)
        # ปัจจัยทั้งหกถูกรวมกลับครบ (ไม่เหลือคอลัมน์ one-hot แยก)
        self.assertEqual(set(rows[0]), set(COLS))

    def test_linear_direction_matches_coefficient(self):
        """บิลที่จ่ายช้ามากกว่าค่าเฉลี่ย ต้องได้แรงดันขึ้นจาก late_count เมื่อสัมประสิทธิ์เป็นบวก"""
        mean_z = xp.transformed_mean(self.lr, self.X[COLS])
        names = xp._names(self.lr)
        w = dict(zip(names, self.lr.named_steps["clf"].coef_[0]))
        heavy = pd.DataFrame([{**self.raw[0], "late_count": 6, "avg_days_late": 12.0}])[COLS]
        rows, _ = xp.linear_contributions(self.lr, heavy, mean_z)
        self.assertEqual(np.sign(rows[0]["late_count"]), np.sign(w["late_count"]))

    def test_tree_path_sums_to_probability(self):
        rows, base = xp.tree_path_contributions(self.rf, self.sample)
        p = self.rf.predict_proba(self.sample)[:, 1]
        for phi, prob in zip(rows, p):
            self.assertAlmostEqual(base + sum(phi.values()), prob, places=6)

    def test_top_contributions_sorted_and_limited(self):
        phi = {"a": 0.1, "b": -0.5, "c": 0.3, "d": 0.0, "e": -0.05, "f": 0.2}
        top = xp.top_contributions(phi, {"a": 1, "b": 2.12345, "c": 3}, k=5)
        self.assertEqual([t["feature"] for t in top], ["b", "c", "f", "a", "e"])
        self.assertEqual(top[0]["direction"], "down")
        self.assertEqual(top[1]["direction"], "up")
        self.assertEqual(top[0]["value"], 2.123)               # ปัดทศนิยม 3 ตำแหน่ง
        self.assertEqual(len(top), 5)

    def test_explain_lr_local(self):
        mean_z = xp.transformed_mean(self.lr, self.X[COLS])
        contribs, meta = xp.explain("lr", self.lr, self.sample, self.raw, mean_z=mean_z)
        self.assertEqual(meta["method"], "linear")
        self.assertEqual(meta["scope"], "local")
        self.assertEqual(len(contribs), len(self.raw))
        self.assertLessEqual(len(contribs[0]), xp.TOP_K)
        self.assertEqual(contribs[0][0]["value"], self.raw[0][contribs[0][0]["feature"]])

    def test_explain_rf_uses_tree_path_without_shap(self):
        saved = sys.modules.get("shap")
        sys.modules["shap"] = None                          # จำลองว่าไม่มีแพ็กเกจ shap
        try:
            contribs, meta = xp.explain("rf", self.rf, self.sample, self.raw)
        finally:
            if saved is None:
                sys.modules.pop("shap", None)
            else:
                sys.modules["shap"] = saved
        self.assertEqual(meta["method"], "tree_path")
        self.assertEqual(meta["scope"], "local")
        self.assertTrue(all(c["direction"] in ("up", "down", "none") for c in contribs[0]))

    def test_explain_falls_back_to_global(self):
        gi = [{"feature": "late_count", "value": 0.12, "std": 0.01}, {"feature": "bill_ratio", "value": 0.03, "std": 0.01}]
        contribs, meta = xp.explain("lr", self.lr, self.sample, self.raw, mean_z=None, global_importance=gi)
        self.assertEqual(meta["scope"], "global")
        self.assertEqual(meta["method"], "permutation")
        self.assertEqual(contribs[0][0]["feature"], "late_count")
        self.assertIsNone(contribs[0][0]["value"])          # ระดับโมเดล ไม่มีค่าของบิลนี้

    def test_explain_shap_path_when_available(self):
        """shap อยู่ใน requirements แล้ว RF จึงต้องใช้ shap · ถ้ารันในเครื่องที่ยังไม่ได้ติดตั้ง ข้ามการทดสอบนี้"""
        try:
            import shap  # noqa: F401
        except ImportError:
            self.skipTest("ไม่ได้ติดตั้ง shap")
        contribs, meta = xp.explain("rf", self.rf, self.sample, self.raw)
        self.assertEqual(meta["method"], "shap")
        self.assertEqual(meta["scope"], "local")

    def test_shap_sums_to_probability(self):
        """คุณสมบัติหลักของ SHAP: ค่าฐาน + ผลรวมแรงทุกปัจจัย = ความน่าจะเป็นที่ Random Forest ทายพอดี"""
        try:
            import shap  # noqa: F401
        except ImportError:
            self.skipTest("ไม่ได้ติดตั้ง shap")
        rows, base = xp.shap_contributions(self.rf, self.sample)
        p = self.rf.predict_proba(self.sample)[:, 1]
        for phi, prob in zip(rows, p):
            self.assertAlmostEqual(base + sum(phi.values()), prob, places=6)
        self.assertEqual(set(rows[0]), set(COLS))          # one-hot ถูกรวมกลับเป็น 6 ปัจจัย

    def test_shap_and_tree_path_agree_on_main_driver(self):
        """SHAP กับ tree_path คิดคนละวิธี แต่ปัจจัยที่แรงที่สุดของบิลส่วนใหญ่ควรเป็นตัวเดียวกัน"""
        try:
            import shap  # noqa: F401
        except ImportError:
            self.skipTest("ไม่ได้ติดตั้ง shap")
        s_rows, _ = xp.shap_contributions(self.rf, self.sample)
        t_rows, _ = xp.tree_path_contributions(self.rf, self.sample)
        top = lambda phi: max(phi, key=lambda k: abs(phi[k]))
        same = sum(top(a) == top(b) for a, b in zip(s_rows, t_rows))
        self.assertGreaterEqual(same / len(s_rows), 0.7)


if __name__ == "__main__":
    unittest.main()
