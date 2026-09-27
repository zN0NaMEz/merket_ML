import { Link } from 'react-router-dom';
import { api } from '../../api';
import { baht, periodLabel, thDate, thDateShort, weekday } from '../../format';
import { Loader, useApp, useData } from '../../ui';
import { Bars, Icon, SURE_WORD, Status, because, nb, nextIcon, shareBooking } from './parts';

/* ประโยคเทียบกับเมื่อวาน / เดือนก่อน */
const vs = (now, before, what) => {
  if (now === before) return `เท่ากับ${what}`;
  return now > before ? `มากกว่า${what} ${baht(now - before)} บาท 👍` : `น้อยกว่า${what} ${baht(before - now)} บาท`;
};

/** สิ่งที่ควรทำวันนี้: เรียงเรื่องเร่งก่อน ไม่เกิน 4 ข้อ ทุกข้อกดแล้วทำต่อได้ทันที */
function todoOf(d, toast) {
  const out = [];
  const u = d.unpaid, f = d.forecast, s = d.stalls;
  if (u.overdue_stalls) {
    out.push({ key: 'overdue', tone: 'bad', title: `โทรตามเงิน ${u.overdue_stalls} แผงที่เลยวันครบกำหนด`,
      sub: `รวม ${baht(u.overdue_amount)} บาท ค้างนานสุด ${u.overdue_longest} วัน`, to: '/owner/unpaid', action: 'ดูรายชื่อและโทร' });
  }
  if (f.state === 'ok' && f.late && f.days_left <= 7) {
    out.push({ key: 'remind', tone: 'warn', title: `โทรเตือน ${f.late} แผงที่อาจจ่ายช้า`,
      sub: `ก่อนครบกำหนด ${thDate(f.due_date)} · เป็นการคาดการณ์`, to: '/owner/unpaid?show=soon', action: 'ดูรายชื่อ' });
  }
  if (s.restore_waiting.length) {
    out.push({ key: 'restore', tone: 'warn', title: `แผง ${s.restore_waiting.map(nb).join(', ')} จ่ายแล้ว รอต่อน้ำไฟคืน`,
      sub: 'บอกเจ้าหน้าที่ให้ต่อน้ำไฟให้วันนี้', to: '/owner/stalls', action: 'ดูผังแผง' });
  }
  if (d.leaks.length) {
    const ids = d.leaks.map(l => nb(l.stall_id)).join(', ');
    out.push({ key: 'leak', tone: 'warn', title: d.leaks.length === 1 ? `ให้ช่างไปดูน้ำไฟที่แผง ${ids}` : `ให้ช่างไปดูน้ำไฟ ${d.leaks.length} แผง (${ids})`,
      sub: d.leaks.length === 1 ? d.leaks[0].why : 'มิเตอร์ดูผิดปกติ อาจมีท่อรั่วหรือไฟรั่ว ดูเหตุผลในกล่องคาดการณ์ด้านล่าง', to: '#fc-h', action: 'ดูเหตุผล' });
  }
  if (s.walkin_free_today >= Math.ceil(s.walkin_total / 2)) {
    out.push({ key: 'walkin', tone: 'warn', title: `ล็อกขาจรวันนี้ยังว่าง ${s.walkin_free_today} ล็อก`,
      sub: `ถ้ามีคนจองเพิ่มได้ล็อกละ ${baht(s.walkin_fee)} บาท`, onClick: () => shareBooking(toast), action: 'ส่งลิงก์จองให้ผู้ค้า', icon: 'share' });
  }
  return out.slice(0, 4);
}

