/**
 * กติกาการยืนยัน/แก้ค่ามิเตอร์ที่ AI ทัก และการเลิกทำ (RodeMap 3.3, 4.2)
 * ฟังก์ชันล้วน ไม่แตะฐานข้อมูล route เป็นผู้ล็อกแถวและเรียกใช้ จึงทดสอบกติกาได้โดยตรง
 */

/** เลิกทำได้ภายใน 30 วินาทีหลังบันทึก (นับด้วยเวลาของฐานข้อมูล เผื่อเน็ตช้า) หน้าเว็บแสดงปุ่ม 6 วินาที */
const UNDO_WINDOW_S = 30;
const UTILITIES = ['water', 'elec'];
const UTIL_TH = { water: 'น้ำ', elec: 'ไฟ' };

/**
 * ค่าที่ ML ตรวจไว้ตอนนั้น (prev + use) ใช้บอกว่าค่าปัจจุบันยังเป็นค่าที่ AI ตรวจแล้วหรือถูกแก้หลังตรวจ
 */
function checkedValue(check, utility) {
  if (!check) return null;
  const prev = check[`prev_${utility}`], use = check[`use_${utility}`];
  return prev == null || use == null ? null : prev + use;
}

/** ค่าปัจจุบันต่างจากค่าที่ AI ตรวจ = ผลตรวจนั้นเก่าแล้ว ต้องตรวจซ้ำ */
const isStale = (check, cur) => UTILITIES.some(u => cur[u] != null && checkedValue(check, u) != null && cur[u] !== checkedValue(check, u));

/**
 * น้ำหรือไฟที่ถูกทัก เรียงจากหนักไปเบา
 * misread = เลขน้อยกว่ารอบก่อน · z หรืออัตราส่วนเกินเกณฑ์ · ถ้าถูกทักเพราะรูปแบบ (Isolation Forest) อย่างเดียว ถือว่าทั้งคู่
 */
function flaggedUtilities(check) {
  if (!check || !check.anomaly) return [];
  if (check.kind === 'misread') {
    return UTILITIES.filter(u => check[`use_${u}`] != null && check[`use_${u}`] < 0);
  }
  const thr = check.z_threshold ?? 3;
  const score = u => {
    const z = Math.abs(check[`z_${u}`] ?? 0);
    const r = check[`ratio_${u}`];
    const ratioHit = r != null && (r >= 1.8 || r <= 0.4);
    return z > thr || ratioHit ? z + (ratioHit ? 100 : 0) : -1;
  };
  const hits = UTILITIES.filter(u => score(u) >= 0).sort((a, b) => score(b) - score(a));
  return hits.length ? hits : [...UTILITIES];
}

/** ช่วงปกติ = ค่าเฉลี่ย ± k × SD (k = เกณฑ์ z ที่ใช้ทักจริง) ไม่ต่ำกว่า 0 */
function band(mean, sd, k) {
  if (mean == null || sd == null || k == null) return null;
  return { mean, low: Math.max(0, Math.round((mean - k * sd) * 10) / 10), high: Math.round((mean + k * sd) * 10) / 10, k };
}

/**
 * ช่วงปกติคำนวณย้อนหลังจากประวัติ ใช้กับค่ามิเตอร์ที่ออกบิลก่อนระบบเก็บผลตรวจ (ไม่มี ai_check)
 * สูตรเดียวกับ ML: SD แบบตัวอย่าง (n−1) ขั้นต่ำ max(SD, 8% ของค่าเฉลี่ย, 1) · ประวัติไม่ถึง 3 เดือน = null (ML ก็ข้ามการตรวจ)
 */
function recomputeBand(values, k) {
  const xs = values.filter(v => Number.isFinite(v));
  if (xs.length < 3) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
  return { ...band(Math.round(m * 10) / 10, Math.max(sd, 0.08 * m, 1), k), sd: Math.round(Math.max(sd, 0.08 * m, 1) * 100) / 100 };
}

