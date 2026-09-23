import { useEffect, useMemo, useState } from 'react';
import Sheet from './Sheet';
import Media from './Media';
import { scrollToId } from './motion';
import { useMarket } from './store';
import { IconArrow } from './icons';
import { CATEGORIES, COLLECTIONS, PRODUCTS, SELLERS, price } from '../../data/market';

const norm = s => String(s || '').toLowerCase();
const HINTS = ['งานทำมือ', 'ของสด', 'กาแฟ', 'ผ้าลินิน', 'ดอกไม้', 'เซรามิก'];

/** รายการสินค้าแบบการ์ดเล็ก ใช้ทั้งผลค้นหาและหน้าสรุปหมวด */
function ProductHits({ items }) {
  const { setDetail, setOverlay, addToCart } = useMarket();
  return (
    <ul className="mk-search__grid">
      {items.map(p => (
        <li key={p.id}>
          <button type="button" className="mk-hit" onClick={() => { setDetail({ kind: 'product', id: p.id }); setOverlay(null); }}>
            <Media photo={p.photo} alt="" ratio={1} sizes="180px" className="mk-hit__media" />
            <span className="mk-hit__body">
              <strong>{p.name}</strong>
              <small>{p.maker}</small>
              <span className="mk-hit__price">{price(p.price)}</span>
            </span>
          </button>
          <button type="button" className="mk-btn mk-btn--ghost mk-btn--sm" onClick={() => addToCart(p.id)}>ใส่ตะกร้า</button>
        </li>
      ))}
    </ul>
  );
}

