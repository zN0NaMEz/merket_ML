import Media from './Media';
import Reveal from './Reveal';
import SectionHeading from './SectionHeading';
import { useMarket } from './store';
import { IconArrow } from './icons';
import { CATEGORIES } from '../../data/market';

/**
 * หมวดหมู่ในตลาด จัดวางแบบไม่สมมาตรบนจอใหญ่
 * จอเล็กเปลี่ยนเป็นแถวเลื่อนแนวนอนแทนการวางซ้อนกันยาว ๆ
 */
export default function Categories() {
  const { openSearch } = useMarket();

  return (
    <section className="mk-section mk-cats" id="categories" aria-labelledby="mk-cats-title">
      <div className="mk-wrap">
        <SectionHeading
          index="01"
          en="BROWSE BY CATEGORY"
          id="mk-cats-title"
          lines={['แปดหมวดหมู่', 'ที่คัดมาแล้ว']}
          note="เราไม่ได้เปิดรับทุกราย แต่ละหมวดมีคณะกรรมการตลาดคัดเลือกผู้ค้าเข้ามาใหม่ปีละสองครั้ง"
        />
      </div>

      <ul className="mk-cats__grid mk-wrap">
        {CATEGORIES.map((c, i) => (
          <li key={c.id} className={`mk-cats__item mk-cats__item--${c.span}`}>
            <Reveal delay={(i % 3) * 90}>
              <button type="button" className="mk-cat" onClick={() => openSearch(c.th)}>
                <Media
                  photo={c.photo}
                  alt={c.alt}
                  ratio={c.ratio}
                  sizes="(max-width: 720px) 74vw, (max-width: 1100px) 46vw, 32vw"
                  className="mk-cat__media"
                />
                <span className="mk-cat__body">
                  <span className="mk-cat__top">
                    <em className="mk-cat__num">{String(i + 1).padStart(2, '0')}</em>
                    <span className="mk-cat__en">{c.en}</span>
                  </span>
                  <span className="mk-cat__name">{c.th}</span>
                  <span className="mk-cat__desc">{c.desc}</span>
                  <span className="mk-cat__more">
                    <span>ดูทั้งหมด {c.count} ร้าน</span>
                    <IconArrow className="mk-cat__arrow" />
                  </span>
                </span>
              </button>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
