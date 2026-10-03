// ทดสอบตรรกะแท็บทดสอบหลายชุดข้อมูล: รันด้วย npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { hypothesisDetail, insights, modelList, toCsv } from './evaluation.js';

const DS = [{ task: 'risk', key: 'rare_late', title: 'จ่ายช้าน้อย' }, { task: 'risk', key: 'noisy', title: 'สุ่มมาก' },
  { task: 'anomaly', key: 'seasonal', title: 'ฤดูกาลแรง' }];
const R = (task, dataset, model, m) => ({ task, dataset, model, auc: null, recall: null, accuracy: null, extra: {}, ...m });

test('แยกได้แต่ไม่เตือน และ accuracy หลอกตา (ข้อมูลไม่สมดุล)', () => {
  const out = insights([
    R('risk', 'rare_late', 'lr', { auc: 0.73, recall: 0, accuracy: 0.895 }),
    R('risk', 'rare_late', 'rf', { auc: 0.81, recall: 0, accuracy: 0.895 }),
    R('risk', 'rare_late', 'baseline', { auc: 0.5, recall: 0, accuracy: 0.895 }),
  ], DS);
  const silent = out.filter(i => /ไม่เตือนสักใบ/.test(i.text));
  assert.equal(silent.length, 1);                                     // รวมสองโมเดลเป็นบรรทัดเดียว
  assert.match(silent[0].text, /Logistic Regression และ Random Forest แยกบิลได้ \(AUC 0\.730, 0\.810\)/);
  assert.ok(out.some(i => /accuracy จึงหลอกตา/.test(i.text) && /90%/.test(i.text)));
  assert.ok(out.every(i => i.text.startsWith('จ่ายช้าน้อย')));
});

test('ใกล้การเดาสุ่มเมื่อทุกโมเดล AUC < 0.6', () => {
  const out = insights([R('risk', 'noisy', 'lr', { auc: 0.555, recall: 0.14, accuracy: 0.7 }), R('risk', 'noisy', 'rf', { auc: 0.536, recall: 0.19, accuracy: 0.71 }),
    R('risk', 'noisy', 'baseline', { auc: 0.5, recall: 0, accuracy: 0.673 })], DS);
  assert.equal(out.length, 1);
  assert.match(out[0].text, /ใกล้การเดาสุ่ม \(AUC สูงสุด 0\.555\)/);
});

test('ทักผิดบ่อยของการตรวจมิเตอร์', () => {
  const out = insights([R('anomaly', 'seasonal', 'z', { extra: { false_alarms_per_100: 5.71 } }), R('anomaly', 'seasonal', 'if', { extra: { false_alarms_per_100: 0 } }),
    R('anomaly', 'seasonal', 'both', { extra: { false_alarms_per_100: 5.71 } })], DS);
  assert.equal(out.length, 1);
  assert.match(out[0].text, /z-score และ ใช้ทั้งสองวิธี ทักผิด 5\.71 ครั้งต่อ 100 ค่า/);
});

test('ผลดีไม่มีข้อสังเกต', () => {
  assert.deepEqual(insights([R('risk', 'x', 'lr', { auc: 0.84, recall: 0.55, accuracy: 0.76 }), R('risk', 'x', 'baseline', { auc: 0.5, recall: 0, accuracy: 0.6 })]), []);
});

test('CSV มี BOM หัวตารางไทย และ escape เครื่องหมายจุลภาค', () => {
  const csv = toCsv([R('risk', 'rare_late', 'lr', { auc: 0.731, n_rows: 420, positive_rate: 0.105, extra: { n_test: 105 } })],
    [{ task: 'risk', key: 'rare_late', title: 'จ่ายช้า, น้อย' }]);
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^ความเสี่ยงจ่ายช้า,"จ่ายช้า, น้อย",rare_late,Logistic Regression,105,0\.105,0\.731,/);
});

test('คำอธิบายผลสมมติฐาน: มีผลรายพับใช้ t ไม่มีใช้ส่วนต่าง', () => {
  assert.equal(hypothesisDetail({ compared: ['rf', 'lr'], winner: 'rf', diff: 0.2052, t: 12.345 }),
    'Random Forest ดีกว่า Logistic Regression ห่าง 0.205 · t = 12.35 จากผลจับคู่ 5 พับ (ต้องเกิน 2.78 จึงนับว่าไม่ใช่ความบังเอิญ)');
  assert.equal(hypothesisDetail({ compared: ['both', 'z'], winner: 'z', diff: 0.02, t: null }),
    'z-score ดีกว่า ใช้ทั้งสองวิธี ห่าง 0.020 (ต้องห่างอย่างน้อย 0.050 จึงนับว่าต่างจริง)');
  assert.equal(hypothesisDetail({ held: 'unclear', reason: 'ผลวัดไม่ครบ' }), 'ผลวัดไม่ครบ');
  assert.equal(modelList(['if', 'both']), 'Isolation Forest หรือ ใช้ทั้งสองวิธี');
});
