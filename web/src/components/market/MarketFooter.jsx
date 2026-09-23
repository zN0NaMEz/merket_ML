import { Link } from 'react-router-dom';
import Ambient from '../Ambient';
import Reveal from './Reveal';
import { scrollToId } from './motion';
import { FOOTER } from '../../data/market';

/** ท้ายหน้าโทนเข้ม เก็บทางเดินทั้งหมดของเว็บไว้ที่เดียว */
export default function MarketFooter() {
  return (
    <footer className="mk-foot">
      <Ambient tone="dark" density={0.7} />
      <div className="mk-wrap">
        <Reveal className="mk-foot__top">
          <div className="mk-foot__brand">
            <span className="mk-foot__mark" aria-hidden="true">บ</span>
            <p className="mk-foot__name">ตลาดบัญญัติทรัพย์</p>
            <p className="mk-foot__en">BANYATSAP MARKET · EST. 1976</p>
          </div>
          <p className="mk-foot__statement">{FOOTER.statement}</p>
        </Reveal>

        <div className="mk-foot__cols">
          {FOOTER.columns.map(col => (
            <nav key={col.title} className="mk-foot__col" aria-label={col.title}>
              <h2>{col.title}</h2>
              <ul>
                {col.links.map(l => (
                  <li key={l.label}>
                    {l.to ? (
                      <Link to={l.to}>{l.label}</Link>
                    ) : (
                      <a href={`#${l.hash}`} onClick={e => { e.preventDefault(); scrollToId(l.hash); }}>{l.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="mk-foot__col">
            <h2>ติดต่อ</h2>
            <dl className="mk-foot__contact">
              {FOOTER.contact.map(c => (
                <div key={c.label}><dt>{c.label}</dt><dd>{c.value}</dd></div>
              ))}
            </dl>
          </div>

          <div className="mk-foot__col">
            <h2>ติดตาม</h2>
            <ul className="mk-foot__social">
              {FOOTER.social.map(s => <li key={s}>{s} · @banyatsap</li>)}
            </ul>
          </div>
        </div>

        <div className="mk-foot__bar">
          <p>© {new Date().getFullYear()} ตลาดบัญญัติทรัพย์ สงวนลิขสิทธิ์</p>
          <p className="mk-foot__sys">
            <Link to="/login">ระบบบริหารตลาด</Link>
            <span aria-hidden="true">·</span>
            <Link to="/walkin">จองแผงรายวัน</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
