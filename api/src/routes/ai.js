/**
 * /api/ai/*  หน้า "เบื้องหลัง AI" (RodeMap.md)
 *
 * กติกาของทั้งไฟล์: อ่านจาก Postgres เป็นหลัก ไม่เรียก ML ตอนเปิดหน้า (ML อาจหลับ ทำให้หน้าค้างถึง 1 นาที)
 * ยกเว้น /status ที่ยิง /health ของ ML แบบรอไม่เกิน 3 วินาที และถูก cache ไว้ที่ CDN 15 วินาที
 * ทุก route ตรวจสิทธิ์ตามบทบาทที่ API การซ่อนแท็บที่หน้าเว็บอย่างเดียวไม่ใช่การป้องกัน
 */
const router = require('express').Router();
const config = require('../config');
const { db, tx } = require('../db');
const { ah, HttpError } = require('../lib/http');
const settings = require('../lib/settings');
const { auth, role } = require('../middleware/auth');
const { pingHealth, STATUS_CACHE } = require('../lib/aiStatus');
const { explainView, listRow } = require('../lib/aiExplain');
const { UNDO_WINDOW_S, UTILITIES, band, canUndo, checkedValue, flaggedUtilities, isStale, recomputeBand, snapshotOf, validateReview } = require('../lib/meterReview');
const { periodLabel } = require('../lib/dates');
const meters = require('../services/meters');
const { fullView, meanSd, normalizeRun, ownerView } = require('../lib/aiQuality');
const { reviewStats } = require('../lib/reviewStats');
const ml = require('../services/ml');

const RISK_TYPES = ['risk_lr', 'risk_rf'];

/**
 * แถวล่าสุดของ model_runs ตามชนิด · โมเดลความเสี่ยงรับแถว 'risk' รวมของรุ่นก่อนด้วย
 * (ระบบที่อัปเกรดแล้วแต่ยังไม่ได้เทรนใหม่ ยังเห็นผลรอบล่าสุด ไม่ขึ้นว่า "ยังไม่มีโมเดล")
 */
async function latestRun(modelType) {
  const types = RISK_TYPES.includes(modelType) ? [modelType, 'risk'] : [modelType];
  const row = await db.one(`SELECT id, model_type, trained_at, metrics, sklearn_version, n_train, n_test, data_from::text AS data_from,
      data_to::text AS data_to, is_synthetic, cv_scores, confusion, calibration, global_importance, triggered_by
    FROM model_runs WHERE model_type = ANY($1) ORDER BY trained_at DESC, id DESC LIMIT 1`, [types]);
  return normalizeRun(row, modelType);
}

/** ส่วนสรุปของรอบเทรนที่ใช้ได้ทุกที่ (ไม่มีรายละเอียดหนัก) */
const runSummary = r => r && ({
  run_id: r.id, model_type: r.model_type, trained_at: r.trained_at, sklearn_version: r.sklearn_version,
  n_train: r.n_train, n_test: r.n_test, data_from: r.data_from, data_to: r.data_to,
  is_synthetic: r.is_synthetic, triggered_by: r.triggered_by,
  auc: r.metrics?.auc ?? null, n_samples: r.metrics?.n_samples ?? r.n_train ?? null,
});

/* ---------------------------------------------------------------------------
 * GET /api/ai/status  แถบสถานะ (3.1)
 * ไม่ต้องเข้าสู่ระบบ และไม่มีข้อมูลเฉพาะผู้ใช้ เพราะ CDN เก็บคำตอบเดียวแจกทุกคน (4.5)
 * ------------------------------------------------------------------------- */
router.get('/status', ah(async (_req, res) => {
  const ai = await settings.ai();
  const [ml, risk, anomaly, scoring, synth] = await Promise.all([
    pingHealth(config.mlUrl),
    latestRun(`risk_${ai.risk_model}`),
    latestRun('anomaly'),
    db.one(`SELECT max(risk_scored_at) AS last_scored_at,
        count(*) FILTER (WHERE status IN ('unpaid','overdue'))::int AS open_bills,
        count(*) FILTER (WHERE status IN ('unpaid','overdue') AND risk_score IS NULL)::int AS open_unscored
      FROM bills WHERE kind = 'monthly'`),
    db.one('SELECT EXISTS (SELECT 1 FROM vendors WHERE sim_discipline IS NOT NULL) AS s'),
  ]);
  res.set('Cache-Control', STATUS_CACHE);
  res.json({
    checked_at: new Date().toISOString(),
    ml: { state: ml.state, ms: ml.ms },
    active_model: ai.risk_model,
    // ป้าย "ข้อมูลจำลอง": ตามรอบเทรนล่าสุด ถ้ายังไม่เคยเทรนให้ดูจากข้อมูลในระบบ
    is_synthetic: risk?.is_synthetic ?? anomaly?.is_synthetic ?? Boolean(synth?.s),
    models: { risk: runSummary(risk), anomaly: runSummary(anomaly) },
    scoring,
  });
}));

