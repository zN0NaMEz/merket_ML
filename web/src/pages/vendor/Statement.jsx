import { useState } from 'react';
import { api } from '../../api';
import { baht, pct, periodLabel, thDate, yearsMonths } from '../../format';
import { Loader, PageHead, useData } from '../../ui';

// 6.0 ออกเอกสารสรุปการชำระรายเดือน สำหรับยื่นกู้
export default function Statement() {
  const [months, setMonths] = useState(6);
  const st = useData(() => api(`/vendor/statement?months=${months}`), [months]);
  return (
    <div className="page">
      <PageHead title="เอกสารสรุปการชำระเพื่อยื่นกู้" tag="6.0 ออกเอกสาร" right={<>
        <div className="seg" role="radiogroup" aria-label="ช่วงเวลา">
          {[6, 12].map(m => <label key={m}><input type="radio" name="m" checked={months === m} onChange={() => setMonths(m)} />{m} เดือน</label>)}
        </div>
        <button className="btn primary" onClick={() => window.print()}>พิมพ์ / บันทึก PDF</button>
      </>} />
      <Loader state={st}>{d => (
        <article className="doc">
          <h2>หนังสือรับรองประวัติการชำระค่าเช่าแผง</h2>
          <div className="doc-org">ตลาดบัญญัติทรัพย์ · ออกเมื่อ {thDate(d.today)}</div>
          <p>ขอรับรองว่า <b>{d.vendor.full_name}</b> เป็นผู้เช่าแผง <b>{d.vendor.stall_id}</b> ประเภท{d.vendor.type_name} ตั้งแต่ {thDate(d.vendor.since)} (ระยะเวลา {yearsMonths(d.summary.tenure_days)}) มีประวัติการชำระค่าเช่าแผง ค่าน้ำ และค่าไฟ ย้อนหลัง {d.months} เดือน ดังนี้</p>
          <div className="sum">
            <div><small>ยอดที่ชำระแล้ว</small><b>{baht(d.summary.total_paid)} บาท</b></div>
            <div><small>เฉลี่ยต่อเดือน</small><b>{baht(d.summary.avg_monthly)} บาท</b></div>
            <div><small>ชำระตรงเวลา</small><b>{d.summary.on_time}/{d.summary.count} ({pct(d.summary.on_time_rate)})</b></div>
            <div><small>ยอดค้าง</small><b>{baht(d.summary.outstanding)} บาท</b></div>
          </div>
          <table><thead><tr><th>รอบบิล</th><th className="num">ยอด (บาท)</th><th>ครบกำหนด</th><th>วันที่ชำระ</th><th>สถานะ</th></tr></thead>
            <tbody>{d.bills.map(b => (
              <tr key={b.period}><td>{periodLabel(b.period)}</td><td className="num">{baht(b.total)}</td><td>{thDate(b.due_date)}</td><td>{thDate(b.paid_date)}</td>
                <td>{b.status !== 'paid' ? 'ยังไม่ชำระ' : b.paid_date <= b.due_date ? 'ตรงเวลา' : 'ชำระช้า'}</td></tr>
            ))}</tbody></table>
          <p>เอกสารนี้ออกจากระบบบริหารตลาดบัญญัติทรัพย์ ตรวจสอบได้ที่สำนักงานตลาด</p>
          <div className="sign"><div>เจ้าหน้าที่สำนักงานตลาด</div></div>
        </article>
      )}</Loader>
    </div>
  );
}
