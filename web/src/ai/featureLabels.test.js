// รัน: cd web && node --test src/ai/
import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_LABELS, bandPosition, describeFactor, featureLabel, meterTip, summarySentence, zPhrase } from './featureLabels.js';

const RAW = /late_count|avg_days_late|bill_ratio|tenure_years|stall_type|season/;

test('ทุกปัจจัยของโมเดลความเสี่ยงมีชื่อภาษาไทย', () => {
  for (const k of ['late_count', 'avg_days_late', 'bill_ratio', 'tenure_years', 'stall_type', 'season']) {
    assert.ok(FEATURE_LABELS[k], k);
    assert.doesNotMatch(featureLabel(k), RAW);
  }
  assert.equal(featureLabel('something_new'), 'ปัจจัยอื่น');   // ไม่คืนชื่อคอลัมน์ดิบ
});

test('describeFactor เขียนเป็นภาษาคนพร้อมค่าจริงของบิล', () => {
  assert.equal(describeFactor({ feature: 'late_count', value: 3 }, { n_prior: 6 }), 'จ่ายช้า 3 ครั้งใน 6 บิลล่าสุด');
  assert.equal(describeFactor({ feature: 'late_count', value: 0 }, { n_prior: 4 }), 'ไม่เคยจ่ายช้าใน 4 บิลล่าสุด');
  assert.equal(describeFactor({ feature: 'avg_days_late', value: 2.5 }), 'ช้าเฉลี่ย 2.5 วันต่อบิล');
  assert.equal(describeFactor({ feature: 'bill_ratio', value: 1.2 }), 'ยอดเดือนนี้สูงกว่าปกติ 20%');
  assert.equal(describeFactor({ feature: 'bill_ratio', value: 0.8 }), 'ยอดเดือนนี้ต่ำกว่าปกติ 20%');
  assert.equal(describeFactor({ feature: 'bill_ratio', value: 1.01 }), 'ยอดเดือนนี้ใกล้เคียงปกติ');
  assert.equal(describeFactor({ feature: 'tenure_years', value: 0.5 }), 'เพิ่งเช่าแผงได้ 6 เดือน');
  assert.equal(describeFactor({ feature: 'stall_type', value: 'cooked' }), 'แผงประเภทอาหารปรุงสุก');
  assert.equal(describeFactor({ feature: 'season', value: 'rainy' }), 'ครบกำหนดหน้าฝน');
  assert.equal(describeFactor({ feature: 'late_count', value: null }), FEATURE_LABELS.late_count);
});

test('ประโยคสรุปของบิลเสี่ยงสูงใช้ปัจจัยที่ดันขึ้น', () => {
  const s = summarySentence({
    level: 'high', features: { n_prior: 6 },
    contributions: [
      { feature: 'late_count', value: 3, direction: 'up' },
      { feature: 'tenure_years', value: 6, direction: 'down' },
      { feature: 'bill_ratio', value: 1.25, direction: 'up' },
    ],
  });
  assert.equal(s, 'ความเสี่ยงสูง เพราะจ่ายช้า 3 ครั้งใน 6 บิลล่าสุด และยอดเดือนนี้สูงกว่าปกติ 25% แม้ว่าเช่าแผงมาแล้ว 6 ปี');
  assert.doesNotMatch(s, RAW);
});

test('ประโยคสรุปของบิลเสี่ยงต่ำใช้ปัจจัยที่ดันลง', () => {
  const s = summarySentence({
    level: 'low', features: { n_prior: 6 },
    contributions: [{ feature: 'late_count', value: 0, direction: 'down' }, { feature: 'avg_days_late', value: 0, direction: 'down' }],
  });
  assert.equal(s, 'ความเสี่ยงต่ำ เพราะไม่เคยจ่ายช้าใน 6 บิลล่าสุด และจ่ายตรงเวลาทุกบิลที่ผ่านมา');
});

test('คำอธิบายระดับโมเดลบอกชัดว่าไม่ใช่ของบิลนี้', () => {
  const s = summarySentence({ level: 'mid', scope: 'global', contributions: [{ feature: 'late_count', value: null, direction: 'up' }] });
  assert.match(s, /ไม่ใช่เหตุผลเฉพาะของบิลนี้/);
});

test('บิลที่ยังไม่มีคำอธิบาย', () => {
  assert.equal(summarySentence({ level: null, contributions: [] }), 'ยังไม่มีคะแนน · ยังไม่มีคำอธิบายของบิลนี้');
});

test('zPhrase แปลง z เป็นภาษาคน', () => {
  assert.equal(zPhrase(4.2), 'สูงกว่าปกติของร้านนี้ราว 4.2 เท่าของความแปรปรวน');
  assert.equal(zPhrase(-3), 'ต่ำกว่าปกติของร้านนี้ราว 3 เท่าของความแปรปรวน');
  assert.equal(zPhrase(0.4), 'ใกล้เคียงปกติของร้านนี้');
  assert.equal(zPhrase(null), 'ไม่ได้คำนวณ (ประวัติไม่พอ)');
});

test('ข้อความจุดบนกราฟมิเตอร์ตรงกับตัวอย่างในแผน', () => {
  const band = { mean: 95, low: 70, high: 120 };
  assert.equal(meterTip({ value: 412, band, current: true }), 'อ่านได้ 412 หน่วย · คาดไว้ราว 95 หน่วย (ปกติ 70–120)');
  assert.equal(meterTip({ value: 88, label: 'ส.ค. 69' }), 'ส.ค. 69 · ใช้ 88 หน่วย');
  assert.match(meterTip({ value: 40, band: null, current: true }), /ประวัติไม่ถึง 3 เดือน/);
  assert.equal(bandPosition(412, band), 'above');
  assert.equal(bandPosition(30, band), 'below');
  assert.equal(bandPosition(100, band), 'inside');
});