/* ---------------------------------------------------------------------------
 * GET /api/ai/runs?model_type=risk_lr  ประวัติการเทรนสำหรับกราฟข้ามรอบ (3.4)
 * ------------------------------------------------------------------------- */
router.get('/runs', auth, role('owner', 'admin'), ah(async (req, res) => {
  const type = String(req.query.model_type || 'risk_lr');
  if (![...RISK_TYPES, 'anomaly'].includes(type)) throw new HttpError(400, 'model_type ต้องเป็น risk_lr, risk_rf หรือ anomaly');
  // ค่าเฉลี่ย ± SD ของ CV คิดจากผลรายพับที่เก็บไว้ (SD แบบตัวอย่าง) ให้ตรงกับแท็บคุณภาพ
  const rows = (await db.q(`SELECT id, trained_at, n_train, n_test, is_synthetic, triggered_by, cv_scores,
      (metrics->>'auc')::float AS auc, (metrics->>'precision')::float AS precision, (metrics->>'recall')::float AS recall
    FROM model_runs WHERE model_type = $1 ORDER BY trained_at, id LIMIT 60`, [type]))
    .map(({ cv_scores: cv, ...r }) => ({ ...r, cv_auc: meanSd(cv?.auc) }));
  res.json({ model_type: type, runs: rows });
}));

/* ---------------------------------------------------------------------------
 * GET /api/ai/card  บัตรโมเดล (3.5) เฉพาะทีม/กรรมการ
 * ข้อความประจำของบัตรอยู่ที่นี่ ตัวเลขทุกตัวมาจาก model_runs จริง ถ้ายังไม่เคยเทรนให้เป็น null
 * ------------------------------------------------------------------------- */
const CARDS = {
  risk: {
    title: 'ทำนายความเสี่ยงจ่ายช้า',
    purpose: 'ประเมินตอนออกบิลว่าบิลรายเดือนแต่ละใบมีโอกาสจ่ายหลังวันครบกำหนดแค่ไหน เพื่อให้เจ้าหน้าที่เตือนผู้ค้าล่วงหน้า',
    label: '"จ่ายช้า" = จ่ายหลังวันครบกำหนด หรือยังไม่จ่ายและเลยวันครบกำหนดแล้ว · บิลที่ยังไม่ถึงกำหนดไม่ถูกนำมาเทรน (ยังไม่รู้ผลจริง)',
    features: ['late_count', 'avg_days_late', 'bill_ratio', 'tenure_years', 'stall_type', 'season'],
    algorithms: 'Logistic Regression และ Random Forest (เลือกใช้ได้) แบ่งข้อมูลเทรน/ทดสอบ 75/25 ร่วมกับ 5-fold cross-validation',
    source: 'บิลรายเดือนในระบบ (ตาราง bills) ร่วมกับประวัติการจ่ายของผู้ค้าคนเดียวกัน ประเภทแผง และวันเริ่มเช่า',
    users: 'เจ้าหน้าที่สำนักงาน (เตือนผู้ค้าล่วงหน้า) และเจ้าของตลาด (ภาพรวม) · ไม่แสดงต่อผู้ค้า',
    limitations: [
      'ฟีเจอร์คิด ณ วันออกบิลเท่านั้น ไม่ใช้ข้อมูลที่รู้หลังวันครบกำหนด (กัน data leakage)',
      'ผู้ค้าที่มีประวัติน้อยกว่า 3 เดือน คะแนนเชื่อถือได้น้อย',
      'คะแนนเป็นความน่าจะเป็นจากโมเดล ใช้ประกอบการตัดสินใจของเจ้าหน้าที่ ไม่ใช้ตัดน้ำไฟหรือลงโทษผู้ค้าโดยอัตโนมัติ',
      'ถ้าพฤติกรรมการจ่ายเปลี่ยนไปมาก (เช่น เศรษฐกิจ เทศกาล) ต้องเทรนใหม่ ดูรายงาน drift ประกอบ',
    ],
  },
  anomaly: {
    title: 'ตรวจค่ามิเตอร์น้ำ–ไฟผิดปกติ',
    purpose: 'ทักค่ามิเตอร์ที่ดูผิดปกติก่อนออกบิล เพื่อให้เจ้าหน้าที่ตรวจหน้างานก่อนเรียกเก็บเงิน',
    label: 'ไม่มีป้ายคำตอบ (unsupervised): ค่าที่ห่างจากประวัติของแผงเองหรือแผงประเภทเดียวกันมาก หรือรูปแบบน้ำ–ไฟแปลกจากที่เคยเห็น',
    features: ['use_vs_own_mean_water', 'use_vs_own_mean_elec', 'use_vs_peer_mean_water', 'use_vs_peer_mean_elec'],
    algorithms: 'z-score เทียบประวัติ 12 เดือนของแผง และเทียบแผงประเภทเดียวกัน 3 เดือน ร่วมกับ Isolation Forest',
    source: 'ค่ามิเตอร์ที่ออกบิลแล้วในอดีต (ตาราง meter_readings)',
    users: 'เจ้าหน้าที่สำนักงาน (ตรวจหน้างาน ยืนยันหรือแก้ค่า)',
    limitations: [
      'แผงที่มีประวัติไม่ถึง 3 เดือนจะข้ามการตรวจ',
      'ค่าที่เลขน้อยกว่ารอบก่อนถูกทักเสมอ และต้องแก้ค่าก่อนออกบิล (ยืนยันไม่ได้)',
      'AI แค่ทัก คนเป็นผู้ตัดสินสุดท้ายผ่านปุ่มยืนยันหรือแก้ค่า ทุกการตัดสินถูกบันทึกพร้อมชื่อผู้ทำ',
    ],
  },
};
const RESPONSIBLE = 'ทีมพัฒนาระบบบริหารตลาดบัญญัติทรัพย์ (โครงงาน สจล.)';

