// ทดสอบกติกายืนยัน/แก้ค่ามิเตอร์และการเลิกทำ (RodeMap 3.3) โดยไม่ต้องมีฐานข้อมูล
const test = require('node:test');
const assert = require('node:assert');
const R = require('../src/lib/meterReview');

const CHECK = {
  anomaly: true, kind: 'high', prev_water: 1000, use_water: 412, prev_elec: 5000, use_elec: 300,
  z_water: 6.1, z_elec: 0.4, ratio_water: 4.3, ratio_elec: 1.02, z_threshold: 3, mean_water: 95, sd_water: 12,
};

test('ช่วงปกติ = ค่าเฉลี่ย ± k × SD ไม่ติดลบ', () => {
  assert.deepEqual(R.band(95, 12, 3), { mean: 95, low: 59, high: 131, k: 3 });
  assert.equal(R.band(5, 4, 3).low, 0);
  assert.equal(R.band(null, 1, 3), null);
});

test('ช่วงปกติย้อนหลังใช้สูตรเดียวกับ ML (SD แบบ n−1 และขั้นต่ำ 8% ของค่าเฉลี่ย)', () => {
  // ค่าเฉลี่ย 100 · SD ตัวอย่าง = sqrt((100+0+100)/2) = 10 · ขั้นต่ำ 8 → ใช้ 10
  assert.deepEqual(R.recomputeBand([90, 100, 110], 3), { mean: 100, low: 70, high: 130, k: 3, sd: 10 });
  // ค่าเท่ากันหมด SD = 0 → ใช้ 8% ของค่าเฉลี่ย = 8
  assert.deepEqual(R.recomputeBand([50, 50, 50, 50], 3).sd, 4);
  assert.equal(R.recomputeBand([1, 2], 3), null);          // ประวัติไม่ถึง 3 เดือน
});

test('หาว่าน้ำหรือไฟที่ถูกทัก', () => {
  assert.deepEqual(R.flaggedUtilities(CHECK), ['water']);
  assert.deepEqual(R.flaggedUtilities({ ...CHECK, z_elec: 3.5 }), ['water', 'elec']);
  assert.deepEqual(R.flaggedUtilities({ anomaly: true, kind: 'misread', use_water: 10, use_elec: -37 }), ['elec']);
  // ทักเพราะรูปแบบ (Isolation Forest) อย่างเดียว: ดูทั้งคู่
  assert.deepEqual(R.flaggedUtilities({ ...CHECK, z_water: 1, ratio_water: 1.1, kind: 'pattern' }), ['water', 'elec']);
  assert.deepEqual(R.flaggedUtilities({ ...CHECK, anomaly: false }), []);
});

test('ค่าที่ถูกแก้หลัง AI ตรวจ = ผลตรวจเก่า', () => {
  assert.equal(R.checkedValue(CHECK, 'water'), 1412);
  assert.equal(R.isStale(CHECK, { water: 1412, elec: 5300 }), false);
  assert.equal(R.isStale(CHECK, { water: 1100, elec: 5300 }), true);
});

test('snapshot เก็บเหตุผลและน้ำ/ไฟที่ถูกทัก ณ ตอนตัดสิน', () => {
  const s = R.snapshotOf({ ...CHECK, reasons: ['ใช้น้ำ 4.3 เท่าของปกติ'], if_level: 'abnormal', method: 'both', extra: 1 });
  assert.deepEqual(s.reasons, ['ใช้น้ำ 4.3 เท่าของปกติ']);
  assert.deepEqual(s.flagged_utilities, ['water']);
  assert.equal(s.z_water, 6.1);
  assert.equal(s.extra, undefined);
  assert.equal(R.snapshotOf(null), null);
});

test('ยืนยันค่าที่เลขน้อยกว่ารอบก่อนไม่ได้', () => {
  assert.match(R.validateReview({ decision: 'confirmed', utility: 'elec' }, { kind: 'misread', prev: 5000, cur: 4963 }), /ยืนยันไม่ได้/);
  assert.equal(R.validateReview({ decision: 'confirmed', utility: 'water' }, { kind: 'high', prev: 1000, cur: 1412 }), null);
});

test('แก้ค่าต้องเป็นจำนวนเต็มไม่น้อยกว่ารอบก่อน และไม่เท่าค่าเดิม', () => {
  const ctx = { kind: 'high', prev: 1000, cur: 1412 };
  assert.equal(R.validateReview({ decision: 'corrected', utility: 'water', new_value: 1095 }, ctx), null);
  assert.match(R.validateReview({ decision: 'corrected', utility: 'water', new_value: 999 }, ctx), /ไม่น้อยกว่าเลขรอบก่อน/);
  assert.match(R.validateReview({ decision: 'corrected', utility: 'water', new_value: 10.5 }, ctx), /จำนวนเต็ม/);
  assert.match(R.validateReview({ decision: 'corrected', utility: 'water', new_value: 1412 }, ctx), /เท่ากับค่าเดิม/);
  assert.match(R.validateReview({ decision: 'deleted', utility: 'water' }, ctx), /ยืนยันค่าหรือแก้ค่า/);
  assert.match(R.validateReview({ decision: 'confirmed', utility: 'gas' }, ctx), /น้ำหรือไฟ/);
  assert.match(R.validateReview({ decision: 'confirmed', utility: 'water', client_ref: 'x; drop' }, ctx), /รหัสอ้างอิง/);
});

const REV = { id: '7', reviewed_by: 3, undone_at: null, age_s: 5 };

test('เลิกทำ: กรณีปกติ (คนเดิม ภายใน 30 วินาที รายการล่าสุด)', () => {
  assert.deepEqual(R.canUndo(REV, { userId: 3, latestId: 7, issued: false }), { ok: true });
});

test('เลิกทำ: เกินเวลา 30 วินาที', () => {
  const r = R.canUndo({ ...REV, age_s: 30.5 }, { userId: 3, latestId: 7, issued: false });
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.match(r.error, /เลยเวลาเลิกทำ/);
  assert.equal(R.canUndo({ ...REV, age_s: 30 }, { userId: 3, latestId: 7 }).ok, true);   // ขอบพอดียังได้
});

test('เลิกทำ: เน็ตหลุดแล้วกดซ้ำ ได้ผลเดิมไม่ error', () => {
  assert.deepEqual(R.canUndo({ ...REV, undone_at: '2026-10-03T00:00:00Z', age_s: 50 }, { userId: 3, latestId: null }), { ok: true, already: true });
});

test('เลิกทำ: คนอื่น · ออกบิลแล้ว · มีรายการใหม่กว่า', () => {
  assert.equal(R.canUndo(REV, { userId: 4, latestId: 7 }).status, 403);
  assert.equal(R.canUndo(REV, { userId: 3, latestId: 7, issued: true }).status, 409);
  assert.match(R.canUndo(REV, { userId: 3, latestId: 8 }).error, /ใหม่กว่า/);
  assert.equal(R.canUndo(null, { userId: 3 }).status, 404);
});
