// ทดสอบสรุปการตรวจค่ามิเตอร์เพื่อปรับเกณฑ์ (RodeMap รอบ 5)
const test = require('node:test');
const assert = require('node:assert');
const { reviewStats, zMax } = require('../src/lib/reviewStats');

const row = (decision, z, extra = {}) => ({ decision, snapshot: { kind: 'high', z_water: z, z_elec: 0.2, if_level: 'abnormal', ...extra } });

test('z สูงสุดของน้ำหรือไฟ (ค่าสัมบูรณ์)', () => {
  assert.equal(zMax({ z_water: -5, z_elec: 2 }), 5);
  assert.equal(zMax(null), 0);
});

test('แบ่งช่วงตามเกณฑ์ปัจจุบัน และแยกเลขน้อยกว่ารอบก่อนออกไป', () => {
  const s = reviewStats([
    row('confirmed', 3.4), row('corrected', 3.9), row('corrected', 5), row('corrected', 9),
    row('confirmed', 1.2, { if_level: 'suspicious' }),
    { decision: 'corrected', snapshot: { kind: 'misread' } },
    { decision: 'confirmed', snapshot: null },
  ], 3);
  const by = Object.fromEntries(s.buckets.map(b => [b.key, b]));
  assert.deepEqual([by.below.n, by.near.n, by.mid.n, by.far.n], [1, 2, 1, 1]);
  assert.equal(by.near.corrected_rate, 0.5);
  assert.equal(s.misread, 1);
  assert.equal(s.no_snapshot, 1);
  assert.equal(s.if_levels.abnormal.n, 4);
  assert.equal(s.suggestion, null);                         // ข้อมูลยังน้อย ไม่แนะนำ
  assert.match(s.note, /อย่างน้อย 10/);
});

test('แนะนำขยับเกณฑ์เมื่อข้อมูลพอและเลขถูกเกือบทั้งหมด พร้อมบอกข้อควรระวัง', () => {
  const rows = [...Array(9)].map(() => row('confirmed', 3.5)).concat([row('corrected', 3.2)]);
  const s = reviewStats(rows, 3);
  assert.equal(s.suggestion.z_threshold, 4);
  assert.match(s.suggestion.text, /9 จาก 10/);
  assert.match(s.suggestion.text, /ท่อรั่ว/);
});

test('ไม่แนะนำเมื่อเจ้าหน้าที่ต้องแก้ค่าบ่อย (AI จับเลขผิดได้จริง)', () => {
  const rows = [...Array(6)].map(() => row('corrected', 3.5)).concat([...Array(6)].map(() => row('confirmed', 3.5)));
  assert.equal(reviewStats(rows, 3).suggestion, null);
});
