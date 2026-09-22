"""เทรนโมเดลทั้งหมดจาก command line และพิมพ์รายงานผล (ใช้ประกอบรายงานโปรเจค)

    python train.py
"""
from app import anomaly, risk

if __name__ == "__main__":
    m = risk.train()
    print(f"\n== ทำนายความเสี่ยงค้างชำระ ==\nข้อมูล {m['n_samples']} บิล (train {m['n_train']} / test {m['n_test']}) จ่ายช้า {m['late_rate']:.1%}")
    print(f"{'model':<6}{'acc':>8}{'prec':>8}{'recall':>8}{'f1':>8}{'auc':>8}{'cv-auc':>14}")
    for name, r in m["models"].items():
        print(f"{name:<6}{r['accuracy']:>8.3f}{r['precision']:>8.3f}{r['recall']:>8.3f}{r['f1']:>8.3f}{r['auc']:>8.3f}"
              f"{r['cv_auc_mean']:>8.3f}±{r['cv_auc_std']:.3f}")
    a = anomaly.train()
    print(f"\n== ตรวจจับค่ามิเตอร์ผิดปกติ (Isolation Forest) ==\nเทรนจาก {a['n_train']} ค่า | score p50={a['score_p50']:.3f} p95={a['score_p95']:.3f} p99={a['score_p99']:.3f}")
