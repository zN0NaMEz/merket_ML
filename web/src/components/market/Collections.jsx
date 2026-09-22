import Media from './Media';
import Reveal from './Reveal';
import SectionHeading from './SectionHeading';
import { useMarket } from './store';
import { IconArrow } from './icons';
import { COLLECTIONS } from '../../data/market';

/** ชุดของที่จัดไว้ให้แล้ว วางแบบหน้านิตยสาร ชิ้นแรกกินพื้นที่เต็มความกว้าง */
export default function Collections() {
  const { openSearch } = useMarket();

  return (
    <section className="mk-section mk-cols" id="collections" aria-labelledby="mk-cols-title">
      <div className="mk-wrap">
        <SectionHeading
          index="05"
          en="CURATED COLLECTIONS"
          id="mk-cols-title"
          lines={['จัดไว้ให้แล้ว', 'ตามจังหวะชีวิต']}
          note="ไม่ใช่หมวดหมู่ แต่เป็นชุดของที่เราเลือกมาให้เข้ากันเอง สำหรับช่วงเวลาหนึ่งของชีวิต"
        />

        <ul className="mk-cols__grid">
          {COLLECTIONS.map((c, i) => (
            <li key={c.id} className={`mk-cols__item ${i === 0 ? 'is-lead' : ''}`}>
              <Reveal delay={i === 0 ? 0 : ((i - 1) % 2) * 100}>
                <article className="mk-col">
                  <button type="button" className="mk-col__btn" onClick={() => openSearch(c.seed)}>
                    <Media
                      photo={c.photo}
                      alt={c.alt}
                      ratio={i === 0 ? 21 / 9 : 5 / 4}
                      sizes={i === 0 ? '(max-width: 860px) 92vw, 88vw' : '(max-width: 860px) 92vw, 43vw'}
                      className="mk-col__media"
                    />
                    <span className="mk-col__body">
                      <span className="mk-col__top">
                        <em>{String(i + 1).padStart(2, '0')}</em>
                        <span className="mk-col__en">{c.en}</span>
                      </span>
                      <span className="mk-col__name">{c.th}</span>
                      <span className="mk-col__desc">{c.desc}</span>
                      <span className="mk-col__more">
                        <span>{c.items} รายการ</span>
                        <IconArrow className="mk-col__arrow" />
                      </span>
                    </span>
                  </button>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