/** รายชื่อร้านแบบแถว */
function SellerRows({ items }) {
  const { setDetail, setOverlay } = useMarket();
  return (
    <ul className="mk-search__rows">
      {items.map(s => (
        <li key={s.id}>
          <button type="button" onClick={() => { setDetail({ kind: 'seller', id: s.id }); setOverlay(null); }}>
            <span className="mk-plate">{s.stall}</span>
            <span><strong>{s.name}</strong><small>{s.trade}</small></span>
            <IconArrow />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * หน้าสรุปเมื่อกดการ์ดหมวดหมู่หรือชุดที่จัดไว้
 * บอกให้ชัดว่าในตลาดมีกี่ร้าน และสั่งออนไลน์ได้กี่รายการ เพื่อไม่ให้ตัวเลขบนการ์ดกับสิ่งที่เห็นขัดกัน
 */
function BrowseLanding({ browse }) {
  const { setOverlay } = useMarket();
  const isCat = browse.kind === 'category';
  const group = (isCat ? CATEGORIES : COLLECTIONS).find(x => x.id === browse.id);
  if (!group) return null;
  const products = group.products.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
  const sellers = group.sellers.map(id => SELLERS.find(s => s.id === id)).filter(Boolean);
  const total = isCat ? `${group.count} ร้านในตลาด` : `${group.items} รายการในชุดนี้`;

  return (
    <section className="mk-browse" aria-labelledby="mk-browse-title">
      <p className="mk-eyebrow"><span>{isCat ? 'หมวดหมู่' : 'ชุดที่จัดไว้'}</span><i aria-hidden="true" /><span>{group.en}</span></p>
      <h2 id="mk-browse-title" className="mk-browse__title">{group.th}</h2>
      <p className="mk-browse__desc">{group.desc}</p>
      <p className="mk-browse__meta">{total} · สั่งออนไลน์ได้ {products.length} รายการ</p>

      <h3 className="mk-search__h">สั่งออนไลน์ได้</h3>
      {products.length > 0 ? <ProductHits items={products} /> : (
        <p className="mk-browse__empty">ยังไม่มีของในหมวดนี้ที่สั่งออนไลน์ได้ ส่วนใหญ่ขายที่แผงโดยตรง แวะดูตำแหน่งในผังตลาดได้เลย</p>
      )}

      {sellers.length > 0 && (
        <>
          <h3 className="mk-search__h">ร้านที่ขายของแบบนี้</h3>
          <SellerRows items={sellers} />
        </>
      )}

      <button type="button" className="mk-btn mk-btn--dark mk-browse__cta" onClick={() => { setOverlay(null); scrollToId('visit'); }}>
        ดูตำแหน่งแผงในผังตลาด<IconArrow className="mk-btn__arrow" />
      </button>
    </section>
  );
}

/** ค้นหาทั่วทั้งตลาด: สินค้า ผู้ค้า หมวดหมู่ และชุดที่จัดไว้ */
export default function SearchOverlay() {
  const { overlay, setOverlay, seed, browse, openBrowse, clearBrowse, openSearch } = useMarket();
  const open = overlay === 'search';
  const [q, setQ] = useState('');

  useEffect(() => { if (open) setQ(seed || ''); }, [open, seed, browse]);

  const term = norm(q.trim());
  const hits = useMemo(() => {
    if (!term) return null;
    const match = (...fields) => fields.some(f => norm(f).includes(term));
    return {
      products: PRODUCTS.filter(p => match(p.name, p.maker, p.category, p.note)),
      sellers: SELLERS.filter(s => match(s.name, s.trade, s.stall, s.story)),
      groups: [
        ...CATEGORIES.filter(c => match(c.th, c.en, c.desc)).map(c => ({ id: c.id, th: c.th, en: c.en, kind: 'category', label: 'หมวดหมู่' })),
        ...COLLECTIONS.filter(c => match(c.th, c.en, c.desc)).map(c => ({ id: c.id, th: c.th, en: c.en, kind: 'collection', label: 'ชุดที่จัดไว้' })),
      ],
    };
  }, [term]);

  const total = hits ? hits.products.length + hits.sellers.length + hits.groups.length : 0;
  const landing = browse && !term;

  return (
    <Sheet open={open} onClose={() => setOverlay(null)} title="ค้นหาในตลาด" variant="full">
      <div className="mk-search">
        <form className="mk-search__bar" role="search" onSubmit={e => e.preventDefault()}>
          <label className="mk-sr" htmlFor="mk-q">ค้นหาสินค้า ผู้ค้า หรือหมวดหมู่</label>
          <input
            id="mk-q"
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ลองพิมพ์ชื่อของ ชื่อร้าน หรือหมวดหมู่"
            autoComplete="off"
          />
        </form>

        {landing && <BrowseLanding browse={browse} />}

        {!term && !browse && (
          <div className="mk-search__hints">
            <p className="mk-eyebrow"><span>คำค้นยอดนิยม</span></p>
            <div className="mk-chips">
              {HINTS.map(h => (
                <button key={h} type="button" className="mk-chip" onClick={() => openSearch(h)}>{h}</button>
              ))}
            </div>
          </div>
        )}

        {term && total === 0 && (
          <p className="mk-search__empty">
            ไม่พบ “{q.trim()}” ในตลาดตอนนี้<br />
            <span>ลองคำที่สั้นลง หรือเลือกจากหมวดหมู่ด้านล่างของหน้า</span>
          </p>
        )}

        {term && total > 0 && (
          <div className="mk-search__results">
            <p className="mk-search__count">พบ {total} รายการ</p>

            {hits.products.length > 0 && (
              <section>
                <h3 className="mk-search__h">สินค้า</h3>
                <ProductHits items={hits.products} />
              </section>
            )}

            {hits.sellers.length > 0 && (
              <section>
                <h3 className="mk-search__h">ผู้ค้า</h3>
                <SellerRows items={hits.sellers} />
              </section>
            )}

            {hits.groups.length > 0 && (
              <section>
                <h3 className="mk-search__h">หมวดหมู่และชุดที่จัดไว้</h3>
                <ul className="mk-search__rows">
                  {hits.groups.map(g => (
                    <li key={`${g.kind}-${g.id}`}>
                      <button type="button" onClick={() => { setQ(''); openBrowse(g.kind, g.id); }}>
                        <span className="mk-plate mk-plate--ghost">{g.label}</span>
                        <span><strong>{g.th}</strong><small>{g.en}</small></span>
                        <IconArrow />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {landing && (
          <button type="button" className="mk-browse__back" onClick={clearBrowse}>ค้นหาทั้งตลาดแทน</button>
        )}
      </div>
    </Sheet>
  );
}
