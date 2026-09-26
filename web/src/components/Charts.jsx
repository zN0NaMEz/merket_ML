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
