import Media from './Media';
import Reveal, { RevealLines } from './Reveal';
import { useReducedMotion, useScrollProgress } from './motion';
import { STORY } from '../../data/market';

/** ภาพใหญ่เต็มความกว้างพร้อมถ้อยคำทับ ภาพเลื่อนช้ากว่าหน้าเล็กน้อยเพื่อให้เกิดความลึก */
export default function StorySection({ onAction }) {
  const reduced = useReducedMotion();
  const ref = useScrollProgress((p, el) => {
    el.style.setProperty('--mk-p', p.toFixed(4));
  }, { disabled: reduced });

  return (
    <section className="mk-story" id="stories" ref={ref} aria-labelledby="mk-story-title">
      <div className="mk-story__bg">
        <Media photo={STORY.photo} alt={STORY.alt} ratio={16 / 10} sizes="100vw" fill className="mk-story__media" />
      </div>
      <div className="mk-story__veil" aria-hidden="true" />

      <div className="mk-wrap mk-story__inner">
        <Reveal as="p" className="mk-eyebrow" mode="fade"><em className="mk-head__num">04</em><span>{STORY.en}</span></Reveal>
        <RevealLines as="h2" id="mk-story-title" className="mk-story__title" lines={STORY.title} />
        <Reveal className="mk-story__note" mode="up" delay={140}>
          <p>{STORY.body}</p>
          <button type="button" className="mk-btn mk-btn--line" onClick={onAction}>
            อ่านเรื่องของผู้ค้า<span className="mk-btn__en">READ THEIR STORIES</span>
          </button>
        </Reveal>
      </div>
    </section>
  );
}
