import { useCallback, useEffect, useRef, useState } from 'react';
import Media from './Media';
import SectionHeading from './SectionHeading';
import { useMarket } from './store';
import { IconArrow } from './icons';
import { SELLERS } from '../../data/market';

/** คนขายของ เลื่อนดูแนวนอนได้ทั้งด้วยเมาส์ ปุ่มลูกศร และแป้นพิมพ์ */
export default function SellerShowcase() {
  const { setDetail } = useMarket();
  const track = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft >= max - 4 });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => { el.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [measure]);

  const step = dir => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector('.mk-seller');
    const by = card ? card.getBoundingClientRect().width + 28 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * by, behavior: 'smooth' });
  };

  return (
    <section className="mk-section mk-sellers" id="sellers" aria-labelledby="mk-sellers-title">
      <div className="mk-wrap">
        <SectionHeading
          index="03"
          en="THE PEOPLE BEHIND THE STALLS"
          id="mk-sellers-title"
          tone="dark"
          lines={['คนที่อยู่', 'หลังแผง']}
          note="ของทุกชิ้นในตลาดนี้มีคนที่ทำมันอยู่ เราอยากให้คุณได้รู้จักพวกเขาก่อนจะรู้จักของ"
          action={(
            <div className="mk-sellers__nav">
              <button type="button" onClick={() => step(-1)} disabled={edge.start} aria-label="ผู้ค้าก่อนหน้า">
                <IconArrow style={{ transform: 'scaleX(-1)' }} />
              </button>
              <button type="button" onClick={() => step(1)} disabled={edge.end} aria-label="ผู้ค้าถัดไป">
                <IconArrow />
              </button>
            </div>
          )}
        />
      </div>

      <ul className="mk-sellers__track" ref={track} tabIndex={0} aria-label="รายชื่อผู้ค้า เลื่อนแนวนอนได้">
        {SELLERS.map((s, i) => (
          <li key={s.id} className="mk-seller">
            <button type="button" className="mk-seller__btn" onClick={() => setDetail({ kind: 'seller', id: s.id })}>
              <Media
                photo={s.photo}
                alt={s.alt}
                ratio={3 / 4}
                sizes="(max-width: 720px) 78vw, (max-width: 1100px) 44vw, 27vw"
                className="mk-seller__media"
              />
              <span className="mk-seller__plate">{s.stall}</span>
              <span className="mk-seller__body">
                <em className="mk-seller__num">{String(i + 1).padStart(2, '0')}</em>
                <span className="mk-seller__name">{s.name}</span>
                <span className="mk-seller__trade">{s.trade}</span>
                <span className="mk-seller__story">{s.story}</span>
                <span className="mk-seller__foot">
                  <span>{s.items} รายการ</span>
                  <span className="mk-seller__cta">ดูร้าน <IconArrow /></span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
