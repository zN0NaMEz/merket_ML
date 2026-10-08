"""ทดสอบโมเดลที่เพิ่มเป็นตัวเลือก (Extra Trees, Gradient Boosting, โมเดลรวม) และการทำนายจากไฟล์

รันได้โดยไม่ต้องมีฐานข้อมูล:  cd ml && python -m unittest discover -s tests -v
"""
import io
import math
import os
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MODEL_DIR", tempfile.mkdtemp())

from sklearn.model_selection import StratifiedKFold, cross_validate  # noqa: E402

from app import explain as xp, risk  # noqa: E402
from app.features import CATEGORICAL, NUMERIC, input_features, risk_features, risk_reasons, season_of  # noqa: E402
from test_explain import synthetic  # noqa: E402

COLS = NUMERIC + CATEGORICAL


def has_shap() -> bool:
    try:
        import shap  # noqa: F401
        return True
    except ImportError:
        return False


class ModelsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.X, cls.y = synthetic(n=400, seed=11)
        base = risk._make_models()
        for k in ("rf", "et"):
            base[k].named_steps["clf"].set_params(n_estimators=40, n_jobs=1)   # ทดสอบให้เร็ว
        cls.fitted = {k: m.fit(cls.X[COLS], cls.y) for k, m in base.items()}
        cls.fitted["ens"] = risk.MeanEnsemble.from_fitted(cls.fitted)
        cls.sample = cls.X[COLS].iloc[:15]
        cls.raw = cls.X.iloc[:15].to_dict("records")
        cls.mean_z = xp.transformed_mean(cls.fitted["lr"], cls.X[COLS])

    def test_model_keys(self):
        self.assertEqual(risk.MODEL_KEYS, ("lr", "rf", "et", "gb", "ens"))
        self.assertEqual(set(risk._make_models()), set(risk.BASE_MODELS))
        self.assertTrue(set(risk.ENSEMBLE_OF) <= set(risk.BASE_MODELS))

    def test_ensemble_is_mean_of_members(self):
        p = self.fitted["ens"].predict_proba(self.sample)[:, 1]
        expect = np.mean([self.fitted[k].predict_proba(self.sample)[:, 1] for k in risk.ENSEMBLE_OF], axis=0)
        np.testing.assert_allclose(p, expect)
        np.testing.assert_array_equal(self.fitted["ens"].predict(self.sample), (p >= 0.5).astype(int))

    def test_ensemble_works_with_cross_validate_and_pickle(self):
        """benchmark ใช้ cross_validate กับโมเดลรวมที่ยังไม่ได้เทรน และโมเดลที่เทรนแล้วต้องเก็บลง model_blobs ได้"""
        ens = risk._ensemble()
        for _, m in ens.members:
            if "n_estimators" in m.named_steps["clf"].get_params():
                m.named_steps["clf"].set_params(n_estimators=20, n_jobs=1)
        r = cross_validate(ens, self.X[COLS], self.y, cv=StratifiedKFold(3, shuffle=True, random_state=1), scoring="roc_auc")
        self.assertTrue(all(0.5 < v <= 1 for v in r["test_score"]), r["test_score"])
        buf = io.BytesIO()
        joblib.dump(self.fitted, buf)
        back = joblib.load(io.BytesIO(buf.getvalue()))
        np.testing.assert_allclose(back["ens"].predict_proba(self.sample), self.fitted["ens"].predict_proba(self.sample))

    def test_to_probability_keeps_exact_sum(self):
        rows = [{"a": 0.8, "b": -0.3}, {"a": 0.0, "b": 0.0}, {"a": -2.0, "b": -1.0}]
        out, p0 = xp.to_probability(rows, -0.4)
        sig = lambda v: 1 / (1 + math.exp(-v))
        self.assertAlmostEqual(p0, sig(-0.4))
        for phi, new in zip(rows, out):
            self.assertAlmostEqual(p0 + sum(new.values()), sig(-0.4 + sum(phi.values())), places=12)
            for f in phi:                                          # ทิศทางของแต่ละปัจจัยไม่เปลี่ยน
                self.assertEqual(np.sign(new[f]), np.sign(phi[f]))

    @unittest.skipUnless(has_shap(), "ไม่ได้ติดตั้ง shap")
    def test_gb_shap_sums_to_logit(self):
        rows, base = xp.shap_contributions(self.fitted["gb"], self.sample)
        p = self.fitted["gb"].predict_proba(self.sample)[:, 1]
        for phi, prob in zip(rows, p):
            self.assertAlmostEqual(base + sum(phi.values()), math.log(prob / (1 - prob)), places=5)
        self.assertEqual(xp.unit_of(self.fitted["gb"]), "logit")

    @unittest.skipUnless(has_shap(), "ไม่ได้ติดตั้ง shap")
    def test_et_shap_sums_to_probability(self):
        rows, base = xp.shap_contributions(self.fitted["et"], self.sample)
        p = self.fitted["et"].predict_proba(self.sample)[:, 1]
        for phi, prob in zip(rows, p):
            self.assertAlmostEqual(base + sum(phi.values()), prob, places=6)
        self.assertEqual(xp.unit_of(self.fitted["et"]), "probability")

    @unittest.skipUnless(has_shap(), "ไม่ได้ติดตั้ง shap")
    def test_ensemble_contributions_sum_to_ensemble_probability(self):
        rows, base, parts = xp.ensemble_contributions(self.fitted["ens"], self.sample, self.mean_z)
        p = self.fitted["ens"].predict_proba(self.sample)[:, 1]
        for phi, prob in zip(rows, p):
            self.assertAlmostEqual(base + sum(phi.values()), prob, places=6)
        self.assertEqual(set(rows[0]), set(COLS))
        self.assertEqual(parts, "lr:linear,rf:shap,gb:shap")
        contribs, meta = xp.explain("ens", self.fitted["ens"], self.sample, self.raw, mean_z=self.mean_z)
        self.assertEqual((meta["method"], meta["scope"], meta["unit"]), ("ensemble", "local", "probability"))

    def test_gb_without_shap_falls_back_to_global(self):
        saved = sys.modules.get("shap")
        sys.modules["shap"] = None
        try:
            gi = [{"feature": "late_count", "value": 0.1, "std": 0.0}]
            _, meta_gb = xp.explain("gb", self.fitted["gb"], self.sample, self.raw, global_importance=gi)
            _, meta_et = xp.explain("et", self.fitted["et"], self.sample, self.raw)
        finally:
            if saved is None:
                sys.modules.pop("shap", None)
            else:
                sys.modules["shap"] = saved
        self.assertEqual(meta_gb["scope"], "global")
        self.assertEqual(meta_et["method"], "tree_path")

    def test_weights_have_thai_labels(self):
        imp = [{"feature": f, "value": 0.01, "std": 0.0} for f in COLS]
        for name in risk.MODEL_KEYS:
            w = risk._weights(name, self.fitted[name], imp)
            self.assertTrue(w)
            for item in w:
                self.assertNotEqual(item["label"], item["feature"], f"{name}: {item['feature']} ไม่มีชื่อไทย")


