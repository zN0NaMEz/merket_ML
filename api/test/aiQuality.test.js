// ทดสอบการสรุปคุณภาพโมเดล (RodeMap 3.4) โดยไม่ต้องมีฐานข้อมูล
const test = require('node:test');
const assert = require('node:assert');
const Q = require('../src/lib/aiQuality');

const RUN = {
  id: 5, model_type: 'risk_lr', trained_at: '2026-10-03T12:53:32Z', n_train: 356, n_test: 119, is_synthetic: true,
  metrics: { auc: 0.799, precision: 0.675, recall: 0.6, accuracy: 0.739, f1: 0.635, late_rate: 0.379 },
  cv_scores: { auc: [0.823, 0.7759, 0.7524, 0.7637, 0.7345], recall: [0.5556, 0.5833, 0.4167, 0.5556, 0.5] },
  confusion: { tn: 61, fp: 13, fn: 18, tp: 27, threshold: 0.5 },
  calibration: { prob_pred: [0.1, 0.5, 0.9], prob_true: [0.2, 0.5, 0.7], counts: [10, 10, 20], brier: 0.17 },
  global_importance: [{ feature: 'bill_ratio', value: 0.001, std: 0.0007 }, { feature: 'late_count', value: 0.13, std: 0.05 }],
};

test('ค่าเฉลี่ย ± SD ของ 5-fold ใช้ SD แบบตัวอย่าง (n−1)', () => {
  const s = Q.meanSd([0.823, 0.7759, 0.7524, 0.7637, 0.7345]);
  assert.equal(s.mean, 0.7699);
  assert.equal(s.sd, 0.0334);           // numpy.std(ddof=1) = 0.03337
  assert.equal(s.folds.length, 5);
  assert.equal(Q.meanSd([]), null);
});

test('ความห่างของ calibration ถ่วงตามจำนวนบิล', () => {
  // (0.1×10 + 0×10 + 0.2×20) / 40 = 0.125
  assert.equal(Q.calibrationGap(RUN.calibration), 0.125);
  assert.equal(Q.calibrationGap(null), null);
});

test('มุมมองเต็ม: เรียงความสำคัญจากมากไปน้อย และไม่เติมค่าที่ไม่มี', () => {
  const f = Q.fullView(RUN);
  assert.equal(f.importance[0].feature, 'late_count');
  assert.equal(f.cv.auc.mean, 0.7699);
  assert.equal(f.cv.precision, undefined);            // ไม่มีผล CV ของ precision = ไม่สร้างขึ้นมาเอง
  assert.equal(f.confusion.tp, 27);
  assert.equal(f.calibration.gap, 0.125);
  const bare = Q.fullView({ id: 1, model_type: 'risk_lr', metrics: {} });
  assert.equal(bare.cv, null);
  assert.equal(bare.confusion, null);
  assert.equal(bare.calibration, null);
  assert.equal(bare.importance, null);
  assert.equal(bare.test.auc, null);
});

test('สรุปของเจ้าของ: ภาษาง่าย ไม่มีชื่อโมเดลหรือผลรายพับ', () => {
  const o = Q.ownerView(RUN, { metrics: { auc: 0.75 } });
  assert.equal(o.caught_of10, 6);
  assert.equal(o.right_of10, 7);
  assert.equal(o.auc_word, 'พอใช้');
  assert.deepEqual(o.trend, { delta: 0.049, word: 'better' });
  assert.equal(o.steady, true);
  const s = JSON.stringify(o);
  assert.doesNotMatch(s, /risk_lr|Logistic|folds|cv_scores/);
});

test('แนวโน้มและคำบรรยาย AUC', () => {
  assert.equal(Q.trend(0.80, 0.795).word, 'same');
  assert.equal(Q.trend(0.70, 0.80).word, 'worse');
  assert.equal(Q.trend(0.8, null), null);
  assert.deepEqual([0.85, 0.72, 0.65, 0.5].map(Q.aucWord), ['ดี', 'พอใช้', 'อ่อน', 'ใช้ไม่ได้']);
});
