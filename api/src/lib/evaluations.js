/**
 * สรุปผลวัดโมเดลกับข้อมูลจำลองหลายชุด (ตาราง model_evaluations) · ฟังก์ชันล้วน ทดสอบได้โดยไม่ต้องมีฐานข้อมูล
 * ตัวเลขทุกตัวมาจากผลที่ ML บันทึกไว้ ฟังก์ชันนี้แค่จัดกลุ่ม เฉลี่ย และหาตัวที่ดีที่สุด
 */

/**
 * ตัวชี้วัดหลักที่ใช้เลือก "ดีที่สุด" ของแต่ละงาน
 * ความเสี่ยงใช้ AUC เฉลี่ยของ 5-fold CV (ใช้ข้อมูลทั้งชุด นิ่งกว่าชุดทดสอบ 25% ชุดเดียว โดยเฉพาะชุดที่ข้อมูลน้อย)
 * มิเตอร์ใช้ F1 ที่เกณฑ์ใช้งานจริง (ไม่มี CV เพราะแบ่งตามเวลา)
 */
const PRIMARY = { risk: 'cv_auc_mean', anomaly: 'f1' };
const METRICS = ['auc', 'pr_auc', 'precision', 'recall', 'f1', 'accuracy', 'brier'];
/** ค่ายิ่งต่ำยิ่งดี */
const LOWER_IS_BETTER = new Set(['brier']);

const r4 = v => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10000) / 10000);

function meanSd(xs) {
  const v = xs.filter(x => x != null && Number.isFinite(Number(x))).map(Number);
  if (!v.length) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) : 0;
  return { mean: r4(m), sd: r4(sd), n: v.length };
}

/** แถวจากฐานข้อมูล → ตัวเลขเป็น number (pg คืน real เป็น number อยู่แล้ว แต่กันกรณีเป็น string) */
function normalizeRow(r) {
  const out = { ...r };
  for (const k of [...METRICS, 'cv_auc_mean', 'cv_auc_std', 'positive_rate']) out[k] = r4(r[k]);
  return out;
}

/**
 * ตัวที่ดีที่สุดของแต่ละชุดข้อมูล (ไม่นับเกณฑ์อ้างอิง) ตามตัวชี้วัดหลักของงาน
 * เสมอกันได้หลายตัว · ไม่มีค่าเลย = ไม่มีผู้ชนะ
 */
function bestByDataset(rows) {
  const groups = {};
  for (const r of rows) {
    if (r.model === 'baseline') continue;
    (groups[`${r.task}/${r.dataset}`] ||= []).push(r);
  }
  const best = {};
  for (const [key, rs] of Object.entries(groups)) {
    const metric = PRIMARY[rs[0].task];
    const vals = rs.map(r => r[metric]).filter(v => v != null);
    if (!vals.length) continue;
    const top = Math.max(...vals);
    best[key] = { metric, value: top, models: rs.filter(r => r[metric] === top).map(r => r.model) };
  }
  return best;
}

/** ค่าเฉลี่ย ± SD ข้ามชุดข้อมูล แยกตามงานและโมเดล + จำนวนชุดที่ชนะ */
function summarize(rows) {
  const best = bestByDataset(rows);
  const groups = {};
  for (const r of rows) (groups[`${r.task}/${r.model}`] ||= []).push(r);
  return Object.entries(groups).map(([key, rs]) => {
    const [task, model] = key.split('/');
    const metrics = Object.fromEntries(METRICS.map(m => [m, meanSd(rs.map(r => r[m]))]));
    const wins = Object.entries(best).filter(([k, b]) => k.startsWith(`${task}/`) && b.models.includes(model)).length;
    return { task, model, datasets: rs.length, metrics, wins };
  });
}

/* ---------- สมมติฐานของชุดที่ออกแบบให้โมเดลต่างกัน ---------- */

/** t วิกฤตของการทดสอบแบบจับคู่ 5 พับ (df = 4) ที่ระดับ 0.05 สองทาง */
const T_CRIT = { 4: 2.776, 3: 3.182, 2: 4.303, 1: 12.706 };
/** มิเตอร์ไม่มีผลรายพับ ส่วนต่าง F1 ต่ำกว่านี้ถือว่าสรุปไม่ได้ */
const F1_MARGIN = 0.05;

