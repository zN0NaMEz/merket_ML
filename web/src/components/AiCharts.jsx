import { useEffect, useMemo, useRef, useState } from 'react';

/*
 * กราฟของหน้า AI วาดด้วย SVG/HTML ล้วน
 *
 * สีสองชุดผ่านเครื่องตรวจ dataviz ทั้งธีมสว่างและมืด (ความต่างสำหรับคนตาบอดสี ≥ 19 · สายตาปกติ ≥ 24)
 *   --viz-late    ดินเผา  จ่ายช้า / ทำให้เสี่ยงขึ้น / มิเตอร์ที่จะถูกทัก
 *   --viz-ontime  คราม    จ่ายตรงเวลา / ทำให้เสี่ยงลดลง
 *   --viz-context เทา     จุดที่ไม่ใช่เรื่องหลักของกราฟ
 * ตัวอักษรใช้สีตัวอักษรของระบบเสมอ ไม่ใช้สีของข้อมูล
 */

const pct = v => `${Math.round(v * 100)}%`;

/** แท่งที่ปลายฝั่งข้อมูลโค้ง 4px ส่วนฝั่งเส้นฐานเป็นมุมเหลี่ยม */
function barPath(x, y0, w, h, up) {
  if (h <= 0.5) return '';
  const r = Math.min(4, h, w / 2);
  if (up) {
    const y = y0 - h;
    return `M${x},${y0}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y0}Z`;
  }
  const y = y0 + h;
  return `M${x},${y0}V${y - r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y - r}V${y0}Z`;
}

/** ความกว้างจริงของกล่องกราฟ ใช้เป็น viewBox เพื่อให้ตัวอักษรคงขนาดทุกจอ */
function useWidth(fallback) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => { const cw = Math.round(e.contentRect.width); if (cw > 0) setW(cw); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, Math.max(300, w)];
}

/** พิกัดตัวชี้ในหน่วยของ viewBox */
function toView(e, svg, W, H) {
  const box = svg.getBoundingClientRect();
  if (!box.width) return null;
  return { x: ((e.clientX - box.left) / box.width) * W, y: ((e.clientY - box.top) / box.height) * H };
}

