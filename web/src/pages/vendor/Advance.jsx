import { useState } from 'react';
import { api } from '../../api';
import { baht } from '../../format';
import { Loader, PageHead, useApp, useData } from '../../ui';
import PayModal from '../../components/PayModal';

export default function Advance() {
  const { toast } = useApp();
  const st = useData(() => api('/vendor/overview'));
  const [pay, setPay] = useState(null);
  const start = async plan => {
    try { setPay(await api('/vendor/advance', { method: 'POST', body: { plan } })); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Loader state={st}>{d => {
      const rent = d.vendor.monthly_rent;
      const weekly = Math.round(rent / 4 / 10) * 10;
      return (
        <div className="page">
          <PageHead title="ชำระค่าแผงล่วงหน้า" tag="4.0 รับชำระเงิน" sub="ยอดที่ชำระจะเก็บเป็นเครดิต และหักจากค่าแผงในบิลถัดไปโดยอัตโนมัติ" />
          <div className="banner info"><strong>ยอดชำระล่วงหน้าคงเหลือ {baht(d.vendor.credit)} บาท</strong>ค่าแผง {d.vendor.type_name} เดือนละ {baht(rent)} บาท (ค่าน้ำไฟคิดตามมิเตอร์ทุกเดือน)</div>
          <div className="opt-grid">
            <div className="opt"><span>รายสัปดาห์</span><strong>฿{baht(weekly)}</strong><small>ประมาณ 1 ใน 4 ของค่าแผงรายเดือน</small><button className="btn primary" onClick={() => start('weekly')}>ชำระรายสัปดาห์</button></div>
            <div className="opt"><span>รายเดือน</span><strong>฿{baht(rent)}</strong><small>ครอบคลุมค่าแผงทั้งเดือน</small><button className="btn primary" onClick={() => start('monthly')}>ชำระรายเดือน</button></div>
          </div>
          {pay && <PayModal payment={pay} onClose={() => { setPay(null); st.reload(); }} />}
        </div>
      );
    }}</Loader>
  );
}