/** กล่องคาดการณ์: แยกให้ชัดว่าไม่ใช่ตัวเลขจริง ทุกข้อมีเหตุผลหนึ่งบรรทัดและคำแนะนำ */
function Forecast({ f, leaks }) {
  let body;
  if (f.state === 'ok') {
    body = (
      <div className="o-fc__item">
        {f.late ? (
          <p className="o-fc__say">รอบบิลที่ครบกำหนด <b>{thDate(f.due_date)}</b> (อีก {f.days_left} วัน) คาดว่า <b>{f.late} แผง</b>อาจจ่ายช้า</p>
        ) : (
          <p className="o-fc__say">รอบบิลที่ครบกำหนด <b>{thDate(f.due_date)}</b> คาดว่าทุกแผงจะจ่ายตรงเวลา</p>
        )}
        <p className="o-fc__sure">ความมั่นใจ: <b>{SURE_WORD[f.sure]}</b></p>
        <p className="o-fc__why">{because(f.why)}</p>
        {f.late > 0 && (
          <p className="o-fc__who">
            {f.stalls.slice(0, 3).map((s, i) => <span key={s.stall_id}>{i > 0 && ' · '}<span className="o-nowrap">{nb(s.stall_id)} {s.name}</span></span>)}
            {f.late > 3 ? ` และอีก ${f.late - 3} แผง` : ''}
          </p>
        )}
        {f.maybe > 0 && <p className="o-fc__why">อีก {f.maybe} แผงอาจจ่ายช้าเหมือนกัน แต่ระบบยังไม่แน่ใจ</p>}
        {f.unknown > 0 && <p className="o-fc__why">อีก {f.unknown} แผงเป็นผู้ค้าใหม่ ข้อมูลยังไม่พอจะคาดการณ์</p>}
        <p className="o-fc__todo"><Icon name="bulb" size={22} />
          {f.late ? 'ควรโทรเตือนก่อนวันครบกำหนด จะได้ไม่ต้องตามทีหลัง' : 'ไม่ต้องทำอะไรเพิ่ม รอดูวันครบกำหนด'}
        </p>
        {f.late > 0 && <Link className="o-btn o-btn--ghost" to="/owner/unpaid?show=soon">ดูรายชื่อ {f.late} แผง{nextIcon}</Link>}
      </div>
    );
  } else if (f.state === 'not_issued') {
    body = (
      <div className="o-fc__item">
        <p className="o-fc__say">บิลค่าเช่าและค่าน้ำไฟเดือน{periodLabel(f.period)} ยังไม่ออก</p>
        <p className="o-fc__todo"><Icon name="bulb" size={22} />ให้เจ้าหน้าที่จดมิเตอร์และออกบิล แล้วระบบจะบอกว่าแผงไหนอาจจ่ายช้า</p>
      </div>
    );
  } else if (f.state === 'none') {
    body = (
      <div className="o-fc__item">
        <p className="o-fc__say">รอบบิลนี้ทุกแผงจ่ายครบแล้ว ไม่มีอะไรต้องคาดการณ์</p>
        <p className="o-fc__why">ลองดูใหม่ในอีก {f.wait_days} วัน หลังออกบิลรอบถัดไป</p>
      </div>
    );
  } else {
    body = (
      <div className="o-fc__item">
        <p className="o-fc__say">ข้อมูลยังไม่พอ ลองดูใหม่ในอีก {f.wait_days} วัน</p>
        <p className="o-fc__why">ระบบต้องเห็นประวัติการจ่ายเงินมากกว่านี้ก่อน ถึงจะบอกได้ว่าแผงไหนอาจจ่ายช้า</p>
      </div>
    );
  }
  return (
    <section className="o-fc" aria-labelledby="fc-h">
      <h2 id="fc-h" className="o-fc__head"><Icon name="bulb" />การคาดการณ์ <small>ยังไม่ใช่ตัวเลขจริง</small></h2>
      {body}
      {leaks.map(l => (
        <div className="o-fc__item" key={l.stall_id}>
          <p className="o-fc__say">มิเตอร์แผง <b>{nb(l.stall_id)}</b> อาจมีปัญหา</p>
          <p className="o-fc__sure">ความมั่นใจ: <b>{SURE_WORD[l.sure]}</b></p>
          <p className="o-fc__why">{because(l.why)}</p>
          <p className="o-fc__todo"><Icon name="bulb" size={22} />ควรให้ช่างไปตรวจท่อน้ำหรือสายไฟที่แผงนี้ ก่อนบิลเดือนหน้าจะสูงอีก</p>
        </div>
      ))}
    </section>
  );
}

