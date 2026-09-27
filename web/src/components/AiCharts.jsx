import { useEffect, useMemo, useRef, useState } from 'react';
import { TH_M, periodShort } from '../format';

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
  const H = compact ? 290 : 320, L = compact ? 34 : 52, R = 14, T = 48, B = 50;
  const pw = W - L - R, ph = H - T - B, y0 = T + ph / 2, half = ph / 2 - 8;
  const N = 10;   // ช่วงละ 10% อ่านง่ายกว่า 20 ช่วง
  const band = pw / N, bw = Math.min(40, band - 10);
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
                {/* จำนวนเขียนไว้ที่ปลายแท่ง ไม่ต้องชี้ก็อ่านได้ */}
                {bn.late > 0 && <text x={bx + bw / 2} y={y0 - h(bn.late) - 5} textAnchor="middle" className="ai-count">{bn.late}</text>}
                {bn.ok > 0 && <text x={bx + bw / 2} y={y0 + h(bn.ok) + 13} textAnchor="middle" className="ai-count">{bn.ok}</text>}
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

/* ค่ามิเตอร์หนึ่งค่า p = [น้ำเทียบปกติ, ไฟเทียบปกติ, คะแนนความแปลก, z สูงสุด] จะถูกทักไหมภายใต้การตั้งค่านี้ */
export function isFlagged(p, method, z, ifThr) {
  if (method === 'z') return p[3] > z;
  if (method === 'if') return p[2] > ifThr;
  return p[3] > z || p[2] > ifThr;
}

/* ===========================================================================
 * ตัวอย่างให้เข้าใจง่าย: "กราฟปกติ" (ข้อมูลที่เกิดขึ้นจริง) ต่อด้วย "กราฟการทำนาย" (ช่องแรเงาด้านขวา)
 * ใช้แกนเดียวเสมอ ส่วนคาดการณ์แยกเป็นช่องของตัวเอง ไม่ซ้อนแกนที่สอง
 * ========================================================================= */

/** ป้ายเดือนบนแกน: ใส่ปีเฉพาะเดือนแรกของกราฟและเดือนมกราคม ถ้าช่องแคบให้เว้นเดือนเว้นเดือน */
function monthTick(period, i, slot) {
  if (slot < 40 && i % 2 === 1) return '';
  const [y, m] = period.split('-').map(Number);
  return i === 0 || m === 1 ? `${TH_M[m - 1]} ${String(y + 543).slice(2)}` : TH_M[m - 1];
}

/** ค่าสูงสุดของแกนแบบตัวเลขกลม ๆ */
function niceMax(v) {
  const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const step = steps.find(s => v / s <= 4) || 10000;
  return Math.max(step, Math.ceil(v / step) * step);
}

/**
 * ประวัติการจ่ายเงิน 6 เดือน (จ่ายช้ากี่วัน) + ช่องคาดการณ์ของบิลถัดไป
 * c = { history:[{period, days_late}], target:{period, score, scores} }
 */
