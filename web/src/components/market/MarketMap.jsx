import { useMemo, useState } from 'react';
import Reveal from './Reveal';
import SectionHeading from './SectionHeading';
import { useMarket } from './store';
import { IconArrow } from './icons';
import { SELLERS, ZONES } from '../../data/market';

const ALL = 'ทั้งหมด';

/** ผังตลาด เลือกโซนเพื่อดูว่าแผงไหนอยู่ตรงไหน และกรองตามประเภทสินค้า */
export default function MarketMap() {
  const [zoneId, setZoneId] = useState(ZONES[0].id);
  const [filter, setFilter] = useState(ALL);
  const { setDetail } = useMarket();

  const zone = ZONES.find(z => z.id === zoneId) || ZONES[0];
  const tags = useMemo(() => [ALL, ...Array.from(new Set(ZONES.flatMap(z => z.stalls.map(s => s.tag))))], []);
  const stalls = zone.stalls.filter(s => filter === ALL || s.tag === filter);

  return (
    <section className="mk-section mk-map" id="visit" aria-labelledby="mk-map-title">
      <div className="mk-wrap">
        <SectionHeading
          index="06"
          en="FIND YOUR WAY AROUND"
          id="mk-map-title"
          lines={['ผังตลาด', 'และทางเดิน']}
          note="ตลาดแบ่งเป็นสี่โซน เดินจากประตูหน้าไปสุดทางใช้เวลาราวสิบนาที เลือกโซนเพื่อดูว่ามีใครอยู่ตรงไหน"
        />

        <div className="mk-map__grid">
          <Reveal className="mk-map__plan">
            <svg viewBox="0 0 400 300" role="img" aria-label="ผังตลาดแบ่งเป็นสี่โซน A ถึง D" className="mk-map__svg">
              <rect x="8" y="8" width="384" height="284" className="mk-map__frame" />
              {ZONES.map(z => (
                <g
                  key={z.id}
                  className={`mk-map__zone ${z.id === zoneId ? 'is-on' : ''}`}
                  onClick={() => setZoneId(z.id)}
                >
                  <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="2" />
                  {z.grid.map((g, i) => (
                    <rect key={i} x={z.x + g[0]} y={z.y + g[1]} width="10" height="8" rx="1" className="mk-map__stall" />
                  ))}
                  <text x={z.x + 10} y={z.y + 20} className="mk-map__id">{z.id}</text>
                  <text x={z.x + 10} y={z.h + z.y - 10} className="mk-map__label">{z.th}</text>
                </g>
              ))}
              <path d="M200 292 V 262" className="mk-map__path" />
              <text x="200" y="285" textAnchor="middle" className="mk-map__gate">ประตูหน้า</text>
              <path d="M8 150 H 392" className="mk-map__aisle" />
            </svg>

            <div className="mk-map__tabs" role="tablist" aria-label="เลือกโซน">
              {ZONES.map(z => (
                <button
                  key={z.id}
                  type="button"
                  role="tab"
                  aria-selected={z.id === zoneId}
                  className={z.id === zoneId ? 'is-on' : ''}
                  onClick={() => setZoneId(z.id)}
                >
                  <em>{z.id}</em>{z.th}
                </button>
              ))}
            </div>
          </Reveal>

          <Reveal className="mk-map__side" delay={120}>
            <div className="mk-map__zonehead">
              <em>{zone.id}</em>
              <div>
                <h3>{zone.th}</h3>
                <p>{zone.desc}</p>
              </div>
            </div>

            <div className="mk-chips" role="group" aria-label="กรองตามประเภทสินค้า">
              {tags.map(t => (
                <button key={t} type="button" className={`mk-chip ${t === filter ? 'is-on' : ''}`} onClick={() => setFilter(t)} aria-pressed={t === filter}>
                  {t}
                </button>
              ))}
            </div>

            {stalls.length === 0 ? (
              <p className="mk-map__empty">โซนนี้ยังไม่มีแผงประเภท “{filter}” ลองเลือกโซนอื่นหรือดูทั้งหมด</p>
            ) : (
              <ul className="mk-map__list">
                {stalls.map(s => {
                  const seller = SELLERS.find(x => x.id === s.seller);
                  return (
                    <li key={s.plate}>
                      <span className="mk-map__plate">{s.plate}</span>
                      <span className="mk-map__info">
                        <strong>{s.name}</strong>
                        <small>{s.tag}</small>
                      </span>
                      {seller ? (
                        <button type="button" className="mk-map__go" onClick={() => setDetail({ kind: 'seller', id: seller.id })}>
                          ดูร้าน<IconArrow />
                        </button>
                      ) : (
                        <span className="mk-map__hours">{s.hours}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
