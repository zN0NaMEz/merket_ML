const router = require('express').Router();
const { db } = require('../db');
const config = require('../config');
const { ah, HttpError } = require('../lib/http');
const settings = require('../lib/settings');
const D = require('../lib/dates');
const { auth, role, recipientOf } = require('../middleware/auth');
const ml = require('../services/ml');
const billing = require('../services/billing');
const meters = require('../services/meters');
const { runDaily } = require('../jobs/daily');

/* ---------- ข้อมูลระบบ ---------- */
router.get('/system/info', ah(async (_req, res) => {
  res.json({ today: await settings.today(), demo_mode: config.demoMode, payment_provider: config.paymentProvider, payment_test_mode: config.paymentTestMode });
}));
router.get('/settings', auth, ah(async (_req, res) => {
  res.json({ rates: await settings.rates(), ai: await settings.ai(), stall_types: await db.q('SELECT * FROM stall_types ORDER BY zone') });
}));

/* ---------- ระบบตั้งเวลา ---------- */
router.post('/system/run-daily', auth, role('staff', 'owner'), ah(async (_req, res) => res.json(await runDaily(await settings.today()))));
router.post('/system/advance', auth, role('staff', 'owner'), ah(async (req, res) => {
  if (!config.demoMode) throw new HttpError(403, 'เลื่อนวันที่ได้เฉพาะโหมดสาธิต');
  const days = Math.min(31, Math.max(1, Number(req.body?.days) || 1));
  let date = await settings.today();
  const runs = [];
  for (let i = 0; i < days; i++) {
    date = D.addDays(date, 1);
    await settings.set('clock', { demo_date: date });
    runs.push(await runDaily(date));
  }
  const total = k => runs.reduce((s, r) => s + r[k], 0);
  res.json({ today: date, runs, total: { paid: total('paid'), early: total('early'), overdue: total('overdue'), escalated: total('escalated') } });
}));

/* ---------- 7 แจ้งเตือน (D7) ---------- */
router.get('/notifications', auth, ah(async (req, res) => {
  const who = recipientOf(req.user);
  const items = await db.q('SELECT id, kind, message, created_on, read_at FROM notifications WHERE recipient = $1 ORDER BY created_on DESC, id DESC LIMIT 100', [who]);
  const { n } = await db.one('SELECT count(*)::int AS n FROM notifications WHERE recipient = $1 AND read_at IS NULL', [who]);
  res.json({ unread: n, items });
}));
router.post('/notifications/read-all', auth, ah(async (req, res) => {
  await db.q('UPDATE notifications SET read_at = now() WHERE recipient = $1 AND read_at IS NULL', [recipientOf(req.user)]);
  res.json({ ok: true });
}));

/* ---------- AI วิเคราะห์ ---------- */
router.get('/ai/overview', auth, role('staff', 'owner'), ah(async (_req, res) => {
  const ai = await settings.ai();
  const [risk, anomaly] = await Promise.all([ml.riskMetrics().catch(e => ({ error: e.message })), ml.anomalyInfo().catch(e => ({ error: e.message }))]);
  const logs = await db.q('SELECT stall_id, period, detected_on, reason, resolution, if_score, method FROM anomaly_logs ORDER BY detected_on DESC, id DESC LIMIT 30');
  const runs = await db.q('SELECT id, model_type, trained_at FROM model_runs ORDER BY id DESC LIMIT 8');
  // ผลตรวจของค่าที่กำลังกรอกในรอบปัจจุบัน (ถ้ามี) ใช้แสดงบนกราฟ
  const draft = await meters.check([]).then(v => v.results).catch(() => []);

  // ตัวอย่างการทำนาย: บิลในชุดทดสอบที่โมเดลไม่เคยเห็น พร้อมรายละเอียดจริงของบิลนั้น
  let examples = [];
  if (Array.isArray(risk.test) && risk.test.length) {
    const rows = await db.q(
      `SELECT b.id, b.stall_id, b.period, b.total, b.due_date, b.paid_date, v.full_name
         FROM bills b JOIN vendors v ON v.id = b.vendor_id WHERE b.id = ANY($1)`,
      [risk.test.map(t => t.bill_id)]);
    const byId = new Map(rows.map(r => [r.id, r]));
    const today = await settings.today();
    examples = risk.test.map(t => {
      const b = byId.get(t.bill_id);
      if (!b) return null;
      const settled = b.paid_date || today;
      const late = Math.max(0, Math.round((Date.parse(settled) - Date.parse(b.due_date)) / 86400000));
      return { ...t, stall_id: b.stall_id, vendor: b.full_name, period: b.period, total: Number(b.total), days_late: late, paid: Boolean(b.paid_date) };
    }).filter(Boolean);
  }
  // บิลที่ค้างอยู่ตอนนี้ ใช้บอกว่าถ้าตั้งเกณฑ์นี้ วันนี้จะมีใครได้รับการเตือนบ้าง
  const open = await db.q(
    `SELECT b.id, b.stall_id, b.period, b.total, b.due_date, b.status, b.risk_score, b.risk_features, v.full_name AS vendor
       FROM bills b JOIN vendors v ON v.id = b.vendor_id
      WHERE b.kind = 'monthly' AND b.status IN ('unpaid','overdue') AND b.risk_score IS NOT NULL
      ORDER BY b.risk_score DESC`);
  const { n: stalls } = await db.one('SELECT count(*)::int AS n FROM stalls');

  // คะแนนรายบิลย้ายไปอยู่ใน examples แล้ว ไม่ต้องส่งซ้ำ
  const { test: _omit, ...riskSummary } = risk;
  res.json({ ai, risk: riskSummary, anomaly, logs, runs, draft, examples, open: open.map(o => ({
    id: o.id, stall_id: o.stall_id, vendor: o.vendor, period: o.period, total: Number(o.total), due_date: o.due_date,
    status: o.status, score: Number(o.risk_score), reasons: o.risk_features?.reasons || [],
  })), stalls });
}));
/* ---------- ตัวอย่างให้เข้าใจง่าย: กราฟข้อมูลจริง (ปกติ) คู่กับกราฟการทำนาย ---------- */
const mean = xs => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const sd = xs => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) : 0; };
/**
 * ค่าปกติของเดือนหนึ่งจากประวัติ 12 เดือนของแผง ใช้กติกาเดียวกับตัวตรวจ (ML)
 * ช่วงปกติ = mean ± z × spread (spread ขั้นต่ำ 8% ของค่าเฉลี่ย) หน้าเว็บคำนวณช่วงเองจาก z ที่กำลังปรับ
 */