export default function Today() {
  const { toast } = useApp();
  const st = useData(() => api('/owner/today'));
  return (
    <Loader state={st}>{d => {
      const m = d.money, u = d.unpaid, s = d.stalls;
      const todo = todoOf(d, toast);
      const vacant = s.regular_total - s.regular_used;
      const headline = u.overdue_stalls
        ? { tone: 'bad', text: `วันนี้มี ${u.overdue_stalls} แผงค้างจ่ายเลยกำหนด ต้องตามเงิน` }
        : todo.length ? { tone: 'warn', text: `วันนี้มี ${todo.length} เรื่องที่ควรดู` }
          : { tone: 'good', text: 'วันนี้ตลาดเรียบร้อยดี ไม่มีเรื่องต้องจัดการ 👍' };
      return (
        <div className="o-page">
          <h1 className="o-h1">วันนี้เป็นยังไงบ้าง</h1>
          <p className={`o-headline o-headline--${headline.tone}`}><Icon name={headline.tone} size={28} />{headline.text}</p>

          <div className="o-cards">
            <article className="o-card">
              <h2 className="o-card__label">เงินเข้าวันนี้</h2>
              <p className="o-card__num">{baht(m.today)} <small>บาท</small></p>
              <p className="o-card__say">{m.today || m.yesterday ? vs(m.today, m.yesterday, 'เมื่อวาน') : 'ยังไม่มีเงินเข้าทั้งวันนี้และเมื่อวาน'}</p>
              {m.today > 0 && <p className="o-card__note">ค่าเช่าและค่าน้ำไฟ {baht(m.today_bills)} บาท · ผู้ค้าขาจร {baht(m.today_walkin)} บาท</p>}
            </article>

            <article className={`o-card o-card--${u.overdue_stalls ? 'bad' : 'good'}`}>
              <h2 className="o-card__label">แผงที่ค้างจ่าย</h2>
              <p className="o-card__num">{u.overdue_stalls} <small>แผง</small></p>
              <Status tone={u.overdue_stalls ? 'bad' : 'good'}>{u.overdue_stalls ? 'ต้องตามเงิน' : 'ไม่มีแผงค้างจ่าย'}</Status>
              <p className="o-card__say">
                {u.overdue_stalls ? `เลยวันครบกำหนดแล้ว รวม ${baht(u.overdue_amount)} บาท` : 'ทุกแผงจ่ายตรงเวลา 👍'}
              </p>
              {u.not_due_stalls > 0 && <p className="o-card__note">อีก {u.not_due_stalls} แผงยังไม่ถึงวันครบกำหนด ({thDate(u.next_due)})</p>}
              <Link className="o-btn" to="/owner/unpaid">ดูแผงที่ยังไม่จ่าย{nextIcon}</Link>
            </article>

            <article className={`o-card o-card--${s.walkin_free_today >= Math.ceil(s.walkin_total / 2) ? 'warn' : 'good'}`}>
              <h2 className="o-card__label">ล็อกขาจรที่ว่างวันนี้</h2>
              <p className="o-card__num">{s.walkin_free_today} <small>ล็อก</small></p>
              <Status tone={s.walkin_free_today >= Math.ceil(s.walkin_total / 2) ? 'warn' : 'good'}>
                {s.walkin_free_today === 0 ? 'จองเต็มทุกล็อก' : s.walkin_free_today >= Math.ceil(s.walkin_total / 2) ? 'ยังว่างเยอะ' : 'จองไปเกือบหมดแล้ว'}
              </Status>
              <p className="o-card__say">มีคนจองแล้ว {s.walkin_total - s.walkin_free_today} จาก {s.walkin_total} ล็อก · พรุ่งนี้ว่าง {s.walkin_free_tomorrow} ล็อก</p>
              <p className="o-card__note">แผงเช่ารายเดือน{vacant ? `ว่าง ${vacant} จาก ${s.regular_total} แผง` : `มีคนเช่าครบทั้ง ${s.regular_total} แผง`}</p>
              <Link className="o-btn o-btn--ghost" to="/owner/stalls">ดูผังแผง{nextIcon}</Link>
            </article>

            <article className={`o-card o-card--${m.month >= m.prev_month_same_day ? 'good' : 'warn'}`}>
              <h2 className="o-card__label">เงินเข้าเดือนนี้ (ถึงวันนี้)</h2>
              <p className="o-card__num">{baht(m.month)} <small>บาท</small></p>
              <Status tone={m.month >= m.prev_month_same_day ? 'good' : 'warn'}>{m.month >= m.prev_month_same_day ? 'ดีกว่าเดือนที่แล้ว' : 'น้อยกว่าเดือนที่แล้ว'}</Status>
              <p className="o-card__say">{vs(m.month, m.prev_month_same_day, 'เดือนที่แล้วช่วงเดียวกัน')}</p>
            </article>
          </div>

          {/* จอคอม: สิ่งที่ควรทำ + เงินเข้า 7 วันอยู่ซ้าย การคาดการณ์อยู่ขวา · มือถือเรียงลงมาตามลำดับเดิม */}
          <div className="o-split o-split--today">
          <section className="o-sec o-sec--todo" aria-labelledby="todo-h">
            <h2 id="todo-h" className="o-h2">สิ่งที่ควรทำวันนี้</h2>
            {todo.length === 0 ? (
              <p className="o-headline o-headline--good"><Icon name="good" size={28} />วันนี้ไม่มีเรื่องต้องจัดการ 👍</p>
            ) : (
              <ol className="o-todo">
                {todo.map(t => (
                  <li key={t.key} className={`o-todo__item o-todo__item--${t.tone}`}>
                    <Status tone={t.tone} />
                    <p className="o-todo__title">{t.title}</p>
                    <p className="o-todo__sub">{t.sub}</p>
                    {t.to?.startsWith('#')
                      ? <a className="o-btn o-btn--ghost" href={t.to}>{t.action}{nextIcon}</a>
                      : t.to
                      ? <Link className="o-btn" to={t.to}>{t.action}{nextIcon}</Link>
                      : <button type="button" className="o-btn" onClick={t.onClick}><Icon name={t.icon} size={22} />{t.action}</button>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <Forecast f={d.forecast} leaks={d.leaks} />

          <section className="o-sec o-sec--week" aria-labelledby="week-h">
            <h2 id="week-h" className="o-h2">เงินเข้า 7 วันล่าสุด</h2>
            <Bars label="เงินเข้าแต่ละวัน" rows={[...m.week].reverse().map((w, i) => ({
              key: w.date, value: w.total, now: i === 0,
              label: i === 0 ? 'วันนี้' : i === 1 ? 'เมื่อวาน' : `${weekday(w.date)} ${thDateShort(w.date)}`,
            }))} />
            <p className="o-note">นับเงินที่จ่ายเข้าระบบจริงในแต่ละวัน ทั้งค่าเช่า ค่าน้ำไฟ และผู้ค้าขาจร</p>
          </section>
          </div>
        </div>
      );
    }}</Loader>
  );
}
