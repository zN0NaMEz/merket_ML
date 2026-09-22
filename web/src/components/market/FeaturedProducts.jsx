import { useState } from 'react';
import Media from './Media';
import Reveal from './Reveal';
import SectionHeading from './SectionHeading';
import { useMediaQuery } from './motion';
import { useMarket } from './store';
import { IconArrow, IconHeart } from './icons';
import { PRODUCTS, price } from '../../data/market';

const FEATURED = PRODUCTS.slice(0, 6);

/**
 * ของเด่นประจำเดือน วางแบบสองคอลัมน์ไม่เท่ากัน
 * จอใหญ่: ภาพใหญ่ฝั่งซ้ายเปลี่ยนตามรายการที่ชี้อยู่ · จอเล็ก: รายการเรียงลงพร้อมภาพของตัวเอง
 */
export default function FeaturedProducts() {
  const [active, setActive] = useState(0);
  const wide = useMediaQuery('(min-width: 861px)');
  const { setDetail, addToCart, toggleSaved, isSaved } = useMarket();

  return (
    <section className="mk-section mk-feat" id="market" aria-labelledby="mk-feat-title">
      <div className="mk-wrap">
        <SectionHeading
          index="02"
          en="FEATURED THIS MONTH"
          id="mk-feat-title"
          lines={['ของดีประจำเดือน', 'กันยายน']}
          note="หกชิ้นที่ทีมคัดสรรเลือกจากแผงทั้งหมดในเดือนนี้ เปลี่ยนใหม่ทุกต้นเดือน"
        />

        <div className="mk-feat__layout">
          {wide && (
            <div className="mk-feat__stage" aria-hidden="true">
              {FEATURED.map((p, i) => (
                <span key={p.id} className={`mk-feat__shot ${i === active ? 'is-on' : ''}`}>
                  <Media photo={p.photo} alt="" ratio={4 / 5} sizes="46vw" />
                </span>
              ))}
              <span className="mk-feat__stagenum">{String(active + 1).padStart(2, '0')}</span>
            </div>
          )}

          <ol className="mk-feat__list">
            {FEATURED.map((p, i) => (
              <li key={p.id}>
                <Reveal delay={i * 60}>
                  <article
                    className={`mk-prod ${i === active ? 'is-active' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                  >
                    {!wide && (
                      <button type="button" className="mk-prod__thumb" onClick={() => setDetail({ kind: 'product', id: p.id })} tabIndex={-1} aria-hidden="true">
                        <Media photo={p.photo} alt="" ratio={4 / 5} sizes="86vw" />
                      </button>
                    )}

                    <div className="mk-prod__main">
                      <em className="mk-prod__num">{String(i + 1).padStart(2, '0')}</em>
                      <h3 className="mk-prod__name">
                        <button type="button" onClick={() => setDetail({ kind: 'product', id: p.id })}>
                          {p.name}
                          <span className="mk-sr">— ดูรายละเอียด</span>
                        </button>
                      </h3>
                      <p className="mk-prod__meta">
                        <span>{p.maker}</span>
                        <i aria-hidden="true" />
                        <span>{p.category}</span>
                      </p>
                      <p className="mk-prod__price">{price(p.price)}</p>
                    </div>

                    <div className="mk-prod__acts">
                      <button
                        type="button"
                        className={`mk-save ${isSaved(p.id) ? 'is-on' : ''}`}
                        onClick={() => toggleSaved(p.id)}
                        aria-pressed={isSaved(p.id)}
                        aria-label={`${isSaved(p.id) ? 'นำออกจาก' : 'บันทึก'}รายการที่สนใจ: ${p.name}`}
                      >
                        <IconHeart filled={isSaved(p.id)} />
                      </button>
                      <button type="button" className="mk-btn mk-btn--ghost mk-btn--sm" onClick={() => addToCart(p.id)}>
                        ใส่ตะกร้า<IconArrow className="mk-btn__arrow" />
                      </button>
                    </div>
                  </article>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
