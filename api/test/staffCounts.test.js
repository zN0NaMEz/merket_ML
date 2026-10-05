// ทดสอบการนับงานค้างของเจ้าหน้าที่ (lib/staffCounts.js)
const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/lib/staffCounts');

test('สัญญาใกล้หมด: หมดแล้วหรือเหลือไม่เกิน 90 วัน', () => {
  assert.equal(C.needsRenewal('2026-09-01', '2026-10-01'), true);        // หมดแล้ว
  assert.equal(C.needsRenewal('2026-12-30', '2026-10-01'), true);        // อีก 90 วันพอดี
  assert.equal(C.needsRenewal('2026-12-31', '2026-10-01'), false);       // อีก 91 วัน
  assert.equal(C.needsRenewal(null, '2026-10-01'), false);               // ไม่มีสัญญา
});

test('มิเตอร์รอตรวจ: ทักอยู่และ (จดผิด หรือยังไม่ยืนยัน)', () => {
  const drafts = [
    { ack: false, ai_check: { anomaly: true, kind: 'high' } },     // รอ
    { ack: true, ai_check: { anomaly: true, kind: 'high' } },      // ยืนยันแล้ว
    { ack: true, ai_check: { anomaly: true, kind: 'misread' } },   // จดผิด ยืนยันไม่ได้ ยังต้องแก้
    { ack: false, ai_check: { anomaly: false, kind: 'normal' } },  // ปกติ
    { ack: false, ai_check: null },                                 // ยังไม่ได้ตรวจ
  ];
  assert.equal(C.meterPending(drafts), 2);
});

test('รวมจำนวนงานค้าง', () => {
  const c = C.staffCounts({
    ff: { overdue: [1, 2, 3, 4], to_cut: [1, 2], to_restore: [] },
    vendors: [{ end_date: '2026-09-02' }, { end_date: '2026-11-01' }, { end_date: '2028-01-01' }],
    drafts: [{ ack: false, ai_check: { anomaly: true, kind: 'low' } }],
    today: '2026-10-01', unread: 5,
  });
  assert.deepEqual(c, { overdue: 4, to_cut: 2, to_restore: 0, meter_pending: 1, contracts_expiring: 2, unread: 5 });
});
