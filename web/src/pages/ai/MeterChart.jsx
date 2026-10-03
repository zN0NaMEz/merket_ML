import { useEffect, useId, useRef, useState } from 'react';
import { periodShort } from '../../format';
import { bandPosition, meterTip } from '../../ai/featureLabels';

/*
 * กราฟการใช้น้ำ/ไฟย้อนหลังของแผงเดียว พร้อมแถบช่วงปกติ (RodeMap 3.3)
 * - แถบ = ค่าเฉลี่ย ± k × SD (k = เกณฑ์ z ที่ใช้ทักจริง) จากผลตรวจที่เก็บไว้ ไม่เรียก ML
 * - จุดที่ตรวจเดือนนี้: ถ้าอยู่นอกช่วงปกติ ใช้รูปข้าวหลามตัดสีแดง (ต่างทั้งสีและรูปทรง) ในช่วงปกติใช้วงกลมสีหลัก
 * - ชี้เมาส์ แตะ หรือกด Tab ไปที่จุดเพื่อดูรายละเอียด (มือถือไม่มี hover) · เปิดหน้ามาจะแสดงรายละเอียดของจุดเดือนนี้ไว้ก่อน
 *   รายละเอียดอยู่ในแถบเหนือกราฟ ไม่ลอยทับปุ่มอื่น
 * - วาดตามความกว้างจริง (ResizeObserver) ตัวหนังสือบนแกนจึงไม่เล็กลงบนมือถือ
 * - มีตารางข้อมูลชุดเดียวกันสำหรับโปรแกรมอ่านหน้าจอ
 */
const M = { l: 40, r: 14, t: 14, b: 30 };