router.get('/card', auth, role('admin'), ah(async (_req, res) => {
  const ai = await settings.ai();
  const [lr, rf, an] = await Promise.all([latestRun('risk_lr'), latestRun('risk_rf'), latestRun('anomaly')]);
  const risk = ai.risk_model === 'rf' ? rf : lr;
  res.json({
    responsible: RESPONSIBLE,
    active_model: ai.risk_model,
    cards: [
      { key: 'risk', ...CARDS.risk, run: runSummary(risk), alt_run: runSummary(ai.risk_model === 'rf' ? lr : rf),
        late_rate: risk?.metrics?.late_rate ?? null, thresholds: { high: ai.risk_high, mid: ai.risk_mid } },
      { key: 'anomaly', ...CARDS.anomaly, run: runSummary(an),
        thresholds: { method: ai.anomaly_method, z: ai.z_threshold, if: ai.if_threshold } },
    ],
  });
}));

/* ---------------------------------------------------------------------------
 * GET /api/ai/audit  ประวัติการทำงานของ AI (3.5): รอบเทรน การให้คะแนนใหม่ การยืนยัน/แก้ค่ามิเตอร์
 * ------------------------------------------------------------------------- */
router.get('/audit', auth, role('admin'), ah(async (req, res) => {
  const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 60));
  const rows = await db.q(`
    SELECT * FROM (
      SELECT 'train' AS kind, trained_at AS at, model_type AS subject, triggered_by AS actor,
             jsonb_build_object('auc', metrics->'auc', 'n_train', n_train, 'is_synthetic', is_synthetic) AS detail
        FROM model_runs
      UNION ALL
      SELECT 'rescore', created_at, job, NULL, jsonb_build_object('summary', summary)
        FROM job_logs WHERE job IN ('rescore', 'issue_bills')
      UNION ALL
      SELECT 'review', r.reviewed_at, r.stall_id || ' · ' || r.period, u.display_name,
             jsonb_build_object('decision', r.decision, 'utility', r.utility, 'old_value', r.old_value, 'new_value', r.new_value,
               'source', r.source, 'undone_at', r.undone_at)
        FROM anomaly_reviews r LEFT JOIN users u ON u.id = r.reviewed_by
    ) a ORDER BY at DESC LIMIT $1`, [limit]);
  res.json({ items: rows });
}));

/* ---------------------------------------------------------------------------
 * GET /api/ai/bills  รายการบิลค้างพร้อมคะแนนและปัจจัยแรก (3.2) · ผู้ค้าไม่มีสิทธิ์
 * GET /api/ai/bills/:id/explain  คำอธิบายเต็มของบิลหนึ่งใบ
 * อ่าน bills.risk_features ที่เก็บไว้ตอนให้คะแนน ไม่เรียก ML · ไม่ส่งเบอร์โทรหรือเลขบัตรของผู้ค้า
 * ------------------------------------------------------------------------- */
const BILL_COLS = `b.id, b.bill_no, b.stall_id, b.period, b.total, b.due_date::text AS due_date, b.status,
  b.risk_score, b.risk_features, b.risk_model, b.risk_scored_at, v.full_name`;