/** ผลตรวจของ AI ณ ตอนที่คนตัดสิน เก็บไว้กับรายการตรวจ (ไม่มีผลตรวจ = null) */
const snapshotOf = c => (c ? {
  kind: c.kind ?? null, z_water: c.z_water ?? null, z_elec: c.z_elec ?? null, if_score: c.if_score ?? null,
  if_level: c.if_level ?? null, z_threshold: c.z_threshold ?? null, if_threshold: c.if_threshold ?? null, method: c.method ?? null,
} : null);

/**
 * ตรวจคำขอยืนยัน/แก้ค่า · ctx = { kind, prev, cur } ของน้ำหรือไฟที่เลือก
 * คืนข้อความ error ภาษาไทย หรือ null ถ้าใช้ได้
 */
function validateReview(body, ctx) {
  const { decision, utility } = body || {};
  if (!['confirmed', 'corrected'].includes(decision)) return 'ต้องเลือกว่าจะยืนยันค่าหรือแก้ค่า';
  if (!UTILITIES.includes(utility)) return 'ต้องระบุว่าเป็นมิเตอร์น้ำหรือไฟ';
  if (body.client_ref != null && (typeof body.client_ref !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(body.client_ref))) {
    return 'รหัสอ้างอิงคำขอไม่ถูกต้อง';
  }
  if (decision === 'confirmed') {
    if (ctx.kind === 'misread') return `เลขมิเตอร์${UTIL_TH[utility]}น้อยกว่ารอบก่อน ยืนยันไม่ได้ ต้องแก้ค่าก่อนออกบิล`;
    if (ctx.cur == null) return 'ยังไม่ได้กรอกเลขมิเตอร์ของแผงนี้';
    return null;
  }
  const v = body.new_value;
  if (!Number.isInteger(v) || v < 0 || v > 9_999_999) return 'ค่าใหม่ต้องเป็นจำนวนเต็มบวก';
  if (ctx.prev != null && v < ctx.prev) return `ค่าใหม่ต้องไม่น้อยกว่าเลขรอบก่อน (${ctx.prev})`;
  if (v === ctx.cur) return 'ค่าใหม่เท่ากับค่าเดิม ถ้าค่านี้ถูกต้องให้กด "ยืนยันค่าถูก"';
  return null;
}

/**
 * เลิกทำได้ไหม · review = แถว anomaly_reviews พร้อม age_s (คิดจาก now() ของฐานข้อมูล)
 * ctx = { userId, latestId: id ของรายการล่าสุดที่ยังมีผลของแผง/รอบนี้, issued: ออกบิลแล้วหรือยัง }
 * คืน { ok: true } · { ok: true, already: true } (เลิกทำไปแล้ว กดซ้ำเพราะเน็ตหลุด) · { ok: false, status, error }
 */
function canUndo(review, ctx) {
  if (!review) return { ok: false, status: 404, error: 'ไม่พบรายการนี้' };
  if (review.reviewed_by !== ctx.userId) return { ok: false, status: 403, error: 'เลิกทำได้เฉพาะคนที่บันทึกรายการนี้' };
  if (review.undone_at) return { ok: true, already: true };
  if (ctx.issued) return { ok: false, status: 409, error: 'ออกบิลจากค่านี้แล้ว เลิกทำไม่ได้' };
  if (review.age_s > UNDO_WINDOW_S) {
    return { ok: false, status: 409, error: `เลยเวลาเลิกทำ (${UNDO_WINDOW_S} วินาที) แล้ว ถ้าต้องเปลี่ยน ให้ยืนยันหรือแก้ค่าใหม่อีกครั้ง` };
  }
  if (ctx.latestId != null && String(ctx.latestId) !== String(review.id)) {
    return { ok: false, status: 409, error: 'มีการยืนยันหรือแก้ค่าที่ใหม่กว่านี้แล้ว เลิกทำรายการนี้ไม่ได้' };
  }
  return { ok: true };
}

module.exports = { UNDO_WINDOW_S, UTILITIES, UTIL_TH, checkedValue, isStale, flaggedUtilities, band, recomputeBand, snapshotOf, validateReview, canUndo };
