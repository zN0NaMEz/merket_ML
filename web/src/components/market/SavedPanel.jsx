import Sheet from './Sheet';
import Media from './Media';
import { useMarket } from './store';
import { IconClose } from './icons';
import { PRODUCTS, price } from '../../data/market';

/** รายการที่กดบันทึกไว้ เก็บในเครื่องของผู้ใช้เอง */
export default function SavedPanel() {
  const { overlay, setOverlay, saved, toggleSaved, addToCart, setDetail } = useMarket();
  const items = saved.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);

  return (
    <Sheet open={overlay === 'saved'} onClose={() => setOverlay(null)} title={`บันทึกไว้ · ${items.length} รายการ`}>
      {items.length === 0 ? (
        <div className="mk-empty">
          <span className="mk-rule" aria-hidden="true" />
          <p>ยังไม่ได้บันทึกอะไรไว้</p>
          <p className="mk-empty__note">กดรูปหัวใจที่ของชิ้นไหนก็ได้ แล้วมันจะมารออยู่ตรงนี้</p>
        </div>
      ) : (
        <ul className="mk-cart__list">
          {items.map(p => (
            <li key={p.id}>
              <button type="button" className="mk-cart__media mk-cart__media--btn" onClick={() => { setDetail({ kind: 'product', id: p.id }); setOverlay(null); }} aria-label={`ดูรายละเอียด ${p.name}`}>
                <Media photo={p.photo} alt="" ratio={1} sizes="96px" />
              </button>
              <div className="mk-cart__info">
                <strong>{p.name}</strong>
                <small>{p.maker}</small>
                <span className="mk-cart__unit">{price(p.price)}</span>
              </div>
              <button type="button" className="mk-btn mk-btn--ghost mk-btn--sm" onClick={() => addToCart(p.id)}>ใส่ตะกร้า</button>
              <button type="button" className="mk-cart__rm" onClick={() => toggleSaved(p.id)} aria-label={`นำ ${p.name} ออกจากรายการที่บันทึก`}>
                <IconClose />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