const normOf = hist => {
  const m = mean(hist);
  return { mean: Math.round(m * 100) / 100, spread: Math.round(Math.max(sd(hist), 0.08 * m, 1) * 100) / 100 };
};

router.get('/ai/showcase', auth, role('staff', 'owner'), ah(async (_req, res) => {
  const today = await settings.today();
  const ai = await settings.ai();

  // ---- ทำนายการจ่ายช้า: ใช้บิลชุดทดสอบ (โมเดลไม่เคยเห็นตอนเรียน และรู้ผลจริงแล้ว)
  //      ปกติ = คะแนนต่ำสุดที่จ่ายตรงเวลาจริง · ทำนายว่าช้า = คะแนนสูงสุดที่จ่ายช้าจริง
  const model = ai.risk_model;
  const test = await ml.riskMetrics().then(m => m.test || []).catch(() => []);
  const bills = test.length ? await db.q(`SELECT b.id, b.vendor_id, b.stall_id, b.period, b.total, b.due_date::text AS due_date,
      b.paid_date::text AS paid_date, v.full_name,
      (SELECT count(*) FROM bills p WHERE p.vendor_id = b.vendor_id AND p.kind = 'monthly' AND p.period < b.period)::int AS n_prior
    FROM bills b JOIN vendors v ON v.id = b.vendor_id WHERE b.id = ANY($1)`, [test.map(t => t.bill_id)]) : [];
  const byId = new Map(bills.map(b => [b.id, b]));
  const scored = test.map(t => ({ ...t, bill: byId.get(t.bill_id), score: t[model] ?? t.lr }))
    .filter(t => t.bill && t.bill.n_prior >= 6 && t.bill.paid_date);
  const lateDays = b => (b.paid_date ? Math.max(0, D.diffDays(b.paid_date, b.due_date)) : today > b.due_date ? D.diffDays(today, b.due_date) : null);
  const riskCase = async t => {
    const b = t.bill;
    const hist = await db.q(`SELECT period, due_date::text AS due_date, paid_date::text AS paid_date FROM bills
      WHERE vendor_id = $1 AND kind = 'monthly' AND period < $2 ORDER BY period DESC LIMIT 6`, [b.vendor_id, b.period]);
    const days = lateDays(b);
    return {
      stall_id: b.stall_id, vendor: b.full_name,
      history: hist.reverse().map(h => ({ period: h.period, days_late: lateDays(h) })),
      target: {
        period: b.period, due_date: b.due_date, total: Number(b.total), score: Number(t.score), scores: { lr: t.lr, rf: t.rf },
        level: billing.riskLevel(t.score, ai), reasons: t.reasons || [],
        outcome: { known: true, late: days > 0, days_late: days },
      },
    };
  };
  const onTime = scored.filter(t => !t.y).sort((a, b) => a.score - b.score);
  const wasLate = scored.filter(t => t.y).sort((a, b) => b.score - a.score);
  const risk = onTime.length && wasLate.length
    ? { normal: await riskCase(onTime[0]), late: await riskCase(wasLate[0]), high: ai.risk_high, mid: ai.risk_mid, model }
    : null;

  // ---- ตรวจค่ามิเตอร์: แผงที่เคยถูกทักจริงเทียบกับแผงที่ใช้สม่ำเสมอ ----
  const rows = await db.q('SELECT stall_id, period, use_water, use_elec FROM meter_readings ORDER BY stall_id, period');
  const byStall = new Map();
  for (const r of rows) (byStall.get(r.stall_id) || byStall.set(r.stall_id, []).get(r.stall_id)).push(r);
  const meterCase = (sid, util, focus) => {
    const ms = byStall.get(sid) || [];
    const key = util === 'water' ? 'use_water' : 'use_elec';
    // แผงที่ถูกทัก: จบกราฟที่เดือนที่ถูกทัก ช่วงปกติของเดือนนั้นคิดจากกติกาเดียวกับตัวตรวจพอดี
    const end = focus ? ms.findIndex(m => m.period === focus) + 1 || ms.length : ms.length;
    const series = [];
    for (let i = 3; i < end; i++) {
      series.push({ period: ms[i].period, value: ms[i][key], ...normOf(ms.slice(Math.max(0, i - 12), i).map(m => m[key])) });
    }
    const last = ms.slice(-12).map(m => m[key]);
    return {
      stall_id: sid, util, focus: focus || null,
      series: series.slice(-9),
      // คาดการณ์เดือนถัดไป (เฉพาะแผงปกติ): ช่วงที่ค่าควรอยู่ ถ้าจดได้นอกช่วงนี้ระบบจะทัก
      next: !focus && ms.length ? { period: D.nextPeriod(ms[ms.length - 1].period), ...normOf(last) } : null,
    };
  };
  const logs = await db.q(`SELECT stall_id, period, reason, resolution FROM anomaly_logs
    ORDER BY (resolution LIKE 'ยืนยัน%') DESC, detected_on DESC LIMIT 10`);
  const log = logs.find(l => byStall.has(l.stall_id) && !/น้อยกว่ารอบก่อน/.test(l.reason)) || null;
  let meter = null;
  if (log) {
    const util = /น้ำ/.test(log.reason) ? 'water' : 'elec';
    // แผงปกติ: ใช้สม่ำเสมอที่สุด (ไม่มีเดือนไหนหลุดช่วง และแกว่งน้อยสุด) ในประเภทเดียวกันถ้ามี
    const key = util === 'water' ? 'use_water' : 'use_elec';
    let best = null;
    for (const [sid, ms] of byStall) {
      if (sid === log.stall_id || ms.length < 8) continue;
      const c = meterCase(sid, util);
      if (c.series.some(p => Math.abs(p.value - p.mean) > Number(ai.z_threshold) * p.spread)) continue;
      const vals = ms.slice(-12).map(m => m[key]);
      const cv = sd(vals) / (mean(vals) || 1);
      if (!best || cv < best.cv) best = { sid, cv };
    }
    meter = {
      odd: { ...meterCase(log.stall_id, util, log.period), reason: log.reason, resolution: log.resolution },
      normal: best ? meterCase(best.sid, util) : null,
    };
  }
  res.json({ risk, meter });
}));

