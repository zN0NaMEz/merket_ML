import { baht, periodShort } from '../format';

const SERIES = [['rent', 's-rent', 'ค่าแผง'], ['water', 's-water', 'ค่าน้ำ'], ['elec', 's-elec', 'ค่าไฟ'], ['walkin', 's-walk', 'ผู้ค้าขาจร']];

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= v);
}

export function RevenueChart({ data }) {
  const W = 720, H = 260, L = 56, B = 28, T = 10;
  const max = niceMax(Math.max(...data.map(d => d.rent + d.water + d.elec + d.walkin)));
  const bw = (W - L - 10) / data.length;
  const y = v => H - B - (v / max) * (H - B - T);
  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="รายได้รายเดือนย้อนหลัง 12 เดือน แยกตามประเภท">
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line className="axis" x1={L} x2={W - 6} y1={y(max * f)} y2={y(max * f)} strokeDasharray={f ? '2 4' : ''} />
            <text x={L - 8} y={y(max * f) + 4} textAnchor="end">{baht(max * f / 1000)}k</text>
          </g>
        ))}
        {data.map((d, i) => {
          let acc = 0;
          const x = L + i * bw + bw * 0.18;
          const total = d.rent + d.water + d.elec + d.walkin;
          return (
            <g key={d.month}>
              <title>{`${periodShort(d.month)}: รวม ${baht(total)} บาท`}</title>
              {SERIES.map(([k, cls]) => {
                const h = (d[k] / max) * (H - B - T);
                acc += d[k];
                return h > 0 ? <rect key={k} className={cls} x={x} width={bw * 0.64} y={y(acc)} height={h} /> : null;
              })}
              <text x={x + bw * 0.32} y={H - 8} textAnchor="middle">{periodShort(d.month)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="legend">{SERIES.map(([k, cls, name]) => <span key={k}><i className={cls} />{name}</span>)}</figcaption>
    </figure>
  );
}

/** กราฟกระจาย log-ratio การใช้น้ำ (แกน x) และไฟ (แกน y) เทียบค่าเฉลี่ยของแผงเอง */
export function AnomalyScatter({ history = [], current = [] }) {
  const W = 520, H = 360, P = 36, R = 1.8;
  const sx = v => P + ((Math.max(-R, Math.min(R, v)) + R) / (2 * R)) * (W - 2 * P);
  const sy = v => H - P - ((Math.max(-R, Math.min(R, v)) + R) / (2 * R)) * (H - 2 * P);
  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="การกระจายของการใช้น้ำไฟเทียบประวัติ จุดสีแดงคือค่าที่ AI ตรวจว่าผิดปกติ">
        <rect x={P} y={P} width={W - 2 * P} height={H - 2 * P} fill="none" className="axis" stroke="currentColor" />
        <line className="axis" x1={sx(0)} x2={sx(0)} y1={P} y2={H - P} />
        <line className="axis" x1={P} x2={W - P} y1={sy(0)} y2={sy(0)} />
        <text x={W / 2} y={H - 8} textAnchor="middle">การใช้น้ำ เทียบค่าเฉลี่ยของแผง (log) →</text>
        <text x={12} y={H / 2} textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>การใช้ไฟ (log) →</text>
        <text x={sx(0.9)} y={sy(0.9) - 6}>ใช้มากผิดปกติ</text>
        <text x={sx(-1.7)} y={sy(-1.5)}>ใช้น้อยผิดปกติ</text>
        {history.map((p, i) => <circle key={i} className="pt-hist" cx={sx(p[0])} cy={sy(p[1])} r="2.6" />)}
        {current.map(c => (
          <g key={c.stall_id}>
            <circle className={c.anomaly ? 'pt-bad' : 'pt-ok'} cx={sx(c.x[0])} cy={sy(c.x[1])} r={c.anomaly ? 6 : 4} />
            {c.anomaly && <text x={sx(c.x[0]) + 8} y={sy(c.x[1]) + 4} style={{ fill: 'var(--ink)', fontWeight: 600 }}>{c.stall_id}</text>}
          </g>
        ))}
      </svg>
      <figcaption className="legend">
        <span><i className="pt-hist" style={{ background: 'var(--faint)' }} />ค่าในอดีตที่ใช้เทรน</span>
        <span><i style={{ background: 'var(--ok)' }} />รอบนี้ ปกติ</span>
        <span><i style={{ background: 'var(--danger)' }} />รอบนี้ ผิดปกติ</span>
      </figcaption>
    </figure>
  );
}