router.get('/bills', auth, role('staff', 'owner', 'admin'), ah(async (_req, res) => {
  const ai = await settings.ai();
  const [rows, run] = await Promise.all([
    db.q(`SELECT ${BILL_COLS} FROM bills b JOIN vendors v ON v.id = b.vendor_id
      WHERE b.kind = 'monthly' AND b.status IN ('unpaid','overdue')
      ORDER BY b.risk_score DESC NULLS LAST, b.due_date, b.stall_id`),
    latestRun(`risk_${ai.risk_model}`),
  ]);
  const items = rows.map(b => listRow(b, ai));
  const count = { high: 0, mid: 0, low: 0, unscored: 0 };
  for (const it of items) count[it.level || 'unscored'] += 1;
  res.json({
    items, count, thresholds: { high: ai.risk_high, mid: ai.risk_mid }, active_model: ai.risk_model,
    is_synthetic: run?.is_synthetic ?? null, trained_at: run?.trained_at ?? null,
  });
}));

router.get('/bills/:id/explain', auth, role('staff', 'owner', 'admin'), ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'เลขบิลไม่ถูกต้อง');
  const bill = await db.one(`SELECT ${BILL_COLS}, b.kind FROM bills b JOIN vendors v ON v.id = b.vendor_id WHERE b.id = $1`, [id]);
  if (!bill) throw new HttpError(404, 'ไม่พบบิลนี้');
  if (bill.kind !== 'monthly') throw new HttpError(404, 'บิลชำระล่วงหน้าไม่มีคะแนนความเสี่ยง');
  const ai = await settings.ai();
  const run = await latestRun(`risk_${bill.risk_model || ai.risk_model}`);
  res.json(explainView(bill, ai, run));
}));

/* ---------------------------------------------------------------------------
 * มิเตอร์ที่ถูกทัก (3.3, 4.2)
 *   GET  /api/ai/readings                           ค่าที่ AI ทักในรอบปัจจุบัน (ยังเป็นร่าง) และที่ออกบิลแล้ว
 *   GET  /api/ai/readings/:stall/:period/explain    ประวัติ + ช่วงปกติ + ผลตรวจที่เก็บไว้ ไม่เรียก ML
 *   POST /api/ai/readings/:stall/:period/review     ยืนยันค่าถูก / แก้ค่า (เจ้าหน้าที่เท่านั้น)
 *   POST /api/ai/reviews/:id/undo                   เลิกทำ (คนเดิม ภายใน 30 วินาที)
 * ค่าที่ทักยังเป็นร่าง (meter_drafts ไม่มี id) จึงอ้างด้วย แผง + รอบ แทน reading id
 * ------------------------------------------------------------------------- */
const STALL_RE = /^[A-Z]-\d{2}$/;
const PERIOD_RE = /^\d{4}-\d{2}$/;
function readingKey(req) {
  const stall = String(req.params.stall || '').toUpperCase();
  const period = String(req.params.period || '');
  if (!STALL_RE.test(stall) || !PERIOD_RE.test(period)) throw new HttpError(400, 'เลขแผงหรือรอบไม่ถูกต้อง');
  return { stall, period };
}

/** ผลตรวจมีสถานะว่า "ทัก" อยู่ไหม: ค่าเลขน้อยกว่ารอบก่อนนับเป็นทักเสมอ */
const isFlagged = c => Boolean(c?.anomaly);

/** การตัดสินล่าสุดที่ยังมีผล (ไม่นับรายการที่เลิกทำ) ของแต่ละ แผง+รอบ */
async function latestReviews(pairs) {
  if (!pairs.length) return {};
  const rows = await db.q(`SELECT DISTINCT ON (r.stall_id, r.period) r.id, r.stall_id, r.period, r.utility, r.decision, r.old_value::float,
      r.new_value::float, r.source, r.reviewed_at, u.display_name AS reviewer
    FROM anomaly_reviews_effective r LEFT JOIN users u ON u.id = r.reviewed_by
    WHERE (r.stall_id || '/' || r.period) = ANY($1)
    ORDER BY r.stall_id, r.period, r.reviewed_at DESC, r.id DESC`, [pairs]);
  return Object.fromEntries(rows.map(r => [`${r.stall_id}/${r.period.trim()}`, r]));
}

function summarizeCheck(check, cur) {
  const utils = flaggedUtilities(check);
  return {
    kind: check?.kind ?? null,
    reasons: check?.reasons ?? [],
    utilities: utils,
    if_level: check?.if_level ?? null,
    z: { water: check?.z_water ?? null, elec: check?.z_elec ?? null },
    stale: check ? isStale(check, cur) : false,
  };
}