/** ค่าที่ใช้ตัดสิน + ผลรายพับ + ทิศทาง (สูงดี/ต่ำดี) ของตัวชี้วัดแต่ละแบบ */
function metricOf(row, metric) {
  if (metric === 'cv_auc') return { value: row.cv_auc_mean, folds: row.extra?.cv_scores?.auc ?? null, higher: true };
  if (metric === 'cv_brier') return { value: row.extra?.cv_brier_mean ?? null, folds: row.extra?.cv_scores?.brier ?? null, higher: false };
  return { value: row.f1, folds: null, higher: true };
}

/** t ของผลต่างรายพับแบบจับคู่ (a − b) · คืน null ถ้าคำนวณไม่ได้ */
function pairedT(a, b) {
  if (!a || !b || a.length !== b.length || a.length < 2) return null;
  const d = a.map((x, i) => x - b[i]);
  const m = d.reduce((s, x) => s + x, 0) / d.length;
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1));
  if (sd === 0) return m === 0 ? 0 : Infinity * Math.sign(m);
  return m / (sd / Math.sqrt(d.length));
}

/**
 * ตรวจสมมติฐานของแต่ละชุด: เทียบ "ตัวที่ดีที่สุดในกลุ่มที่คาดว่าชนะ" กับ "ตัวที่ดีที่สุดในกลุ่มที่เหลือ" (ไม่นับเกณฑ์อ้างอิง)
 *   held = 'yes'     กลุ่มที่คาดชนะ และต่างอย่างมีนัยสำคัญ (paired t ≥ t วิกฤต หรือ F1 ห่าง ≥ 0.05)
 *          'no'      กลุ่มที่เหลือชนะอย่างมีนัยสำคัญ
 *          'unclear' ต่างกันน้อยกว่าที่ความบังเอิญอธิบายได้
 */
function checkHypotheses(rows, datasets = []) {
  const out = [];
  for (const ds of datasets) {
    if (!ds.expect?.length) continue;
    const metric = ds.expect_metric || (ds.task === 'risk' ? 'cv_auc' : 'f1');
    const rs = rows.filter(r => r.task === ds.task && r.dataset === ds.key && r.model !== 'baseline');
    const scored = rs.map(r => ({ model: r.model, ...metricOf(r, metric) })).filter(x => x.value != null);
    const better = (x, y) => (x.higher ? x.value > y.value : x.value < y.value);
    const pick = xs => xs.reduce((b, x) => (!b || better(x, b) ? x : b), null);
    const exp = pick(scored.filter(x => ds.expect.includes(x.model)));
    const other = pick(scored.filter(x => !ds.expect.includes(x.model)));
    const base = { task: ds.task, dataset: ds.key, title: ds.title, hypothesis: ds.hypothesis, expect: ds.expect, metric,
      values: Object.fromEntries(scored.map(x => [x.model, x.value])) };
    if (!exp || !other) { out.push({ ...base, held: 'unclear', reason: 'ผลวัดไม่ครบ' }); continue; }
    const expWins = better(exp, other) || exp.value === other.value;
    const diff = Math.abs(exp.value - other.value);
    let significant;
    let t = null;
    if (exp.folds && other.folds) {
      t = pairedT(exp.folds, other.folds);
      significant = t != null && Math.abs(t) >= (T_CRIT[exp.folds.length - 1] ?? 2.776);
    } else {
      significant = diff >= F1_MARGIN;
    }
    out.push({
      ...base, winner: expWins ? exp.model : other.model, compared: [exp.model, other.model],
      diff: Math.round(diff * 10000) / 10000, t: t == null || !Number.isFinite(t) ? t : Math.round(t * 100) / 100,
      held: !significant ? 'unclear' : expWins ? 'yes' : 'no',
    });
  }
  return out;
}

module.exports = { PRIMARY, METRICS, LOWER_IS_BETTER, meanSd, normalizeRow, bestByDataset, summarize, pairedT, checkHypotheses };
