"""ทดสอบข้อมูลจำลองหลายชุดและการวัดผลโมเดล (app/synthetic.py, app/benchmark.py) โดยไม่ต้องมีฐานข้อมูล

รัน: cd ml && python -m unittest discover -s tests -v
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MODEL_DIR", tempfile.mkdtemp())

from app import benchmark as B  # noqa: E402
from app import synthetic as S  # noqa: E402

RISK = {sc.key: sc for sc in S.RISK_SCENARIOS}
METER = {sc.key: sc for sc in S.METER_SCENARIOS}


class SyntheticDataTest(unittest.TestCase):
    def test_same_seed_same_data(self):
        a, b = S.risk_dataset(RISK["baseline"]), S.risk_dataset(RISK["baseline"])
        self.assertTrue(a.equals(b))
        self.assertEqual(S.meter_records(METER["baseline"]), S.meter_records(METER["baseline"]))

    def test_scenarios_have_unique_keys_and_seeds(self):
        for group in (S.RISK_SCENARIOS, S.METER_SCENARIOS):
            self.assertEqual(len({s.key for s in group}), len(group))
            self.assertEqual(len({s.seed for s in group}), len(group))

    def test_scenarios_differ_the_way_they_claim(self):
        base = S.risk_dataset(RISK["baseline"])
        self.assertLess(S.risk_dataset(RISK["rare_late"])["label"].mean(), 0.15)          # ไม่สมดุล
        self.assertGreater((S.risk_dataset(RISK["new_market"])["tenure_years"] < 1).mean(), (base["tenure_years"] < 1).mean() * 2)
        self.assertGreater(S.risk_dataset(RISK["bill_shock"])["bill_ratio"].max(), base["bill_ratio"].max())
        self.assertGreater(len(S.risk_dataset(RISK["large"])), len(base) * 3)

    def test_no_label_for_bills_not_yet_due(self):
        """บิลที่ยังไม่ถึงกำหนด ณ วันอ้างอิงต้องไม่ถูกนำมาเทรน (กันข้อมูลรั่วเหมือนข้อมูลจริง)"""
        by_vendor, today = S.risk_bills(RISK["baseline"])
        not_due = {b["id"] for bills in by_vendor.values() for b in bills if b["due_date"] >= today}
        self.assertTrue(not_due)
        self.assertFalse(not_due & set(S.risk_dataset(RISK["baseline"])["bill_id"]))

    def test_meter_anomalies_are_labelled_within_their_ranges(self):
        recs = S.meter_records(METER["many"])
        rate = sum(r["label"] for r in recs) / len(recs)
        self.assertTrue(0.08 < rate < 0.14, rate)
        self.assertTrue(all(r["kind"] != "normal" for r in recs if r["label"]))
        self.assertTrue(all(r["kind"] == "normal" for r in recs if not r["label"]))


class DesignedScenarioTest(unittest.TestCase):
    """ชุดที่ออกแบบให้โมเดลต่างกัน: กลไกต้องทำงานตามที่บรรยายไว้"""

    def test_special_terms(self):
        sc = RISK["interaction"]
        new = {"bill_ratio": 1.2, "tenure_years": 1.0, "season": "normal"}
        old = {"bill_ratio": 1.2, "tenure_years": 5.0, "season": "normal"}
        self.assertGreater(S.special_term(sc, new, "fresh"), 0)          # ผู้ค้าใหม่ บิลสูง → เสี่ยงขึ้น
        self.assertLess(S.special_term(sc, old, "fresh"), 0)             # ผู้ค้าเก่า บิลสูง → เสี่ยงลง
        u = RISK["u_shape"]
        up = S.special_term(u, {"bill_ratio": 1.5, "tenure_years": 5, "season": "normal"}, "dry")
        down = S.special_term(u, {"bill_ratio": 1 / 1.5, "tenure_years": 5, "season": "normal"}, "dry")
        self.assertAlmostEqual(up, down, places=9)                       # สูงหรือต่ำเท่ากันมีผลเท่ากัน
        ts = RISK["type_season"]
        self.assertGreater(S.special_term(ts, {"bill_ratio": 1, "tenure_years": 5, "season": "rainy"}, "produce"),
                           S.special_term(ts, {"bill_ratio": 1, "tenure_years": 5, "season": "school"}, "produce"))
        self.assertEqual(S.special_term(RISK["baseline"], new, "fresh"), 0.0)

    def test_every_designed_scenario_states_its_hypothesis(self):
        for sc in [*S.RISK_SCENARIOS, *S.METER_SCENARIOS]:
            if sc.expect:
                self.assertTrue(sc.hypothesis, sc.key)
                self.assertTrue(set(sc.expect) <= {"lr", "rf", "z", "if", "both"}, sc.key)

    def test_pattern_scenario_only_has_pattern_anomalies(self):
        """สุ่มค่าผิดปกติครั้งเดียวต่อเดือน (เคยมีบั๊กที่สุ่มสองรอบ ทำให้มีค่าพุ่งแบบอื่นปนมา)"""
        kinds = {r["kind"] for r in S.meter_records(METER["pattern"]) if r["label"]}
        self.assertEqual(kinds, {"pattern"})

    def test_growth_scenario_grows_without_labels(self):
        recs = S.meter_records(METER["growth"])
        by = {}
        for r in recs:
            by.setdefault(r["stall_id"], []).append(r)
        grown = [ms for ms in by.values() if ms[-1]["use_elec"] > 2 * ms[0]["use_elec"]]
        self.assertTrue(grown)
        self.assertLess(sum(r["label"] for r in recs) / len(recs), 0.06)

    def test_interaction_separates_models(self):
        rows = {r["model"]: r for r in B.evaluate_risk(S.risk_dataset(RISK["interaction"]))}
        self.assertGreater(rows["rf"]["cv_auc_mean"] - rows["lr"]["cv_auc_mean"], 0.1)
        self.assertEqual(len(rows["lr"]["extra"]["cv_scores"]["brier"]), 5)
        self.assertTrue(all(0 <= b <= 1 for b in rows["lr"]["extra"]["cv_scores"]["brier"]))


class EvaluationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.risk = {r["model"]: r for r in B.evaluate_risk(S.risk_dataset(RISK["baseline"]))}
        cls.meter_base = {r["model"]: r for r in B.evaluate_anomaly(S.meter_records(METER["baseline"]))[0]}
        cls.meter_subtle = {r["model"]: r for r in B.evaluate_anomaly(S.meter_records(METER["subtle"]))[0]}

    def test_models_beat_the_reference(self):
        self.assertEqual(set(self.risk), {"lr", "rf", "et", "gb", "ens", "baseline"})
        self.assertEqual(self.risk["baseline"]["auc"], 0.5)
        for m in ("lr", "rf", "et", "gb", "ens"):
            self.assertGreater(self.risk[m]["auc"], 0.7)
            self.assertGreater(self.risk[m]["pr_auc"], self.risk["baseline"]["pr_auc"])

    def test_reference_pr_auc_equals_base_rate(self):
        """PR-AUC ของการเดาตามสัดส่วน = สัดส่วนกลุ่มบวกในชุดทดสอบ (ทฤษฎี)"""
        c = self.risk["baseline"]["extra"]["confusion"]
        rate = (c["tp"] + c["fn"]) / sum(c.values())
        self.assertAlmostEqual(self.risk["baseline"]["pr_auc"], rate, places=3)

    def test_metrics_are_in_range_and_cv_has_five_folds(self):
        for r in self.risk.values():
            for k in ("auc", "pr_auc", "precision", "recall", "f1", "accuracy", "brier"):
                self.assertTrue(0 <= r[k] <= 1, (r["model"], k, r[k]))
            self.assertEqual(len(r["extra"]["cv_scores"]["auc"]), 5)
            self.assertEqual(r["extra"]["n_test"], sum(r["extra"]["confusion"].values()))   # ทุกบิลทดสอบอยู่ในตาราง

    def test_both_methods_catch_at_least_as_much_as_each(self):
        m = self.meter_base
        self.assertGreaterEqual(m["both"]["recall"], m["z"]["recall"])
        self.assertGreaterEqual(m["both"]["recall"], m["if"]["recall"])
        self.assertGreaterEqual(m["both"]["extra"]["false_alarms_per_100"], m["if"]["extra"]["false_alarms_per_100"])

    def test_subtle_anomalies_are_harder(self):
        self.assertLess(self.meter_subtle["both"]["recall"], self.meter_base["both"]["recall"])


if __name__ == "__main__":
    unittest.main()