router.get('/readings', auth, role('staff', 'owner', 'admin'), ah(async (_req, res) => {
  const period = await meters.currentPeriod();
  const [drafts, past] = await Promise.all([
    db.q(`SELECT d.stall_id, d.period, d.cur_water, d.cur_elec, d.ack, d.ever_flagged, d.ai_check, d.updated_at,
        t.name AS type_name, v.full_name
      FROM meter_drafts d JOIN stalls s ON s.id = d.stall_id JOIN stall_types t ON t.code = s.type_code
      LEFT JOIN vendors v ON v.stall_id = d.stall_id AND v.active
      WHERE d.period = $1 AND (d.ever_flagged OR (d.ai_check->>'anomaly')::boolean)
      ORDER BY d.stall_id`, [period]),
    db.q(`SELECT r.id, r.stall_id, r.period, r.cur_water, r.cur_elec, r.use_water, r.use_elec, r.ai_check, r.recorded_on,
        t.name AS type_name, v.full_name
      FROM meter_readings r JOIN stalls s ON s.id = r.stall_id JOIN stall_types t ON t.code = s.type_code
      LEFT JOIN vendors v ON v.stall_id = r.stall_id AND v.active
      WHERE r.flagged ORDER BY r.period DESC, r.stall_id LIMIT 60`),
  ]);
  const keyOf = r => `${r.stall_id}/${r.period.trim()}`;
  const reviews = await latestReviews([...drafts, ...past].map(keyOf));
  const item = (r, source) => {
    const cur = { water: r.cur_water, elec: r.cur_elec };
    const rev = reviews[keyOf(r)] || null;
    const flagged = isFlagged(r.ai_check);
    // pending = ยังเป็นร่าง AI ยังทักอยู่ และยังไม่มีใครยืนยัน
    const state = source === 'reading' ? 'issued' : !flagged ? 'resolved' : r.ack ? 'confirmed' : 'pending';
    return {
      key: keyOf(r), stall_id: r.stall_id, period: r.period.trim(), source, state,
      vendor_name: r.full_name ?? null, type_name: r.type_name,
      has_check: Boolean(r.ai_check), ...summarizeCheck(r.ai_check, cur),
      review: rev && { id: rev.id, decision: rev.decision, utility: rev.utility, old_value: rev.old_value, new_value: rev.new_value,
        reviewer: rev.reviewer, source: rev.source, reviewed_at: rev.reviewed_at },
    };
  };
  const current = drafts.map(r => item(r, 'draft'));
  res.json({
    period, period_label: periodLabel(period),
    current, past: past.map(r => item(r, 'reading')),
    count: { pending: current.filter(i => i.state === 'pending').length, current: current.length, past: past.length },
  });
}));

