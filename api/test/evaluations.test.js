// ทดสอบการสรุปผลวัดโมเดลหลายชุดข้อมูล (lib/evaluations.js)
const test = require('node:test');
const assert = require('node:assert');
const E = require('../src/lib/evaluations');

const row = (task, dataset, model, m) => ({ task, dataset, model, auc: null, pr_auc: null, precision: null, recall: null, f1: null, accuracy: null, brier: null, cv_auc_mean: null, ...m });
const ROWS = [
  row('risk', 'baseline', 'lr', { auc: 0.835, cv_auc_mean: 0.769, f1: 0.64, brier: 0.165 }),
  row('risk', 'baseline', 'rf', { auc: 0.823, cv_auc_mean: 0.765, f1: 0.62, brier: 0.169 }),
  row('risk', 'baseline', 'baseline', { auc: 0.5, cv_auc_mean: 0.5, f1: 0, brier: 0.239 }),
  row('risk', 'rare_late', 'lr', { auc: 0.731, cv_auc_mean: 0.663, f1: 0, brier: 0.089 }),
  row('risk', 'rare_late', 'rf', { auc: 0.807, cv_auc_mean: 0.807, f1: 0, brier: 0.082 }),
  row('risk', 'rare_late', 'baseline', { auc: 0.5, cv_auc_mean: 0.5, f1: 0, brier: 0.094 }),
  row('anomaly', 'baseline', 'z', { auc: 0.993, f1: 0.774 }),
  row('anomaly', 'baseline', 'if', { auc: 0.996, f1: 0.818 }),
  row('anomaly', 'baseline', 'both', { auc: 0.992, f1: 0.774 }),
];

test('ตัวที่ดีที่สุดต่อชุด: ความเสี่ยงดู CV AUC มิเตอร์ดู F1 และไม่นับเกณฑ์อ้างอิง', () => {
  const b = E.bestByDataset(ROWS);
  assert.deepEqual(b['risk/baseline'], { metric: 'cv_auc_mean', value: 0.769, models: ['lr'] });
  assert.deepEqual(b['risk/rare_late'].models, ['rf']);
  assert.deepEqual(b['anomaly/baseline'], { metric: 'f1', value: 0.818, models: ['if'] });
});

test('เสมอกันได้หลายตัว และชุดที่ไม่มีค่าไม่มีผู้ชนะ', () => {
  const b = E.bestByDataset([row('anomaly', 'x', 'z', { f1: 0.5 }), row('anomaly', 'x', 'both', { f1: 0.5 }), row('anomaly', 'y', 'z', {})]);
  assert.deepEqual(b['anomaly/x'].models, ['z', 'both']);
  assert.equal(b['anomaly/y'], undefined);
});

test('ค่าเฉลี่ย ± SD ข้ามชุดข้อมูล (SD แบบตัวอย่าง) และนับจำนวนชุดที่ชนะ', () => {
  const s = E.summarize(ROWS);
  const rf = s.find(x => x.task === 'risk' && x.model === 'rf');
  assert.equal(rf.datasets, 2);
  assert.equal(rf.metrics.auc.mean, 0.815);
  assert.equal(rf.metrics.auc.sd, 0.0113);                // |0.823−0.807| / √2 = 0.01131
  assert.equal(rf.wins, 1);
  assert.equal(s.find(x => x.model === 'lr').wins, 1);
  assert.equal(s.find(x => x.model === 'baseline').wins, 0);
  assert.equal(s.find(x => x.model === 'if').metrics.pr_auc, null);   // ไม่มีค่า = null ไม่เติมเอง
});

test('แปลงตัวเลขจากฐานข้อมูล', () => {
  const r = E.normalizeRow({ auc: '0.81234567', brier: null, positive_rate: 0.3333333 });
  assert.equal(r.auc, 0.8123);
  assert.equal(r.brier, null);
  assert.equal(r.positive_rate, 0.3333);
});

const cvRow = (dataset, model, auc, brier) => row('risk', dataset, model, {
  cv_auc_mean: auc.reduce((a, b) => a + b) / auc.length,
  extra: { cv_scores: { auc, brier }, cv_brier_mean: brier.reduce((a, b) => a + b) / brier.length },
});

test('paired t ของผลรายพับ', () => {
  // ผลต่าง 0.2, 0.2, 0.2, 0.21, 0.19 → ค่าเฉลี่ย 0.2 SD เล็กมาก → t สูง
  assert.ok(E.pairedT([0.8, 0.8, 0.8, 0.81, 0.79], [0.6, 0.6, 0.6, 0.6, 0.6]) > 20);
  assert.equal(E.pairedT([0.5], [0.4]), null);
  assert.equal(E.pairedT([0.5, 0.6], [0.5, 0.6]), 0);
});

test('สมมติฐาน: เป็นไปตามคาด / สวนทาง / สรุปไม่ได้', () => {
  const ds = [
    { task: 'risk', key: 'interaction', title: 'กลับทาง', expect: ['rf'], expect_metric: 'cv_auc', hypothesis: 'h1' },
    { task: 'risk', key: 'flip', title: 'สวน', expect: ['lr'], expect_metric: 'cv_auc', hypothesis: 'h2' },
    { task: 'risk', key: 'small', title: 'น้อย', expect: ['lr'], expect_metric: 'cv_brier', hypothesis: 'h3' },
    { task: 'anomaly', key: 'pattern', title: 'สวนทาง', expect: ['if', 'both'], hypothesis: 'h4' },
    { task: 'risk', key: 'plain', title: 'ปกติ', expect: [] },
  ];
  const rows = [
    cvRow('interaction', 'lr', [0.52, 0.5, 0.55, 0.51, 0.53], [0.2, 0.2, 0.2, 0.2, 0.2]),
    cvRow('interaction', 'rf', [0.73, 0.72, 0.75, 0.71, 0.74], [0.18, 0.18, 0.18, 0.18, 0.18]),
    cvRow('flip', 'lr', [0.52, 0.5, 0.55, 0.51, 0.53], [0.2, 0.2, 0.2, 0.2, 0.2]),
    cvRow('flip', 'rf', [0.73, 0.72, 0.75, 0.71, 0.74], [0.2, 0.2, 0.2, 0.2, 0.2]),
    cvRow('small', 'lr', [0.7, 0.8, 0.6, 0.9, 0.75], [0.19, 0.17, 0.22, 0.2, 0.18]),
    cvRow('small', 'rf', [0.75, 0.7, 0.65, 0.85, 0.72], [0.2, 0.21, 0.18, 0.2, 0.2]),
    row('anomaly', 'pattern', 'z', { f1: 0.5 }), row('anomaly', 'pattern', 'if', { f1: 0.67 }), row('anomaly', 'pattern', 'both', { f1: 0.75 }),
  ];
  const h = Object.fromEntries(E.checkHypotheses(rows, ds).map(x => [x.dataset, x]));
  assert.equal(h.interaction.held, 'yes');
  assert.equal(h.interaction.winner, 'rf');
  assert.equal(h.flip.held, 'no');
  assert.equal(h.small.metric, 'cv_brier');
  assert.equal(h.small.held, 'unclear');                    // ต่างกันน้อยกว่าความแกว่งของพับ
  assert.equal(h.pattern.held, 'yes');                      // both 0.75 ชนะ z 0.5 ห่าง ≥ 0.05
  assert.deepEqual(h.pattern.compared, ['both', 'z']);
  assert.equal(h.plain, undefined);                         // ชุดที่ไม่ได้ตั้งสมมติฐานไม่ถูกตรวจ
});
