import { useEffect, useRef } from 'react';
import { IconClose } from './icons';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * ชั้นซ้อนที่ใช้ร่วมกันทั้งช่องค้นหา ตะกร้า และรายละเอียดสินค้า
 * variant: 'full' เต็มจอ · 'side' แผงด้านขวา
 * จัดการโฟกัสให้วนอยู่ภายใน และคืนโฟกัสกลับที่เดิมเมื่อปิด
 */
export default function Sheet({ open, onClose, title, variant = 'side', labelledBy, children, foot }) {
  const box = useRef(null);
  const opener = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement;
    const el = box.current;
    const first = el?.querySelector(FOCUSABLE);
    (first || el)?.focus();

    const onKey = e => {
      if (e.key !== 'Tab' || !el) return;
      const items = Array.from(el.querySelectorAll(FOCUSABLE)).filter(n => n.offsetParent !== null);
      if (items.length === 0) return;
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement === edge) {
        e.preventDefault();
        (e.shiftKey ? items[items.length - 1] : items[0]).focus();
      }
    };
    el?.addEventListener('keydown', onKey);
    return () => {
      el?.removeEventListener('keydown', onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={`mk-sheet mk-sheet--${variant}`}>
      <button type="button" className="mk-sheet__scrim" onClick={onClose} aria-label="ปิด" tabIndex={-1} />
      <div
        className="mk-sheet__box"
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
        ref={box}
        tabIndex={-1}
      >
        <div className="mk-sheet__head">
          <p className="mk-sheet__title">{title}</p>
          <button type="button" className="mk-icon mk-sheet__x" onClick={onClose} aria-label="ปิด">
            <IconClose />
          </button>
        </div>
        <div className="mk-sheet__body">{children}</div>
        {foot && <div className="mk-sheet__foot">{foot}</div>}
      </div>
    </div>
  );
}
