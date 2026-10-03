/**
 * สรุปการยืนยัน/แก้ค่ามิเตอร์ที่ AI ทัก เพื่อช่วยคนตัดสินใจปรับเกณฑ์ (RodeMap รอบ 5)
 * ใช้ผลตรวจ ณ ตอนตัดสิน (ai_snapshot) ไม่ใช่ผลตรวจหลังแก้ค่า · ระบบแค่แนะนำ ไม่เปลี่ยนเกณฑ์เอง
 *
 * ความหมาย: "แก้ค่า" = AI จับเลขที่จดผิดได้จริง · "ยืนยันค่าถูก" = เลขถูก แต่การใช้อาจผิดปกติจริง (เช่น ท่อรั่ว)
 * จึงไม่ได้แปลว่า AI ทักผิดเสมอ ข้อความแนะนำต้องบอกข้อนี้ด้วย
 */
const MIN_N = 10;          // ต่ำกว่านี้ถือว่าข้อมูลยังน้อยเกินจะแนะนำ
const MOSTLY_OK = 0.8;     // ยืนยันว่าเลขถูกตั้งแต่ 80% ขึ้นไป = ช่วงนี้ส่วนใหญ่ไม่ใช่เลขผิด

const zMax = s => Math.max(Math.abs(s?.z_water ?? 0), Math.abs(s?.z_elec ?? 0));

/** ช่วงของ z เทียบกับเกณฑ์ปัจจุบัน k */
function bucketsFor(k) {
  return [
    { key: 'below', from: null, to: k, label: `z ต่ำกว่า ${k} (ทักเพราะรูปแบบ)` },
    { key: 'near', from: k, to: k + 1, label: `z ${k}–${k + 1}` },
    { key: 'mid', from: k + 1, to: k + 3, label: `z ${k + 1}–${k + 3}` },
    { key: 'far', from: k + 3, to: null, label: `z ${k + 3} ขึ้นไป` },
  ];
}

/**
 * rows = การตัดสินล่าสุดที่ยังมีผลของแต่ละ แผง+รอบ: [{ decision, snapshot }]
 * k = เกณฑ์ z ที่ใช้อยู่
 */
function reviewStats(rows, k) {
  const buckets = bucketsFor(k).map(b => ({ ...b, n: 0, confirmed: 0, corrected: 0 }));
  const ifLevels = {};
  let misread = 0, noSnapshot = 0;
  for (const r of rows) {
    const s = r.snapshot;
    if (!s) { noSnapshot += 1; continue; }
    if (s.kind === 'misread') { misread += 1; continue; }     // เลขน้อยกว่ารอบก่อน ต้องแก้เสมอ ไม่เกี่ยวกับเกณฑ์ z
    const z = zMax(s);
    const b = buckets.find(x => (x.from == null || z >= x.from) && (x.to == null || z < x.to));
    b.n += 1; b[r.decision] += 1;
    if (s.if_level) {
      const l = (ifLevels[s.if_level] ||= { n: 0, confirmed: 0, corrected: 0 });
      l.n += 1; l[r.decision] += 1;
    }
  }
  for (const b of buckets) b.corrected_rate = b.n ? Math.round((b.corrected / b.n) * 100) / 100 : null;
  const total = buckets.reduce((a, b) => a + b.n, 0);

  // แนะนำ: ช่วงเหนือเกณฑ์ที่ใกล้ที่สุด ถ้าข้อมูลพอ และเจ้าหน้าที่ยืนยันว่าเลขถูกเกือบทั้งหมด → ลองขยับเกณฑ์ขึ้นไปที่ขอบบนของช่วงนั้น
  let suggestion = null;
  const near = buckets.find(b => b.key === 'near');
  if (near.n >= MIN_N && near.confirmed / near.n >= MOSTLY_OK) {
    suggestion = {
      z_threshold: near.to,
      text: `ค่าที่ AI ทักช่วง ${near.label} เจ้าหน้าที่ยืนยันว่าเลขถูก ${near.confirmed} จาก ${near.n} ครั้ง `
        + `ถ้าอยากลดงานเดินตรวจ ลองตั้งเกณฑ์ z เป็น ${near.to} · ค่าที่ยืนยันว่าเลขถูกอาจยังเป็นการใช้ผิดปกติจริง (เช่น ท่อรั่ว) ควรดูประกอบก่อนเปลี่ยน`,
    };
  }
  return {
    k, total, misread, no_snapshot: noSnapshot, buckets, if_levels: ifLevels, min_n: MIN_N, suggestion,
    note: total < MIN_N ? `ข้อมูลการตรวจยังมี ${total} รายการ ต้องมีอย่างน้อย ${MIN_N} รายการในช่วงเดียวกันจึงจะแนะนำการปรับเกณฑ์` : null,
  };
}

module.exports = { reviewStats, bucketsFor, zMax, MIN_N };
