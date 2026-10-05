// ทดสอบกติกาหน้าเจ้าหน้าที่: รันด้วย npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseLog, daysLeft, needsRenewal } from './rules.js';

test('ปุ่มต่อสัญญาแสดงเฉพาะหมดแล้วหรือเหลือไม่เกิน 90 วัน (ตรงกับ API)', () => {
  assert.equal(needsRenewal('2026-09-01', '2026-10-01'), true);
  assert.equal(needsRenewal('2026-12-30', '2026-10-01'), true);
  assert.equal(needsRenewal('2026-12-31', '2026-10-01'), false);
  assert.equal(needsRenewal(null, '2026-10-01'), false);
  assert.equal(daysLeft('2026-10-31', '2026-10-01'), 30);
});

test('บันทึกระบบ: รวมบรรทัดซ้ำที่ติดกัน พร้อมจำนวนและช่วงวัน', () => {
  const jobs = [
    { run_date: '2026-09-08', summary: 'B' },
    { run_date: '2026-09-08', summary: 'A' },
    { run_date: '2026-09-07', summary: 'A' },
    { run_date: '2026-09-06', summary: 'A' },
    { run_date: '2026-09-05', summary: 'B' },
  ];
  assert.deepEqual(collapseLog(jobs), [
    { summary: 'B', count: 1, from: '2026-09-08', to: '2026-09-08' },
    { summary: 'A', count: 3, from: '2026-09-06', to: '2026-09-08' },
    { summary: 'B', count: 1, from: '2026-09-05', to: '2026-09-05' },   // ไม่ติดกัน ไม่รวม
  ]);
  assert.deepEqual(collapseLog([]), []);
});
