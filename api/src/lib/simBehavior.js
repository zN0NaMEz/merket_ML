/**
 * พฤติกรรมการจ่ายของผู้ค้าในข้อมูลสาธิต (ใช้ทั้งตอน seed ประวัติย้อนหลังและตอนเลื่อนวันที่จำลอง)
 * สมมติฐานตั้งไว้ก่อนวัดผล ไม่ได้ปรับเพื่อให้โมเดลชนะ และต้องตรงกับ ml/app/synthetic.py (APP_P, ontime_day, seen_date):
 *   - ผู้ค้าวินัยดีจ่ายเร็ว: วันที่จ่ายนับจากออกบิล = floor(W · u^(0.6 + 2.4d))
 *   - เปิดดูบิลในแอปภายใน 4 วันแรกด้วยโอกาส 0.30 + 0.65d · คนจ่ายผ่านแอปต้องเปิดบิลอย่างช้าวันที่จ่าย
 *   - จ่ายผ่านแอป (ไม่ใช่เงินสดที่สำนักงาน) ด้วยโอกาส 0.25 + 0.60d (ค่าประจำตัวผู้ค้า vendors.sim_app)
 * d = sim_discipline (0–1) ที่ซ่อนไว้ ระบบไม่ได้ใช้ค่านี้ทำนาย
 */
const D = require('./dates');

/**
 * โปรไฟล์ของข้อมูลสาธิต (เลือกตอนรีเซ็ต บันทึกใน settings.sim)
 *   realistic  ความบังเอิญเท่าที่คาดในตลาดจริง (ค่าเริ่มต้น)
 *   clear      ผลจ่ายช้าขึ้นกับปัจจัยมากขึ้น 3 เท่า (logit × 3) ใช้สาธิตว่าโมเดลทำได้แค่ไหนเมื่อข้อมูลชัด ไม่ใช่ภาพของตลาดจริง
 */
const SIM_PROFILES = {
  realistic: { sharp: 1, label: 'ข้อมูลจำลอง (ความบังเอิญเท่าตลาดจริง)' },
  clear: { sharp: 3, label: 'ข้อมูลจำลองแบบความบังเอิญต่ำ (logit × 3)' },
};

const appP = d => 0.25 + 0.6 * d;

/** วันที่จ่าย (0..W-1 วันหลังออกบิล) เมื่อจ่ายตรงเวลา */
function ontimeDay(u, d, payWithin) {
  return Math.min(payWithin - 1, Math.floor(payWithin * Math.pow(u, 0.6 + 2.4 * d)));
}

/** วันที่เปิดดูบิลครั้งแรก (YYYY-MM-DD) หรือ null · rng คืนเลขสุ่ม 0–1 */
function seenDate(rng, d, appUser, issueDate, payDate) {
  let seen = rng() < 0.30 + 0.65 * d ? D.addDays(issueDate, Math.floor(rng() * 4)) : null;
  if (appUser && payDate && (!seen || seen > payDate)) seen = payDate;
  return seen;
}

module.exports = { SIM_PROFILES, appP, ontimeDay, seenDate };
