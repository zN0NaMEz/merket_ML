import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Loader, PageHead, SecHead, useApp, useData } from '../../ui';

const FIELDS = [
  ['water_rate', 'ค่าน้ำ (บาท/หน่วย)'], ['elec_rate', 'ค่าไฟ (บาท/หน่วย)'], ['walkin_fee', 'ค่าพื้นที่ขาจร (บาท/วัน)'],
  ['pay_within_days', 'ชำระภายใน (วันหลังออกบิล)'], ['overdue_days', 'ส่งต่อเจ้าหน้าที่เมื่อค้างเกิน (วัน)'],
];

export default function Rates() {
  const { toast } = useApp();
  const st = useData(() => api('/settings'));
  const [rates, setRates] = useState(null);
  const [rents, setRents] = useState(null);
  useEffect(() => {
    if (st.data) { setRates(st.data.rates); setRents(Object.fromEntries(st.data.stall_types.map(t => [t.code, t.monthly_rent]))); }
  }, [st.data]);
  const save = async e => {
    e.preventDefault();
    try { await api('/owner/rates', { method: 'PUT', body: { rates, rents } }); toast('บันทึกอัตราค่าบริการแล้ว มีผลกับบิลรอบถัดไป'); st.reload(); } catch (ex) { toast(ex.message, 'bad'); }
  };
  return (
    <Loader state={st}>{d => rates && (
      <form className="page" onSubmit={save}>
        <PageHead title="อัตราค่าบริการ" tag="ตั้งค่า" sub="การเปลี่ยนแปลงมีผลกับบิลที่ออกรอบถัดไป บิลที่ออกแล้วไม่เปลี่ยน" right={<button className="btn primary">บันทึก</button>} />
        <section className="panel">
          <SecHead title="ค่าน้ำไฟและเงื่อนไขการชำระ" />
          <div className="fields">{FIELDS.map(([k, label]) => (
            <label className="field" key={k}>{label}<input className="input" type="number" min="1" required value={rates[k]} onChange={e => setRates({ ...rates, [k]: Number(e.target.value) })} /></label>
          ))}</div>
        </section>
        <section className="panel">
          <SecHead title="ค่าเช่าแผงรายเดือน" />
          <div className="fields">{d.stall_types.map(t => (
            <label className="field" key={t.code}>โซน {t.zone} · {t.name}<input className="input" type="number" min="0" required value={rents[t.code]} onChange={e => setRents({ ...rents, [t.code]: Number(e.target.value) })} /></label>
          ))}</div>
        </section>
      </form>
    )}</Loader>
  );
}
