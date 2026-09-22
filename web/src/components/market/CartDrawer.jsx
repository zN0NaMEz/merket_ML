import { useState } from 'react';
import { Link } from 'react-router-dom';
import Sheet from './Sheet';
import Media from './Media';
import { useMarket } from './store';
import { IconMinus, IconPlus, IconClose } from './icons';
import { price } from '../../data/market';

/**
 * ตะกร้าของฝั่งหน้าเว็บ ใช้นัดรับที่แผงจริง
 * ยังไม่มีระบบชำระเงินออนไลน์สำหรับสินค้า จึงจบที่ใบนัดรับและบอกให้ชัดว่าต้องทำอะไรต่อ
 */
export default function CartDrawer() {
  const { overlay, setOverlay, cart, total, count, setQty, clearCart } = useMarket();
  const [done, setDone] = useState(false);
  const open = overlay === 'cart';

  const close = () => { setOverlay(null); setDone(false); };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={`ตะกร้า · ${count} ชิ้น`}
      foot={cart.length > 0 && !done ? (
        <>
          <div className="mk-cart__sum">
            <span>ยอดรวม</span>
            <strong>{price(total)}</strong>
          </div>
          <p className="mk-cart__hint">นัดรับที่แผงภายใน 3 วัน ชำระเงินกับผู้ค้าโดยตรง</p>
          <button type="button" className="mk-btn mk-btn--dark mk-btn--wide" onClick={() => setDone(true)}>
            ออกใบนัดรับ
          </button>
        </>
      ) : null}
    >
      {done ? (
        <div className="mk-cart__done" role="status">
          <span className="mk-rule" aria-hidden="true" />
          <h3>จองไว้ให้แล้ว</h3>
          <p>
            เราแจ้งผู้ค้าทั้ง {new Set(cart.map(l => l.product.maker)).size} รายแล้ว
            แสดงหน้าจอนี้ที่แผงเพื่อรับของ ภายในวันที่ตลาดเปิดสามวันถัดไป
          </p>
          <ul className="mk-cart__slip">
            {cart.map(l => (
              <li key={l.id}><span>{l.product.name} × {l.qty}</span><span>{price(l.product.price * l.qty)}</span></li>
            ))}
            <li className="is-total"><span>รวม</span><span>{price(total)}</span></li>
          </ul>
          <div className="mk-cart__doneacts">
            <button type="button" className="mk-btn mk-btn--ghost" onClick={() => { clearCart(); close(); }}>เสร็จสิ้น</button>
            <Link className="mk-btn mk-btn--ghost" to="/walkin" onClick={close}>ดูวันที่ตลาดเปิด</Link>
          </div>
        </div>
      ) : cart.length === 0 ? (
        <div className="mk-empty">
          <span className="mk-rule" aria-hidden="true" />
          <p>ยังไม่มีอะไรในตะกร้า</p>
          <button type="button" className="mk-btn mk-btn--ghost" onClick={() => setOverlay('search')}>ค้นหาของในตลาด</button>
        </div>
      ) : (
        <ul className="mk-cart__list">
          {cart.map(l => (
            <li key={l.id}>
              <Media photo={l.product.photo} alt="" ratio={1} sizes="96px" className="mk-cart__media" />
              <div className="mk-cart__info">
                <strong>{l.product.name}</strong>
                <small>{l.product.maker}</small>
                <span className="mk-cart__unit">{price(l.product.price)}</span>
              </div>
              <div className="mk-cart__qty">
                <button type="button" onClick={() => setQty(l.id, l.qty - 1)} aria-label={`ลดจำนวน ${l.product.name}`}><IconMinus /></button>
                <span aria-live="polite">{l.qty}</span>
                <button type="button" onClick={() => setQty(l.id, l.qty + 1)} aria-label={`เพิ่มจำนวน ${l.product.name}`} disabled={l.qty >= 99}><IconPlus /></button>
              </div>
              <button type="button" className="mk-cart__rm" onClick={() => setQty(l.id, 0)} aria-label={`นำ ${l.product.name} ออกจากตะกร้า`}>
                <IconClose />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