router.get('/readings/:stall/:period/explain', auth, role('staff', 'owner', 'admin'), ah(async (req, res) => {
  const { stall, period } = readingKey(req);
  const current = await meters.currentPeriod();
  const [draft, reading, info, ai] = await Promise.all([
    period === current ? db.one('SELECT * FROM meter_drafts WHERE stall_id = $1 AND period = $2', [stall, period]) : null,
    db.one('SELECT * FROM meter_readings WHERE stall_id = $1 AND period = $2', [stall, period]),
    db.one(`SELECT s.id, s.init_water, s.init_elec, t.name AS type_name, v.full_name FROM stalls s JOIN stall_types t ON t.code = s.type_code
      LEFT JOIN vendors v ON v.stall_id = s.id AND v.active WHERE s.id = $1`, [stall]),
    settings.ai(),
  ]);
  if (!info) throw new HttpError(404, 'ไม่พบแผงนี้');
  const src = draft || reading;
  if (!src) throw new HttpError(404, 'ไม่พบค่ามิเตอร์ของแผงนี้ในรอบนี้');

  const hist = (await db.q(`SELECT period, cur_water, cur_elec, use_water, use_elec, flagged FROM meter_readings
    WHERE stall_id = $1 AND period < $2 ORDER BY period DESC LIMIT 12`, [stall, period])).reverse();
  const check = src.ai_check || null;
  const prev = {
    water: check?.prev_water ?? hist.at(-1)?.cur_water ?? info.init_water,
    elec: check?.prev_elec ?? hist.at(-1)?.cur_elec ?? info.init_elec,
  };
  const cur = { water: src.cur_water, elec: src.cur_elec };
  const use = {
    water: reading && !draft ? reading.use_water : cur.water == null ? null : cur.water - prev.water,
    elec: reading && !draft ? reading.use_elec : cur.elec == null ? null : cur.elec - prev.elec,
  };
  const k = check?.z_threshold ?? ai.z_threshold;
  const utilities = {};
  for (const u of UTILITIES) {
    const stored = check && check[`mean_${u}`] != null ? band(check[`mean_${u}`], check[`sd_${u}`], k) : null;
    utilities[u] = {
      band: stored || recomputeBand(hist.map(h => h[`use_${u}`]), k),
      band_source: stored ? 'check' : 'recomputed',
      z: check?.[`z_${u}`] ?? null, peer_z: check?.[`peer_z_${u}`] ?? null, ratio: check?.[`ratio_${u}`] ?? null,
      prev: prev[u], cur: cur[u], use: use[u], checked_value: checkedValue(check, u),
    };
  }
  const reviews = await db.q(`SELECT r.id, r.utility, r.decision, r.old_value::float, r.new_value::float, r.source, r.reviewed_at, r.undone_at,
      r.reviewed_by, r.ai_snapshot, u.display_name AS reviewer, extract(epoch FROM now() - r.reviewed_at)::float AS age_s
    FROM anomaly_reviews r LEFT JOIN users u ON u.id = r.reviewed_by
    WHERE r.stall_id = $1 AND r.period = $2 ORDER BY r.reviewed_at DESC, r.id DESC`, [stall, period]);
  res.json({
    stall_id: stall, period, period_label: periodLabel(period), vendor_name: info.full_name ?? null, type_name: info.type_name,
    source: draft ? 'draft' : 'reading', ack: draft?.ack ?? null,
    can_review: Boolean(draft) && req.user.role === 'staff',
    has_check: Boolean(check), checked_at: check?.checked_at ?? null, method: check?.method ?? ai.anomaly_method,
    ...summarizeCheck(check, cur),
    flagged_utilities: flaggedUtilities(check),
    // ผลตรวจครั้งที่ทักจริง (เก็บไว้กับรายการตรวจ) ใช้อธิบายค่าที่แก้แล้วออกบิล ซึ่งผลตรวจบนเลขมิเตอร์เป็นของค่าหลังแก้
    first_flag: reviews.filter(r => r.ai_snapshot?.reasons?.length).at(-1)?.ai_snapshot ?? null,
    flagged: isFlagged(check) || Boolean(reading?.flagged) || Boolean(draft?.ever_flagged),
    if_score: check?.if_score ?? null, if_threshold: check?.if_threshold ?? ai.if_threshold, z_threshold: k,
    window: check?.window ?? (hist.length ? { from: hist[0].period, to: hist.at(-1).period, n: hist.length } : null),
    history: hist.map(h => ({ period: h.period.trim(), water: h.use_water, elec: h.use_elec, flagged: h.flagged })),
    utilities,
    reviews: reviews.map(r => ({
      id: r.id, utility: r.utility, decision: r.decision, old_value: r.old_value, new_value: r.new_value, source: r.source,
      reviewer: r.reviewer, reviewed_at: r.reviewed_at, undone_at: r.undone_at,
      // ปุ่มเลิกทำโผล่ได้เฉพาะคนที่บันทึก และยังอยู่ในเวลา (หน้าเว็บใช้แสดงผลเท่านั้น server ตรวจซ้ำตอนกด)
      undo_left_s: !r.undone_at && r.reviewed_by === req.user.sub ? Math.max(0, UNDO_WINDOW_S - r.age_s) : 0,
    })),
  });
}));

/** แถวรีวิวสำหรับตอบกลับ */
const reviewOut = r => ({
  review_id: r.id, decision: r.decision, utility: r.utility, old_value: r.old_value == null ? null : Number(r.old_value),
  new_value: r.new_value == null ? null : Number(r.new_value), reviewed_at: r.reviewed_at, undo_window_s: UNDO_WINDOW_S,
  undo_until: new Date(new Date(r.reviewed_at).getTime() + UNDO_WINDOW_S * 1000).toISOString(),
});

