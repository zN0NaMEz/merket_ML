// ทดสอบตรรกะเลิกทำฝั่งหน้าเว็บ: รันด้วย npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNDO_TOAST_MS, failMessage, newClientRef, savedMessage, sendWithRetry } from './undo.js';

const noWait = () => Promise.resolve();
const netErr = () => Object.assign(new TypeError('Failed to fetch'));
const httpErr = (status, message) => Object.assign(new Error(message), { status });

test('toast เลิกทำแสดง 6 วินาที', () => assert.equal(UNDO_TOAST_MS, 6000));

test('client_ref ใช้ได้กับ API (ตัวอักษร ตัวเลข _ ยาว 8–64)', () => {
  const a = newClientRef(), b = newClientRef();
  assert.match(a, /^[A-Za-z0-9_-]{8,64}$/);
  assert.notEqual(a, b);
  assert.match(newClientRef(null), /^cr_[a-z0-9]+$/);     // เบราว์เซอร์เก่าที่ไม่มี randomUUID
});

test('เน็ตหลุด: ลองใหม่ด้วยคำขอเดิม จนสำเร็จ', async () => {
  const seen = [];
  const ref = newClientRef();
  const r = await sendWithRetry(async n => {
    seen.push(ref);
    if (n < 3) throw netErr();
    return { review_id: 9, replay: true };
  }, { wait: noWait });
  assert.equal(r.attempts, 3);
  assert.deepEqual(r.data, { review_id: 9, replay: true });
  assert.ok(seen.every(x => x === ref), 'ทุกครั้งต้องใช้ client_ref เดิม');
});

test('เน็ตหลุดเกินจำนวนครั้ง: โยน error ให้หน้าเว็บแสดงปุ่มลองใหม่', async () => {
  await assert.rejects(sendWithRetry(async () => { throw netErr(); }, { wait: noWait, delays: [1, 1] }), e => e.attempts === 3);
});

test('เซิร์ฟเวอร์ตอบ error (เช่น เลยเวลาเลิกทำ): ไม่ลองซ้ำ', async () => {
  let calls = 0;
  await assert.rejects(sendWithRetry(async () => { calls += 1; throw httpErr(409, 'เลยเวลาเลิกทำ'); }, { wait: noWait }), /เลยเวลา/);
  assert.equal(calls, 1);
});

test('ข้อความหลังบันทึกและเมื่อล้มเหลว', () => {
  assert.equal(savedMessage({ decision: 'confirmed' }), 'ยืนยันค่าแล้ว');
  assert.equal(savedMessage({ decision: 'corrected', utility: 'water', new_value: 1412 }), 'แก้ค่าน้ำเป็น 1,412 แล้ว');
  assert.match(failMessage(netErr(), 'save'), /ไม่บันทึกซ้ำ/);
  assert.match(failMessage(netErr(), 'undo'), /30 วินาที/);
  assert.equal(failMessage(httpErr(409, 'เลยเวลาเลิกทำ (30 วินาที) แล้ว'), 'undo'), 'เลยเวลาเลิกทำ (30 วินาที) แล้ว');
});
