// ทดสอบการจัดสถานะ ML (พร้อมใช้ / กำลังตื่น / ไม่ตอบ) โดยไม่ต้องมีเซิร์ฟเวอร์จริง
// รัน: cd api && node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { pingHealth, STATUS_CACHE } = require('../src/lib/aiStatus');

/** เซิร์ฟเวอร์ทดสอบ: mode = ok | error | hang (รับคำขอแล้วไม่ตอบ เหมือน Render ที่กำลังตื่น) */
function server(mode) {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      if (mode === 'hang') return;                       // ไม่ตอบเลย
      res.writeHead(mode === 'ok' ? 200 : 503, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}
const urlOf = s => `http://127.0.0.1:${s.address().port}`;
const close = s => { s.closeAllConnections?.(); s.close(); };

test('ready เมื่อ /health ตอบ 200', async () => {
  const s = await server('ok');
  try {
    const r = await pingHealth(urlOf(s), { timeoutMs: 1000 });
    assert.equal(r.state, 'ready');
  } finally { close(s); }
});

test('asleep เมื่อไม่ตอบภายในเวลาที่กำหนด (Render กำลังตื่น)', async () => {
  const s = await server('hang');
  try {
    const t0 = Date.now();
    const r = await pingHealth(urlOf(s), { timeoutMs: 300 });
    assert.equal(r.state, 'asleep');
    assert.ok(Date.now() - t0 < 1500, 'ต้องเลิกรอตามเวลาที่กำหนด ไม่ค้าง');
  } finally { close(s); }
});

test('down เมื่อ /health ตอบ error', async () => {
  const s = await server('error');
  try {
    const r = await pingHealth(urlOf(s), { timeoutMs: 1000 });
    assert.equal(r.state, 'down');
    assert.match(r.detail, /503/);
  } finally { close(s); }
});

test('down เมื่อต่อไม่ได้เลย (พอร์ตปิด)', async () => {
  const s = await server('ok');
  const url = urlOf(s);
  close(s);
  await new Promise(r => setTimeout(r, 50));
  const r = await pingHealth(url, { timeoutMs: 1000 });
  assert.equal(r.state, 'down');
});

test('down เมื่อยังไม่ได้ตั้ง ML_URL และไม่โยน error', async () => {
  const r = await pingHealth('');
  assert.equal(r.state, 'down');
});

test('cache header ตามหัวข้อ 4.5 (public, s-maxage=15)', () => {
  assert.match(STATUS_CACHE, /public/);
  assert.match(STATUS_CACHE, /s-maxage=15/);
  assert.match(STATUS_CACHE, /stale-while-revalidate=30/);
});
