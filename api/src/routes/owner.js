const router = require('express').Router();
const { db } = require('../db');
const { ah, HttpError } = require('../lib/http');
const settings = require('../lib/settings');
const D = require('../lib/dates');
const billing = require('../services/billing');
const walkin = require('../services/walkin');

/* =====================================================================
   หน้าเจ้าของตลาด (ใช้บนมือถือ): ส่งเฉพาะสิ่งที่ต้องรู้วันนี้ เป็นตัวเลขพร้อมหน่วย
   ผลของโมเดลแปลเป็นคำพูดธรรมดา ไม่ส่งคะแนนหรือค่าทางเทคนิคไปให้หน้าจอ
   ===================================================================== */
const MIN_HISTORY = 3;   // ต้องมีบิลย้อนหลังอย่างน้อย 3 เดือนถึงจะคาดการณ์รายแผง

/** คุณภาพของโมเดลล่าสุดจากผลทดสอบตอนเทรน: good / ok / weak หรือ null ถ้ายังไม่เคยเทรน */
async function riskQuality(ai) {
  const run = await db.one(`SELECT model_type, metrics FROM model_runs WHERE model_type IN ($1, 'risk')
    ORDER BY trained_at DESC, id DESC LIMIT 1`, [`risk_${ai.risk_model}`]);
  const auc = run?.model_type === 'risk' ? (run.metrics?.models?.[ai.risk_model] || run.metrics?.models?.lr)?.auc : run?.metrics?.auc;
  if (auc == null) return null;
  return auc >= 0.8 ? 'good' : auc >= 0.7 ? 'ok' : 'weak';
}

/** เหตุผลหนึ่งบรรทัดจากข้อมูลที่โมเดลใช้ */
function plainWhy(f = {}) {
  if (f.late_count >= 2) return `เคยจ่ายช้า ${f.late_count} ครั้งใน ${f.n_prior || 6} เดือนล่าสุด`;
  if (f.late_count === 1) return 'เคยจ่ายช้า 1 ครั้งเมื่อไม่นานมานี้';
  if (f.bill_ratio >= 1.15) return `บิลเดือนนี้สูงกว่าปกติ ${Math.round((f.bill_ratio - 1) * 100)}%`;
  if (f.tenure_years < 1) return 'เพิ่งเช่าแผงได้ไม่ถึงปี';
  if (f.season === 'rainy') return 'ครบกำหนดช่วงหน้าฝน ช่วงนี้ขายได้น้อยลง';
  if (f.season === 'school') return 'ครบกำหนดช่วงเปิดเทอม ผู้ค้ามีค่าใช้จ่ายมาก';
  return 'ที่ผ่านมาจ่ายตรงเวลา';
}

/**
 * คำทำนายของบิลหนึ่งใบ
 * late: true = อาจจ่ายช้า, false = น่าจะจ่ายตรง, null = ข้อมูลยังไม่พอ
 * sure: 'sure' ค่อนข้างแน่นอน / 'likely' น่าจะ / 'unsure' ยังไม่แน่ใจ
 */
function foresee(b, ai, quality) {
  const f = b.risk_features || {};
  const history = f.n_prior ?? 0;
  if (b.risk_score == null || !quality || history < MIN_HISTORY) return { late: null, sure: null, why: null };
  const s = Number(b.risk_score);
  const late = s >= ai.risk_mid;
  let sure;
  if (late) sure = s >= 0.85 && history >= 6 && quality === 'good' ? 'sure' : s >= ai.risk_high && quality !== 'weak' ? 'likely' : 'unsure';
  else sure = s < ai.risk_mid / 2 && quality !== 'weak' ? 'sure' : 'likely';
  return { late, sure, why: plainWhy(f) };
}

/** เงินเข้าต่อวัน (บิลของผู้ค้าประจำ + ขาจร) ตั้งแต่ from ถึง to */
async function dailyIn(from, to) {
  const rows = await db.q(`SELECT paid_date::text AS d,
      sum(amount) FILTER (WHERE booking_id IS NULL AND provider <> 'aggregate')::int AS bills,
      sum(amount) FILTER (WHERE booking_id IS NOT NULL OR provider = 'aggregate')::int AS walkin
    FROM payments WHERE status = 'successful' AND paid_date BETWEEN $1 AND $2 GROUP BY 1`, [from, to]);
  const m = Object.fromEntries(rows.map(r => [r.d, r]));
  const out = [];
  for (let d = from; d <= to; d = D.addDays(d, 1)) out.push({ date: d, bills: m[d]?.bills || 0, walkin: m[d]?.walkin || 0 });
  return out.map(r => ({ ...r, total: r.bills + r.walkin }));
}

