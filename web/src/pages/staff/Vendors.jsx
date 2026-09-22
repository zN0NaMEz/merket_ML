import { useState } from 'react';
import { api } from '../../api';
import { baht, diffDays, phoneFmt, thDate } from '../../format';
import { Chip, Loader, Modal, PageHead, useApp, useData } from '../../ui';

// 1.0 จัดการผู้ค้าและสัญญา (D1, D3)
export default function Vendors() {
  const { toast } = useApp();
  const st = useData(() => api('/staff/vendors'));
  const [adding, setAdding] = useState(false);
  const renew = async v => {
    try { const r = await api(`/staff/contracts/${v.contract_id}/renew`, { method: 'POST', body: { months: 12 } }); toast(`ต่อสัญญาแผง ${v.stall_id} ถึง ${thDate(r.end_date)}`); st.reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Loader state={st}>{d => (
      <div className="page">
        <PageHead title="ผู้ค้าและสัญญาเช่า" tag="1.0 จัดการผู้ค้าและสัญญา" sub={`ผู้ค้าประจำ ${d.vendors.length} ราย`}
          right={<button className="btn primary" onClick={() => setAdding(true)}>เพิ่มผู้ค้าใหม่</button>} />
        <section className="panel">
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>แผง</th><th>ผู้ค้า</th><th>ประเภท</th><th>เช่าตั้งแต่</th><th>สัญญาถึง</th><th className="num">ค้างชำระ</th><th>น้ำไฟ</th><th /></tr></thead>
            <tbody>{d.vendors.map(v => {
              const left = v.end_date ? diffDays(v.end_date, d.today) : null;
              return (
                <tr key={v.id}>
                  <td><span className="plate">{v.stall_id}</span></td>
                  <td><div className="cell-name">{v.full_name}</div><small>{phoneFmt(v.phone)} · ผู้ใช้ {v.username}</small></td>
                  <td>{v.type_name}</td>
                  <td className="nowrap">{thDate(v.since)}</td>
                  <td className="nowrap">{thDate(v.end_date)} {left != null && left < 0 ? <Chip tone="bad">หมดอายุ</Chip> : left != null && left <= 60 ? <Chip tone="warn">อีก {left} วัน</Chip> : null}</td>
                  <td className="num">{v.overdue_total ? <span className="t-bad">{baht(v.overdue_total)}</span> : '-'}</td>
                  <td>{v.utility_status === 'cut' ? <Chip tone="bad">ถูกตัด</Chip> : <Chip>ปกติ</Chip>}</td>
                  <td>{v.contract_id && <button className="btn sm" onClick={() => renew(v)}>ต่อสัญญา 1 ปี</button>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </section>
        {adding && <AddVendor today={d.today} onClose={ok => { setAdding(false); if (ok) st.reload(); }} />}
      </div>
    )}</Loader>
  );
}

function AddVendor({ today, onClose }) {
  const { toast } = useApp();
  const vac = useData(() => api('/staff/stalls/vacant'));
  const [f, setF] = useState({ full_name: '', phone: '', stall_id: '', start_date: today, months: 12, deposit: '', username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setBusy(true);
    try { const r = await api('/staff/vendors', { method: 'POST', body: { ...f, deposit: f.deposit === '' ? undefined : Number(f.deposit) } }); toast(`เพิ่มผู้ค้า ${r.code} แล้ว`); onClose(true); } catch (ex) { toast(ex.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal title="เพิ่มผู้ค้าใหม่และทำสัญญาเช่า" onClose={() => onClose(false)} wide>
      <form onSubmit={submit} className="stack">
        <div className="fields">
          <label className="field">แผงที่ว่าง
            <select className="input" required value={f.stall_id} onChange={set('stall_id')}>
              <option value="">เลือกแผง</option>
              {vac.data?.stalls.map(s => <option key={s.id} value={s.id}>{s.id} · {s.type_name} · {baht(s.monthly_rent)} บาท</option>)}
            </select>
          </label>
          <label className="field">ชื่อ-นามสกุล<input className="input" required value={f.full_name} onChange={set('full_name')} /></label>
          <label className="field">เบอร์โทร<input className="input" required inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
          <label className="field">วันเริ่มสัญญา<input className="input" type="date" required value={f.start_date} onChange={set('start_date')} /></label>
          <label className="field">ระยะสัญญา (เดือน)<input className="input" type="number" min="1" max="60" value={f.months} onChange={set('months')} /></label>
          <label className="field">เงินประกัน (เว้นว่าง = 2 เดือน)<input className="input" type="number" min="0" value={f.deposit} onChange={set('deposit')} /></label>
          <label className="field">ชื่อผู้ใช้สำหรับเข้าแอป<input className="input" required autoComplete="off" value={f.username} onChange={set('username')} /></label>
          <label className="field">รหัสผ่านเริ่มต้น (อย่างน้อย 8 ตัว)<input className="input" required minLength={8} autoComplete="new-password" value={f.password} onChange={set('password')} /></label>
        </div>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={() => onClose(false)}>ยกเลิก</button>
          <button className="btn primary" disabled={busy}>บันทึก</button>
        </div>
      </form>
    </Modal>
  );
}
