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
  res.json({ ai, risk, anomaly, logs, runs, draft });
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
