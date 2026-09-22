import Media from './Media';
import { RevealLines } from './Reveal';
import { useReducedMotion, useScrollProgress } from './motion';
import { HERO } from '../../data/market';

/** ภาพเปิดเต็มจอ ภาพค่อย ๆ ขยายและเลื่อนขึ้นช้า ๆ ขณะผู้ชมเลื่อนหน้า */
export default function Hero({ onExplore, onMeet }) {
  const reduced = useReducedMotion();

  const ref = useScrollProgress((_, el) => {
    const r = el.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -r.top / (r.height || 1)));
    el.style.setProperty('--mk-p', p.toFixed(4));
  }, { disabled: reduced });

  return (
    <section className="mk-hero" ref={ref} id="mk-top" aria-labelledby="mk-hero-title">
      <div className="mk-hero__bg">
        <Media photo={HERO.photo} alt={HERO.alt} ratio={16 / 9} sizes="100vw" priority fill className="mk-hero__media" />
      </div>
      <div className="mk-hero__veil" aria-hidden="true" />

      <div className="mk-hero__inner">
        <p className="mk-eyebrow mk-hero__eyebrow">
          <span>THE CURATED MARKET</span>
          <i aria-hidden="true" />
          <span>ตั้งแต่ พ.ศ. ๒๕๑๙</span>
        </p>

        <RevealLines as="h1" id="mk-hero-title" className="mk-hero__title" lines={HERO.title} delay={120} />

        <p className="mk-hero__lead">{HERO.lead}</p>

        <div className="mk-hero__cta">
          <button type="button" className="mk-btn mk-btn--light" onClick={onExplore}>
            เดินชมตลาด<span className="mk-btn__en">EXPLORE MARKET</span>
          </button>
          <button type="button" className="mk-btn mk-btn--line" onClick={onMeet}>
            รู้จักผู้ค้า<span className="mk-btn__en">MEET THE MAKERS</span>
          </button>
        </div>
      </div>

      <div className="mk-hero__foot">
        <dl className="mk-hero__facts">
          {HERO.facts.map(f => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
        <span className="mk-scroll" aria-hidden="true">
          <em>SCROLL</em>
          <i />
        </span>
      </div>
    </section>
  );
}