function niceTicks(max) {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= raw) || p * 10;
  const top = Math.ceil(max / step) * step;          // เส้นบนสุดต้องไม่ต่ำกว่าค่าสูงสุด
  const out = [];
  for (let v = 0; v <= top + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export default function MeterChart({ history, current, band, unitLabel, compact }) {
  const id = useId();
  const wrap = useRef(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 210 : 250;
  const pts = [
    ...history.map(h => ({ period: h.period, value: h.value, flagged: h.flagged, current: false })),
    { period: current.period, value: current.value, current: true, flagged: current.flagged },
  ];
  const [active, setActive] = useState(pts.length - 1);
  const pos = bandPosition(current.value, band);
  const out = pos === 'above' || pos === 'below';

  const vals = pts.map(p => p.value).filter(v => v != null);
  const yMax = Math.max(1, ...vals, band?.high ?? 0) * 1.12;
  const ticks = niceTicks(yMax);
  const top = ticks.at(-1);
  const x = i => M.l + (pts.length === 1 ? (W - M.l - M.r) / 2 : (i * (W - M.l - M.r)) / (pts.length - 1));
  const y = v => M.t + (1 - v / top) * (H - M.t - M.b);
  const step = pts.length > 1 ? (W - M.l - M.r) / (pts.length - 1) : W - M.l - M.r;
  const line = pts.map((p, i) => (p.value == null ? null : `${x(i)},${y(p.value)}`)).filter(Boolean);
  const labelEvery = Math.max(1, Math.ceil(pts.length / Math.max(3, Math.floor((W - M.l - M.r) / (compact ? 70 : 56)))));
  const tip = i => meterTip({ value: pts[i].value, band, label: periodShort(pts[i].period), current: pts[i].current });
  const a = pts[active];

  return (
    <figure className="bh-mc">
      {a && (
        <p className={`bh-mc__read ${a.current && out ? 'is-flag' : ''}`} role="status" aria-live="polite">
          <b>{a.current ? `${unitLabel}เดือนนี้` : periodShort(a.period)}</b>
          <span>{tip(active)}</span>
        </p>
      )}
      <div className="bh-mc__wrap" ref={wrap}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="bh-mc__svg" role="img" aria-labelledby={`${id}-cap`}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="bh-mc__grid" />
              <text x={M.l - 8} y={y(t)} className="bh-mc__tick" textAnchor="end" dominantBaseline="middle">{t.toLocaleString('th-TH')}</text>
            </g>
          ))}
          {band && (
            <>
              <rect x={M.l} width={W - M.l - M.r} y={y(Math.min(band.high, top))} height={Math.max(0, y(band.low) - y(Math.min(band.high, top)))} className="bh-mc__band" />
              <line x1={M.l} x2={W - M.r} y1={y(band.mean)} y2={y(band.mean)} className="bh-mc__mean" />
            </>
          )}
          <polyline points={line.join(' ')} className="bh-mc__line" />
          {pts.map((p, i) => {
            if (p.value == null) return null;
            const cx = x(i), cy = y(p.value);
            if (p.current && out) {
              return <path key={i} d={`M${cx} ${cy - 10} L${cx + 10} ${cy} L${cx} ${cy + 10} L${cx - 10} ${cy} Z`} className="bh-mc__flag" />;
            }
            if (p.current) return <circle key={i} cx={cx} cy={cy} r="7" className="bh-mc__now" />;
            return <circle key={i} cx={cx} cy={cy} r="4.5" className={`bh-mc__pt ${p.flagged ? 'is-past-flag' : ''}`} />;
          })}
          {pts.map((p, i) => (i % labelEvery === 0 || p.current) && (
            <text key={`l${i}`} x={x(i)} y={H - 10} textAnchor="middle" className={`bh-mc__tick ${p.current ? 'is-now' : ''}`}>
              {p.current ? 'เดือนนี้' : periodShort(p.period)}
            </text>
          ))}
          {/* พื้นที่รับการชี้/แตะ กว้างเท่าระยะระหว่างจุด ใหญ่กว่าตัวจุดมาก */}
          {pts.map((p, i) => (
            <rect key={`h${i}`} x={x(i) - step / 2} y={M.t} width={step} height={H - M.t - M.b} className="bh-mc__hit"
              tabIndex={0} role="button" aria-label={tip(i)} aria-pressed={active === i}
              onPointerEnter={() => setActive(i)} onClick={() => setActive(i)} onFocus={() => setActive(i)} />
          ))}
          {a?.value != null && <line x1={x(active)} x2={x(active)} y1={M.t} y2={H - M.b} className="bh-mc__cross" />}
        </svg>
      </div>
      <figcaption id={`${id}-cap`} className="bh-mc__legend">
        {band && <span><i className="bh-mc__sw bh-mc__sw--band" aria-hidden="true" />ช่วงปกติของแผงนี้ ({band.low.toLocaleString('th-TH')}–{band.high.toLocaleString('th-TH')} หน่วย)</span>}
        <span><i className="bh-mc__sw bh-mc__sw--pt" aria-hidden="true" />{unitLabel}เดือนก่อน ๆ</span>
        <span>
          <i className={`bh-mc__sw ${out ? 'bh-mc__sw--flag' : 'bh-mc__sw--now'}`} aria-hidden="true" />
          {out ? 'เดือนนี้ (นอกช่วงปกติ)' : 'เดือนนี้'}
        </span>
      </figcaption>
      <details className="bh-mc__table">
        <summary>ดูเป็นตาราง</summary>
        <table className="bh-table">
          <thead><tr><th scope="col">เดือน</th><th scope="col">ใช้ (หน่วย)</th><th scope="col">หมายเหตุ</th></tr></thead>
          <tbody>
            {pts.map(p => (
              <tr key={p.period}>
                <td>{periodShort(p.period)}{p.current ? ' (ตรวจ)' : ''}</td>
                <td>{p.value == null ? '–' : p.value.toLocaleString('th-TH')}</td>
                <td>{p.current ? (out ? 'นอกช่วงปกติ' : 'ในช่วงปกติ') : p.flagged ? 'เคยถูกทัก' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
