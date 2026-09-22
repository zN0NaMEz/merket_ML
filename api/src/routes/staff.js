const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db, tx } = require('../db');
const { ah, HttpError } = require('../lib/http');
const settings = require('../lib/settings');
const { notify } = require('../lib/notify');
const D = require('../lib/dates');
const billing = require('../services/billing');
const meters = require('../services/meters');
const walkin = require('../services/walkin');

const addMonths = (date, n) => {
  let [y, m, d] = date.split('-').map(Number);
  m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${D.pad2(m)}-${D.pad2(Math.min(d, last))}`;
};

/* ---------- 5.0 ติดตามค้างชำระ ---------- */
router.get('/followup', ah(async (_req, res) => {
  const today = await settings.today();
  const rates = await settings.rates();
  const ai = await settings.ai();
  const overdue = (await db.q(`SELECT b.id, b.period, b.total, b.due_date, b.escalated_on, b.risk_score, b.stall_id,
      v.id AS vendor_id, v.full_name, v.phone, s.utility_status, s.cut_date
    FROM bills b JOIN vendors v ON v.id = b.vendor_id JOIN stalls s ON s.id = b.stall_id
    WHERE b.status = 'overdue' ORDER BY b.due_date, b.stall_id`)).map(b => ({ ...b, days_overdue: D.diffDays(today, b.due_date) }));
  const byStall = {};
  for (const b of overdue) {
    const g = (byStall[b.stall_id] ||= { stall_id: b.stall_id, full_name: b.full_name, phone: b.phone, utility_status: b.utility_status, total: 0, max_days: 0, bills: 0 });
    g.total += b.total; g.bills++; g.max_days = Math.max(g.max_days, b.days_overdue);
  }
  const toCut = Object.values(byStall).filter(g => g.max_days > rates.overdue_days && g.utility_status === 'on');
  const toRestore = await db.q(`SELECT s.id AS stall_id, s.cut_date, v.full_name, v.phone FROM stalls s JOIN vendors v ON v.stall_id = s.id
    WHERE s.restore_pending ORDER BY s.id`);
  const cutNow = await db.q(`SELECT s.id AS stall_id, s.cut_date, v.full_name FROM stalls s JOIN vendors v ON v.stall_id = s.id
    WHERE s.utility_status = 'cut' ORDER BY s.id`);
  const upcoming = (await db.q(`SELECT b.id, b.period, b.total, b.due_date, b.risk_score, b.risk_features, b.early_reminded_on, b.stall_id,
      v.id AS vendor_id, v.full_name, v.phone
    FROM bills b JOIN vendors v ON v.id = b.vendor_id
    WHERE b.kind = 'monthly' AND b.status = 'unpaid' ORDER BY b.risk_score DESC NULLS LAST, b.stall_id`)).map(b => ({
    ...b, days_to_due: D.diffDays(b.due_date, today), level: billing.riskLevel(b.risk_score, ai),
    reasons: b.risk_features?.reasons || [],
  }));
  const jobs = await db.q('SELECT run_date, job, summary FROM job_logs ORDER BY id DESC LIMIT 10');
  res.json({ today, rates, ai, overdue, to_cut: toCut, to_restore: toRestore, cut_now: cutNow, upcoming, jobs });
}));

router.post('/bills/:id/remind', ah(async (req, res) => {
  const today = await settings.today();
  const b = await db.one("SELECT * FROM bills WHERE id = $1 AND status IN ('unpaid','overdue')", [Number(req.params.id)]);
  if (!b) throw new HttpError(404, 'ไม่พบบิลที่ยังไม่ชำระ');
  await notify(`vendor:${b.vendor_id}`, 'bill', `เจ้าหน้าที่แจ้งเตือน: บิล${D.periodLabel(b.period)} ยอด ${D.baht(b.total)} บาท ครบกำหนด ${D.thDate(b.due_date)}`, today);
  res.json({ ok: true });
}));
router.post('/stalls/:id/cut', ah(async (req, res) => { await billing.cutUtility(req.params.id); res.json({ ok: true }); }));
router.post('/stalls/:id/restore', ah(async (req, res) => { await billing.restoreUtility(req.params.id); res.json({ ok: true }); }));

/* ---------- 3.0 บันทึกมิเตอร์และออกบิล ---------- */
router.get('/meters', ah(async (_req, res) => {
  try { res.json(await meters.check([])); } catch (e) { res.json({ ...(await meters.draftView()), results: [], ai: await settings.ai(), ml_error: e.message }); }
}));
router.post('/meters/check', ah(async (req, res) => {
  const readings = (req.body?.readings || []).map(r => ({
    stall_id: String(r.stall_id), ack: !!r.ack,
    cur_water: r.cur_water === '' || r.cur_water == null ? null : Number(r.cur_water),
    cur_elec: r.cur_elec === '' || r.cur_elec == null ? null : Number(r.cur_elec),
  }));
  res.json(await meters.check(readings));
}));
router.post('/meters/sample', ah(async (_req, res) => res.json(await meters.fillSample())));
router.post('/meters/issue', ah(async (req, res) => res.json(await meters.issueBills(req.user.sub))));

/* ---------- 1.0 ผู้ค้าและสัญญา ---------- */
router.get('/vendors', ah(async (_req, res) => {
  const rows = await db.q(`SELECT v.id, v.code, v.full_name, v.phone, v.stall_id, v.since, v.credit, t.name AS type_name, s.utility_status,
      c.id AS contract_id, c.start_date, c.end_date, c.deposit,
      (SELECT coalesce(sum(total),0) FROM bills WHERE vendor_id = v.id AND status = 'overdue') AS overdue_total,
      (SELECT username FROM users WHERE vendor_id = v.id LIMIT 1) AS username
    FROM vendors v JOIN stalls s ON s.id = v.stall_id JOIN stall_types t ON t.code = s.type_code
    LEFT JOIN LATERAL (SELECT * FROM contracts WHERE vendor_id = v.id AND status = 'active' ORDER BY end_date DESC LIMIT 1) c ON true
    WHERE v.active ORDER BY v.stall_id`);
  res.json({ today: await settings.today(), vendors: rows });
}));
router.get('/stalls/vacant', ah(async (_req, res) => {
  res.json({ stalls: await db.q(`SELECT s.id, t.name AS type_name, t.monthly_rent FROM stalls s JOIN stall_types t ON t.code = s.type_code
    WHERE NOT EXISTS (SELECT 1 FROM vendors v WHERE v.stall_id = s.id AND v.active) ORDER BY s.id`) });
}));
router.post('/vendors', ah(async (req, res) => {
  const b = req.body || {};
  const today = await settings.today();
  const phone = String(b.phone || '').replace(/\D/g, '');
  if (!b.full_name || String(b.full_name).trim().length < 2) throw new HttpError(400, 'กรอกชื่อผู้ค้า');
  if (phone.length < 9) throw new HttpError(400, 'เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก');
  if (!b.username || String(b.password || '').length < 8) throw new HttpError(400, 'ตั้งชื่อผู้ใช้ และรหัสผ่านอย่างน้อย 8 ตัวอักษร');
  const months = Math.min(60, Math.max(1, Number(b.months) || 12));
  const start = /^\d{4}-\d{2}-\d{2}$/.test(b.start_date || '') ? b.start_date : today;
  const stall = await db.one(`SELECT s.id, t.monthly_rent FROM stalls s JOIN stall_types t ON t.code = s.type_code WHERE s.id = $1
    AND NOT EXISTS (SELECT 1 FROM vendors v WHERE v.stall_id = s.id AND v.active)`, [b.stall_id]);
  if (!stall) throw new HttpError(409, 'แผงนี้มีผู้เช่าแล้วหรือไม่พบ');
  const out = await tx(async t => {
    const v = await t.one(`INSERT INTO vendors (code, full_name, phone, stall_id, since) VALUES ('tmp-' || md5(random()::text), $1,$2,$3,$4) RETURNING id`,
      [String(b.full_name).trim(), phone, stall.id, start]);
    const code = `V${String(v.id).padStart(3, '0')}`;
    await t.q('UPDATE vendors SET code = $1 WHERE id = $2', [code, v.id]);
    await t.q('INSERT INTO contracts (vendor_id, stall_id, start_date, end_date, deposit) VALUES ($1,$2,$3,$4,$5)',
      [v.id, stall.id, start, D.addDays(addMonths(start, months), -1), Number(b.deposit) >= 0 ? Number(b.deposit) : stall.monthly_rent * 2]);
    await t.q(`INSERT INTO users (username, password_hash, role, vendor_id, display_name) VALUES ($1,$2,'vendor',$3,$4)`,
      [String(b.username).trim().toLowerCase(), await bcrypt.hash(String(b.password), 10), v.id, String(b.full_name).trim()]);
    return { id: v.id, code };
  }).catch(e => { if (e.code === '23505') throw new HttpError(409, 'ชื่อผู้ใช้นี้ถูกใช้แล้ว'); throw e; });
  res.json(out);
}));
router.post('/contracts/:id/renew', ah(async (req, res) => {
  const months = Math.min(60, Math.max(1, Number(req.body?.months) || 12));
  const c = await db.one('SELECT * FROM contracts WHERE id = $1', [Number(req.params.id)]);
  if (!c) throw new HttpError(404, 'ไม่พบสัญญา');
  const end = D.addDays(addMonths(D.addDays(c.end_date, 1), months), -1);
  await db.q('UPDATE contracts SET end_date = $1 WHERE id = $2', [end, c.id]);
  res.json({ end_date: end });
}));

/* ---------- 2.0 พื้นที่ผู้ค้าขาจร ---------- */
router.get('/walkin', ah(async (req, res) => {
  const opt = await walkin.options();
  const date = opt.dates.includes(req.query.date) ? req.query.date : opt.dates[0];
  res.json({ ...opt, date, spots: await walkin.spotsFor(date, true) });
}));
router.post('/walkin/bookings', ah(async (req, res) => {
  const bk = await walkin.createBooking(req.body || {}, 'staff');
  const payment = req.body?.method === 'qr'
    ? await billing.createPayment({ bookingId: bk.id, payer: `walkin:${bk.phone}` })
    : await billing.createCashPayment({ bookingId: bk.id, payer: `walkin:${bk.phone}` });
  res.json({ booking: bk, payment });
}));
module.exports = router;
