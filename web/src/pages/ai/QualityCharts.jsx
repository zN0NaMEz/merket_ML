import { useEffect, useRef, useState } from 'react';
import { featureLabel } from '../../ai/featureLabels';
import { thDateTime } from '../../ai/behind';

/*
 * กราฟของแท็บคุณภาพโมเดล (RodeMap 3.4) วาดด้วย SVG ตามความกว้างจริง
 * สีชุดข้อมูล LR/RF ใช้ categorical slot 1–2 (ฟ้า/ส้ม) ที่ผ่าน validate_palette บนพื้นทั้งสองธีม
 * ส้มบนพื้นครีมได้คอนทราสต์ 2.99:1 จึงมีป้ายชื่อติดเส้นและตารางข้อมูลเสมอ
 */

function useWidth(initial = 560) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const pct = v => `${Math.round(v * 100)}%`;
const f3 = v => (v == null ? '–' : Number(v).toFixed(3));

/* ---------- Confusion matrix ---------- */
export function ConfusionMatrix({ c, nTest }) {
  const cells = [
    { k: 'tp', row: 'จ่ายช้าจริง', col: 'ระบบเตือน', word: 'เตือนถูก', ok: true },
    { k: 'fn', row: 'จ่ายช้าจริง', col: 'ไม่เตือน', word: 'พลาด (ไม่ได้เตือน)', ok: false },
    { k: 'fp', row: 'จ่ายตรงเวลา', col: 'ระบบเตือน', word: 'เตือนเกิน', ok: false },
    { k: 'tn', row: 'จ่ายตรงเวลา', col: 'ไม่เตือน', word: 'ไม่เตือนถูก', ok: true },
  ];
  return (
    <figure className="bh-cm">
      <table className="bh-cm__table">
        <caption className="visually-hidden">ตารางผลทายของชุดทดสอบ แถวคือผลจริง คอลัมน์คือสิ่งที่ระบบทาย</caption>
        <thead>
          <tr><td /><th scope="col">ระบบเตือน<small>โอกาส ≥ {pct(c.threshold ?? 0.5)}</small></th><th scope="col">ไม่เตือน</th></tr>
        </thead>
        <tbody>
          {['จ่ายช้าจริง', 'จ่ายตรงเวลา'].map(row => (
            <tr key={row}>
              <th scope="row">{row}</th>
              {cells.filter(x => x.row === row).map(x => (
                <td key={x.k} className={x.ok ? 'is-ok' : 'is-miss'}>
                  <b>{c[x.k].toLocaleString('th-TH')}</b><span>{x.word}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="bh-fine">ชุดทดสอบ {nTest ?? c.tp + c.fn + c.fp + c.tn} บิล (25% ที่กันไว้ไม่ให้โมเดลเห็นตอนเทรน) ที่เกณฑ์เตือน {pct(c.threshold ?? 0.5)}</figcaption>
    </figure>
  );
}

/* ---------- Calibration (reliability diagram) ---------- */
export function CalibrationChart({ cal }) {
  const [ref, w] = useWidth(420);
  const W = Math.min(w, 460), H = W, M = { l: 44, r: 12, t: 12, b: 40 };
  const pts = cal.prob_pred.map((p, i) => ({ p, t: cal.prob_true[i], n: cal.counts?.[i] ?? null })).filter(d => d.n == null || d.n > 0);
  const [active, setActive] = useState(null);
  const x = v => M.l + v * (W - M.l - M.r);
  const y = v => M.t + (1 - v) * (H - M.t - M.b);
  const maxN = Math.max(1, ...pts.map(d => d.n || 1));
  const r = n => 4 + 6 * Math.sqrt((n || maxN) / maxN);
  const a = active == null ? null : pts[active];
  return (
    <figure className="bh-qc">
      <p className="bh-mc__read" role="status" aria-live="polite">
        {a ? <span>ระบบบอกโอกาสจ่ายช้าราว <b>{pct(a.p)}</b> · จ่ายช้าจริง <b>{pct(a.t)}</b>{a.n != null && ` (${a.n} บิล)`}</span>
          : <span>ชี้หรือแตะจุดเพื่อดูว่าที่ระบบบอก กับที่เกิดจริง ห่างกันแค่ไหน</span>}
      </p>
      <div ref={ref} className="bh-qc__wrap">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="กราฟเทียบโอกาสที่ระบบบอกกับสัดส่วนที่จ่ายช้าจริง">
          {[0, 0.25, 0.5, 0.75, 1].map(v => (
            <g key={v}>
              <line x1={x(0)} x2={x(1)} y1={y(v)} y2={y(v)} className="bh-mc__grid" />
              <text x={M.l - 6} y={y(v)} className="bh-mc__tick" textAnchor="end" dominantBaseline="middle">{pct(v)}</text>
              <text x={x(v)} y={H - M.b + 16} className="bh-mc__tick" textAnchor="middle">{pct(v)}</text>
            </g>
          ))}
          <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="bh-qc__diag" />
          <text x={x(0.62)} y={y(0.62) - 8} className="bh-mc__tick" transform={`rotate(-45 ${x(0.62)} ${y(0.62) - 8})`} textAnchor="middle">ตรงพอดี</text>
          <polyline points={pts.map(d => `${x(d.p)},${y(d.t)}`).join(' ')} className="bh-qc__line" />
          {pts.map((d, i) => (
            <circle key={i} cx={x(d.p)} cy={y(d.t)} r={r(d.n)} className={`bh-qc__pt ${active === i ? 'is-on' : ''}`} />
          ))}
          {pts.map((d, i) => (
            <circle key={`h${i}`} cx={x(d.p)} cy={y(d.t)} r={Math.max(18, r(d.n) + 8)} className="bh-mc__hit" tabIndex={0} role="button"
              aria-label={`ระบบบอก ${pct(d.p)} จ่ายช้าจริง ${pct(d.t)}${d.n != null ? ` จาก ${d.n} บิล` : ''}`}
              onPointerEnter={() => setActive(i)} onClick={() => setActive(i)} onFocus={() => setActive(i)} />
          ))}
          <text x={(x(0) + x(1)) / 2} y={H - 4} className="bh-mc__tick" textAnchor="middle">โอกาสที่ระบบบอก</text>
        </svg>
      </div>
      <figcaption className="bh-fine">
        จุดอยู่บนเส้นทแยง = ระบบบอก 30% แล้วจ่ายช้าจริงราว 30% · จุดใหญ่ = มีบิลในช่วงนั้นมาก
        {cal.brier != null && <> · Brier score {f3(cal.brier)}</>}{cal.gap != null && <> · ห่างจากเส้นเฉลี่ย {Math.round(cal.gap * 100)} จุด%</>}
      </figcaption>
      <details className="bh-mc__table">
        <summary>ดูเป็นตาราง</summary>
        <table className="bh-table">
          <thead><tr><th scope="col">ระบบบอก (เฉลี่ย)</th><th scope="col">จ่ายช้าจริง</th><th scope="col">จำนวนบิล</th></tr></thead>
          <tbody>{pts.map((d, i) => <tr key={i}><td>{pct(d.p)}</td><td>{pct(d.t)}</td><td>{d.n ?? '–'}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

/* ---------- ความสำคัญระดับโมเดล (permutation importance) ---------- */
export function ImportanceBars({ items }) {
  const max = Math.max(...items.map(i => i.value + (i.std || 0)), 1e-9);
  return (
    <figure className="bh-imp">
      <ul className="bh-imp__list">
        {items.map(i => {
          const v = Math.max(0, i.value);
          return (
            <li key={i.feature} className="bh-imp__row" aria-label={`${featureLabel(i.feature)}: AUC ลดลง ${f3(i.value)} ± ${f3(i.std)}`}>
              <span className="bh-imp__label">{featureLabel(i.feature)}</span>
              <span className="bh-imp__track" aria-hidden="true">
                <i className="bh-imp__bar" style={{ width: `${(v / max) * 100}%` }} />
                {i.std > 0 && (
                  <i className="bh-imp__err" style={{ left: `${(Math.max(0, i.value - i.std) / max) * 100}%`, width: `${((Math.min(max, i.value + i.std) - Math.max(0, i.value - i.std)) / max) * 100}%` }} />
                )}
              </span>
              <span className="bh-imp__val">{i.value <= 0.0005 ? '≈ 0' : f3(i.value)}</span>
            </li>
          );
        })}
      </ul>
      <figcaption className="bh-fine">
        ตัวเลข = AUC ของชุดทดสอบลดลงเท่าไรเมื่อสลับค่าปัจจัยนั้นแบบสุ่ม (permutation importance) · เส้นบาง = ± SD จากการสลับหลายรอบ · ≈ 0 = โมเดลแทบไม่ใช้ปัจจัยนี้
      </figcaption>
    </figure>
  );
}

/* ---------- AUC ข้ามรอบเทรน ---------- */
const SERIES = { risk_lr: { label: 'LR', cls: 's1' }, risk_rf: { label: 'RF', cls: 's2' } };

export function AucHistory({ runs, owner }) {
  const [ref, w] = useWidth(640);
  const W = w, H = W < 480 ? 220 : 250, M = { l: 44, r: 54, t: 16, b: 30 };
  const types = [...new Set(runs.map(r => r.model_type || 'risk'))];
  // LR และ RF ถูกเทรนพร้อมกันในการกดเทรนครั้งเดียว (ห่างกันไม่กี่วินาที) จึงวางตาม "รอบที่" ของแต่ละโมเดล ไม่ใช่เวลาจริง
  const seq = new Map();
  for (const type of types) runs.filter(r => (r.model_type || 'risk') === type).forEach((r, i) => seq.set(r, i));
  const rounds = Math.max(1, ...[...seq.values()].map(i => i + 1));
  const vals = runs.flatMap(r => [r.auc, r.cv_auc ? r.cv_auc.mean - r.cv_auc.sd : null]).filter(v => v != null);
  const lo = Math.max(0, Math.min(0.5, Math.floor((Math.min(...vals) - 0.05) * 20) / 20));
  const x = r => M.l + (rounds === 1 ? (W - M.l - M.r) / 2 : (seq.get(r) * (W - M.l - M.r)) / (rounds - 1));
  const y = v => M.t + (1 - (v - lo) / (1 - lo)) * (H - M.t - M.b);
  const ticks = []; for (let v = lo; v <= 1.0001; v += lo <= 0.5 ? 0.1 : 0.05) ticks.push(Math.round(v * 100) / 100);
  const [active, setActive] = useState(runs.length - 1);
  const a = runs[active];
  // ป้ายชื่อท้ายเส้นห่างกันอย่างน้อย 16px ไม่ให้ทับกันเมื่อ AUC ของสองโมเดลใกล้กัน
  const labelY = {};
  const ends = types.map(t => ({ t, last: runs.filter(r => (r.model_type || 'risk') === t).at(-1) })).filter(e => e.last)
    .map(e => ({ ...e, y: y(e.last.auc) })).sort((p, q) => p.y - q.y);
  ends.forEach((e, i) => { labelY[e.t] = i && e.y - labelY[ends[i - 1].t] < 16 ? labelY[ends[i - 1].t] + 16 : e.y; });
  return (
    <figure className="bh-qc">
      <p className="bh-mc__read" role="status" aria-live="polite">
        {a && <span><b>{owner ? '' : `${SERIES[a.model_type]?.label || ''} · `}{thDateTime(a.trained_at)}</b> {owner ? `คะแนน ${a.auc?.toFixed(2) ?? '–'} จากเต็ม 1.00` : `AUC ${f3(a.auc)}`}
          {!owner && a.cv_auc && <> · CV {f3(a.cv_auc.mean)} ± {f3(a.cv_auc.sd)}</>}{a.is_synthetic ? ' · ข้อมูลจำลอง' : ''}</span>}
      </p>
      <div ref={ref} className="bh-qc__wrap">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={owner ? 'คะแนนความแม่นของแต่ละครั้งที่เทรน' : 'AUC ของแต่ละรอบเทรน'}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="bh-mc__grid" />
              <text x={M.l - 6} y={y(t)} className="bh-mc__tick" textAnchor="end" dominantBaseline="middle">{t.toFixed(2)}</text>
            </g>
          ))}
          {types.map(type => {
            const rs = runs.filter(r => (r.model_type || 'risk') === type);
            const s = SERIES[type] || { label: '', cls: 's1' };
            const last = rs.at(-1);
            return (
              <g key={type} className={`bh-qc__series bh-qc__series--${s.cls}`}>
                {rs.map(r => r.cv_auc && !owner && (
                  <line key={`e${r.id}`} x1={x(r)} x2={x(r)} y1={y(Math.min(1, r.cv_auc.mean + r.cv_auc.sd))}
                    y2={y(Math.max(lo, r.cv_auc.mean - r.cv_auc.sd))} className="bh-qc__err" />
                ))}
                {rs.length > 1 && <polyline points={rs.map(r => `${x(r)},${y(r.auc)}`).join(' ')} className="bh-qc__hline" />}
                {rs.map(r => <circle key={r.id} cx={x(r)} cy={y(r.auc)} r="5" className="bh-qc__hpt" />)}
                {last && !owner && <text x={x(last) + 9} y={labelY[type]} dominantBaseline="middle" className="bh-qc__lbl">{s.label} {f3(last.auc)}</text>}
              </g>
            );
          })}
          {runs.map((r, i) => (
            <circle key={`h${r.id}`} cx={x(r)} cy={y(r.auc)} r="16" className="bh-mc__hit" tabIndex={0} role="button"
              aria-label={`${owner ? '' : SERIES[r.model_type]?.label || ''} ${thDateTime(r.trained_at)} ${owner ? 'คะแนน' : 'AUC'} ${f3(r.auc)}`}
              onPointerEnter={() => setActive(i)} onClick={() => setActive(i)} onFocus={() => setActive(i)} />
          ))}
          {rounds > 1 && Array.from({ length: rounds }, (_, i) => (
            <text key={`r${i}`} x={M.l + (i * (W - M.l - M.r)) / (rounds - 1)} y={H - 8} className="bh-mc__tick" textAnchor="middle">
              {rounds <= 8 || i === 0 || i === rounds - 1 ? `รอบ ${i + 1}` : ''}
            </text>
          ))}
        </svg>
      </div>
      {!owner && (
        <figcaption className="bh-mc__legend">
          {types.map(t => <span key={t}><i className={`bh-mc__sw bh-qc__sw--${SERIES[t]?.cls}`} aria-hidden="true" />{t === 'risk_lr' ? 'Logistic Regression (LR)' : 'Random Forest (RF)'}</span>)}
          <span>เส้นตั้ง = CV ค่าเฉลี่ย ± SD</span>
        </figcaption>
      )}
      {rounds === 1 && <p className="bh-fine">มีรอบเทรนเดียว จะเห็นแนวโน้มเมื่อเทรนรอบถัดไป</p>}
      <details className="bh-mc__table">
        <summary>ดูเป็นตาราง</summary>
        <table className="bh-table">
          <thead><tr><th scope="col">เทรนเมื่อ</th>{!owner && <th scope="col">โมเดล</th>}<th scope="col">{owner ? 'คะแนน' : 'AUC'}</th>{!owner && <th scope="col">CV ± SD</th>}<th scope="col">ข้อมูล</th></tr></thead>
          <tbody>{runs.map(r => (
            <tr key={r.id}><td>{thDateTime(r.trained_at)}</td>{!owner && <td>{SERIES[r.model_type]?.label}</td>}<td>{f3(r.auc)}</td>
              {!owner && <td>{r.cv_auc ? `${f3(r.cv_auc.mean)} ± ${f3(r.cv_auc.sd)}` : '–'}</td>}<td>{r.is_synthetic ? 'จำลอง' : 'จริง'}</td></tr>
          ))}</tbody>
        </table>
      </details>
    </figure>
  );
}