router.post('/readings/:stall/:period/review', auth, role('staff'), ah(async (req, res) => {
  const { stall, period } = readingKey(req);
  const body = req.body || {};
  const ref = body.client_ref ?? null;
  const userId = req.user.sub;
  try {
    const out = await tx(async t => {
      // ส่งซ้ำด้วย client_ref เดิม (เน็ตหลุดหลังเซิร์ฟเวอร์บันทึกแล้ว) = คืนรายการเดิม ไม่บันทึกซ้ำ
      if (ref) {
        const dup = await t.one('SELECT * FROM anomaly_reviews WHERE client_ref = $1', [ref]);
        if (dup) {
          if (dup.reviewed_by !== userId || dup.stall_id !== stall || dup.period.trim() !== period) throw new HttpError(409, 'รหัสอ้างอิงนี้ถูกใช้แล้ว');
          return { ...reviewOut(dup), replay: true };
        }
      }
      if (period !== await meters.currentPeriod()) throw new HttpError(409, 'รอบนี้ออกบิลแล้ว แก้หรือยืนยันจากหน้านี้ไม่ได้');
      const d = await t.one('SELECT * FROM meter_drafts WHERE stall_id = $1 AND period = $2 FOR UPDATE', [stall, period]);
      if (!d) throw new HttpError(409, 'ไม่พบค่าที่จดของแผงนี้ในรอบนี้ (อาจออกบิลไปแล้ว)');
      if (!d.ever_flagged && !isFlagged(d.ai_check)) throw new HttpError(409, 'AI ไม่ได้ทักค่ามิเตอร์ของแผงนี้');
      const u = body.utility;
      const prevVal = d.ai_check?.[`prev_${u}`] ?? null;
      const curVal = d[`cur_${u}`] ?? null;
      const kind = curVal != null && prevVal != null && curVal < prevVal ? 'misread' : d.ai_check?.kind;
      const err = validateReview(body, { kind, prev: prevVal, cur: curVal });
      if (err) throw new HttpError(422, err);
      const newVal = body.decision === 'corrected' ? body.new_value : curVal;
      const r = await t.one(`INSERT INTO anomaly_reviews (stall_id, period, utility, decision, old_value, new_value, prev_ack, source, client_ref, reviewed_by, ai_snapshot)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'behind',$8,$9,$10) RETURNING *`,
        [stall, period, u, body.decision, curVal, newVal, d.ack, ref, userId, JSON.stringify(snapshotOf(d.ai_check))]);
      if (body.decision === 'confirmed') {
        await t.q('UPDATE meter_drafts SET ack = true, updated_at = now() WHERE stall_id = $1 AND period = $2', [stall, period]);
      } else {
        // ค่าใหม่ต้องให้ AI ตรวจซ้ำ (ทำตอนเปิดหน้าจดมิเตอร์หรือตอนออกบิล) จึงล้างสถานะ "ตรวจแล้ว"
        await t.q(`UPDATE meter_drafts SET cur_${u === 'water' ? 'water' : 'elec'} = $1, ack = false, updated_at = now()
          WHERE stall_id = $2 AND period = $3`, [newVal, stall, period]);
      }
      return reviewOut(r);
    });
    res.status(out.replay ? 200 : 201).json(out);
  } catch (e) {
    // กดพร้อมกันสองครั้งด้วย client_ref เดียวกัน: ครั้งที่สองชน UNIQUE ให้คืนรายการแรก
    if (e.code === '23505' && ref) {
      const dup = await db.one('SELECT * FROM anomaly_reviews WHERE client_ref = $1', [ref]);
      if (dup && dup.reviewed_by === userId) return res.json({ ...reviewOut(dup), replay: true });
    }
    throw e;
  }
}));

router.post('/reviews/:id/undo', auth, role('staff'), ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'เลขรายการไม่ถูกต้อง');
  const out = await tx(async t => {
    const r = await t.one(`SELECT *, extract(epoch FROM now() - reviewed_at)::float AS age_s FROM anomaly_reviews WHERE id = $1 FOR UPDATE`, [id]);
    if (!r) throw new HttpError(404, 'ไม่พบรายการนี้');
    const period = r.period.trim();
    const d = await t.one('SELECT * FROM meter_drafts WHERE stall_id = $1 AND period = $2 FOR UPDATE', [r.stall_id, period]);
    const latest = await t.one(`SELECT id FROM anomaly_reviews WHERE stall_id = $1 AND period = $2 AND undone_at IS NULL
      ORDER BY reviewed_at DESC, id DESC LIMIT 1`, [r.stall_id, period]);
    const v = canUndo(r, { userId: req.user.sub, latestId: latest?.id ?? null, issued: !d });
    if (!v.ok) throw new HttpError(v.status, v.error);
    if (v.already) return { ok: true, already: true, review_id: r.id };
    await t.q('UPDATE anomaly_reviews SET undone_at = now() WHERE id = $1', [id]);
    if (r.decision === 'corrected') {
      await t.q(`UPDATE meter_drafts SET cur_${r.utility === 'water' ? 'water' : 'elec'} = $1, ack = $2, updated_at = now()
        WHERE stall_id = $3 AND period = $4`, [Number(r.old_value), r.prev_ack, r.stall_id, period]);
    } else {
      await t.q('UPDATE meter_drafts SET ack = $1, updated_at = now() WHERE stall_id = $2 AND period = $3', [r.prev_ack, r.stall_id, period]);
    }
    return { ok: true, review_id: r.id, restored: { utility: r.utility, value: r.old_value == null ? null : Number(r.old_value), ack: r.prev_ack } };
  });
  res.json(out);
}));

