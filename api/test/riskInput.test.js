// ทดสอบการตรวจแถวของหน้า "ทำนายจากไฟล์" (lib/riskInput.js) ต้องตรงกับ web/src/ai/predictFile.js checkRow
const test = require('node:test');
const assert = require('node:assert');
const { MAX_ROWS, rowErrors, validateRows } = require('../src/lib/riskInput');

const good = { ref: 'ก', stall_type: 'dry', due_month: 7, tenure_years: 2, n_prior: 6, late_count: 1, days_late_total: 3, bill_total: 3000, prev_avg: 2900 };

test('แถวถูกต้องผ่าน และตัดฟิลด์อื่นทิ้ง', () => {
  assert.deepEqual(rowErrors(good), []);
  const r = validateRows([{ ...good, extra: 'x', __proto__x: 1 }]);
  assert.deepEqual(r.rows, [{ ...good, early_days_avg: null, seen_count: null, app_count: null }]);
  assert.deepEqual(validateRows([{ ...good, ref: undefined }]).rows[0].ref, '');
});

test('ปฏิเสธค่าที่ไม่ใช่ตัวเลข นอกช่วง หรือขัดกันเอง', () => {
  const bad = f => rowErrors({ ...good, ...f }).join(' | ');
  assert.match(bad({ stall_type: 'ของชำ' }), /stall_type/, 'API รับเฉพาะรหัส หน้าเว็บแปลงชื่อไทยให้แล้ว');
  assert.match(bad({ due_month: 13 }), /due_month/);
  assert.match(bad({ due_month: '7' }), /due_month/, 'สตริงไม่ผ่าน');
  assert.match(bad({ n_prior: 2.5 }), /จำนวนเต็ม/);
  assert.match(bad({ bill_total: 0 }), /bill_total/);
  assert.match(bad({ tenure_years: NaN }), /tenure_years/);
  assert.match(bad({ late_count: 4, n_prior: 3, days_late_total: 9 }), /มากกว่า n_prior/);
  assert.match(bad({ late_count: 0, days_late_total: 5 }), /ไม่เป็น 0/);
  assert.match(bad({ late_count: 3, days_late_total: 2 }), /ไม่น้อยกว่า/);
  assert.match(bad({ ref: 'x'.repeat(61) }), /ref/);
  assert.deepEqual(rowErrors(null), ['ไม่ใช่ข้อมูลหนึ่งแถว']);
  // พฤติกรรม: ไม่บังคับ แต่ถ้าส่งมาต้องถูกต้อง
  assert.deepEqual(rowErrors({ ...good, early_days_avg: 4.5, seen_count: 6, app_count: 0 }), []);
  assert.match(bad({ seen_count: 7 }), /seen_count/);
  assert.match(bad({ n_prior: 3, seen_count: 4, late_count: 1 }), /seen_count มากกว่า n_prior/);
  assert.match(bad({ app_count: 1.5 }), /app_count/);
  assert.match(bad({ early_days_avg: -1 }), /early_days_avg/);
});

test('ทั้งชุด: ว่าง เกินจำนวน และบอกแถวที่ผิด', () => {
  assert.match(validateRows([]).error, /ไม่มีแถว/);
  assert.match(validateRows('x').error, /ไม่มีแถว/);
  assert.match(validateRows(Array(MAX_ROWS + 1).fill(good)).error, /ไม่เกิน 500/);
  const r = validateRows([good, { ...good, due_month: 0 }]);
  assert.match(r.error, /1 แถว/);
  assert.equal(r.details[0].index, 1);
});
