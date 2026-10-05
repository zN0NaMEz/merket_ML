import { phoneFmt } from '../format';

/**
 * เบอร์โทรที่ไม่ตัดบรรทัด + ปุ่ม "โทร" (ลิงก์ tel:) ขนาด 44 × 44 px ขึ้นไป [S4][S22][S24]
 * เจ้าหน้าที่ต้องโทรตามผู้ค้าจากมือถือ จึงให้แตะครั้งเดียวแล้วเปิดแอปโทรศัพท์
 */
export default function Phone({ number, name }) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return null;
  const shown = phoneFmt(number);
  return (
    <span className="tel">
      <span className="tel__num">{shown}</span>
      <a className="tel__call" href={`tel:${digits}`} aria-label={`โทรหา${name ? ` ${name}` : ''} ${shown}`}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 4.2 2 2 0 0 1 3.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L7 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
        </svg>
        โทร
      </a>
    </span>
  );
}
