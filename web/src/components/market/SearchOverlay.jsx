import { useEffect, useMemo, useState } from 'react';
import Sheet from './Sheet';
import Media from './Media';
import { useMarket } from './store';
import { IconArrow } from './icons';
import { CATEGORIES, COLLECTIONS, PRODUCTS, SELLERS, price } from '../../data/market';

const norm = s => String(s || '').toLowerCase();
const HINTS = ['งานทำมือ', 'ของสด', 'กาแฟ', 'ผ้าลินิน', 'ดอกไม้', 'เซรามิก'];

/** ค้นหาทั่วทั้งตลาด: สินค้า ผู้ค้า หมวดหมู่ และชุดที่จัดไว้ */
export default function SearchOverlay() {
  const { overlay, setOverlay, seed, setDetail, addToCart, openSearch } = useMarket();
  const open = overlay === 'search';
  const [q, setQ] = useState('');

  useEffect(() => { if (open) setQ(seed || ''); }, [open, seed]);

  const term = norm(q.trim());
  const hits = useMemo(() => {
    if (!term) return null;
    const match = (...fields) => fields.some(f => norm(f).includes(term));
    return {
      products: PRODUCTS.filter(p => match(p.name, p.maker, p.category, p.note)),
      sellers: SELLERS.filter(s => match(s.name, s.trade, s.stall, s.story)),
      groups: [
        ...CATEGORIES.filter(c => match(c.th, c.en, c.desc)).map(c => ({ id: c.id, th: c.th, en: c.en, kind: 'หมวดหมู่' })),
        ...COLLECTIONS.filter(c => match(c.th, c.en, c.desc)).map(c => ({ id: c.id, th: c.th, en: c.en, kind: 'ชุดที่จัดไว้' })),
      ],
    };
  }, [term]);

  const total = hits ? hits.products.length + hits.sellers.length + hits.groups.length : 0;

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

        {!term && (
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
            <span>ลองคำที่สั้นลง หรือเลือกจากคำค้นยอดนิยมด้านบน</span>
          </p>
        )}

        {term && total > 0 && (
          <div className="mk-search__results">
            <p className="mk-search__count">พบ {total} รายการ</p>

            {hits.products.length > 0 && (
              <section>
                <h3 className="mk-search__h">สินค้า</h3>
                <ul className="mk-search__grid">
                  {hits.products.map(p => (
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
              </section>
            )}

            {hits.sellers.length > 0 && (
              <section>
                <h3 className="mk-search__h">ผู้ค้า</h3>
                <ul className="mk-search__rows">
                  {hits.sellers.map(s => (
                    <li key={s.id}>
                      <button type="button" onClick={() => { setDetail({ kind: 'seller', id: s.id }); setOverlay(null); }}>
                        <span className="mk-plate">{s.stall}</span>
                        <span><strong>{s.name}</strong><small>{s.trade}</small></span>
                        <IconArrow />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hits.groups.length > 0 && (
              <section>
                <h3 className="mk-search__h">หมวดหมู่และชุดที่จัดไว้</h3>
                <ul className="mk-search__rows">
                  {hits.groups.map(g => (
                    <li key={`${g.kind}-${g.id}`}>
                      <button type="button" onClick={() => setQ(g.th)}>
                        <span className="mk-plate mk-plate--ghost">{g.kind}</span>
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
      </div>
    </Sheet>
  );
}