export function PayForecastChart({ c, model, high, mid }) {
  const [box, W] = useWidth(520);
  const H = 260, L = 34, R = 6, T = 40, B = 40;
  const pw = W - L - R, ph = H - T - B;
  const fcw = Math.max(112, pw * 0.27), gap = 14;
  const hw = pw - fcw - gap;
  const n = c.history.length;
  const slot = hw / n, bw = Math.min(34, slot - 12);
  const maxD = niceMax(Math.max(8, ...c.history.map(h => h.days_late || 0)));
  const y0 = T + ph;
  const y = d => y0 - (d / maxD) * ph;
  const score = c.target.scores?.[model] ?? c.target.score;
  const tone = score >= high ? 'late' : score >= mid ? 'context' : 'ontime';
  const fx = L + hw + gap;
  const gx = fx + 18, gy = T + 6, gh = ph - 6;   // แถบวัดโอกาสจ่ายช้า 0–100%
  const lateMonths = c.history.filter(h => h.days_late > 0).length;
  return (
    <figure className="ai-chart ai-chart--ex">
      <div className="ai-chart__plot" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} className="ai-svg" role="img"
          aria-label={`ข้อมูลจริง ${n} เดือน จ่ายช้า ${lateMonths} เดือน · AI คาดว่าบิลถัดไปมีโอกาสจ่ายช้า ${pct(score)}`}>
          <text x={L} y={16} className="ai-side">ข้อมูลจริง · จ่ายช้ากี่วัน</text>
          {[0, maxD / 2, maxD].map(t => (
            <g key={t}>
              <line x1={L} x2={L + hw} y1={y(t)} y2={y(t)} className={t === 0 ? 'ai-axis' : 'ai-grid'} />
              <text x={L - 6} y={y(t) + 4} textAnchor="end" className="ai-tick">{t}</text>
            </g>
          ))}
          {c.history.map((h, i) => {
            const cx = L + slot * i + slot / 2, d = h.days_late || 0;
            return (
              <g key={h.period}>
                {d > 0
                  ? <path d={barPath(cx - bw / 2, y0, bw, y0 - y(d), true)} className="v-late" />
                  : <rect x={cx - bw / 2} y={y0 - 5} width={bw} height={5} rx="2" className="v-ontime" />}
                <text x={cx} y={(d > 0 ? y(d) : y0 - 5) - 6} textAnchor="middle" className="ai-count">{d > 0 ? (slot < 48 ? d : `${d} วัน`) : (slot < 48 ? '✓' : 'ตรง')}</text>
                <text x={cx} y={y0 + 17} textAnchor="middle" className="ai-tick">{monthTick(h.period, i, slot)}</text>
              </g>
            );
          })}

          {/* ช่องคาดการณ์: ตอนที่ AI ทำนาย บิลนี้ยังไม่ถึงกำหนด */}
          <rect x={fx} y={T - 34} width={fcw} height={ph + 34} rx="6" className="ai-fc" />
          <text x={fx + fcw / 2} y={16} textAnchor="middle" className="ai-fc-title">การทำนาย</text>
          <rect x={gx} y={gy} width={10} height={gh} rx="5" className="ai-gauge" />
          <rect x={gx} y={gy + gh * (1 - score)} width={10} height={gh * score} rx="5" className={`v-${tone}`} />
          <line x1={gx - 5} x2={gx + 15} y1={gy + gh * (1 - high)} y2={gy + gh * (1 - high)} className="ai-thr" />
          <text x={gx + 20} y={gy + gh * (1 - high) + 4} className="ai-gauge-label">เตือน</text>
          <text x={fx + fcw - 10} y={T + ph * 0.5} textAnchor="end" className="ai-fc-big">{pct(score)}</text>
          <text x={fx + fcw - 10} y={T + ph * 0.5 + 18} textAnchor="end" className="ai-fc-small">โอกาสจ่ายช้า</text>
          <text x={fx + fcw / 2} y={y0 + 17} textAnchor="middle" className="ai-tick">บิล{periodShort(c.target.period)}</text>
        </svg>
      </div>
    </figure>
  );
}

/**
 * การใช้น้ำ/ไฟรายเดือน กับ "ช่วงปกติที่คาดไว้" (ค่าเฉลี่ย 12 เดือนก่อนหน้า ± z × ความแกว่ง)
 * จุดที่หลุดช่วง = ระบบจะทัก · ช่องขวา (ถ้ามี) = ช่วงที่คาดไว้ของเดือนหน้า
 */
