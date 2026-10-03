// ทดสอบการจัดรูปคำอธิบายรายบิล (RodeMap 3.2) โดยไม่ต้องมีฐานข้อมูลหรือ ML
const test = require('node:test');
const assert = require('node:assert');
const { explainView, listRow, cleanContributions } = require('../src/lib/aiExplain');

const AI = { risk_model: 'lr', risk_high: 0.7, risk_mid: 0.4 };
const RUN = { id: 9, model_type: 'risk_lr', trained_at: '2026-10-02T07:00:00Z', is_synthetic: true };
const bill = over => ({
  id: 1, bill_no: 'INV-202609-A-04', stall_id: 'A-04', period: '2026-09', total: 1850, due_date: '2026-10-10', status: 'unpaid',
  full_name: 'นางสมใจ', phone: '0812345678', national_id: '1100000000000',
  risk_score: 0.82, risk_model: 'lr', risk_scored_at: '2026-10-02T08:00:00Z',
  risk_features: {
    late_count: 3, avg_days_late: 2.5, bill_ratio: 1.2, tenure_years: 6, stall_type: 'cooked', season: 'rainy', n_prior: 6,
    sim_secret: 0.9, reasons: ['เคยจ่ายช้า'],
    contributions: [
      { feature: 'late_count', value: 3, direction: 'up', contribution: 1.2 },
      { feature: 'tenure_years', value: 6, direction: 'down', contribution: -0.4 },
    ],
    explain: { method: 'linear', scope: 'local', unit: 'logit', base: -0.5 },
  },
  ...over,
});

test('คำอธิบายไม่มีเบอร์โทร เลขบัตร หรือคอลัมน์ภายใน', () => {
  const v = explainView(bill(), AI, RUN);
  const s = JSON.stringify(v);
  assert.doesNotMatch(s, /0812345678|1100000000000|sim_secret/);
  assert.deepEqual(Object.keys(v.features).sort(), ['avg_days_late', 'bill_ratio', 'late_count', 'n_prior', 'season', 'stall_type', 'tenure_years']);
});

test('ระดับและปัจจัยของบิลที่มีคำอธิบายรายบิล', () => {
  const v = explainView(bill(), AI, RUN);
  assert.equal(v.level, 'high');
  assert.equal(v.scope, 'local');
  assert.equal(v.contributions.length, 2);
  assert.equal(v.explain.method, 'linear');
  assert.equal(v.is_synthetic, true);
  assert.equal(v.stale, false);
  assert.deepEqual(v.legacy_reasons, []);          // มีปัจจัยแล้ว ไม่ต้องใช้เหตุผลแบบเก่า
});

test('บิลที่ยังไม่มีคะแนน', () => {
  const v = explainView(bill({ risk_score: null, risk_features: null, risk_scored_at: null }), AI, RUN);
  assert.equal(v.scored, false);
  assert.equal(v.level, null);
  assert.equal(v.scope, 'none');
  assert.deepEqual(v.contributions, []);
});

test('คำอธิบายระดับโมเดล (scope global) ถูกบอกต่อให้หน้าเว็บ', () => {
  const rf = { ...bill().risk_features, explain: { method: 'permutation', scope: 'global' },
    contributions: [{ feature: 'late_count', value: null, direction: 'up', contribution: 0.1 }] };
  const v = explainView(bill({ risk_features: rf }), AI, RUN);
  assert.equal(v.scope, 'global');
  assert.equal(listRow(bill({ risk_features: rf }), AI).scope, 'global');
});

test('ให้คะแนนก่อนรอบเทรนล่าสุด = คำอธิบายจากโมเดลรุ่นก่อน', () => {
  const v = explainView(bill({ risk_scored_at: '2026-10-01T00:00:00Z' }), AI, RUN);
  assert.equal(v.stale, true);
});

test('บิลรุ่นเก่าที่มีแต่เหตุผลแบบข้อความ', () => {
  const rf = { late_count: 1, reasons: ['เคยจ่ายช้า 1 ครั้ง'] };
  const v = explainView(bill({ risk_features: rf }), AI, RUN);
  assert.equal(v.scope, 'none');
  assert.deepEqual(v.legacy_reasons, ['เคยจ่ายช้า 1 ครั้ง']);
});

test('ปัจจัยที่ข้อมูลเสียถูกตัดทิ้ง และไม่เกิน 5 ตัว', () => {
  const list = [{ feature: 'a', direction: 'up' }, { direction: 'up' }, { feature: 'b', direction: 'sideways' }, null,
    ...['c', 'd', 'e', 'f', 'g'].map(f => ({ feature: f, direction: 'down', contribution: '-0.1' }))];
  const out = cleanContributions(list);
  assert.deepEqual(out.map(c => c.feature), ['a', 'c', 'd', 'e', 'f']);
  assert.equal(out[1].contribution, -0.1);
});

test('แถวในรายการใช้ปัจจัยที่ดันขึ้นเมื่อเสี่ยง และดันลงเมื่อเสี่ยงต่ำ', () => {
  assert.equal(listRow(bill(), AI).lead.feature, 'late_count');
  assert.equal(listRow(bill({ risk_score: 0.1 }), AI).lead.feature, 'tenure_years');
  assert.equal(listRow(bill(), AI).phone, undefined);
});
