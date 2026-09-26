import { useState } from 'react';
import Sheet from './Sheet';
import Media from './Media';
import PickupSlip from './PickupSlip';
import { scrollToId } from './motion';
import { useMarket } from './store';
import { IconArrow, IconMinus, IconPlus, IconClose } from './icons';
import { thDate } from '../../format';
import { PICKUP, price } from '../../data/market';

/**
 * ตะกร้าของฝั่งหน้าเว็บ ใช้นัดรับที่แผงจริง
 * ยังไม่มีระบบชำระเงินออนไลน์สำหรับสินค้า จึงจบที่ใบนัดรับ แล้วบอกให้ชัดว่าต้องทำอะไรต่อ
 * ใบนัดรับเก็บไว้ในเครื่องนี้จนหมดเวลารับ เปิดดูซ้ำได้จากตะกร้า
 */
export default function CartDrawer() {
  const { overlay, setOverlay, cart, total, count, setQty, pickups, issuePickup, cancelPickup, restorePickup, setMapZone } = useMarket();
  const [view, setView] = useState(null);         // รหัสใบนัดที่เปิดดูอยู่
  const [fresh, setFresh] = useState(false);      // เพิ่งออกใบนัดเมื่อครู่
  const [cancelled, setCancelled] = useState(null); // ใบนัดที่เพิ่งยกเลิก (ให้ใส่ของกลับตะกร้าได้)
  const open = overlay === 'cart';
  const slip = pickups.find(p => p.code === view);

  const reset = () => { setView(null); setFresh(false); setCancelled(null); };
  const close = () => { setOverlay(null); reset(); };
  const issue = () => { const s = issuePickup(); setView(s.code); setFresh(true); };
  const showMap = zone => { close(); if (zone) setMapZone({ zone, at: Date.now() }); setTimeout(() => scrollToId('visit'), 60); };
  const cancel = s => { cancelPickup(s.code); setView(null); setFresh(false); setCancelled(s); };

  const title = slip ? `ใบนัดรับ · ${slip.code}` : cancelled ? 'ยกเลิกนัดรับแล้ว' : `ตะกร้า · ${count} ชิ้น`;
  const showCartFoot = !slip && !cancelled && cart.length > 0;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      foot={showCartFoot ? (
        <>
          <div className="mk-cart__sum">
            <span>ยอดรวม</span>
            <strong>{price(total)}</strong>
          </div>
          <p className="mk-cart__hint">รับของที่แผงภายใน {PICKUP.days} วันที่ตลาดเปิด และจ่ายกับผู้ค้าตอนรับของ ยังไม่ต้องจ่ายตอนนี้</p>
          <button type="button" className="mk-btn mk-btn--dark mk-btn--wide" onClick={issue}>
            ออกใบนัดรับ
          </button>
        </>
      ) : null}
    >
      {slip ? (
        <PickupSlip slip={slip} fresh={fresh} onDone={close} onMap={showMap} onCancel={cancel} />
      ) : cancelled ? (
        <div className="mk-cart__done" role="status">
          <span className="mk-rule" aria-hidden="true" />
          <h3>ยกเลิกนัดรับ {cancelled.code} แล้ว</h3>
          <p>ผู้ค้าจะนำของกลับไปขายต่อ ถ้ายังอยากได้ของชุดนี้ ใส่กลับตะกร้าแล้วออกใบนัดใหม่ได้</p>
          <div className="mk-cart__doneacts">
            <button type="button" className="mk-btn mk-btn--dark" onClick={() => { restorePickup(cancelled); setCancelled(null); }}>ใส่ของกลับตะกร้า</button>
            <button type="button" className="mk-btn mk-btn--ghost" onClick={close}>ปิด</button>
          </div>
        </div>
      ) : (
        <>
          {pickups.length > 0 && (
            <section className="mk-pickups" aria-labelledby="mk-pickups-h">
              <h3 className="mk-slip__h" id="mk-pickups-h">ใบนัดรับของคุณ</h3>
              <ul>
                {pickups.map(p => (
                  <li key={p.code}>
                    <button type="button" onClick={() => { setFresh(false); setView(p.code); }}>
                      <span>
                        <strong>{p.code}</strong>
                        <small>{p.lines.reduce((n, l) => n + l.qty, 0)} ชิ้น · {price(p.total)} · รับได้ถึง {thDate(p.until)}</small>
                      </span>
                      <IconArrow />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {cart.length === 0 ? (
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
        </>
      )}
    </Sheet>
  );
}
