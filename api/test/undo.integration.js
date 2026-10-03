/**
 * ทดสอบการยืนยัน/แก้ค่ามิเตอร์และการเลิกทำกับ API จริง (RodeMap รอบ 3)
 * ต้องมี API + ฐานข้อมูลทดสอบที่มีค่ามิเตอร์ถูกทักในรอบปัจจุบัน (เช่น กด "เติมค่าตัวอย่าง" หลัง seed)
 * ห้ามรันกับฐานข้อมูลจริง: ทดสอบนี้แก้ค่ามิเตอร์ร่างและบันทึกรายการตรวจ
 *
 *   AI_IT_URL=http://localhost:4000/api node --test test/undo.integration.js
 * ถ้าไม่ได้ตั้ง AI_IT_URL ทดสอบทั้งไฟล์จะถูกข้าม
 */
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const BASE = process.env.AI_IT_URL;
const skip = !BASE && 'ตั้ง AI_IT_URL เพื่อรันทดสอบกับ API จริง';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ref = () => `it_${crypto.randomUUID().replace(/-/g, '')}`;

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const login = async (u, p) => (await call('/auth/login', { method: 'POST', body: { username: u, password: p } })).data.token;

test('ยืนยัน แก้ค่า และเลิกทำ', { skip, timeout: 120000 }, async t => {
  const staff = await login('staff', 'staff1234');
  const owner = await login('owner', 'owner1234');
  const list = (await call('/ai/readings', { token: staff })).data;
  const pick = (pred, what) => {
    const it = list.current.find(pred);
    if (!it) t.skip(`ไม่มีค่าที่ถูกทักแบบ ${what} ในรอบปัจจุบัน`);
    return it;
  };
  const explain = it => call(`/ai/readings/${it.stall_id}/${it.period}/explain`, { token: staff }).then(r => r.data);
  const review = (it, body, token = staff) => call(`/ai/readings/${it.stall_id}/${it.period}/review`, { method: 'POST', token, body });
  const undo = (id, token = staff) => call(`/ai/reviews/${id}/undo`, { method: 'POST', token });

  const high = pick(i => i.kind !== 'misread' && i.state === 'pending', 'ค่าสูง/ต่ำ');
  if (!high) return;
  const u = high.utilities[0];

  await t.test('กรณีปกติ: ยืนยันแล้วเลิกทำภายในเวลา คืนสถานะเดิม และประวัติยังอยู่', async () => {
    const before = await explain(high);
    const r = await review(high, { decision: 'confirmed', utility: u, client_ref: ref() });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.undo_window_s, 30);
    const mid = await explain(high);
    assert.equal(mid.ack, true);
    assert.equal(mid.reviews[0].reviewer, 'เจ้าหน้าที่สำนักงาน');
    assert.ok(mid.reviews[0].undo_left_s > 20);

    // ระหว่างยังเลิกทำได้ ห้ามออกบิล
    const issue = await call('/staff/meters/issue', { method: 'POST', token: staff });
    assert.equal(issue.status, 409, JSON.stringify(issue.data));
    assert.match(issue.data.error, /ยังเลิกทำได้/);

    const u1 = await undo(r.data.review_id);
    assert.equal(u1.status, 200, JSON.stringify(u1.data));
    assert.equal(u1.data.restored.ack, before.ack);
    const after = await explain(high);
    assert.equal(after.ack, before.ack);
    const row = after.reviews.find(x => x.id === r.data.review_id);
    assert.ok(row && row.undone_at, 'แถวที่เลิกทำต้องยังอยู่และมี undone_at');
  });

  await t.test('แก้ค่าแล้วเลิกทำ: คืนเลขเดิม', async () => {
    const before = await explain(high);
    const util = before.utilities[u];
    const r = await review(high, { decision: 'corrected', utility: u, new_value: util.prev + Math.round(util.band?.mean ?? 1), client_ref: ref() });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal((await explain(high)).utilities[u].cur, r.data.new_value);
    const u1 = await undo(r.data.review_id);
    assert.equal(u1.status, 200);
    assert.equal((await explain(high)).utilities[u].cur, util.cur);
  });

  await t.test('เน็ตหลุด: ส่งซ้ำด้วย client_ref เดิมไม่บันทึกซ้ำ และเลิกทำซ้ำได้ผลเดิม', async () => {
    const before = (await explain(high)).reviews.length;
    const body = { decision: 'confirmed', utility: u, client_ref: ref() };
    const [a, b] = await Promise.all([review(high, body), review(high, body)]);   // กดซ้ำพร้อมกัน
    const c = await review(high, body);                                            // ส่งใหม่หลังเน็ตกลับมา
    assert.deepEqual([a, b, c].map(x => x.data.review_id).filter((v, i, xs) => xs.indexOf(v) === i).length, 1);
    assert.equal(c.status, 200);
    assert.equal(c.data.replay, true);
    assert.equal((await explain(high)).reviews.length, before + 1);
    const u1 = await undo(c.data.review_id);
    const u2 = await undo(c.data.review_id);                                       // คำตอบแรกหาย กดเลิกทำซ้ำ
    assert.equal(u1.status, 200);
    assert.equal(u2.status, 200);
    assert.equal(u2.data.already, true);
  });

  await t.test('เกินเวลา: เลิกทำหลัง 30 วินาทีไม่ได้ และค่ายังเป็นที่ยืนยันไว้', async () => {
    const r = await review(high, { decision: 'confirmed', utility: u, client_ref: ref() });
    assert.equal(r.status, 201);
    await sleep(31500);
    const u1 = await undo(r.data.review_id);
    assert.equal(u1.status, 409);
    assert.match(u1.data.error, /เลยเวลาเลิกทำ/);
    assert.equal((await explain(high)).ack, true);
  });

  await t.test('สิทธิ์และค่าที่ไม่ถูกต้อง', async () => {
    assert.equal((await review(high, { decision: 'confirmed', utility: u }, owner)).status, 403);   // เจ้าของยืนยันไม่ได้
    const misread = list.current.find(i => i.kind === 'misread');
    if (misread) {
      const r = await review(misread, { decision: 'confirmed', utility: misread.utilities[0] });
      assert.equal(r.status, 422);
      assert.match(r.data.error, /ยืนยันไม่ได้/);
    }
    const ex = await explain(high);
    const bad = await review(high, { decision: 'corrected', utility: u, new_value: ex.utilities[u].prev - 1 });
    assert.equal(bad.status, 422);
    assert.equal((await call('/ai/readings', {})).status, 401);
  });
});
