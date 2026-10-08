/**
 * ตรวจแถวที่ส่งมาจากหน้า "ทำนายจากไฟล์" ก่อนส่งต่อให้ ML (POST /api/ai/predict)
 * หน้าเว็บแปลงไฟล์ CSV เป็นค่าพร้อมใช้แล้ว (web/src/ai/predictFile.js checkRow) ที่นี่ตรวจซ้ำอีกชั้น
 * เพราะ API ต้องไม่เชื่อค่าจากเบราว์เซอร์ ช่วงค่าต้องตรงกับฝั่งเว็บ
 */
const { TYPES } = require('./constants');

const MAX_ROWS = 500;
const STALL_CODES = Object.keys(TYPES);

const isNum = v => typeof v === 'number' && Number.isFinite(v);

/** คืนรายการข้อความผิดของแถวเดียว (ว่าง = ถูกต้อง) */
function rowErrors(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return ['ไม่ใช่ข้อมูลหนึ่งแถว'];
  const e = [];
  const range = (k, lo, hi, int = false) => {
    if (!isNum(r[k]) || r[k] < lo || r[k] > hi || (int && !Number.isInteger(r[k]))) e.push(`${k} ต้องเป็น${int ? 'จำนวนเต็ม' : 'ตัวเลข'} ${lo}–${hi}`);
  };
  if (r.ref != null && (typeof r.ref !== 'string' || r.ref.length > 60)) e.push('ref ต้องเป็นข้อความไม่เกิน 60 ตัวอักษร');
  if (!STALL_CODES.includes(r.stall_type)) e.push(`stall_type ต้องเป็น ${STALL_CODES.join(', ')}`);
  range('due_month', 1, 12, true);
  range('tenure_years', 0, 60);
  range('n_prior', 0, 6, true);
  range('late_count', 0, 6, true);
  range('days_late_total', 0, 2000);
  range('bill_total', 1, 1e7);
  range('prev_avg', 0, 1e7);
  // พฤติกรรมการจ่ายไม่บังคับ: null = ให้ ML เติมค่าเฉลี่ยของตลาด
  for (const [k, hi, int] of [['early_days_avg', 30, false], ['seen_count', 6, true], ['app_count', 6, true]]) {
    if (r[k] != null) range(k, 0, hi, int);
  }
  if (!e.length) {
    for (const k of ['seen_count', 'app_count']) if (r[k] != null && r[k] > r.n_prior) e.push(`${k} มากกว่า n_prior`);
    if (r.late_count > r.n_prior) e.push('late_count มากกว่า n_prior');
    if (r.late_count === 0 && r.days_late_total > 0) e.push('ไม่มีบิลที่จ่ายช้า แต่ days_late_total ไม่เป็น 0');
    if (r.late_count > 0 && r.days_late_total < r.late_count) e.push('days_late_total ต้องไม่น้อยกว่า late_count');
  }
  return e;
}

/** ตรวจทั้งชุด: คืน { rows } ที่ตัดเหลือเฉพาะฟิลด์ที่ ML ใช้ หรือ { error, details } */
function validateRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return { error: 'ไม่มีแถวข้อมูลให้ทำนาย' };
  if (rows.length > MAX_ROWS) return { error: `ทำนายได้ครั้งละไม่เกิน ${MAX_ROWS} แถว` };
  const details = [];
  rows.forEach((r, i) => { const e = rowErrors(r); if (e.length) details.push({ index: i, errors: e }); });
  if (details.length) return { error: `ข้อมูลไม่ถูกต้อง ${details.length} แถว`, details: details.slice(0, 20) };
  return {
    rows: rows.map(r => ({
      ref: r.ref || '', stall_type: r.stall_type, due_month: r.due_month, tenure_years: r.tenure_years, n_prior: r.n_prior,
      late_count: r.late_count, days_late_total: r.days_late_total, bill_total: r.bill_total, prev_avg: r.prev_avg,
      early_days_avg: r.early_days_avg ?? null, seen_count: r.seen_count ?? null, app_count: r.app_count ?? null,
    })),
  };
}

module.exports = { MAX_ROWS, rowErrors, validateRows };