router.post('/ai/retrain', auth, role('staff', 'owner'), ah(async (_req, res) => {
  const risk = await ml.trainRisk();
  const anomaly = await ml.trainAnomaly();
  const rescored = await billing.rescoreOpenBills();
  res.json({ risk, anomaly, rescored });
}));
router.put('/ai/settings', auth, role('staff', 'owner'), ah(async (req, res) => {
  const cur = await settings.ai();
  const b = req.body || {};
  const next = { ...cur };
  if (b.risk_model != null) { if (!['lr', 'rf'].includes(b.risk_model)) throw new HttpError(400, 'โมเดลต้องเป็น lr หรือ rf'); next.risk_model = b.risk_model; }
  if (b.anomaly_method != null) { if (!['z', 'if', 'both'].includes(b.anomaly_method)) throw new HttpError(400, 'วิธีตรวจจับไม่ถูกต้อง'); next.anomaly_method = b.anomaly_method; }
  for (const [k, lo, hi] of [['risk_high', 0.05, 0.99], ['risk_mid', 0.01, 0.95], ['z_threshold', 1, 10], ['if_threshold', 0.4, 0.95]]) {
    if (b[k] == null) continue;
    const v = Number(b[k]);
    if (!(v >= lo && v <= hi)) throw new HttpError(400, `${k} ต้องอยู่ระหว่าง ${lo} ถึง ${hi}`);
    next[k] = v;
  }
  if (next.risk_mid >= next.risk_high) throw new HttpError(400, 'เกณฑ์เสี่ยงปานกลางต้องต่ำกว่าเกณฑ์เสี่ยงสูง');
  await settings.set('ai', next);
  if (next.risk_model !== cur.risk_model) await billing.rescoreOpenBills();
  res.json({ ai: next });
}));
module.exports = router;
