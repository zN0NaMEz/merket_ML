/*
 * ตรรกะของหน้า "เบื้องหลัง AI" ที่ไม่ผูกกับ React (RodeMap.md หัวข้อ 3 และ 5)
 * แท็บตามบทบาท · ข้อความสถานะ ML · การจัดรูปเวลา · จังหวะการถามสถานะ
 * ทดสอบได้ด้วย node --test โดยไม่ต้องมีเบราว์เซอร์
 */

/** ทุกแท็บของหน้า เรียงจากสิ่งที่ผู้ใช้ถามบ่อยไปหารายละเอียดเชิงเทคนิค */
export const TABS = {
  bills: { label: 'บิลเสี่ยง', hint: 'ทำไมบิลนี้ได้คะแนนนี้' },
  meters: { label: 'มิเตอร์ที่ถูกทัก', hint: 'ทำไมเลขมิเตอร์นี้ถูกทัก' },
  quality: { label: 'คุณภาพโมเดล', hint: 'โมเดลแม่นแค่ไหน' },
  card: { label: 'บัตรโมเดล', hint: 'เทรนจากข้อมูลอะไร และใครทำอะไรไปบ้าง' },
  eval: { label: 'ทดสอบหลายชุดข้อมูล', hint: 'วัดผลทุกโมเดลกับข้อมูลจำลองหลายแบบ' },
};

/** แท็บที่แต่ละบทบาทเห็น (หัวข้อ 3) · ตรวจสิทธิ์ซ้ำที่ API ทุก route */
const ROLE_TABS = {
  staff: { tabs: ['bills', 'meters'], initial: 'meters' },
  owner: { tabs: ['bills', 'meters', 'quality'], initial: 'bills' },
  admin: { tabs: ['bills', 'meters', 'quality', 'card', 'eval'], initial: 'quality' },
};

export const BEHIND_ROLES = Object.keys(ROLE_TABS);
export const tabsFor = role => ROLE_TABS[role]?.tabs || [];
export const defaultTab = role => ROLE_TABS[role]?.initial || null;
/** แท็บจาก URL (?tab=) ใช้ได้เฉพาะเมื่อบทบาทนั้นเห็นแท็บนั้น ไม่งั้นกลับไปแท็บเริ่มต้น */
export const pickTab = (role, wanted) => (tabsFor(role).includes(wanted) ? wanted : defaultTab(role));

/** ถามสถานะไม่ถี่กว่าทุก 30 วินาที (หัวข้อ 4.5) */
export const POLL_MS = 30000;
/** ถามเฉพาะตอนแท็บของเบราว์เซอร์เปิดอยู่ */
export const shouldPoll = visibilityState => visibilityState !== 'hidden';

const TZ = 'Asia/Bangkok';
const parts = (iso, opts) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('th-TH', { timeZone: TZ, ...opts }).format(d);
};
/** "14:20" */
export const thTime = iso => (iso ? parts(iso, { hour: '2-digit', minute: '2-digit', hour12: false }) : null);
/** "2 ต.ค. 69 14:20" แสดงปีสั้นตามปฏิทินไทย */
export function thDateTime(iso) {
  if (!iso) return null;
  const date = parts(iso, { day: 'numeric', month: 'short', year: '2-digit' });
  return date && `${date} ${thTime(iso)}`;
}

/** เวลาที่ข้อมูลบนหน้านี้อัปเดตล่าสุด = ค่าล่าสุดของ เทรน / ให้คะแนน */
export function lastUpdated(status) {
  if (!status) return null;
  const ts = [status.models?.risk?.trained_at, status.models?.anomaly?.trained_at, status.scoring?.last_scored_at]
    .filter(Boolean).map(t => new Date(t).getTime()).filter(n => !Number.isNaN(n));
  return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
}

/** ชื่อโมเดลที่ใช้อยู่แบบสั้น */
export const MODEL_SHORT = { lr: 'Logistic Regression', rf: 'Random Forest' };
export const MODEL_PLAIN = { lr: 'แบบถ่วงน้ำหนักปัจจัย', rf: 'แบบต้นไม้ตัดสินใจหลายต้น' };

/** จุดสถานะ ML: ข้อความสั้นบนแถบ */
export const ML_DOT = {
  ready: { tone: 'good', label: 'AI พร้อมใช้' },
  asleep: { tone: 'warn', label: 'AI กำลังเปิด' },
  down: { tone: 'bad', label: 'AI ไม่ตอบ' },
  unknown: { tone: 'idle', label: 'กำลังตรวจสถานะ AI' },
};

/**
 * ข้อความแจ้งใต้แถบเมื่อ ML ไม่พร้อม (หัวข้อ 5) · คืน null เมื่อไม่ต้องแจ้ง
 * ทุกข้อความบอกว่าเกิดอะไรขึ้นและผู้ใช้ทำอะไรต่อได้ หน้าไม่ถูกล็อก
 */
export function mlNotice(status) {
  const state = status?.ml?.state;
  if (state === 'asleep') {
    const t = thTime(lastUpdated(status));
    return {
      tone: 'warn',
      text: `กำลังเปิดระบบ AI ใช้เวลาประมาณ 1 นาที ${t ? `ระหว่างนี้แสดงข้อมูลล่าสุดเมื่อ ${t}` : 'ระหว่างนี้ยังใช้หน้านี้ดูข้อมูลที่บันทึกไว้ได้'}`,
    };
  }
  if (state === 'down') {
    return { tone: 'bad', text: 'ระบบ AI ไม่ตอบ การจ่ายเงินและดูบิลยังใช้ได้ตามปกติ ข้อมูลในหน้านี้เป็นผลที่บันทึกไว้ล่าสุด' };
  }
  return null;
}

/** ยังไม่เคยเทรนโมเดลใดเลย → สถานะว่างของทั้งหน้า */
export const noModelYet = status => Boolean(status) && !status.models?.risk && !status.models?.anomaly;
export const EMPTY_MODEL_TEXT = "ยังไม่มีโมเดลที่เทรนแล้ว กด 'เทรนโมเดลใหม่' ในหน้า AI เพื่อเริ่ม";

/** หน้า AI ที่มีปุ่มเทรนโมเดลใหม่ของแต่ละบทบาท (admin เทรนจากบัตรโมเดลได้เลย) */
export const trainLink = role => (role === 'staff' ? '/staff/ai' : role === 'admin' ? '/ai/behind?tab=card' : null);

/**
 * คะแนนความเสี่ยงเป็นเปอร์เซ็นต์ ปัดลงเสมอ ไม่ให้ตัวเลขขัดกับระดับ
 * คะแนน 0.3996 เป็น "ต่ำ" (ปานกลางเริ่ม 0.40) ถ้าปัดเป็น 40% จะเห็น "40% · ต่ำ" คู่กับ "ปานกลาง ≥ 40%"
 */
export const riskPct = v => (v == null ? '–' : `${Math.floor(Number(v) * 100 + 1e-9)}%`);

/** เลขจำนวนแบบไทย */
export const num = n => (n == null ? '–' : Number(n).toLocaleString('th-TH'));