class InputFeaturesTest(unittest.TestCase):
    """ค่าที่กรอกในไฟล์ต้องให้ปัจจัยเดียวกับที่ risk_features คิดจากบิลจริงทุกประการ"""

    def bills(self, late_days: list[int], totals: list[float], seen: list[bool] | None = None, app: list[bool] | None = None):
        """late_days: บวก = จ่ายช้ากี่วัน · ลบ = จ่ายก่อนครบกำหนดกี่วัน"""
        due0 = date(2026, 1, 10)
        prior = []
        for i, (d, t) in enumerate(zip(late_days, totals)):
            due = due0 + timedelta(days=30 * i)
            issue = due - timedelta(days=9)
            prior.append({"issue_date": issue, "due_date": due, "paid_date": due + timedelta(days=d), "total": t, "credit_used": 0,
                          "seen_at": issue + timedelta(days=1) if seen and seen[i] else None,
                          "channel": ("app" if app[i] else "cash") if app else None})
        due = due0 + timedelta(days=30 * len(late_days))
        return prior, {"issue_date": due - timedelta(days=9), "due_date": due, "total": 5200.0, "credit_used": 0}

    def test_matches_risk_features(self):
        cases = [([-4, 3, -1, 5, 0, -6, 2, -3], [3000, 3100, 2900, 3050, 3200, 2950, 3000, 3100],
                  [1, 1, 0, 1, 0, 0, 1, 1], [1, 0, 1, 1, 0, 1, 0, 1]),
                 ([0, -2], [2000, 2200], [0, 1], [0, 0]), ([], [], [], [])]
        for late_days, totals, seen, app in cases:
            prior, bill = self.bills(late_days, totals, seen, app)
            since = bill["issue_date"] - timedelta(days=int(365 * 2.5))
            expect = risk_features(since, "cooked", prior, bill)
            last6, last3 = late_days[-6:], totals[-3:]
            early = [-d for d in last6 if d <= 0]
            row = {"stall_type": "cooked", "due_month": bill["due_date"].month, "tenure_years": 2.5,
                   "n_prior": len(last6), "late_count": sum(d > 0 for d in last6), "days_late_total": sum(max(0, d) for d in last6),
                   "bill_total": bill["total"], "prev_avg": (sum(last3) / len(last3)) if last3 else 0,
                   "early_days_avg": (sum(early) / len(early)) if early else 0.0,
                   "seen_count": sum(seen[-6:]), "app_count": sum(app[-6:])}
            got = input_features(row)
            for k in expect:
                if isinstance(expect[k], float):
                    self.assertAlmostEqual(got[k], expect[k], places=2, msg=k)
                else:
                    self.assertEqual(got[k], expect[k], k)
            self.assertEqual(got["season"], season_of(bill["due_date"]))
            self.assertEqual(got["filled"], [])

    def test_behavior_uses_only_what_was_known_at_issue(self):
        """บิลก่อนหน้าที่ยังไม่จ่าย หรือเปิดดูหลังวันออกบิลนี้ ต้องไม่นับ (กันข้อมูลรั่ว)"""
        prior, bill = self.bills([-5, -5, -5], [3000, 3000, 3000], [1, 1, 1], [1, 1, 1])
        prior[-1]["paid_date"] = bill["issue_date"] + timedelta(days=3)       # จ่ายหลังวันออกบิลนี้
        prior[-1]["seen_at"] = bill["issue_date"] + timedelta(days=1)         # เปิดดูหลังวันออกบิลนี้
        f = risk_features(bill["issue_date"] - timedelta(days=900), "dry", prior, bill)
        self.assertAlmostEqual(f["seen_rate"], 2 / 3)
        self.assertAlmostEqual(f["app_share"], 1.0)                           # คิดจาก 2 บิลที่จ่ายแล้ว
        self.assertAlmostEqual(f["early_days_avg"], 5.0)
        # ไม่มีข้อมูลพฤติกรรมเลย (ระบบรุ่นก่อน) = 0 ไม่ล้ม
        prior2, bill2 = self.bills([0, 1], [1000, 1000])
        f2 = risk_features(bill2["issue_date"] - timedelta(days=900), "dry", prior2, bill2)
        self.assertEqual((f2["seen_rate"], f2["app_share"]), (0.0, 0.0))

    def test_blank_behavior_uses_market_mean_and_is_not_a_reason(self):
        base = {"stall_type": "dry", "due_month": 7, "tenure_years": 3, "n_prior": 6, "late_count": 0, "days_late_total": 0,
                "bill_total": 3000, "prev_avg": 3000}
        fill = {"early_days_avg": 0.4, "seen_rate": 0.1, "app_share": 0.7}
        f = input_features({**base, "early_days_avg": None, "seen_count": None, "app_count": 3}, fill)
        self.assertEqual((f["early_days_avg"], f["seen_rate"], f["app_share"]), (0.4, 0.1, 0.5))
        self.assertEqual(f["filled"], ["early_days_avg", "seen_rate"])
        self.assertNotIn("มักจ่ายวันใกล้ครบกำหนด", risk_reasons(f))
        self.assertNotIn("ไม่ค่อยเปิดดูบิลในแอป", risk_reasons(f))
        own = input_features({**base, "early_days_avg": 0.0, "seen_count": 1, "app_count": 3}, fill)
        self.assertIn("มักจ่ายวันใกล้ครบกำหนด", risk_reasons(own))
        self.assertIn("ไม่ค่อยเปิดดูบิลในแอป", risk_reasons(own))
        none = input_features({**base, "n_prior": 0, "late_count": 0}, fill)       # ไม่มีบิลก่อนหน้า ไม่มีพฤติกรรม
        self.assertEqual((none["early_days_avg"], none["seen_rate"], none["app_share"], none["filled"]), (0.0, 0.0, 0.0, []))

    def test_no_history_means_normal_ratio(self):
        f = input_features({"stall_type": "dry", "due_month": 5, "tenure_years": 0.1, "n_prior": 0, "late_count": 0,
                            "days_late_total": 0, "bill_total": 9999, "prev_avg": 3000})
        self.assertEqual((f["bill_ratio"], f["avg_days_late"], f["season"]), (1.0, 0.0, "school"))
        self.assertEqual(input_features({**{"stall_type": "dry", "due_month": 1, "tenure_years": 40, "n_prior": 1, "late_count": 0,
                                            "days_late_total": 0, "bill_total": 10, "prev_avg": 0}})["tenure_years"], 15.0)


