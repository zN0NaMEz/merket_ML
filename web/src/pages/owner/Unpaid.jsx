import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { baht, phoneFmt, thDate } from '../../format';
import { Loader, useData } from '../../ui';
import { Icon, SURE_WORD, Status, because } from './parts';

/** ลำดับในรายการที่ยังไม่ถึงกำหนด: อาจจ่ายช้า (มั่นใจ) → อาจจ่ายช้า (ยังไม่แน่ใจ) → อื่น ๆ */
const rank = g => (!g.forecast?.late ? 0 : g.forecast.sure === 'unsure' ? 1 : 2);

/** รวมบิลของแผงเดียวกันเป็นการ์ดเดียว (บางแผงค้างหลายเดือน) */
function byStall(rows) {
  const m = new Map();
  for (const r of rows) {
    const g = m.get(r.stall_id) || { stall_id: r.stall_id, name: r.full_name, phone: r.phone, total: 0, bills: 0, days: -Infinity,
      due: r.due_date, cut: r.utility_status === 'cut', forecast: null };
    g.total += r.total;
    g.bills += 1;
    g.days = Math.max(g.days, r.days);
    if (r.due_date < g.due) g.due = r.due_date;
    if (r.forecast?.late != null && (!g.forecast || r.forecast.late)) g.forecast = r.forecast;
    m.set(r.stall_id, g);
  }
  return [...m.values()];
}

function StallCard({ g, overdue }) {
  const tel = String(g.phone || '').replace(/\D/g, '');
  const sms = `แจ้งเตือนจากตลาดบัญญัติทรัพย์ แผง ${g.stall_id} ยอดค่าเช่าและค่าน้ำไฟ ${baht(g.total)} บาท `
    + (overdue ? 'เลยวันครบกำหนดแล้ว รบกวนชำระด้วยครับ/ค่ะ' : `ครบกำหนดวันที่ ${thDate(g.due)} ครับ/ค่ะ`);
  const f = g.forecast;
  return (
    <li className={`o-stall o-stall--${overdue ? 'bad' : f?.late ? 'warn' : 'plain'}`}>
      <div className="o-stall__top">
        <span className="o-plate">{g.stall_id}</span>
        <div>
          <p className="o-stall__name">{g.name}</p>
          <p className="o-stall__amt">{overdue ? 'ค้าง' : 'ต้องจ่าย'} <b>{baht(g.total)} บาท</b>{g.bills > 1 ? ` (${g.bills} เดือน)` : ''}</p>
        </div>
      </div>
      {overdue
        ? <Status tone="bad">เลยวันครบกำหนดมา {g.days} วัน</Status>
        : <p className="o-stall__due"><Icon name="clock" size={22} />ครบกำหนด {thDate(g.due)} (อีก {-g.days} วัน)</p>}
      {g.cut && <p className="o-stall__cut"><Icon name="bad" size={22} />ถูกตัดน้ำไฟอยู่</p>}
      {!overdue && f?.late && (
        <div className="o-stall__fc">
          <p><b>คาดการณ์:</b> อาจจ่ายช้า · ความมั่นใจ: <b>{SURE_WORD[f.sure]}</b></p>
          <p>{because(f.why)} · ควรโทรเตือนก่อนวันครบกำหนด</p>
        </div>
      )}
      {!overdue && f?.late === false && <p className="o-stall__ok"><Icon name="good" size={22} />คาดว่าจะจ่ายตรงเวลา</p>}
      <div className="o-stall__acts">
        {tel && <a className="o-btn" href={`tel:${tel}`}><Icon name="phone" size={22} />โทร {phoneFmt(g.phone)}</a>}
        {tel && <a className="o-btn o-btn--ghost" href={`sms:${tel}?body=${encodeURIComponent(sms)}`}><Icon name="message" size={22} />ส่งข้อความเตือน</a>}
      </div>
    </li>
  );
}

export default function Unpaid() {
  const st = useData(() => api('/owner/outstanding'));
  const [params, setParams] = useSearchParams();
  return (
    <Loader state={st}>{d => {
      const over = byStall(d.rows.filter(r => r.status === 'overdue')).sort((a, b) => b.days - a.days);
      // ยังไม่ถึงกำหนด: แผงที่คาดว่าอาจจ่ายช้าขึ้นก่อน
      const soon = byStall(d.rows.filter(r => r.status === 'unpaid'))
        .sort((a, b) => rank(b) - rank(a) || a.stall_id.localeCompare(b.stall_id));
      const show = params.get('show') === 'soon' || (!over.length && soon.length) ? 'soon' : 'over';
      const list = show === 'over' ? over : soon;
      const lateSoon = soon.filter(g => g.forecast?.late && g.forecast.sure !== 'unsure').length;
      return (
        <div className="o-page">
          <h1 className="o-h1">แผงที่ยังไม่จ่าย</h1>
          <div className="o-seg" role="tablist" aria-label="เลือกรายการ">
            <button type="button" role="tab" aria-selected={show === 'over'} className={show === 'over' ? 'is-on' : ''}
              onClick={() => setParams({}, { replace: true })}>เลยกำหนดแล้ว<br /><b>{over.length} แผง</b></button>
            <button type="button" role="tab" aria-selected={show === 'soon'} className={show === 'soon' ? 'is-on' : ''}
              onClick={() => setParams({ show: 'soon' }, { replace: true })}>ยังไม่ถึงกำหนด<br /><b>{soon.length} แผง</b></button>
          </div>

          {show === 'over' && over.length > 0 && (
            <p className="o-headline o-headline--bad"><Icon name="bad" size={28} />รวมค้าง {baht(over.reduce((s, g) => s + g.total, 0))} บาท โทรตามได้จากปุ่มในแต่ละแผง</p>
          )}
          {show === 'soon' && lateSoon > 0 && (
            <p className="o-headline o-headline--warn"><Icon name="warn" size={28} />คาดว่า {lateSoon} แผงอาจจ่ายช้า (อยู่บนสุด) เป็นการคาดการณ์ ยังไม่ใช่เรื่องจริง</p>
          )}

          {list.length === 0 ? (
            <p className="o-headline o-headline--good"><Icon name="good" size={28} />
              {show === 'over' ? 'ไม่มีแผงที่เลยกำหนด 👍' : 'ไม่มีบิลที่รอจ่าย'}
            </p>
          ) : (
            <ul className="o-stalls">{list.map(g => <StallCard key={g.stall_id} g={g} overdue={show === 'over'} />)}</ul>
          )}
        </div>
      );
    }}</Loader>
  );
}
