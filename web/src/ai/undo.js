/*
 * ตรรกะฝั่งหน้าเว็บของ "ยืนยัน/แก้ค่า แล้วเลิกทำได้" (RodeMap 3.3) ไม่ผูกกับ React
 * - บันทึกลงเซิร์ฟเวอร์ทันที ไม่หน่วงไว้ในเครื่อง (ถ้าหน่วงแล้วเน็ตหลุดหรือปิดแอป การยืนยันจะหาย)
 * - ทุกการกดมี client_ref ประจำ ถ้าเน็ตหลุดแล้วส่งใหม่ด้วย ref เดิม เซิร์ฟเวอร์คืนรายการเดิม ไม่บันทึกซ้ำ
 * - toast เลิกทำแสดง 6 วินาที ส่วนเซิร์ฟเวอร์ยอมรับถึง 30 วินาที (เผื่อเน็ตช้า)
 */
export const UNDO_TOAST_MS = 6000;

/** รหัสอ้างอิงของการกดหนึ่งครั้ง ใช้ซ้ำทุกครั้งที่ส่งใหม่ของการกดนั้น */
export function newClientRef(rand = globalThis.crypto) {
  const raw = rand?.randomUUID ? rand.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `cr_${raw.replace(/-/g, '')}`.slice(0, 64);
}

/** error จากเน็ต (ไม่มีรหัส HTTP) ส่งใหม่ได้ · error ที่เซิร์ฟเวอร์ตอบ (4xx/5xx) ส่งซ้ำก็ได้ผลเดิม จึงไม่ลองใหม่ */
export const isNetworkError = e => !e?.status;

/**
 * ส่งคำขอและลองใหม่เฉพาะตอนเน็ตหลุด · fn ต้องส่งข้อมูลชุดเดิม (client_ref เดิม) ทุกครั้ง
 * คืน { data, attempts } หรือโยน error ตัวสุดท้าย (มี .attempts)
 */
export async function sendWithRetry(fn, { delays = [700, 1800], wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return { data: await fn(attempt), attempts: attempt };
    } catch (e) {
      if (!isNetworkError(e) || attempt > delays.length) { e.attempts = attempt; throw e; }
      await wait(delays[attempt - 1]);
    }
  }
}

const UTIL = { water: 'น้ำ', elec: 'ไฟ' };
/** ข้อความใน toast หลังบันทึก */
export function savedMessage(r) {
  if (r.decision === 'corrected') return `แก้ค่า${UTIL[r.utility] || ''}เป็น ${Number(r.new_value).toLocaleString('th-TH')} แล้ว`;
  return 'ยืนยันค่าแล้ว';
}

/** ข้อความเมื่อบันทึก/เลิกทำไม่สำเร็จ บอกว่าเกิดอะไรขึ้นและทำอะไรต่อได้ */
export function failMessage(e, action) {
  if (isNetworkError(e)) {
    return action === 'undo'
      ? 'เลิกทำไม่สำเร็จเพราะเชื่อมต่อไม่ได้ ระบบยังเลิกทำให้ได้ภายใน 30 วินาทีหลังบันทึก กด "เลิกทำ" อีกครั้ง'
      : 'บันทึกไม่สำเร็จเพราะเชื่อมต่อไม่ได้ กดลองใหม่ได้เลย ระบบจะไม่บันทึกซ้ำ';
  }
  return e?.message || 'เกิดข้อผิดพลาด';
}
