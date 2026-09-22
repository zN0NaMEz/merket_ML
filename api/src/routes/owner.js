const router = require('express').Router();
const { db } = require('../db');
const { ah, HttpError } = require('../lib/http');
const settings = require('../lib/settings');
const D = require('../lib/dates');
const billing = require('../services/billing');

// 6.0 ออกเอกสารและรายงาน: Dashboard รายได้
router.get('/dashboard', ah(async (_req, res) => {
  const today = await settings.today();
  const ai = await settings.ai();
  const month = D.periodOf(today);
  const from = D.prevPeriod(month, 11);
  const months = Array.from({ length: 12 }, (_, i) => D.prevPeriod(month, 11 - i));
  const billRev = await db.q(`SELECT to_char(p.paid_date, 'YYYY-MM') AS m,
      sum(CASE WHEN b.kind = 'monthly' THEN b.rent - b.credit_used ELSE b.total END)::int AS rent,
      sum(b.water_amount)::int AS water, sum(b.elec_amount)::int AS elec
    FROM payments p JOIN payment_bills pb ON pb.payment_id = p.id JOIN bills b ON b.id = pb.bill_id
    WHERE p.status = 'successful' AND p.paid_date >= $1 GROUP BY 1`, [`${from}-01`]);
  const walkRev = await db.q(`SELECT to_char(paid_date, 'YYYY-MM') AS m, sum(amount)::int AS walkin FROM payments
    WHERE status = 'successful' AND (booking_id IS NOT NULL OR provider = 'aggregate') AND paid_date >= $1 GROUP BY 1`, [`${from}-01`]);
  const bm = Object.fromEntries(billRev.map(r => [r.m, r])), wm = Object.fromEntries(walkRev.map(r => [r.m, r]));
  const revenue = months.map(m => ({ month: m, rent: bm[m]?.rent || 0, water: bm[m]?.water || 0, elec: bm[m]?.elec || 0, walkin: wm[m]?.walkin || 0 }));
  const sum = r => r.rent + r.water + r.elec + r.walkin;
  const out = await db.one(`SELECT coalesce(sum(total),0)::int AS amount, count(*)::int AS n FROM bills WHERE status = 'overdue'`);
  const notDue = await db.one(`SELECT coalesce(sum(total),0)::int AS amount, count(*)::int AS n FROM bills WHERE status = 'unpaid' AND kind = 'monthly'`);
  const ot = await db.one(`SELECT count(*) FILTER (WHERE paid_date <= due_date)::int AS on_time, count(*)::int AS n FROM bills
    WHERE kind = 'monthly' AND due_date BETWEEN $1 AND $2 AND status IN ('paid','overdue')`, [D.addDays(today, -90), D.addDays(today, -1)]);
  const cut = await db.one("SELECT count(*)::int AS n FROM stalls WHERE utility_status = 'cut'");
  const occ = await db.one('SELECT (SELECT count(*) FROM vendors WHERE active)::int AS used, (SELECT count(*) FROM stalls)::int AS total');
  const open = await db.q(`SELECT b.id, b.period, b.total, b.due_date, b.status, b.risk_score, b.risk_features, b.stall_id, v.full_name
    FROM bills b JOIN vendors v ON v.id = b.vendor_id WHERE b.kind = 'monthly' AND b.status IN ('unpaid','overdue')
    ORDER BY b.risk_score DESC NULLS LAST`);
  const levels = { high: 0, mid: 0, low: 0 };
  open.forEach(b => { const l = billing.riskLevel(b.risk_score, ai); if (l) levels[l]++; });
  res.json({
    today, revenue,
    kpi: {
      revenue_month: sum(revenue[11]), revenue_prev: sum(revenue[10]),
      overdue_amount: out.amount, overdue_count: out.n, unpaid_amount: notDue.amount, unpaid_count: notDue.n,
      on_time_rate: ot.n ? ot.on_time / ot.n : null, cut_count: cut.n, occupied: occ.used, stalls: occ.total,
    },
    risk: { levels, top: open.slice(0, 6).map(b => ({ ...b, level: billing.riskLevel(b.risk_score, ai), reasons: b.risk_features?.reasons || [] })) },
  });
}));

router.get('/outstanding', ah(async (_req, res) => {
  const today = await settings.today();
  const ai = await settings.ai();
  const rows = await db.q(`SELECT b.id, b.bill_no, b.period, b.total, b.due_date, b.status, b.risk_score, b.stall_id, t.zone,
      v.full_name, v.phone, s.utility_status
    FROM bills b JOIN vendors v ON v.id = b.vendor_id JOIN stalls s ON s.id = b.stall_id JOIN stall_types t ON t.code = s.type_code
    WHERE b.kind = 'monthly' AND b.status IN ('unpaid','overdue') ORDER BY b.status DESC, b.due_date, b.stall_id`);
  res.json({ today, rows: rows.map(r => ({ ...r, days: D.diffDays(today, r.due_date), level: billing.riskLevel(r.risk_score, ai) })) });
}));

// ตั้งค่าอัตราค่าบริการ
router.put('/rates', ah(async (req, res) => {
  const { rates = {}, rents = {} } = req.body || {};
  const cur = await settings.rates();
  const next = { ...cur };
  for (const k of ['water_rate', 'elec_rate', 'walkin_fee', 'pay_within_days', 'overdue_days']) {
    if (rates[k] == null) continue;
    const v = Number(rates[k]);
    if (!Number.isInteger(v) || v < 1) throw new HttpError(400, 'ค่าทุกช่องต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป');
    next[k] = v;
  }
  await settings.set('rates', next);
  for (const [code, amount] of Object.entries(rents)) {
    const v = Number(amount);
    if (!Number.isInteger(v) || v < 0) throw new HttpError(400, 'ค่าแผงต้องเป็นจำนวนเต็ม');
    await db.q('UPDATE stall_types SET monthly_rent = $1 WHERE code = $2', [v, code]);
  }
  res.json({ rates: next, stall_types: await db.q('SELECT * FROM stall_types ORDER BY zone') });
}));
module.exports = router;
