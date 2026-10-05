/*
 * กติกาของหน้าเจ้าหน้าที่ที่ไม่ผูกกับ React · ทดสอบด้วย node --test
 * ต้องตรงกับ api/src/lib/staffCounts.js เพราะตัวเลขในเมนูและแถบงานวันนี้นับด้วยกติกาเดียวกัน
 */

/** สัญญาที่หมดแล้วหรือเหลือไม่เกินกี่วันถือว่าใกล้หมด (เท่ากับ RENEW_WITHIN_DAYS ฝั่ง API) */
export const RENEW_WITHIN_DAYS = 90;

const dayMs = 86400000;
export const daysLeft = (endDate, today) => (endDate == null ? null : Math.round((Date.parse(endDate) - Date.parse(today)) / dayMs));

/** แสดงปุ่มต่อสัญญาเฉพาะรายที่หมดแล้วหรือเหลือไม่เกิน 90 วัน */
export const needsRenewal = (endDate, today) => {
  const left = daysLeft(endDate, today);
  return left != null && left <= RENEW_WITHIN_DAYS;
};

/**
 * บันทึกระบบ: รวมบรรทัดที่ข้อความซ้ำกันติดกันเป็นบรรทัดเดียว พร้อมจำนวนครั้งและช่วงวันที่
 * jobs เรียงใหม่ไปเก่า · คืน [{ summary, count, from, to }] (from = วันเก่าสุด, to = วันล่าสุดของกลุ่ม)
 */
export function collapseLog(jobs) {
  const out = [];
  for (const j of jobs) {
    const last = out[out.length - 1];
    if (last && last.summary === j.summary) {
      last.count += 1;
      last.from = j.run_date;
    } else {
      out.push({ summary: j.summary, count: 1, from: j.run_date, to: j.run_date });
    }
  }
  return out;
}

/** จำนวนบรรทัดที่แสดงก่อนกด "ดูทั้งหมด" */
export const LOG_PREVIEW = 3;