export function UsageBandChart({ c, z }) {
  const [box, W] = useWidth(520);
  const H = 260, L = 34, R = 6, T = 40, B = 40;
  const band = p => ({ lo: Math.max(0, p.mean - z * p.spread), hi: p.mean + z * p.spread });
  const pts = c.series.map(p => { const b = band(p); return { ...p, ...b, out: p.value < b.lo || p.value > b.hi }; });
  const nx = c.next ? { ...c.next, ...band(c.next) } : null;
  const pw = W - L - R, ph = H - T - B;
  const fcw = nx ? Math.max(112, pw * 0.26) : 0, gap = nx ? 14 : 0;
  const hw = pw - fcw - gap;
  const slot = hw / pts.length;
  const vmax = niceMax(Math.max(...pts.map(p => Math.max(p.value, p.hi)), nx ? nx.hi : 0) * 1.1);
  const y0 = T + ph;
  const y = v => y0 - (v / vmax) * ph;
  const xc = i => L + slot * i + slot / 2;
  const area = `M${pts.map((p, i) => `${xc(i)},${y(p.hi)}`).join('L')}L${pts.map((p, i) => `${xc(i)},${y(p.lo)}`).reverse().join('L')}Z`;
  const line = pts.map((p, i) => `${xc(i)},${y(p.value)}`).join(' ');
  const mean = pts.map((p, i) => `${xc(i)},${y(p.mean)}`).join(' ');
  const unit = c.util === 'water' ? 'น้ำ' : 'ไฟ';
  const fx = L + hw + gap;
  const flagged = pts.filter(p => p.out);
  return (
    <figure className="ai-chart ai-chart--ex">
      <div className="ai-chart__plot" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} className="ai-svg" role="img"
          aria-label={`การใช้${unit}ของแผง ${c.stall_id} ${pts.length} เดือน หลุดช่วงปกติ ${flagged.length} เดือน`}>
          <text x={L} y={16} className="ai-side">ข้อมูลจริง · ใช้{unit}กี่หน่วย</text>
          {[0, vmax / 2, vmax].map(t => (
            <g key={t}>
              <line x1={L} x2={L + hw} y1={y(t)} y2={y(t)} className={t === 0 ? 'ai-axis' : 'ai-grid'} />
              <text x={L - 6} y={y(t) + 4} textAnchor="end" className="ai-tick">{Math.round(t)}</text>
            </g>
          ))}
          <path d={area} className="ai-band" />
          <polyline points={mean} className="ai-mean" />
          <polyline points={line} className="ai-line" />
          {pts.map((p, i) => (
            <g key={p.period}>
              <circle cx={xc(i)} cy={y(p.value)} r={p.out ? 6.5 : 4} className={`ai-dot ${p.out ? 'v-late' : 'v-ink'}`} />
              <text x={xc(i)} y={y(p.value) - (p.out ? 12 : 9)} textAnchor="middle" className={p.out ? 'ai-count ai-count--strong' : 'ai-count'}>{p.value}</text>
              <text x={xc(i)} y={y0 + 17} textAnchor="middle" className="ai-tick">{monthTick(p.period, i, slot)}</text>
            </g>
          ))}
          {flagged.map(p => {
            const i = pts.indexOf(p);
            const left = xc(i) > L + hw * 0.6;
            return (
              <text key={`n${p.period}`} x={xc(i) + (left ? -12 : 12)} y={y(p.value) + 4} textAnchor={left ? 'end' : 'start'} className="ai-note">
                คาดไว้ {Math.round(p.lo)}–{Math.round(p.hi)} → ทัก
              </text>
            );
          })}

          {nx && (
            <g>
              <rect x={fx} y={T - 34} width={fcw} height={ph + 34} rx="6" className="ai-fc" />
              <text x={fx + fcw / 2} y={16} textAnchor="middle" className="ai-fc-title">การทำนายเดือนหน้า</text>
              <rect x={fx + 16} y={y(nx.hi)} width={fcw - 32} height={Math.max(4, y(nx.lo) - y(nx.hi))} rx="4" className="ai-band ai-band--fc" />
              <line x1={fx + 16} x2={fx + fcw - 16} y1={y(nx.mean)} y2={y(nx.mean)} className="ai-mean" />
              <text x={fx + fcw / 2} y={y(nx.hi) - 22} textAnchor="middle" className="ai-fc-big ai-fc-big--sm">{Math.round(nx.lo)}–{Math.round(nx.hi)}</text>
              <text x={fx + fcw / 2} y={y(nx.hi) - 6} textAnchor="middle" className="ai-fc-small">หน่วย</text>
              <text x={fx + fcw / 2} y={y0 + 17} textAnchor="middle" className="ai-tick">{periodShort(nx.period)}</text>
            </g>
          )}
        </svg>
      </div>
      <figcaption className="ai-legend">
        <span><i className="ai-swatch ai-swatch--band" aria-hidden="true" />ช่วงปกติที่คาดไว้</span>
        <span><i className="ai-dotkey v-ink-bg" aria-hidden="true" />ค่าที่จดจริง</span>
        <span><i className="ai-dotkey v-late-bg" aria-hidden="true" />หลุดช่วง = ระบบทัก</span>
        {nx && <span><i className="ai-swatch ai-swatch--fc" aria-hidden="true" />ช่องการทำนาย</span>}
      </figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------------------------
 * ค่ามิเตอร์ในอดีตแบบแถบเดียวต่อเกณฑ์ (แทนกราฟจุดสองแกน)
 * แถบบน: ห่างจากค่าปกติของแผงกี่เท่าของความแกว่ง (เกณฑ์ z) · แถบล่าง: ความแปลกของรูปแบบ (เกณฑ์ Isolation Forest)
 * เลยเส้นเกณฑ์ไปทางขวาของแถบใดแถบหนึ่ง = ถูกทัก ตรงกับที่ระบบใช้ตัดสินจริง
 * ------------------------------------------------------------------------- */
function Strip({ title, items, lo, hi, step, ticks, thr, thrText, off, offText, markers, fmt }) {
  const [box, W] = useWidth(640);
  const H = 176, L = 36, R = 14, T = 44, B = 36;
  const pw = W - L - R, ph = H - T - B;
  const nb = Math.round((hi - lo) / step);
  const x = v => L + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * pw;
  const bins = useMemo(() => {
    const b = Array.from({ length: nb }, () => ({ on: 0, off: 0 }));
    for (const it of items) {
      const k = Math.min(nb - 1, Math.max(0, Math.floor((it.v - lo) / step)));
      if (it.on) b[k].on += 1; else b[k].off += 1;
    }
    return b;
  }, [items, lo, step, nb]);
  const max = Math.max(1, ...bins.map(b => b.on + b.off));
  const y0 = T + ph, bw = Math.max(4, pw / nb - 4);
  const hh = c => (c / max) * (ph - 14);
  // ป้ายเกณฑ์: ถ้าเส้นอยู่ชิดขวา ให้ป้ายอยู่ซ้ายเส้น
  const flip = x(thr) > W - R - 150;
  return (
    <div className={`ai-strip ${off ? 'is-off' : ''}`}>
      <div className="ai-chart__plot" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} className="ai-svg" role="img" aria-label={`${title} เกณฑ์ ${fmt(thr)}${off ? ' (ไม่ได้ใช้)' : ''}`}>
          <text x={L} y={16} className="ai-side ai-side--strong">{title}</text>
          {off && <text x={W - R} y={16} textAnchor="end" className="ai-side">{offText}</text>}
          <rect x={x(thr)} y={T - 16} width={W - R - x(thr)} height={ph + 16} className="ai-zone" />
          {bins.map((b, i) => {
            const bx = L + (i * pw) / nb + 2;
            const tot = b.on + b.off;
            return (
              <g key={i}>
                <path d={barPath(bx, y0, bw, hh(b.off), true)} className="v-context" />
                <path d={barPath(bx, y0 - hh(b.off), bw, hh(b.on), true)} className="v-late" />
                {tot > 0 && <text x={bx + bw / 2} y={y0 - hh(tot) - 4} textAnchor="middle" className="ai-count">{tot}</text>}
              </g>
            );
          })}
          <line x1={L} x2={W - R} y1={y0} y2={y0} className="ai-axis" />
          {ticks.map(t => <text key={t} x={x(t)} y={y0 + 16} textAnchor="middle" className="ai-tick">{fmt(t)}</text>)}
          <line x1={x(thr)} x2={x(thr)} y1={T - 20} y2={y0 + 4} className="ai-thr" />
          <text x={x(thr) + (flip ? -6 : 6)} y={T - 8} textAnchor={flip ? 'end' : 'start'} className="ai-thr-label">{thrText}</text>
          {markers.map(m => (
            <g key={m.id}>
              <path d={`M${x(m.v)},${y0 - 2}l-6,-10h12z`} className={m.on ? 'v-late' : 'v-ink'} />
              <text x={x(m.v)} y={y0 - 16} textAnchor="middle" className="ai-now-label">{m.id}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function MeterStrips({ points, method, z, ifThr, current = [] }) {
  const items = useMemo(() => points.map(p => ({ z: p[3], s: p[2], on: isFlagged(p, method, z, ifThr) })), [points, method, z, ifThr]);
  const flagged = items.filter(i => i.on).length;
  const zHi = Math.max(6, Math.ceil(z) + 1);
  const sVals = items.map(i => i.s);
  const sLo = Math.min(0.35, Math.floor(Math.min(...sVals) * 20) / 20);
  const sHi = Math.max(0.8, Math.ceil(Math.max(...sVals, ifThr) * 20) / 20);
  const cur = current.filter(c => c.if_score != null).map(c => ({
    id: c.stall_id, on: c.anomaly, s: c.if_score,
    z: Math.max(Math.abs(c.z_water ?? 0), Math.abs(c.z_elec ?? 0), Math.abs(c.peer_z_water ?? 0) - 1, Math.abs(c.peer_z_elec ?? 0) - 1),
  }));
  const zTicks = Array.from({ length: zHi + 1 }, (_, i) => i);
  const sTicks = [];
  for (let t = Math.ceil(sLo * 10) / 10; t <= sHi + 1e-9; t += 0.1) sTicks.push(Math.round(t * 10) / 10);
  return (
    <figure className="ai-chart">
      <Strip title="1. ห่างจากค่าปกติของแผงเองกี่เท่า" items={items.map(i => ({ v: i.z, on: i.on }))}
        lo={0} hi={zHi} step={0.5} ticks={zTicks} thr={z} thrText={`เกณฑ์ ${z} เท่า → ทัก`} fmt={v => `${v}`}
        off={method === 'if'} offText="วิธีที่เลือกไม่ได้ใช้แถบนี้" markers={cur.map(c => ({ id: c.id, v: c.z, on: c.on }))} />
      <Strip title="2. รูปแบบน้ำ–ไฟแปลกแค่ไหน (AI ให้คะแนน)" items={items.map(i => ({ v: i.s, on: i.on }))}
        lo={sLo} hi={sHi} step={0.05} ticks={sTicks} thr={ifThr} thrText={`เกณฑ์ ${ifThr.toFixed(2)} → ทัก`} fmt={v => v.toFixed(1)}
        off={method === 'z'} offText="วิธีที่เลือกไม่ได้ใช้แถบนี้" markers={cur.map(c => ({ id: c.id, v: c.s, on: c.on }))} />
      <figcaption className="ai-legend">
        <span><i className="ai-swatch v-late-bg" aria-hidden="true" />จะถูกทัก ({flagged})</span>
        <span><i className="ai-swatch v-context-bg" aria-hidden="true" />ผ่าน ({items.length - flagged})</span>
        <span><i className="ai-swatch ai-swatch--zone" aria-hidden="true" />เลยเส้นเกณฑ์</span>
        {cur.length > 0 && <span><i className="ai-dotkey v-ink-bg" aria-hidden="true" />ค่าที่กำลังจดรอบนี้</span>}
      </figcaption>
    </figure>
  );
}