class PredictRowsTest(unittest.TestCase):
    """predict_rows ใช้โมเดลที่โหลดไว้ ไม่แตะฐานข้อมูล"""

    def setUp(self):
        X, y = synthetic(n=300, seed=5)
        base = risk._make_models()
        for k in ("rf", "et"):
            base[k].named_steps["clf"].set_params(n_estimators=30, n_jobs=1)
        fitted = {k: m.fit(X[COLS], y) for k, m in base.items()}
        fitted["ens"] = risk.MeanEnsemble.from_fitted(fitted)
        self.saved = dict(risk._cache)
        risk._cache.clear()
        risk._cache.update(models=fitted, metrics={"models": {}, "explain": {"lr_mean": xp.transformed_mean(fitted["lr"], X[COLS])}})

    def tearDown(self):
        risk._cache.clear()
        risk._cache.update(self.saved)

    def rows(self):
        return [
            {"ref": "ดี", "stall_type": "dry", "due_month": 7, "tenure_years": 6, "n_prior": 6, "late_count": 0,
             "days_late_total": 0, "bill_total": 2950, "prev_avg": 2900},
            {"ref": "ช้า", "stall_type": "clothes", "due_month": 9, "tenure_years": 1, "n_prior": 6, "late_count": 6,
             "days_late_total": 60, "bill_total": 4600, "prev_avg": 2900},
        ]

    def test_scores_all_models_with_reasons(self):
        out = risk.predict_rows(self.rows())
        self.assertEqual(out["models"], list(risk.MODEL_KEYS))
        self.assertEqual(len(out["results"]), 2)
        good, bad = out["results"]
        for m in out["models"]:
            self.assertGreater(bad["scores"][m], good["scores"][m], m)
            self.assertTrue(0 <= good["scores"][m] <= 1)
            self.assertLessEqual(len(bad["contributions"][m]), xp.TOP_K)
        self.assertEqual(good["reasons"], ["ประวัติชำระตรงเวลา"])
        self.assertIn("จ่ายช้า 6 ครั้งใน 6 บิลล่าสุด", bad["reasons"])
        self.assertEqual(out["explain"]["lr"]["method"], "linear")

    def test_old_model_set_offers_only_trained_models(self):
        """โมเดลที่เทรนก่อนเพิ่มตัวเลือกใหม่มีแค่ lr, rf: ทำนายได้เฉพาะสองตัวนี้ และขอตัวอื่นต้องบอกให้เทรนใหม่"""
        risk._cache["models"] = {k: risk._cache["models"][k] for k in ("lr", "rf")}
        self.assertEqual(risk.predict_rows(self.rows())["models"], ["lr", "rf"])
        with self.assertRaisesRegex(RuntimeError, "เทรนโมเดลใหม่"):
            risk._pipe("gb")


