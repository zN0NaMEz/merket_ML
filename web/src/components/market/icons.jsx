/* ไอคอนเส้นบาง วาดเองทั้งหมด ให้เข้ากับงานพิมพ์ของหน้าร้าน */
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const IconSearch = p => <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
export const IconHeart = ({ filled, ...p }) => <svg {...base} fill={filled ? 'currentColor' : 'none'} {...p}><path d="M12 20s-7.3-4.4-7.3-9.4A4 4 0 0 1 12 8.2a4 4 0 0 1 7.3 2.4c0 5-7.3 9.4-7.3 9.4Z" /></svg>;
export const IconBag = p => <svg {...base} {...p}><path d="M5.5 8h13l-1 12h-11Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>;
export const IconUser = p => <svg {...base} {...p}><circle cx="12" cy="8.5" r="3.4" /><path d="M5.5 20c.7-3.6 3.2-5.4 6.5-5.4s5.8 1.8 6.5 5.4" /></svg>;
export const IconClose = p => <svg {...base} {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>;
export const IconArrow = p => <svg {...base} {...p}><path d="M4.5 12h15" /><path d="m13.5 6 6 6-6 6" /></svg>;
export const IconMinus = p => <svg {...base} {...p}><path d="M5.5 12h13" /></svg>;
export const IconPlus = p => <svg {...base} {...p}><path d="M12 5.5v13M5.5 12h13" /></svg>;