router.get('/today', ah(async (_req, res) => {
  const today = await settings.today();
  const [ai, rates] = await Promise.all([settings.ai(), settings.rates()]);
  const quality = await riskQuality(ai);
  const month = D.periodOf(today);
  const dayOfMonth = Number(today.slice(8, 10));

  // เงินเข้า: 7 วันล่าสุด, เดือนนี้ถึงวันนี้ เทียบเดือนก่อนช่วงวันเดียวกัน
  const week = await dailyIn(D.addDays(today, -6), today);
  const prevMonth = D.prevPeriod(month);
  const prevSameDay = D.addDays(D.periodStart(prevMonth), Math.min(dayOfMonth, Number(D.periodEnd(prevMonth).slice(8, 10))) - 1);
  const [mtd, prevMtd] = await Promise.all([
    db.one("SELECT coalesce(sum(amount),0)::int AS n FROM payments WHERE status = 'successful' AND paid_date BETWEEN $1 AND $2", [D.periodStart(month), today]),
    db.one("SELECT coalesce(sum(amount),0)::int AS n FROM payments WHERE status = 'successful' AND paid_date BETWEEN $1 AND $2", [D.periodStart(prevMonth), prevSameDay]),
  ]);

  // บิลที่ยังไม่จ่าย: เลยกำหนด (ข้อเท็จจริง) และยังไม่ถึงกำหนด (ใช้คาดการณ์)
  const open = await db.q(`SELECT b.id, b.stall_id, b.total, b.due_date::text AS due_date, b.status, b.risk_score, b.risk_features, v.full_name, v.phone
    FROM bills b JOIN vendors v ON v.id = b.vendor_id WHERE b.kind = 'monthly' AND b.status IN ('unpaid','overdue')`);
  const overdue = open.filter(b => b.status === 'overdue');
  const notDue = open.filter(b => b.status === 'unpaid').map(b => ({ ...b, ...foresee(b, ai, quality) }));
  const overdueStalls = new Set(overdue.map(b => b.stall_id));

  // ผังแผง: แผงประจำที่มีผู้เช่า / ว่าง · ล็อกขาจรวันนี้และพรุ่งนี้
  const occ = await db.one('SELECT (SELECT count(*) FROM vendors WHERE active)::int AS used, (SELECT count(*) FROM stalls)::int AS total');
  const cut = await db.q("SELECT id, restore_pending FROM stalls WHERE utility_status = 'cut' ORDER BY id");
  const [spotsToday, spotsTomorrow] = await Promise.all([walkin.spotsFor(today), walkin.spotsFor(D.addDays(today, 1))]);
  const freeToday = spotsToday.filter(s => !s.taken).length;

  // มิเตอร์ที่ระบบตรวจเจอว่าผิดปกติและเจ้าหน้าที่ยืนยันว่าเป็นค่าจริง (อาจมีท่อรั่ว/ไฟรั่ว) ในรอบล่าสุด
  const leaks = await db.q(`SELECT stall_id, reason, method FROM anomaly_logs
    WHERE detected_on >= $1 AND resolution LIKE 'ยืนยันค่าที่จด%' AND resolution NOT LIKE '%ซ่อมแล้ว%' ORDER BY detected_on DESC LIMIT 3`,
  [D.addDays(today, -35)]);

  // การคาดการณ์รอบบิลที่ยังไม่ถึงกำหนด
  const nextIssue = D.periodStart(D.nextPeriod(month));
  const waitDays = D.diffDays(nextIssue, today);
  const cycle = D.prevPeriod(month);   // บิลรอบการใช้เดือนก่อน ออกต้นเดือนนี้
  const issued = await db.one("SELECT 1 AS ok FROM bills WHERE kind = 'monthly' AND period = $1 LIMIT 1", [cycle]);
  let forecast;
  if (!notDue.length) {
    // ยังไม่ออกบิลรอบนี้ = รอเจ้าหน้าที่จดมิเตอร์ · ออกแล้วแต่ไม่มีบิลค้าง = ทุกแผงจ่ายครบ รอรอบหน้า
    forecast = issued ? { state: 'none', wait_days: waitDays } : { state: 'not_issued', period: cycle };
  } else {
    const known = notDue.filter(b => b.late !== null);
    const due = notDue.map(b => b.due_date).sort()[0];
    if (!quality || known.length < Math.ceil(notDue.length / 2)) {
      forecast = { state: 'not_enough', wait_days: waitDays, due_date: due };
    } else {
      // นับเฉพาะแผงที่มั่นใจระดับ "น่าจะ" ขึ้นไป แผงที่ยังไม่แน่ใจบอกแยกไว้ ไม่ให้รายชื่อยาวจนไม่รู้จะโทรใครก่อน
      const late = known.filter(b => b.late && b.sure !== 'unsure').sort((a, b) => b.risk_score - a.risk_score);
      const maybe = known.filter(b => b.late && b.sure === 'unsure').length;
      const hist = late.filter(b => (b.risk_features?.late_count || 0) >= 2).length;
      const levels = late.map(b => b.sure);
      const sure = !late.length ? (quality === 'weak' || maybe ? 'unsure' : 'likely')
        : levels.filter(l => l === 'sure').length > late.length / 2 ? 'sure' : 'likely';
      forecast = {
        state: 'ok', due_date: due, days_left: D.diffDays(due, today), sure,
        open: notDue.length, late: late.length, maybe, unknown: notDue.length - known.length,
        why: !late.length ? 'ผู้ค้าที่ยังไม่จ่ายส่วนใหญ่จ่ายตรงเวลามาตลอด'
          : hist === late.length ? `ทั้ง ${late.length} แผงนี้เคยจ่ายช้าหลายครั้งในช่วงหลัง`
            : hist ? `${hist} ใน ${late.length} แผงนี้เคยจ่ายช้าหลายครั้งในช่วงหลัง` : late[0].why,
        stalls: late.slice(0, 6).map(b => ({ stall_id: b.stall_id, name: b.full_name, sure: b.sure, why: b.why })),
      };
    }
  }

  res.json({
    today, weekday: new Date(`${today}T00:00:00Z`).getUTCDay(),
    money: {
      today: week[6].total, yesterday: week[5].total, today_bills: week[6].bills, today_walkin: week[6].walkin,
      month: mtd.n, prev_month_same_day: prevMtd.n, week,
    },
    unpaid: {
      overdue_stalls: overdueStalls.size, overdue_amount: overdue.reduce((s, b) => s + b.total, 0),
      overdue_longest: overdue.length ? Math.max(...overdue.map(b => D.diffDays(today, b.due_date))) : 0,
      not_due_stalls: new Set(notDue.map(b => b.stall_id)).size, not_due_amount: notDue.reduce((s, b) => s + b.total, 0),
      next_due: notDue.map(b => b.due_date).sort()[0] || null,
    },
    stalls: {
      regular_total: occ.total, regular_used: occ.used,
      walkin_total: spotsToday.length, walkin_free_today: freeToday, walkin_free_tomorrow: spotsTomorrow.filter(s => !s.taken).length,
      walkin_fee: rates.walkin_fee,
      cut: cut.length, restore_waiting: cut.filter(c => c.restore_pending).map(c => c.id),
    },
    leaks: leaks.map(l => ({ stall_id: l.stall_id, why: l.reason, sure: l.method === 'both' ? 'sure' : 'likely' })),
    forecast,
  });
}));

