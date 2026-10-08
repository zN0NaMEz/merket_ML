/*
 * ทำนายการจ่ายช้าจากไฟล์ที่เจ้าหน้าที่อัปโหลด (หน้า AI วิเคราะห์ แท็บ "ทำนายจากไฟล์")
 * อ่านไฟล์ CSV ในเบราว์เซอร์ ตรวจค่าทีละแถวให้แก้ได้ทันที แล้วส่งเฉพาะแถวที่ถูกต้องไปให้ API
 * การแปลงเป็นปัจจัยของโมเดล (avg_days_late, bill_ratio, season …) ทำที่ ML ใน features.input_features()
 * ที่เดียว ไฟล์นี้จึงมีแค่การอ่านและตรวจรูปแบบ ไม่มี React ทดสอบได้ด้วย node --test
 */
import { STALL_TYPES } from './featureLabels.js';

export const MAX_ROWS = 500;
export const MAX_BYTES = 1024 * 1024;
export const SAMPLE_NAME = 'ตัวอย่างข้อมูลทำนายการจ่ายช้า.csv';

/** คอลัมน์ของไฟล์ หัวตารางภาษาไทยคือชื่อที่ไฟล์ตัวอย่างใช้ ชื่ออังกฤษ (key) ใช้แทนได้ */
export const COLUMNS = [
  { key: 'ref', th: 'ชื่อหรือรหัสอ้างอิง', hint: 'ไม่บังคับ ใช้ดูว่าผลเป็นของใคร เช่น ชื่อผู้ค้าหรือเลขแผง' },
  { key: 'stall_type', th: 'ประเภทแผง', required: true, hint: `${Object.values(STALL_TYPES).join(' / ')}` },
  { key: 'due_month', th: 'เดือนที่ครบกำหนด', required: true, hint: 'เลขเดือน 1–12 หรือวันที่ เช่น 2026-05' },
  { key: 'tenure_years', th: 'เช่ามาแล้ว (ปี)', required: true, hint: 'ใส่ทศนิยมได้ เช่น 0.5 = หกเดือน' },
  { key: 'n_prior', th: 'จำนวนบิลก่อนหน้าที่นับ', required: true, hint: '0–6 บิลล่าสุดก่อนบิลนี้ (ผู้ค้าใหม่ใส่ 0)' },
  { key: 'late_count', th: 'จ่ายช้ากี่บิล', required: true, hint: 'นับจากบิลก่อนหน้าข้างบน ต้องไม่เกินจำนวนบิลที่นับ' },
  { key: 'days_late_total', th: 'รวมวันที่จ่ายช้า', required: true, hint: 'รวมทุกบิลที่จ่ายช้า บิลที่จ่ายตรงนับเป็น 0' },
  { key: 'bill_total', th: 'ยอดบิลนี้ (บาท)', required: true, hint: 'ยอดของบิลที่ต้องการทำนาย' },
  { key: 'prev_avg', th: 'ยอดเฉลี่ย 3 บิลก่อนหน้า (บาท)', hint: 'เว้นว่างได้ถ้าไม่มีบิลก่อนหน้า ระบบถือว่ายอดเท่าปกติ' },
  // พฤติกรรมการจ่าย (ไม่บังคับ): เว้นว่าง = ใช้ค่าเฉลี่ยของตลาดจากข้อมูลที่เทรน และบอกไว้ในผล
  { key: 'early_days_avg', th: 'จ่ายก่อนครบกำหนดเฉลี่ย (วัน)', hint: 'เฉพาะบิลที่จ่ายตรงเวลา เช่น จ่ายก่อน 5 วัน ใส่ 5 · เว้นว่างได้' },
  { key: 'seen_count', th: 'เปิดดูบิลในแอปกี่บิล', hint: 'จากบิลก่อนหน้าที่นับ ต้องไม่เกินจำนวนบิลที่นับ · เว้นว่างได้' },
  { key: 'app_count', th: 'จ่ายผ่านแอปกี่บิล', hint: 'จ่ายผ่าน PromptPay ในแอป ไม่ใช่เงินสดที่สำนักงาน · เว้นว่างได้' },
  // ผลจริงใช้วัดความแม่นของ AI กับไฟล์นี้เท่านั้น ไม่ถูกส่งไปให้ AI (เบราว์เซอร์เก็บไว้เทียบเอง)
  { key: 'actual', th: 'ผลจริง (ถ้ารู้)', hint: 'จ่ายช้า หรือ ตรงเวลา (ใส่ 1 / 0 ก็ได้) · เว้นว่างได้ ใส่เมื่ออยากวัดว่า AI ทายแม่นแค่ไหนกับไฟล์นี้' },
];
/** คอลัมน์พฤติกรรมที่เว้นว่างได้ (ระบบเติมค่าเฉลี่ยของตลาด) */
export const BEHAVIOR_KEYS = ['early_days_avg', 'seen_count', 'app_count'];