if __name__ == "__main__":
    unittest.main()


class SyntheticBehaviorTest(unittest.TestCase):
    def test_behavior_and_clear_scenarios(self):
        from sklearn.metrics import roc_auc_score
        from app import synthetic as S
        from app.risk import build_dataset
        by = {sc.key: sc for sc in S.RISK_SCENARIOS}
        # ชุดเดิมไม่มีพฤติกรรม (ข้อมูลเหมือนเดิมทุกไบต์) ชุดใหม่มี
        old, _ = S.risk_bills(by["baseline"])
        self.assertFalse(any("seen_at" in b for bills in old.values() for b in bills))
        new, today = S.risk_bills(by["behavior"])
        df = build_dataset(new, today)
        self.assertGreater(df["seen_rate"].mean(), 0.3)
        self.assertGreater(df["app_share"].mean(), 0.3)
        # วินัยดี (จ่ายตรง) ต้องจ่ายเร็วกว่า: ปัจจัยจ่ายก่อนกำหนดสัมพันธ์กับการจ่ายตรงเวลา
        self.assertGreater(df.loc[df.label == 0, "early_days_avg"].mean(), df.loc[df.label == 1, "early_days_avg"].mean())
        # ความบังเอิญต่ำ: เพดาน (รู้วินัย) สูงกว่าชุดปกติชัดเจน
        def ceiling(sc):
            bv, t = S.risk_bills(sc)
            d = build_dataset(bv, t)
            o = {b["id"]: b["oracle_logit"] for bills in bv.values() for b in bills}
            return roc_auc_score(d["label"], d["bill_id"].map(o))
        self.assertGreater(ceiling(by["clear"]), 0.95)
        self.assertLess(ceiling(by["behavior"]), 0.9)