function Tip({ tip }) {
  if (!tip) return null;
  return (
    <div className="ai-tip" style={{ left: `${Math.min(84, Math.max(16, tip.left))}%`, top: `${tip.top}%` }} role="status">
      {tip.lines.map((l, i) => (
        <div key={i} className={i === 0 ? 'ai-tip__value' : 'ai-tip__row'}>
          {l.key && <i className={`ai-key ai-key--${l.key}`} aria-hidden="true" />}
          {l.text}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * การกระจายของคะแนนความเสี่ยง แยกตามผลจริง
 * ด้านบนคือบิลที่จ่ายช้าจริง ด้านล่างคือบิลที่จ่ายตรงเวลา เส้นแนวตั้งคือเกณฑ์
 * ทุกอย่างทางขวาของเส้นเสี่ยงสูงคือบิลที่จะได้รับการเตือน จึงเห็นทันทีว่าเตือนถูกกี่ใบ เตือนเกินกี่ใบ
 * ------------------------------------------------------------------------- */
export function ScoreHistogram({ rows, model, high, mid }) {
  const [box, W] = useWidth(720);
  const compact = W < 560;
  const H = compact ? 270 : 300, L = compact ? 34 : 52, R = 14, T = 40, B = 44;
  const pw = W - L - R, ph = H - T - B, y0 = T + ph / 2, half = ph / 2 - 8;
  const N = 20;
  const band = pw / N, bw = Math.min(24, band - 6);
  const svg = useRef(null);
  const [act, setAct] = useState(null);

  const bins = useMemo(() => {
    const b = Array.from({ length: N }, (_, i) => ({ i, lo: i / N, hi: (i + 1) / N, late: 0, ok: 0 }));
    for (const r of rows) {
      const k = Math.min(N - 1, Math.max(0, Math.floor(r[model] * N)));
      if (r.y) b[k].late += 1; else b[k].ok += 1;
    }
    return b;
  }, [rows, model]);

  const max = Math.max(1, ...bins.map(b => Math.max(b.late, b.ok)));
  const x = v => L + v * pw;
  const highLabel = compact ? `สูง ≥ ${pct(high)} · เตือน →` : `เสี่ยงสูง ≥ ${pct(high)} · จะได้รับการเตือน →`;
  const flipHigh = x(high) + highLabel.length * (compact ? 6.4 : 6.6) > W - R;
  const h = c => (c / max) * half;
  const lateCount = rows.filter(r => r.y).length;

  const onMove = e => {
    const p = toView(e, svg.current, W, H);
    if (!p || p.x < L || p.x > W - R) { setAct(null); return; }
    setAct(Math.min(N - 1, Math.floor((p.x - L) / band)));
  };
  const onKey = e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setAct(a => Math.min(N - 1, (a ?? Math.floor(high * N) - 1) + 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setAct(a => Math.max(0, (a ?? Math.floor(high * N) + 1) - 1)); }
    if (e.key === 'Escape') setAct(null);
  };

  const b = act == null ? null : bins[act];
  const tip = b && {
    left: ((x(b.lo) + band / 2) / W) * 100,
    top: 4,
    lines: [
      { text: `คะแนน ${pct(b.lo)}–${pct(b.hi)}` },
      { key: 'late', text: `จ่ายช้าจริง ${b.late} ใบ` },
      { key: 'ontime', text: `จ่ายตรงเวลา ${b.ok} ใบ` },
      { text: b.lo >= high ? 'อยู่ในโซนที่จะได้รับการเตือน' : b.lo >= mid ? 'ระดับเสี่ยงปานกลาง' : 'ระดับเสี่ยงต่ำ' },
    ],
  };

  return (
    <figure className="ai-chart">
      <div className="ai-chart__plot" ref={box}>
        <svg
          ref={svg} viewBox={`0 0 ${W} ${H}`} className="ai-svg" tabIndex={0} role="img"
          aria-label={`การกระจายคะแนนความเสี่ยงของบิล ${rows.length} ใบ จ่ายช้าจริง ${lateCount} ใบ ใช้ปุ่มลูกศรซ้ายขวาเพื่อดูแต่ละช่วงคะแนน`}
          onPointerMove={onMove} onPointerLeave={() => setAct(null)} onKeyDown={onKey} onBlur={() => setAct(null)}
        >
          {/* โซนที่จะได้รับการเตือน */}
          <rect x={x(high)} y={T - 6} width={W - R - x(high)} height={ph + 12} className="ai-zone" />

          {bins.map(bn => {
            const bx = x(bn.lo) + (band - bw) / 2;
            const dim = act != null && act !== bn.i;
            return (
              <g key={bn.i} className={dim ? 'is-dim' : ''}>
                <path d={barPath(bx, y0 - 1, bw, h(bn.late), true)} className="v-late" />
                <path d={barPath(bx, y0 + 1, bw, h(bn.ok), false)} className="v-ontime" />
              </g>
            );
          })}

          <line x1={L} x2={W - R} y1={y0} y2={y0} className="ai-axis" />
          <text x={L - 8} y={y0 - half + 4} textAnchor="end" className="ai-tick">{max}</text>
          <text x={L - 8} y={y0 + 4} textAnchor="end" className="ai-tick">0</text>
          <text x={L - 8} y={y0 + half + 4} textAnchor="end" className="ai-tick">{max}</text>
          <text x={L + 6} y={T + 6} className="ai-side">▲ จ่ายช้าจริง</text>
          <text x={L + 6} y={H - B - 2} className="ai-side">▼ จ่ายตรงเวลา</text>

          {[0, 0.2, 0.4, 0.6, 0.8, 1].map(t => (
            <text key={t} x={x(t)} y={H - B + 18} textAnchor="middle" className="ai-tick">{pct(t)}</text>
          ))}
          <text x={L + pw / 2} y={H - 6} textAnchor="middle" className="ai-axis-title">คะแนนความเสี่ยงที่ AI ให้</text>

          {/* เส้นเกณฑ์ ป้ายอยู่คนละแถวเพื่อไม่ให้ชนกันเมื่อค่าใกล้กัน */}
          <line x1={x(mid)} x2={x(mid)} y1={T - 6} y2={T + ph + 6} className="ai-thr ai-thr--mid" />
          <text x={x(mid) - 6} y={T - 12} textAnchor="end" className="ai-thr-label ai-thr-label--mid">{compact ? 'กลาง' : 'ปานกลาง'} ≥ {pct(mid)}</text>
          <line x1={x(high)} x2={x(high)} y1={T - 22} y2={T + ph + 6} className="ai-thr" />
          {/* ถ้าป้ายจะล้นขอบขวา ให้ย้ายไปอยู่ซ้ายเส้น ลูกศรยังชี้ไปทางโซนที่จะได้รับการเตือน */}
          <text x={x(high) + (flipHigh ? -6 : 6)} y={T - 24} textAnchor={flipHigh ? 'end' : 'start'} className="ai-thr-label">{highLabel}</text>
        </svg>
        <Tip tip={tip} />
      </div>
      <figcaption className="ai-legend">
        <span><i className="ai-swatch v-late-bg" aria-hidden="true" />จ่ายช้าจริง</span>
        <span><i className="ai-swatch v-ontime-bg" aria-hidden="true" />จ่ายตรงเวลา</span>
        <span><i className="ai-swatch ai-swatch--zone" aria-hidden="true" />โซนที่จะได้รับการเตือน</span>
      </figcaption>
      <details className="ai-table">
        <summary>ดูข้อมูลของกราฟเป็นตาราง</summary>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>ช่วงคะแนน</th><th className="num">จ่ายช้าจริง</th><th className="num">จ่ายตรงเวลา</th></tr></thead>
            <tbody>
              {bins.filter(bn => bn.late || bn.ok).map(bn => (
                <tr key={bn.i}><td>{pct(bn.lo)}–{pct(bn.hi)}</td><td className="num">{bn.late}</td><td className="num">{bn.ok}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/* ---------------------------------------------------------------------------
 * ปัจจัยที่ AI ใช้ตัดสิน
 * signed = true (Logistic Regression): แท่งออกสองทางจากเส้นกลาง ขวาคือทำให้เสี่ยงขึ้น ซ้ายคือทำให้เสี่ยงลดลง
 * signed = false (Random Forest): บอกได้แค่ความสำคัญ จึงเป็นแท่งสีเดียว
 * ------------------------------------------------------------------------- */
export function FactorBars({ weights, signed, limit = 10 }) {
  const top = [...weights].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, limit);
  const max = Math.max(...top.map(w => Math.abs(w.value))) || 1;
  return (
    <figure className="ai-chart">
      <div className={`ai-factors ${signed ? 'is-signed' : ''}`} role="list">
        {top.map(w => {
          const f = Math.abs(w.value) / max;
          const up = w.value >= 0;
          const tone = signed ? (up ? 'is-up' : 'is-down') : 'is-mag';
          return (
            <div className="ai-factor" role="listitem" key={w.feature}
              aria-label={`${w.label} ${signed ? (up ? 'ทำให้เสี่ยงขึ้น' : 'ทำให้เสี่ยงลดลง') : 'ความสำคัญ'} ${Math.abs(w.value).toFixed(2)}`}>
              <span className="ai-factor__label">{w.label}</span>
              <span className="ai-factor__track">
                {signed && <i className="ai-factor__mid" aria-hidden="true" />}
                <i className={`ai-factor__bar ${tone}`} style={{ width: `${(signed ? 50 : 100) * f}%` }} />
              </span>
              <span className="ai-factor__val">{signed ? (up ? '+' : '−') : ''}{Math.abs(w.value).toFixed(2)}</span>
            </div>
          );
        })}
      </div>
      {signed ? (
        <figcaption className="ai-legend">
          <span><i className="ai-swatch v-ontime-bg" aria-hidden="true" />← ทำให้เสี่ยงลดลง</span>
          <span><i className="ai-swatch v-late-bg" aria-hidden="true" />ทำให้เสี่ยงขึ้น →</span>
        </figcaption>
      ) : (
        <figcaption className="ai-legend"><span>แท่งยาว = AI ให้น้ำหนักกับปัจจัยนั้นมาก (บอกทิศทางไม่ได้)</span></figcaption>
      )}
    </figure>
  );
}

/** แถบวัดค่า 0–100% ใช้เทียบโมเดล */
export function Meter({ value, label }) {
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <span className="ai-meter" role="img" aria-label={`${label} ${value == null ? 'ไม่มีข้อมูล' : pct(v)}`}>
      <i style={{ width: `${v * 100}%` }} />
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * ค่ามิเตอร์ในอดีตเทียบค่าปกติของแผงเอง
 * จุดที่จะถูกทักภายใต้การตั้งค่าปัจจุบันเป็นสีดินเผา นอกนั้นเป็นเทา เลื่อนเกณฑ์แล้วจุดเปลี่ยนสีทันที
 * ------------------------------------------------------------------------- */
const LIM = 1.8;
const TICKS = [[-1.386, '¼×'], [-0.693, '½×'], [0, 'ปกติ'], [0.693, '2×'], [1.386, '4×']];
const times = v => {
  const r = Math.exp(v);
  return r >= 10 ? `${Math.round(r)} เท่า` : `${r.toFixed(1)} เท่า`;
};

export function isFlagged(p, method, z, ifThr) {
  if (method === 'z') return p[3] > z;
  if (method === 'if') return p[2] > ifThr;
  return p[3] > z || p[2] > ifThr;
}

export function MeterScatter({ points, method, z, ifThr, current = [] }) {
  const [box, W] = useWidth(560);
  const H = Math.round(Math.min(420, Math.max(300, W * 0.7))), P = W < 480 ? 40 : 50;
  const clamp = v => Math.max(-LIM, Math.min(LIM, v));
  const sx = v => P + ((clamp(v) + LIM) / (2 * LIM)) * (W - 2 * P);
  const sy = v => H - P - ((clamp(v) + LIM) / (2 * LIM)) * (H - 2 * P);
  const svg = useRef(null);
  const [act, setAct] = useState(null);

  const marked = useMemo(() => points.map(p => ({ p, on: isFlagged(p, method, z, ifThr) })), [points, method, z, ifThr]);
  const flagged = marked.filter(m => m.on);

  /* หาจุดที่ใกล้ตัวชี้ที่สุด ไม่ต้องเล็งให้ตรงจุดเล็ก ๆ */
  const onMove = e => {
    const c = toView(e, svg.current, W, H);
    if (!c) return;
    let best = null, bd = 24 * 24;
    marked.forEach((m, i) => {
      const dx = sx(m.p[0]) - c.x, dy = sy(m.p[1]) - c.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    });
    setAct(best);
  };

  const a = act == null ? null : marked[act];
  const tip = a && {
    left: (sx(a.p[0]) / W) * 100,
    top: Math.max(2, (sy(a.p[1]) / H) * 100 - 30),
    lines: [
      { text: a.on ? 'จะถูกทักให้ตรวจซ้ำ' : 'ผ่าน ไม่ถูกทัก' },
      { text: `น้ำ ${times(a.p[0])} · ไฟ ${times(a.p[1])} ของค่าปกติ` },
      { text: `ห่างจากปกติ ${a.p[3].toFixed(1)} เท่าของความแกว่งปกติ` },
      { text: `ความแปลกของรูปแบบ ${a.p[2].toFixed(2)}` },
    ],
  };

  return (
    <figure className="ai-chart">
      <div className="ai-chart__plot" ref={box}>
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="ai-svg" role="img"
          aria-label={`ค่ามิเตอร์ในอดีต ${points.length} ค่า ด้วยการตั้งค่านี้จะถูกทัก ${flagged.length} ค่า`}
          onPointerMove={onMove} onPointerLeave={() => setAct(null)}>
          <rect x={P} y={P} width={W - 2 * P} height={H - 2 * P} className="ai-frame" />
          {TICKS.map(([v, t]) => (
            <g key={t}>
              <line x1={sx(v)} x2={sx(v)} y1={P} y2={H - P} className={v === 0 ? 'ai-axis' : 'ai-grid'} />
              <line x1={P} x2={W - P} y1={sy(v)} y2={sy(v)} className={v === 0 ? 'ai-axis' : 'ai-grid'} />
              <text x={sx(v)} y={H - P + 18} textAnchor="middle" className="ai-tick">{t}</text>
              <text x={P - 8} y={sy(v) + 4} textAnchor="end" className="ai-tick">{t}</text>
            </g>
          ))}
          <text x={W / 2} y={H - 10} textAnchor="middle" className="ai-axis-title">การใช้น้ำ เทียบค่าปกติของแผง →</text>
          <text x={14} y={H / 2} textAnchor="middle" transform={`rotate(-90 14 ${H / 2})`} className="ai-axis-title">การใช้ไฟ เทียบค่าปกติของแผง →</text>
          <text x={W - P - 8} y={P + 18} textAnchor="end" className="ai-side">ใช้มากกว่าปกติ</text>
          <text x={P + 8} y={H - P - 10} className="ai-side">ใช้น้อยกว่าปกติ</text>

          {marked.filter(m => !m.on).map((m, i) => (
            <circle key={`n${i}`} cx={sx(m.p[0])} cy={sy(m.p[1])} r="3" className="v-context ai-dot" />
          ))}
          {flagged.map((m, i) => (
            <circle key={`f${i}`} cx={sx(m.p[0])} cy={sy(m.p[1])} r="5" className="v-late ai-dot" />
          ))}
          {current.map(c => (
            <g key={c.stall_id}>
              <circle cx={sx(c.x[0])} cy={sy(c.x[1])} r="7" className={`ai-now ${c.anomaly ? 'is-on' : ''}`} />
              <text x={sx(c.x[0]) + 10} y={sy(c.x[1]) + 4} className="ai-now-label">{c.stall_id}</text>
            </g>
          ))}
          {a && <circle cx={sx(a.p[0])} cy={sy(a.p[1])} r="9" className="ai-hover-ring" />}
        </svg>
        <Tip tip={tip} />
      </div>
      <figcaption className="ai-legend">
        <span><i className="ai-dotkey v-late-bg" aria-hidden="true" />จะถูกทัก ({flagged.length})</span>
        <span><i className="ai-dotkey v-context-bg" aria-hidden="true" />ผ่าน ({points.length - flagged.length})</span>
        {current.length > 0 && <span><i className="ai-dotkey ai-dotkey--now" aria-hidden="true" />ค่าที่กำลังจดรอบนี้</span>}
      </figcaption>
      <details className="ai-table">
        <summary>ดูค่าที่จะถูกทักเป็นตาราง ({flagged.length} ค่า)</summary>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>น้ำ เทียบปกติ</th><th>ไฟ เทียบปกติ</th><th className="num">ห่างจากปกติ (z)</th><th className="num">ความแปลก (IF)</th></tr></thead>
            <tbody>
              {flagged.map((m, i) => (
                <tr key={i}><td>{times(m.p[0])}</td><td>{times(m.p[1])}</td><td className="num">{m.p[3].toFixed(1)}</td><td className="num">{m.p[2].toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
