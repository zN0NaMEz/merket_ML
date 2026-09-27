import { useEffect, useState } from 'react';
import { api } from '../../api';
import { baht } from '../../format';
import { Loader, useApp, useData } from '../../ui';
import { Icon } from './parts';

/* ช่องตั้งราคา: ชื่อ + หน่วย + คำอธิบายสั้น ๆ ว่าตัวเลขนี้ใช้ทำอะไร */
const FIELDS = [
  ['water_rate', 'ค่าน้ำ', 'บาท ต่อหน่วย', 'คิดจากเลขมิเตอร์น้ำที่ใช้ในเดือนนั้น'],
  ['elec_rate', 'ค่าไฟ', 'บาท ต่อหน่วย', 'คิดจากเลขมิเตอร์ไฟที่ใช้ในเดือนนั้น'],
  ['walkin_fee', 'ค่าล็อกขาจร', 'บาท ต่อวัน', 'ผู้ค้าขาจรจ่ายตอนจองล็อก'],
  ['pay_within_days', 'ให้จ่ายภายใน', 'วัน หลังออกบิล', 'บิลออกวันที่ 1 ของเดือน'],
  ['overdue_days', 'ค้างเกินกี่วันให้เจ้าหน้าที่ตาม', 'วัน', 'นับจากวันครบกำหนด'],
];

export default function Rates() {
  const { toast } = useApp();
  const st = useData(() => api('/settings'));
  const [rates, setRates] = useState(null);
  const [rents, setRents] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (st.data) { setRates(st.data.rates); setRents(Object.fromEntries(st.data.stall_types.map(t => [t.code, t.monthly_rent]))); }
  }, [st.data]);
  const save = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/owner/rates', { method: 'PUT', body: { rates, rents } });
      toast('บันทึกราคาแล้ว ใช้กับบิลรอบถัดไป');
      st.reload();
    } catch (ex) { toast(ex.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Loader state={st}>{d => rates && rents && (
      <form className="o-page" onSubmit={save}>
        <h1 className="o-h1">ตั้งราคาค่าเช่า ค่าน้ำ ค่าไฟ</h1>
        <p className="o-headline o-headline--warn"><Icon name="warn" size={28} />ราคาใหม่ใช้กับบิลที่ออกรอบถัดไป บิลที่ออกไปแล้วไม่เปลี่ยน</p>

        <section className="o-sec" aria-labelledby="r-h">
          <h2 id="r-h" className="o-h2">ค่าน้ำไฟและการจ่ายเงิน</h2>
          <div className="o-fields">{FIELDS.map(([k, label, unit, help]) => (
            <label className="o-field" key={k}>
              <span className="o-field__label">{label}</span>
              <span className="o-field__row">
                <input type="number" inputMode="numeric" min="1" required value={rates[k]}
                  onChange={e => setRates({ ...rates, [k]: Number(e.target.value) })} />
                <span>{unit}</span>
              </span>
              <span className="o-field__help">{help}</span>
            </label>
          ))}</div>
        </section>

        <section className="o-sec" aria-labelledby="rent-h">
          <h2 id="rent-h" className="o-h2">ค่าเช่าแผงรายเดือน</h2>
          <div className="o-fields">{d.stall_types.map(t => (
            <label className="o-field" key={t.code}>
              <span className="o-field__label">โซน {t.zone} · {t.name}</span>
              <span className="o-field__row">
                <input type="number" inputMode="numeric" min="0" required value={rents[t.code]}
                  onChange={e => setRents({ ...rents, [t.code]: Number(e.target.value) })} />
                <span>บาท ต่อเดือน</span>
              </span>
              <span className="o-field__help">ตอนนี้ {baht(t.monthly_rent)} บาท</span>
            </label>
          ))}</div>
        </section>

        <button className="o-btn" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกราคา'}</button>
      </form>
    )}</Loader>
  );
}
