import Sheet from './Sheet';
import Media from './Media';
import { useMarket } from './store';
import { IconArrow, IconHeart } from './icons';
import { PRODUCTS, SELLERS, price } from '../../data/market';

/** รายละเอียดสินค้าและร้าน เปิดเป็นแผงด้านข้างแทนการเปลี่ยนหน้า */
export default function DetailPanel() {
  const { detail, setDetail, addToCart, toggleSaved, isSaved } = useMarket();
  const close = () => setDetail(null);

  if (!detail) return <Sheet open={false} onClose={close} title="" />;

  if (detail.kind === 'product') {
    const p = PRODUCTS.find(x => x.id === detail.id);
    if (!p) return null;
    const shop = SELLERS.find(s => s.id === p.seller);
    return (
      <Sheet
        open
        onClose={close}
        title="รายละเอียดสินค้า"
        foot={(
          <div className="mk-detail__acts">
            <button type="button" className="mk-btn mk-btn--dark mk-btn--wide" onClick={() => addToCart(p.id)}>
              ใส่ตะกร้า · {price(p.price)}
            </button>
            <button
              type="button"
              className={`mk-save mk-save--lg ${isSaved(p.id) ? 'is-on' : ''}`}
              onClick={() => toggleSaved(p.id)}
              aria-pressed={isSaved(p.id)}
              aria-label={`${isSaved(p.id) ? 'นำออกจาก' : 'บันทึก'}รายการที่สนใจ`}
            >
              <IconHeart filled={isSaved(p.id)} />
            </button>
          </div>
        )}
      >
        <article className="mk-detail">
          <Media photo={p.photo} alt={p.alt} ratio={4 / 5} sizes="(max-width: 720px) 92vw, 420px" className="mk-detail__media" />
          <p className="mk-eyebrow"><span>{p.category}</span></p>
          <h3 className="mk-detail__name">{p.name}</h3>
          <p className="mk-detail__price">{price(p.price)}</p>
          <p className="mk-detail__note">{p.note}</p>
          <dl className="mk-detail__meta">
            <div><dt>ผู้ทำ</dt><dd>{p.maker}</dd></div>
            <div><dt>หมวดหมู่</dt><dd>{p.category}</dd></div>
            {shop && <div><dt>แผง</dt><dd>{shop.stall}</dd></div>}
          </dl>
          {shop && (
            <button type="button" className="mk-detail__link" onClick={() => setDetail({ kind: 'seller', id: shop.id })}>
              ดูร้านของ {shop.name}<IconArrow />
            </button>
          )}
        </article>
      </Sheet>
    );
  }

  const s = SELLERS.find(x => x.id === detail.id);
  if (!s) return null;
  const goods = PRODUCTS.filter(p => p.seller === s.id);

  return (
    <Sheet open onClose={close} title="ร้านในตลาด">
      <article className="mk-detail">
        <Media photo={s.photo} alt={s.alt} ratio={3 / 4} sizes="(max-width: 720px) 92vw, 420px" className="mk-detail__media" />
        <p className="mk-eyebrow"><span>แผง {s.stall}</span></p>
        <h3 className="mk-detail__name">{s.name}</h3>
        <p className="mk-detail__trade">{s.trade}</p>
        <p className="mk-detail__note">{s.story}</p>
        <dl className="mk-detail__meta">
          <div><dt>อยู่ที่ตลาดนี้มา</dt><dd>{s.years} ปี</dd></div>
          <div><dt>รายการทั้งหมด</dt><dd>{s.items} รายการ</dd></div>
          <div><dt>แผง</dt><dd>{s.stall}</dd></div>
        </dl>

        {goods.length > 0 && (
          <>
            <h4 className="mk-detail__sub">ของจากร้านนี้</h4>
            <ul className="mk-detail__goods">
              {goods.map(p => (
                <li key={p.id}>
                  <button type="button" onClick={() => setDetail({ kind: 'product', id: p.id })}>
                    <Media photo={p.photo} alt="" ratio={1} sizes="88px" />
                    <span><strong>{p.name}</strong><small>{price(p.price)}</small></span>
                    <IconArrow />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </article>
    </Sheet>
  );
}
