import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Loader, useApp, useData } from '../../ui';
import { Icon, shareBooking } from './parts';

/* สถานะของแผงเช่ารายเดือน: สี + ไอคอน + คำ */
const PAY = {
  paid: { tone: 'good', icon: 'good', word: 'จ่ายแล้ว' },
  waiting: { tone: 'warn', icon: 'clock', word: 'รอจ่าย' },
  overdue: { tone: 'bad', icon: 'bad', word: 'ค้างจ่าย' },
  empty: { tone: 'empty', icon: null, word: 'ว่าง' },
};

export default function Stalls() {
  const { toast } = useApp();
  const st = useData(() => api('/owner/stalls'));
  return (
    <Loader state={st}>{d => {
      const free = d.walkin_today.filter(s => !s.taken).length;
      const zones = [...new Set(d.stalls.map(s => s.zone))];
      const count = k => d.stalls.filter(s => s.pay === k).length;
      return (
        <div className="o-page">
          <h1 className="o-h1">แผงตลาด</h1>

          <div className="o-split o-split--stalls">
          <section className="o-sec o-sec--walk" aria-labelledby="walk-h">
            <h2 id="walk-h" className="o-h2">ล็อกขาจรวันนี้</h2>
            <p className="o-lead">ว่าง <b>{free} ล็อก</b> จาก {d.walkin_today.length} ล็อก · พรุ่งนี้ว่าง {d.walkin_tomorrow_free} ล็อก</p>
            <ul className="o-tiles">
              {d.walkin_today.map(s => (
                <li key={s.spot} className={`o-tile o-tile--${s.taken ? 'taken' : 'free'}`}>
                  <b>{s.spot}</b>
                  <span>{s.taken ? (s.name ? s.name.split(' ')[0] : 'มีคนจอง') : 'ว่าง'}</span>
                  {s.taken && !s.paid && <small>รอจ่าย</small>}
                </li>
              ))}
            </ul>
            {free > 0 && (
              <button type="button" className="o-btn" onClick={() => shareBooking(toast)}>
                <Icon name="share" size={22} />ส่งลิงก์จองให้ผู้ค้า
              </button>
            )}
          </section>

          <section className="o-sec" aria-labelledby="reg-h">
            <h2 id="reg-h" className="o-h2">แผงเช่ารายเดือน</h2>
            <ul className="o-legend" aria-label="ความหมายของสี">
              {['paid', 'waiting', 'overdue', 'empty'].map(k => (
                <li key={k} className={`o-legend__i o-legend__i--${PAY[k].tone}`}>
                  {PAY[k].icon ? <Icon name={PAY[k].icon} size={20} /> : <i aria-hidden="true" />}{PAY[k].word} {count(k)} แผง
                </li>
              ))}
            </ul>
            {zones.map(z => {
              const list = d.stalls.filter(s => s.zone === z);
              return (
                <div className="o-zone" key={z}>
                  <h3 className="o-h3">โซน {z} · {list[0].zone_name}</h3>
                  <ul className="o-tiles">
                    {list.map(s => {
                      const p = PAY[s.pay];
                      const body = (<>
                        <b>{s.id}</b>
                        <span>{p.icon && <Icon name={p.icon} size={18} />}{p.word}</span>
                        {s.cut && <small>{s.restore_waiting ? 'รอต่อน้ำไฟ' : 'ตัดน้ำไฟ'}</small>}
                      </>);
                      return (
                        <li key={s.id} className={`o-tile o-tile--${p.tone}`}>
                          {s.pay === 'overdue' || s.pay === 'waiting'
                            ? <Link to={s.pay === 'overdue' ? '/owner/unpaid' : '/owner/unpaid?show=soon'} aria-label={`แผง ${s.id} ${p.word} ดูรายละเอียด`}>{body}</Link>
                            : body}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>
          </div>
        </div>
      );
    }}</Loader>
  );
}
