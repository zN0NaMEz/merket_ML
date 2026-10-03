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

    def test_shift_period(self):
        self.assertEqual(drift.shift_period("2026-09", -12), "2025-09")
        self.assertEqual(drift.shift_period("2026-01", -1), "2025-12")
        self.assertEqual(drift.shift_period("2025-12", 1), "2026-01")


if __name__ == "__main__":
    unittest.main()