/* ---------------------------------------------------------------------------
 * GET /api/ai/quality  คุณภาพโมเดล (3.4)
 *   เจ้าของ: สรุปภาษาง่าย + AUC ข้ามรอบของโมเดลที่ใช้อยู่ · ทีม/กรรมการ: ผลเต็มของทั้งสองโมเดล
 *   เจ้าหน้าที่ไม่มีแท็บนี้ API จึงปฏิเสธด้วย
 * ตัวเลขทุกตัวมาจาก model_runs ถ้ายังไม่เคยเทรน ค่าเป็น null ให้หน้าเว็บแสดงสถานะว่าง
 * ------------------------------------------------------------------------- */
router.get('/quality', auth, role('owner', 'admin'), ah(async (req, res) => {
  const ai = await settings.ai();
  const active = `risk_${ai.risk_model}`;
  const history = (await db.q(`SELECT id, model_type, trained_at, is_synthetic, n_train, (metrics->>'auc')::float AS auc, cv_scores
    FROM model_runs WHERE model_type = ANY($1) ORDER BY trained_at, id`, [req.user.role === 'admin' ? RISK_TYPES : [active]]))
    .map(({ cv_scores: cv, ...h }) => ({ ...h, cv_auc: meanSd(cv?.auc) }));
  const prevOf = async type => db.one(`SELECT metrics FROM model_runs WHERE model_type = $1 ORDER BY trained_at DESC, id DESC OFFSET 1 LIMIT 1`, [type]);
  const thresholds = { high: ai.risk_high, mid: ai.risk_mid };

  if (req.user.role === 'owner') {
    const [run, prev] = await Promise.all([latestRun(active), prevOf(active)]);
    return res.json({ view: 'owner', active_model: ai.risk_model, thresholds, summary: ownerView(run, prev),
      history: history.map(h => ({ id: h.id, model_type: h.model_type, trained_at: h.trained_at, auc: h.auc, is_synthetic: h.is_synthetic })) });
  }
  const [lr, rf, an] = await Promise.all([latestRun('risk_lr'), latestRun('risk_rf'), latestRun('anomaly')]);
  res.json({
    view: 'full', active_model: ai.risk_model, thresholds,
    models: { lr: fullView(lr), rf: fullView(rf) },
    anomaly: an && { run_id: an.id, trained_at: an.trained_at, n_train: an.n_train, data_from: an.data_from, data_to: an.data_to,
      is_synthetic: an.is_synthetic, metrics: an.metrics },
    history,
  });
}));

/* ---------------------------------------------------------------------------
 * รอบ 5: การเปลี่ยนแปลงของข้อมูล (drift) และสรุปการตรวจมิเตอร์เพื่อปรับเกณฑ์ · เฉพาะทีม/กรรมการ
 *   GET  /api/ai/drift      รายงานที่บันทึกไว้ + สรุปการตรวจ (อ่าน Postgres อย่างเดียว)
 *   POST /api/ai/drift/run  สั่ง ML สร้างรายงานใหม่ (เป็นการกดปุ่ม ไม่ใช่ตอนเปิดหน้า)
 * ------------------------------------------------------------------------- */
router.get('/drift', auth, role('admin'), ah(async (_req, res) => {
  const ai = await settings.ai();
  const [reports, reviews] = await Promise.all([
    db.q(`SELECT id, created_at, as_of::text AS as_of, report FROM drift_reports WHERE model_type = 'risk'
      ORDER BY created_at DESC, id DESC LIMIT 12`),
    // การตัดสินล่าสุดที่ยังมีผลของแต่ละ แผง+รอบ พร้อมผลตรวจ ณ ตอนนั้น
    db.q(`SELECT DISTINCT ON (stall_id, period) decision, ai_snapshot AS snapshot FROM anomaly_reviews_effective
      ORDER BY stall_id, period, reviewed_at DESC, id DESC`),
  ]);
  res.json({
    reports: reports.map(r => ({ id: r.id, created_at: r.created_at, as_of: r.as_of, ...r.report })),
    reviews: reviewStats(reviews, ai.z_threshold),
    thresholds: { method: ai.anomaly_method, z: ai.z_threshold, if: ai.if_threshold },
  });
}));

router.post('/drift/run', auth, role('admin'), ah(async (req, res) => {
  const r = await ml.runDrift(`${req.user.name} (${req.user.role})`);
  res.status(201).json(r);
}));

module.exports = router;