/** ผังแผงทั้งหมดกับสถานะการจ่ายรอบล่าสุด และล็อกขาจรวันนี้/พรุ่งนี้ */
router.get('/stalls', ah(async (_req, res) => {
  const today = await settings.today();
  const rows = await db.q(`SELECT s.id, t.zone, t.name AS zone_name, s.utility_status, s.restore_pending, v.full_name,
      (SELECT b.status FROM bills b WHERE b.stall_id = s.id AND b.kind = 'monthly' ORDER BY b.period DESC LIMIT 1) AS bill_status
    FROM stalls s JOIN stall_types t ON t.code = s.type_code LEFT JOIN vendors v ON v.stall_id = s.id AND v.active
    ORDER BY s.id`);
  const [spotsToday, spotsTomorrow] = await Promise.all([walkin.spotsFor(today, true), walkin.spotsFor(D.addDays(today, 1))]);
  res.json({
    today,
    stalls: rows.map(r => ({
      id: r.id, zone: r.zone, zone_name: r.zone_name, vendor: r.full_name || null,
      pay: !r.full_name ? 'empty' : r.bill_status === 'overdue' ? 'overdue' : r.bill_status === 'unpaid' ? 'waiting' : 'paid',
      cut: r.utility_status === 'cut', restore_waiting: r.restore_pending,
    })),
    walkin_today: spotsToday.map(s => ({ spot: s.spot, taken: s.taken, name: s.full_name || null, product: s.product || null, paid: s.status === 'paid' })),
    walkin_tomorrow_free: spotsTomorrow.filter(s => !s.taken).length,
  });
}));

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
    WHERE p.status = 'successful' AND p.paid_date BETWEEN $1 AND $2 GROUP BY 1`, [`${from}-01`, today]);
  const walkRev = await db.q(`SELECT to_char(paid_date, 'YYYY-MM') AS m, sum(amount)::int AS walkin FROM payments
    WHERE status = 'successful' AND (booking_id IS NOT NULL OR provider = 'aggregate') AND paid_date BETWEEN $1 AND $2 GROUP BY 1`, [`${from}-01`, today]);
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
  const quality = await riskQuality(ai);
  const rows = await db.q(`SELECT b.id, b.bill_no, b.period, b.total, b.due_date, b.status, b.risk_score, b.risk_features, b.stall_id, t.zone,
      v.full_name, v.phone, s.utility_status
    FROM bills b JOIN vendors v ON v.id = b.vendor_id JOIN stalls s ON s.id = b.stall_id JOIN stall_types t ON t.code = s.type_code
    WHERE b.kind = 'monthly' AND b.status IN ('unpaid','overdue') ORDER BY b.status DESC, b.due_date, b.stall_id`);
  // risk_score / level ยังส่งให้หน้าเจ้าหน้าที่ใช้ · หน้าเจ้าของใช้เฉพาะ forecast ที่เป็นคำพูดธรรมดา
  res.json({ today, rows: rows.map(({ risk_features, ...r }) => ({
    ...r, days: D.diffDays(today, r.due_date), level: billing.riskLevel(r.risk_score, ai),
    forecast: r.status === 'unpaid' ? foresee({ ...r, risk_features }, ai, quality) : null,
  })) });
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
