import { useRef } from 'react';
import Reveal from './Reveal';
import { useReducedMotion, useScrollProgress } from './motion';
import { MANIFESTO } from '../../data/market';

/** คำแถลงของตลาด ตัวอักษรค่อย ๆ สว่างขึ้นทีละวรรคตามการเลื่อน */
export default function Manifesto() {
  const reduced = useReducedMotion();
  const words = useRef([]);

  const ref = useScrollProgress((_, el) => {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const span = r.height + vh * 0.2;
    const p = Math.min(1, Math.max(0, (vh * 0.86 - r.top) / span));
    const lit = p * (MANIFESTO.chunks.length + 5);
    words.current.forEach((node, i) => {
      if (node) node.style.setProperty('--mk-lit', Math.min(1, Math.max(0, lit - i)).toFixed(3));
    });
  }, { disabled: reduced });

  return (
    <section className="mk-manifesto" id="about" aria-labelledby="mk-manifesto-title">
      <div className="mk-wrap">
        <Reveal as="p" className="mk-eyebrow mk-manifesto__label" mode="fade">
          <span>{MANIFESTO.label}</span>
        </Reveal>

        <blockquote className={`mk-manifesto__quote ${reduced ? 'is-static' : ''}`} ref={ref}>
          <h2 id="mk-manifesto-title">
            {MANIFESTO.chunks.map((chunk, i) => (
              <span className="mk-fill" key={i} ref={el => { words.current[i] = el; }}>{chunk}</span>
            ))}
          </h2>
        </blockquote>

        <Reveal className="mk-manifesto__sign" mode="up" delay={80}>
          <span className="mk-rule" aria-hidden="true" />
          <p>{MANIFESTO.sign}</p>
        </Reveal>
      </div>
    </section>
  );
}