/** ตัวอย่างที่ครอบคลุมหลายแบบ ให้เห็นว่าคะแนนเปลี่ยนตามปัจจัยอย่างไร */
const SAMPLE_ROWS = [
  ['ตัวอย่าง 1 จ่ายตรงทุกเดือน', 'ของชำ', 7, 6, 6, 0, 0, 2950, 2900, 7, 6, 6, ''],
  ['ตัวอย่าง 2 ช้าบ่อย', 'เสื้อผ้าและของใช้', 9, 2, 6, 4, 23, 2600, 2450, 1, 1, 0, ''],
  ['ตัวอย่าง 3 ผู้ค้าใหม่', 'ผักผลไม้', 5, 0.3, 2, 0, 0, 3100, 2800, 4, 2, 2, ''],
  ['ตัวอย่าง 4 ยอดบิลพุ่ง', 'อาหารปรุงสุก', 6, 3.5, 6, 1, 3, 6200, 3900, 3, 4, 3, ''],
  ['ตัวอย่าง 5 ช้าแค่ครั้งเดียว', 'อาหารสด', 12, 8, 6, 1, 2, 3400, 3350, 5, 5, 6, ''],
  ['ตัวอย่าง 6 ยังไม่มีประวัติ', 'อาหารสด', 8, 0, 0, 0, 0, 3200, '', '', '', '', ''],
  ['ตัวอย่าง 7 ช้านานหลายวัน', 'อาหารปรุงสุก', 10, 1.5, 5, 3, 31, 4100, 4000, 0, 1, 0, ''],
  ['ตัวอย่าง 8 ไม่ได้กรอกพฤติกรรม', 'เสื้อผ้าและของใช้', 4, 4, 6, 2, 6, 2500, 2400, '', '', '', ''],
];

/* ---------------- CSV ---------------- */

const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** ไฟล์ตัวอย่าง: ขึ้นต้นด้วย BOM เพื่อให้ Excel เปิดภาษาไทยได้ถูกต้อง */
export const sampleCsv = () => '﻿' + toCsv([COLUMNS.map(c => c.th), ...SAMPLE_ROWS]);

/** เดาตัวคั่นจากบรรทัดหัวตาราง (Excel บางภาษาใช้ ; หรือแท็บ) */
function delimiterOf(text) {
  const head = text.split(/\r?\n/, 1)[0];
  const count = ch => head.split(ch).length - 1;
  return [',', ';', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');
}

/** แยก CSV ตาม RFC 4180 (ช่องในเครื่องหมายคำพูด, "" แทน " และขึ้นบรรทัดในช่องได้) */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const d = delimiterOf(src);
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === d) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/** ไบต์ของไฟล์ → ข้อความ: ลอง UTF-8 ก่อน ถ้าไม่ใช่ (Excel ไทยบันทึกแบบ ANSI) ใช้ windows-874 */
export function decodeBytes(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* ไม่ใช่ UTF-8 */ }
  return new TextDecoder('windows-874').decode(bytes);
}

/* ---------------- ตรวจค่า ---------------- */

const norm = s => String(s || '').replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, '');
const HEADER_OF = new Map(COLUMNS.flatMap(c => [[norm(c.th), c.key], [norm(c.key), c.key]]));
const TYPE_OF = new Map(Object.entries(STALL_TYPES).flatMap(([code, th]) => [[norm(code), code], [norm(th), code]]));
const TYPE_LIST = Object.values(STALL_TYPES).join(', ');

