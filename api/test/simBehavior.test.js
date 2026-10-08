// พฤติกรรมการจ่ายในข้อมูลสาธิต (lib/simBehavior.js) และโปรไฟล์ของตัวสร้างข้อมูล (seed/generator.js)
const test = require('node:test');
const assert = require('node:assert');
const { SIM_PROFILES, appP, ontimeDay, seenDate } = require('../src/lib/simBehavior');
const { generate } = require('../src/seed/generator');
const R = require('../src/lib/random');
const D = require('../src/lib/dates');

test('จ่ายตรงเวลา: วินัยดีจ่ายเร็วกว่า และไม่เกินวันครบกำหนด', () => {
  const rng = R.mulberry32(1);
  const avg = d => { let s = 0; for (let i = 0; i < 4000; i++) s += ontimeDay(rng(), d, 10); return s / 4000; };
  assert.ok(avg(0.9) < avg(0.5) && avg(0.5) < avg(0.1), `${avg(0.9)} ${avg(0.5)} ${avg(0.1)}`);
  for (const u of [0, 0.5, 0.9999]) for (const d of [0, 1]) assert.ok(ontimeDay(u, d, 10) >= 0 && ontimeDay(u, d, 10) <= 9);
  assert.ok(appP(0.9) > appP(0.1));
});

test('เปิดดูบิล: คนจ่ายผ่านแอปต้องเปิดบิลอย่างช้าวันที่จ่าย', () => {
  const never = () => 0.99;                                 // สุ่มแล้วไม่เปิดดูเอง
  assert.equal(seenDate(never, 0.5, true, '2026-05-01', '2026-05-07'), '2026-05-07');
  assert.equal(seenDate(never, 0.5, false, '2026-05-01', '2026-05-07'), null);
  assert.equal(seenDate(never, 0.5, true, '2026-05-01', null), null, 'ยังไม่จ่าย ไม่ถูกบังคับให้เห็น');
  const early = (() => { const q = [0.01, 0.5]; return () => q.shift(); })();
  assert.equal(seenDate(early, 0.5, true, '2026-05-01', '2026-05-07'), '2026-05-03', 'เปิดดูเองก่อนจ่าย ใช้วันที่เปิดจริง');
});

test('ตัวสร้างข้อมูล: โปรไฟล์ clear ทำให้ผลขึ้นกับปัจจัยมากขึ้น และมีพฤติกรรมครบ', () => {
  const anchor = '2026-10-01';
  const real = generate(anchor, 20261001, 'realistic');
  const clear = generate(anchor, 20261001, 'clear');
  assert.equal(real.meta.profile, 'realistic');
  assert.equal(clear.meta.profile, 'clear');
  assert.equal(generate(anchor, 20261001, 'ไม่มี').meta.profile, 'realistic');
  assert.deepEqual(Object.keys(SIM_PROFILES), ['realistic', 'clear']);
  for (const g of [real, clear]) {
    assert.ok(g.vendors.every(v => typeof v.sim_app === 'boolean'));
    const paid = g.bills.filter(b => b.paid_date);
    assert.ok(g.bills.some(b => b.seen_at) && g.bills.some(b => !b.seen_at), 'มีทั้งบิลที่เปิดดูและไม่เปิด');
    assert.ok(g.bills.every(b => !b.seen_at || b.seen_at < anchor), 'ไม่มีการเปิดดูในอนาคต');
    // คนจ่ายผ่านแอปเห็นบิลทุกใบที่จ่ายแล้ว
    const app = new Set(g.vendors.filter(v => v.sim_app).map(v => v.idx));
    assert.ok(paid.filter(b => app.has(b.vendor_idx)).every(b => b.seen_at && b.seen_at <= b.paid_date));
  }
  // วินัยดีจ่ายตรงเวลามากกว่า และใน clear ความต่างนี้ชัดกว่า (ความบังเอิญต่ำ)
  const gap = g => {
    const disc = Object.fromEntries(g.vendors.map(v => [v.idx, v.sim_discipline]));
    const late = b => b.paid_date && b.paid_date > b.due_date;
    const rate = xs => xs.filter(late).length / xs.length;
    const known = g.bills.filter(b => b.paid_date);
    return rate(known.filter(b => disc[b.vendor_idx] < 0.5)) - rate(known.filter(b => disc[b.vendor_idx] >= 0.5));
  };
  assert.ok(gap(real) > 0.1, `realistic gap ${gap(real)}`);
  assert.ok(gap(clear) > gap(real), `clear ${gap(clear)} > realistic ${gap(real)}`);
  assert.ok(real.bills.every(b => b.paid_date === null || D.diffDays(b.paid_date, b.issue_date) >= 0));
});
