"""ทดสอบการคำนวณ PSI ของรายงาน drift (ml/app/drift.py) โดยไม่ต้องมีฐานข้อมูล

รัน: cd ml && python -m unittest discover -s tests -v
"""
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import drift  # noqa: E402


class PsiTest(unittest.TestCase):
    def test_same_distribution_is_stable(self):
        rng = random.Random(1)
        ref = [rng.gauss(0, 1) for _ in range(2000)]
        cur = [rng.gauss(0, 1) for _ in range(2000)]
        p = drift.psi_numeric(ref, cur)
        self.assertLess(p, drift.STABLE)
        self.assertEqual(drift.level(p), "stable")

    def test_shifted_distribution_is_significant(self):
        rng = random.Random(2)
        ref = [rng.gauss(0, 1) for _ in range(2000)]
        cur = [rng.gauss(1.5, 1) for _ in range(2000)]
        p = drift.psi_numeric(ref, cur)
        self.assertGreater(p, drift.MODERATE)
        self.assertEqual(drift.level(p), "significant")

    def test_psi_matches_hand_calculation(self):
        # อ้างอิงครึ่งต่อครึ่ง เดือนนี้ 80/20: PSI = (0.8-0.5)ln(0.8/0.5) + (0.2-0.5)ln(0.2/0.5) = 0.4159
        p = drift.psi_categorical(["a"] * 50 + ["b"] * 50, ["a"] * 80 + ["b"] * 20, ["a", "b"])
        self.assertAlmostEqual(p, 0.4159, places=3)

    def test_constant_reference_and_missing_data(self):
        self.assertAlmostEqual(drift.psi_numeric([0] * 30, [0] * 10), 0.0, places=6)
        self.assertGreater(drift.psi_numeric([0] * 30, [0] * 5 + [3] * 5), drift.MODERATE)
        self.assertIsNone(drift.psi_numeric([1], [1, 2]))
        self.assertIsNone(drift.psi_numeric([1, 2, 3], []))
        self.assertIsNone(drift.psi_categorical([], ["a"], ["a"]))
        self.assertIsNone(drift.level(None))

    def test_category_missing_in_current_month_does_not_crash(self):
        p = drift.psi_categorical(["fresh", "dry", "dry"], ["dry"], ["fresh", "dry", "cooked"])
        self.assertGreater(p, 0)

    def test_bins_follow_sample_size(self):
        self.assertEqual(drift.bins_for(32), 3)
        self.assertEqual(drift.bins_for(55), 5)
        self.assertEqual(drift.bins_for(500), 10)
        self.assertEqual(drift.bins_for(5), 3)

    def test_noise_floor_explains_small_sample_psi(self):
        # 10 ช่องกับ 32 รายการ: แค่สุ่มก็ได้ราว 0.3 จึงต้องลดช่อง · 3 ช่องเหลือราว 0.07 ต่ำกว่าเกณฑ์ 0.1
        self.assertGreater(drift.noise_floor(10, 366, 32), drift.MODERATE)
        self.assertLess(drift.noise_floor(3, 366, 32), drift.STABLE)
        self.assertIsNone(drift.noise_floor(1, 10, 10))

    def test_random_small_month_rarely_significant_with_adaptive_bins(self):
        """เดือนที่มี 32 รายการสุ่มจากการแจกแจงเดิม: ช่องแบบปรับตามขนาดต้องไม่ทักว่า "เปลี่ยนมาก" บ่อย"""
        rng = random.Random(3)
        ref = [rng.gauss(0, 1) for _ in range(366)]
        hits10 = hits_adapt = 0
        for _ in range(200):
            cur = [rng.gauss(0, 1) for _ in range(32)]
            hits10 += drift.level(drift.psi_numeric(ref, cur, 10)) == "significant"
            hits_adapt += drift.level(drift.psi_numeric(ref, cur, drift.bins_for(32))) == "significant"
        self.assertLess(hits_adapt, hits10)
        self.assertLess(hits_adapt / 200, 0.05)

    def test_permutation_pvalue_separates_chance_from_real_shift(self):
        rng = random.Random(4)
        ref = [rng.gauss(0, 1) for _ in range(60)]
        same = [rng.gauss(0, 1) for _ in range(30)]
        moved = [rng.gauss(1.2, 1) for _ in range(30)]
        stat = lambda a, b: drift.psi_numeric(a, b, 3)
        self.assertGreaterEqual(drift.psi_pvalue(ref, same, stat, n_perm=300), drift.ALPHA)
        self.assertLess(drift.psi_pvalue(ref, moved, stat, n_perm=300), drift.ALPHA)
        # seed คงที่ = รายงานซ้ำได้ผลเดิม
        self.assertEqual(drift.psi_pvalue(ref, moved, stat, n_perm=100), drift.psi_pvalue(ref, moved, stat, n_perm=100))
        self.assertIsNone(drift.psi_pvalue([1], [2], stat))

    def test_reference_prefers_same_month_last_year(self):
        rows = [{"period": p} for p in ["2025-06"] * 25 + ["2025-07"] * 25 + ["2026-05"] * 25 + ["2026-06"] * 30]
        ref, kind, lo, hi = drift.reference_rows(rows, "2026-06")
        self.assertEqual(kind, "same_month")
        self.assertEqual((lo, hi, len(ref)), ("2025-06", "2025-06", 25))

    def test_reference_falls_back_to_rolling_12(self):
        rows = [{"period": p} for p in ["2025-06"] * 5 + ["2026-01"] * 25 + ["2026-05"] * 25 + ["2026-06"] * 30]
        ref, kind, lo, hi = drift.reference_rows(rows, "2026-06")
        self.assertEqual(kind, "rolling_12")
        self.assertEqual((lo, hi), ("2025-06", "2026-05"))
        self.assertEqual(len(ref), 55)                      # มิ.ย. 68 (5) + ม.ค. 69 (25) + พ.ค. 69 (25) ไม่นับเดือนปัจจุบัน

    def test_shift_period(self):
        self.assertEqual(drift.shift_period("2026-09", -12), "2025-09")
        self.assertEqual(drift.shift_period("2026-01", -1), "2025-12")
        self.assertEqual(drift.shift_period("2025-12", 1), "2026-01")


if __name__ == "__main__":
    unittest.main()


class FewValuesPsiTest(unittest.TestCase):
    """ตัวแปรที่มีแค่ไม่กี่ค่า (0/1) ต้องไม่ได้ PSI สูงเพียงเพราะ quantile ชนกัน"""

    def test_binary_same_share_is_stable(self):
        from app.drift import psi_numeric_k
        ref = [1.0] * 21 + [0.0] * 7                   # 75% เป็น 1
        cur = [1.0] * 23 + [0.0] * 9                   # 72% เป็น 1
        p, used = psi_numeric_k(ref, cur, 3)
        self.assertEqual(used, 2)
        self.assertLess(p, 0.01)

    def test_binary_real_shift_is_detected(self):
        from app.drift import psi_numeric_k
        p, _ = psi_numeric_k([1.0] * 21 + [0.0] * 7, [1.0] * 8 + [0.0] * 24, 3)
        self.assertGreater(p, 0.25)

    def test_constant_reference_still_uses_same_vs_different(self):
        from app.drift import psi_numeric_k
        p, used = psi_numeric_k([2.0] * 10, [2.0] * 10, 3)
        self.assertEqual((round(p, 6), used), (0.0, 2))
