/* ชิ้นส่วนที่ใช้ร่วมกันในหน้าเจ้าของตลาด: ไอคอน ป้ายสถานะไฟจราจร กราฟแท่ง และคำบอกความมั่นใจ */
import { baht } from '../../format';

const PATHS = {
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></>,
  wallet: <><path d="M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M3 7l12-3.5V7" /><circle cx="16" cy="14" r="1.3" /></>,
  stalls: <><path d="M3 9.5 5 4h14l2 5.5" /><path d="M4 9.5V20h16V9.5" /><path d="M3 9.5h18" /><path d="M9.5 20v-5.5h5V20" /></>,
  more: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  phone: <path d="M21 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 4.2 2 2 0 0 1 3.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L7 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  share: <><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></>,
  good: <><circle cx="12" cy="12" r="9.5" /><path d="m7.8 12.4 2.8 2.8 5.6-5.8" /></>,
  warn: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4.5" /><path d="M12 17.2h.01" /></>,
  bad: <><circle cx="12" cy="12" r="9.5" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></>,
  bulb: <><path d="M9 18h6" /><path d="M10 21.5h4" /><path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.7v.5h6V16c0-.7.3-1.3.8-1.7A6.5 6.5 0 0 0 12 2.5Z" /></>,
  next: <path d="m9 5 7 7-7 7" />,
  clock: <><circle cx="12" cy="12" r="9.5" /><path d="M12 7v5l3 2" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
};

export function Icon({ name, size = 24 }) {
  return (
    <svg className="o-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
  );
}

/** ป้ายสถานะ: สีไฟจราจร + ไอคอน + คำ (ไม่บอกด้วยสีอย่างเดียว) */
export const TONE_WORD = { good: 'ดี', warn: 'ต้องดู', bad: 'ต้องจัดการ' };
export function Status({ tone, children }) {
  return (
    <span className={`o-status o-status--${tone}`}>
      <Icon name={tone} size={22} />{children || TONE_WORD[tone]}
    </span>
  );
}

/** ความมั่นใจของการคาดการณ์ 3 ระดับ */
export const SURE_WORD = { sure: 'ค่อนข้างแน่นอน', likely: 'น่าจะ', unsure: 'ยังไม่แน่ใจ' };

/** รหัสแผงไม่ให้ตัดบรรทัดตรงขีด (A-03 → A‑03 ขีดแบบไม่แยกบรรทัด) */
export const nb = id => String(id).replace(/-/g, '‑');

/** "เพราะ..." เว้นวรรคก่อนตัวเลข */
export const because = why => `เพราะ${/^\d/.test(why) ? ' ' : ''}${why}`;

/** กราฟแท่งแนวนอน ตัวเลขเขียนไว้เหนือแท่งทุกแท่ง ไม่ต้องชี้หรือแตะ */
export function Bars({ rows, unit = 'บาท', label }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <ul className="o-bars" aria-label={label}>
      {rows.map(r => (
        <li key={r.key} className={r.now ? 'is-now' : ''}>
          <span className="o-bars__label">{r.label}</span>
          <b className="o-bars__val">{baht(r.value)} {unit}</b>
          <span className="o-bars__track" aria-hidden="true">
            <i style={{ width: `${r.value ? Math.max(2, (r.value / max) * 100) : 0}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** ปุ่มลิงก์ใหญ่ไปหน้าอื่น */
export const nextIcon = <Icon name="next" size={22} />;

/** ส่งลิงก์หน้าจองพื้นที่ให้คนอื่น (มือถือเปิดเมนูแชร์ · คอมคัดลอกลิงก์) */
export async function shareBooking(toast) {
  const url = `${location.origin}/walkin`;
  const text = 'จองล็อกขายของหน้าตลาดบัญญัติทรัพย์ เลือกวันและล็อกแล้วสแกนจ่ายได้เลย';
  try {
    if (navigator.share) { await navigator.share({ title: 'จองพื้นที่ขายของ', text, url }); return; }
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('คัดลอกลิงก์จองแล้ว วางในไลน์เพื่อส่งให้ผู้ค้าได้เลย');
  } catch (e) {
    if (e?.name !== 'AbortError') toast(`ลิงก์จอง: ${url}`);
  }
}