class ExperimentSampleTest(unittest.TestCase):
    """ไฟล์ทดลองของหน้า "ทำนายจากไฟล์" (web/src/ai/experimentSample.js) สร้างจากข้อมูลจำลองชุด clear"""

    @classmethod
    def setUpClass(cls):
        from app import synthetic as S
        cls.S = S
        cls.rows = S.experiment_rows()

    def test_rows_give_same_features_as_the_bills(self):
        """ค่าที่ใส่ในไฟล์ต้องให้ปัจจัยเดียวกับที่ระบบคิดจากบิลจริงของตลาดจำลอง และผลจริงตรงกับป้ายของการเทรน"""
        from app.risk import build_dataset
        sc = next(s for s in self.S.RISK_SCENARIOS if s.key == self.S.EXPERIMENT_KEY)
        df = build_dataset(*self.S.risk_bills(sc)).set_index("bill_id")
        self.assertEqual(len(self.rows), self.S.EXPERIMENT_SIZE)
        for r in self.rows:
            want = df.loc[r["bill_id"]]
            got = input_features({k: v for k, v in r.items() if k not in ("bill_id", "ref", "actual")})
            self.assertEqual(r["actual"], int(want["label"]))
            for k in ("late_count", "stall_type", "season", "n_prior"):
                self.assertEqual(got[k], want[k], k)
            for k in ("avg_days_late", "bill_ratio", "tenure_years", "early_days_avg", "seen_rate", "app_share"):
                self.assertAlmostEqual(got[k], float(want[k]), delta=0.02, msg=k)
        self.assertTrue(0 < sum(r["actual"] for r in self.rows) < len(self.rows), "ต้องมีทั้งจ่ายช้าและตรงเวลา")

    def test_web_file_is_current(self):
        """ไฟล์ในเว็บต้องตรงกับตัวสร้างข้อมูลเสมอ (ห้ามแก้มือ) · สร้างใหม่ด้วย python -m app.benchmark --experiment-js"""
        path = Path(__file__).resolve().parents[2] / "web" / "src" / "ai" / "experimentSample.js"
        if not path.exists():
            self.skipTest("ไม่มีโฟลเดอร์ web (เช่นใน Docker image ของ ML)")
        self.assertEqual(path.read_text(encoding="utf-8"), self.S.experiment_js(self.rows))