/** "3,200 บาท" → 3200 · ว่าง → null · อ่านไม่ได้ → NaN */
export function toNumber(raw) {
  const s = String(raw ?? '').replace(/บาท|ปี|วัน|บิล|ครั้ง/g, '').replace(/[,\s]/g, '');
  if (s === '') return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const LATE_WORDS = new Set(['จ่ายช้า', 'ช้า', 'late', '1', 'yes', 'y', 'ใช่', 'true']);
const ONTIME_WORDS = new Set(['ตรงเวลา', 'จ่ายตรงเวลา', 'ตรง', 'ontime', 'on time', 'on-time', '0', 'no', 'n', 'ไม่', 'false']);
/** ผลจริง: 1 = จ่ายช้า · 0 = ตรงเวลา · null = เว้นว่าง · NaN = อ่านไม่ได้ */
export function toActual(raw) {
  const t = String(raw ?? '').trim().toLowerCase();
  if (t === '') return null;
  if (LATE_WORDS.has(t)) return 1;
  if (ONTIME_WORDS.has(t)) return 0;
  return NaN;
}

/** เดือน 1–12 จาก "5", "2026-05", "2026-05-10" หรือ "10/5/2026" */
export function toMonth(raw) {
  const s = String(raw ?? '').trim();
  let m = null;
  if (/^\d{1,2}$/.test(s)) m = Number(s);
  else if (/^\d{4}-\d{1,2}(-\d{1,2})?$/.test(s)) m = Number(s.split('-')[1]);
  else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) m = Number(s.split('/')[1]);
  return m >= 1 && m <= 12 ? m : null;
}

/**
 * ตรวจหนึ่งแถว คืน { value, errors } ข้อความผิดบอกว่าผิดอะไรและแก้อย่างไร
 * ต้องตรงกับ api/src/lib/riskInput.js (API ตรวจซ้ำอีกชั้น)
 */
export function checkRow(cells) {
  const errors = [];
  const num = (key, label, { int = false, min = 0, max = Infinity, required = true } = {}) => {
    const v = toNumber(cells[key]);
    if (v == null) { if (required) errors.push(`ยังไม่ได้ใส่${label}`); return null; }
    if (Number.isNaN(v)) { errors.push(`${label} "${cells[key]}" ไม่ใช่ตัวเลข`); return null; }
    if (int && !Number.isInteger(v)) { errors.push(`${label}ต้องเป็นจำนวนเต็ม`); return null; }
    if (v < min || v > max) { errors.push(`${label}ต้องอยู่ระหว่าง ${min} ถึง ${max.toLocaleString('th-TH')}`); return null; }
    return v;
  };
  const ref = String(cells.ref ?? '').trim().slice(0, 60);
  const typeRaw = String(cells.stall_type ?? '').trim();
  const stall_type = TYPE_OF.get(norm(typeRaw)) || null;
  if (!typeRaw) errors.push('ยังไม่ได้ใส่ประเภทแผง');
  else if (!stall_type) errors.push(`ไม่รู้จักประเภทแผง "${typeRaw}" ใช้ได้: ${TYPE_LIST}`);
  const due_month = toMonth(cells.due_month);
  if (due_month == null) errors.push(String(cells.due_month ?? '').trim() ? `เดือนที่ครบกำหนด "${cells.due_month}" ต้องเป็นเลข 1–12 หรือวันที่ เช่น 2026-05` : 'ยังไม่ได้ใส่เดือนที่ครบกำหนด');
  const tenure_years = num('tenure_years', 'ระยะเวลาที่เช่า', { max: 60 });
  const n_prior = num('n_prior', 'จำนวนบิลก่อนหน้า', { int: true, max: 6 });
  const late_count = num('late_count', 'จำนวนบิลที่จ่ายช้า', { int: true, max: 6 });
  const days_late_total = num('days_late_total', 'รวมวันที่จ่ายช้า', { max: 2000 });
  const bill_total = num('bill_total', 'ยอดบิลนี้', { min: 1, max: 1e7 });
  const prev_avg = num('prev_avg', 'ยอดเฉลี่ย 3 บิลก่อนหน้า', { max: 1e7, required: false });
  const early_days_avg = num('early_days_avg', 'จ่ายก่อนครบกำหนดเฉลี่ย', { max: 30, required: false });
  const seen_count = num('seen_count', 'จำนวนบิลที่เปิดดูในแอป', { int: true, max: 6, required: false });
  const app_count = num('app_count', 'จำนวนบิลที่จ่ายผ่านแอป', { int: true, max: 6, required: false });
  if (n_prior != null && late_count != null && late_count > n_prior) errors.push(`จ่ายช้า ${late_count} บิล มากกว่าจำนวนบิลที่นับ (${n_prior})`);
  if (late_count === 0 && days_late_total > 0) errors.push('ไม่มีบิลที่จ่ายช้า แต่รวมวันที่ช้าไม่เป็น 0');
  if (late_count > 0 && days_late_total != null && days_late_total < late_count) errors.push(`จ่ายช้า ${late_count} บิล รวมวันที่ช้าต้องอย่างน้อย ${late_count} วัน`);
  const actual = toActual(cells.actual);
  if (Number.isNaN(actual)) errors.push(`ผลจริง "${cells.actual}" ใช้ได้: จ่ายช้า, ตรงเวลา, 1, 0 หรือเว้นว่าง`);
  for (const [v, label] of [[seen_count, 'เปิดดูบิลในแอป'], [app_count, 'จ่ายผ่านแอป']]) {
    if (v != null && n_prior != null && v > n_prior) errors.push(`${label} ${v} บิล มากกว่าจำนวนบิลที่นับ (${n_prior})`);
  }
  if (errors.length) return { value: null, errors };
  // พฤติกรรมที่เว้นว่างส่งเป็น null ให้ ML เติมค่าเฉลี่ยของตลาด
  return { value: { ref, stall_type, due_month, tenure_years, n_prior, late_count, days_late_total, bill_total, prev_avg: prev_avg ?? 0,
    early_days_avg, seen_count, app_count, actual }, errors };
}

