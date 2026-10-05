/**
 * จำนวนงานค้างของเจ้าหน้าที่ (เมนูและแถบ "งานวันนี้") · ฟังก์ชันล้วน ทดสอบได้โดยไม่ต้องมีฐานข้อมูล
 * ทุกตัวเลขต้องตรงกับจำนวนที่หน้าปลายทางแสดงหลังกรอง จึงใช้กติกาชุดเดียวกับหน้านั้น ๆ
 */

/** สัญญาที่หมดแล้วหรือเหลือไม่ถึงกี่วันถือว่า "ใกล้หมด" (ต้องตรงกับ RENEW_WITHIN_DAYS ของหน้าเว็บ) */
const RENEW_WITHIN_DAYS = 90;

const dayMs = 86400000;
const diffDays = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / dayMs);

/** สัญญานี้ต้องต่อไหม: หมดแล้ว หรือเหลือไม่เกิน RENEW_WITHIN_DAYS วัน */
const needsRenewal = (endDate, today) => endDate != null && diffDays(endDate, today) <= RENEW_WITHIN_DAYS;

/**
 * ค่ามิเตอร์ที่ยังต้องตรวจ: AI ทักอยู่ และ (เลขน้อยกว่ารอบก่อน หรือยังไม่มีใครยืนยัน)
 * กติกาเดียวกับ "รอตรวจ" ในหน้าจดมิเตอร์ และเงื่อนไขที่บล็อกการออกบิล
 */
const meterPending = drafts => drafts.filter(d => d.ai_check?.anomaly && (d.ai_check.kind === 'misread' || !d.ack)).length;

/**
 * ff = ผลของ /staff/followup (overdue, to_cut, to_restore) · vendors = แถวของ /staff/vendors (end_date)
 * drafts = meter_drafts ของรอบปัจจุบัน (ai_check, ack) · unread = จำนวนแจ้งเตือนที่ยังไม่อ่าน
 */
function staffCounts({ ff, vendors, drafts, today, unread = 0 }) {
  return {
    overdue: ff.overdue.length,
    to_cut: ff.to_cut.length,
    to_restore: ff.to_restore.length,
    meter_pending: meterPending(drafts),
    contracts_expiring: vendors.filter(v => needsRenewal(v.end_date, today)).length,
    unread,
  };
}

module.exports = { RENEW_WITHIN_DAYS, needsRenewal, meterPending, staffCounts };