/**
 * อ่านทั้งไฟล์ คืน { fatal } ถ้าใช้ไม่ได้ทั้งไฟล์ หรือ { rows, invalid, total }
 * rows = [{ line, value }] แถวที่ถูกต้อง · invalid = [{ line, ref, errors }] (line = เลขบรรทัดใน Excel นับหัวตารางเป็น 1)
 */
export function readTable(text) {
  const table = parseCsv(text);
  if (!table.length) return { fatal: 'ไฟล์ว่าง ไม่มีหัวตารางหรือข้อมูล' };
  const keys = table[0].map(h => HEADER_OF.get(norm(h)) || null);
  const missing = COLUMNS.filter(c => c.required && !keys.includes(c.key)).map(c => `"${c.th}"`);
  if (missing.length) {
    return { fatal: `ไม่พบคอลัมน์ ${missing.join(', ')} ในแถวแรกของไฟล์ ดาวน์โหลดไฟล์ตัวอย่างแล้วกรอกตามหัวตารางนั้น` };
  }
  const body = table.slice(1);
  if (!body.length) return { fatal: 'มีแต่หัวตาราง ยังไม่มีข้อมูลสักแถว' };
  if (body.length > MAX_ROWS) return { fatal: `ไฟล์มี ${body.length} แถว ทำนายได้ครั้งละไม่เกิน ${MAX_ROWS} แถว แบ่งไฟล์แล้วอัปโหลดทีละส่วน` };
  const rows = [], invalid = [];
  body.forEach((r, i) => {
    const cells = {};
    keys.forEach((k, j) => { if (k) cells[k] = r[j]; });
    const { value, errors } = checkRow(cells);
    if (value) rows.push({ line: i + 2, value });
    else invalid.push({ line: i + 2, ref: String(cells.ref ?? '').trim(), errors });
  });
  return { rows, invalid, total: body.length };
}

/** ตรวจชนิดไฟล์ก่อนอ่าน: ไฟล์ Excel (.xlsx) อ่านตรง ๆ ไม่ได้ ต้องบันทึกเป็น CSV ก่อน */
export function fileProblem(file) {
  if (!file) return 'ยังไม่ได้เลือกไฟล์';
  if (/\.(xlsx|xls|ods|numbers)$/i.test(file.name)) return 'ไฟล์นี้เป็นไฟล์ตาราง (Excel) ให้เปิดแล้วเลือก "บันทึกเป็น" ชนิด CSV UTF-8 ก่อนอัปโหลด';
  if (!/\.(csv|txt)$/i.test(file.name)) return 'รับเฉพาะไฟล์ .csv';
  if (file.size > MAX_BYTES) return 'ไฟล์ใหญ่เกิน 1 MB แบ่งไฟล์แล้วอัปโหลดทีละส่วน';
  if (file.size === 0) return 'ไฟล์ว่าง';
  return null;
}

/* ---------------- ผลลัพธ์ ---------------- */

export const levelOf = (s, high, mid) => (s >= high ? 'high' : s >= mid ? 'mid' : 'low');

/** นับแต่ละระดับของโมเดลที่เลือก */
export function summarize(results, model, high, mid) {
  const out = { high: 0, mid: 0, low: 0, n: results.length };
  for (const r of results) {
    const s = r.scores?.[model];
    if (s != null) out[levelOf(s, high, mid)] += 1;
  }
  return out;
}

/** ส่งให้ API เฉพาะค่าที่ใช้ทำนาย ผลจริงเก็บไว้ในเบราว์เซอร์ใช้วัดผลเท่านั้น */
export const payloadOf = value => { const { actual: _omit, ...rest } = value; return rest; };

/* ---------------- ประเมินโมเดล (model evaluation) กับไฟล์ที่มีผลจริง ---------------- */

/** เกณฑ์ตัดสิน "ทายว่าจ่ายช้า" ของการประเมิน เท่ากับตอนประเมินโมเดลหลังเทรน (ml/app/risk.py) จึงเทียบกันได้ */
export const EVAL_THRESHOLD = 0.5;
const ACTUAL_WORD = { 1: 'จ่ายช้า', 0: 'ตรงเวลา' };

/** ROC-AUC แบบนับคู่ (Mann–Whitney): โอกาสที่บิลจ่ายช้าได้คะแนนสูงกว่าบิลตรงเวลา คะแนนเท่ากันนับครึ่ง */
export function aucOf(scores, labels) {
  const pos = [], neg = [];
  scores.forEach((v, i) => (labels[i] ? pos : neg).push(v));
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/** วัดโมเดลหนึ่งกับแถวที่มีผลจริง: confusion matrix ที่เกณฑ์ 0.5 + AUC + Brier */
export function evaluateFile(results, model, threshold = EVAL_THRESHOLD) {
  const rows = results.filter(r => r.input.actual != null && r.scores?.[model] != null);
  let tp = 0, fp = 0, fn = 0, tn = 0, sq = 0;
  for (const r of rows) {
    const p = r.scores[model], y = r.input.actual;
    const warn = p >= threshold;
    if (warn && y) tp += 1; else if (warn) fp += 1; else if (y) fn += 1; else tn += 1;
    sq += (p - y) ** 2;
  }
  const n = rows.length;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  return {
    n, pos: tp + fn, neg: fp + tn, tp, fp, fn, tn,
    accuracy: n ? (tp + tn) / n : null,
    precision, recall,
    f1: precision != null && recall != null ? (precision + recall ? (2 * precision * recall) / (precision + recall) : 0) : null,
    auc: aucOf(rows.map(r => r.scores[model]), rows.map(r => r.input.actual)),
    brier: n ? sq / n : null,
  };
}

/** โมเดลที่ดีที่สุดของตัวชี้วัดหนึ่ง (เสมอกันได้หลายตัว) · lower = ค่ายิ่งต่ำยิ่งดี (Brier) */
export function bestModels(evals, key, lower = false) {
  const vals = Object.entries(evals).filter(([, e]) => e && e[key] != null);
  if (vals.length < 2) return new Set();
  const top = (lower ? Math.min : Math.max)(...vals.map(([, e]) => e[key]));
  return new Set(vals.filter(([, e]) => Math.abs(e[key] - top) < 1e-9).map(([k]) => k));
}

/** ทายถูกไหมสำหรับแถวที่มีผลจริง (เกณฑ์ 0.5) · ไม่มีผลจริงคืน null */
export const isCorrect = (r, model, threshold = EVAL_THRESHOLD) =>
  (r.input.actual == null || r.scores?.[model] == null ? null : (r.scores[model] >= threshold) === Boolean(r.input.actual));

/** ไฟล์ผลลัพธ์: คอลัมน์เดิม + คะแนนทุกโมเดล + ระดับและเหตุผลของโมเดลที่เลือก (+ ทายถูกไหม ถ้ามีผลจริง) */
export function resultsCsv(results, { models, model, names, high, mid, levelWord }) {
  const labeled = results.some(r => r.input.actual != null);
  const head = [...COLUMNS.map(c => c.th), ...models.map(m => `คะแนน ${names[m]} (%)`), `ระดับ (${names[model]})`, 'เหตุผล',
    ...(labeled ? [`ทายถูก (${names[model]} เกณฑ์ 50%)`] : [])];
  const cell = (r, c) => {
    if (c.key === 'stall_type') return STALL_TYPES[r.input.stall_type];
    if (c.key === 'actual') return r.input.actual == null ? '' : ACTUAL_WORD[r.input.actual];
    return r.input[c.key];
  };
  const lines = results.map(r => {
    const ok = isCorrect(r, model);
    return [
      ...COLUMNS.map(c => cell(r, c) ?? ''),
      ...models.map(m => (r.scores[m] == null ? '' : Math.round(r.scores[m] * 1000) / 10)),
      levelWord[levelOf(r.scores[model], high, mid)], (r.reasons || []).join(' · '),
      ...(labeled ? [ok == null ? '' : ok ? 'ถูก' : 'พลาด'] : []),
    ];
  });
  return '\uFEFF' + toCsv([head, ...lines]);
}
