import { useState } from 'react';
import { api } from '../../api';
import { baht, thDate } from '../../format';
import { Loader, Modal, PageHead, SecHead, useApp, useData } from '../../ui';
import PayModal from '../../components/PayModal';
import Receipt from '../../components/Receipt';
import { DatePicker, SpotGrid } from '../walkin/SpotPicker';

// 2.0 จัดการพื้นที่ผู้ค้าขาจร: เจ้าหน้าที่จองแทนและรับเงินสดหรือ QR ได้
export default function WalkinAdmin() {
  const { toast } = useApp();
  const [date, setDate] = useState('');
  const st = useData(() => api(`/staff/walkin${date ? `?date=${date}` : ''}`), [date]);
  const [spot, setSpot] = useState(null);
  const [form, setForm] = useState({ full_name: '', phone: '', product: '', method: 'cash' });
  const [pay, setPay] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const submit = async (e, d) => {
    e.preventDefault();
    try {
      const r = await api('/staff/walkin/bookings', { method: 'POST', body: { ...form, date: d.date, spot } });
      setSpot(null); setForm({ full_name: '', phone: '', product: '', method: form.method });
      if (r.payment.status === 'successful') setReceipt(r.payment); else setPay(r.payment);
      st.reload();
    } catch (ex) { toast(ex.message, 'bad'); }
  };
  return (
    <Loader state={st}>{d => {
      const taken = d.spots.filter(s => s.taken).length;
      return (
        <div className="page">
          <PageHead title="พื้นที่ผู้ค้าขาจร" tag="2.0 จองแผง/พื้นที่" sub={`ค่าพื้นที่ ${baht(d.fee)} บาท/วัน · ${thDate(d.date)} จองแล้ว ${taken}/${d.spots.length} ล็อก`} />
          <section className="panel">
            <SecHead title="เลือกวันที่" />
            <DatePicker dates={d.dates} value={d.date} onChange={setDate} />
          </section>
          <section className="panel">
            <SecHead title="ผังล็อกหน้าตลาด" sub="กดล็อกที่ว่างเพื่อจองให้ผู้ค้าที่มาติดต่อที่สำนักงาน" />
            <SpotGrid spots={d.spots} value={spot} onPick={setSpot} showNames />
          </section>
          {spot && (
            <Modal title={`จองล็อก ${spot} วันที่ ${thDate(d.date)}`} onClose={() => setSpot(null)}>
              <form className="stack" onSubmit={e => submit(e, d)}>
                <label className="field">ชื่อ-นามสกุล<input className="input" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></label>
                <label className="field">เบอร์โทร<input className="input" required inputMode="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
                <label className="field">ประเภทสินค้า
                  <select className="input" required value={form.product} onChange={e => setForm({ ...form, product: e.target.value })}>
                    <option value="">เลือก</option>{d.products.map(p => <option key={p}>{p}</option>)}
                  </select>
                </label>
                <div className="seg" role="radiogroup" aria-label="วิธีรับเงิน">
                  <label><input type="radio" name="method" checked={form.method === 'cash'} onChange={() => setForm({ ...form, method: 'cash' })} />รับเงินสด</label>
                  <label><input type="radio" name="method" checked={form.method === 'qr'} onChange={() => setForm({ ...form, method: 'qr' })} />QR PromptPay</label>
                </div>
                <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="btn" onClick={() => setSpot(null)}>ยกเลิก</button>
                  <button className="btn primary">บันทึกการจอง {baht(d.fee)} บาท</button>
                </div>
              </form>
            </Modal>
          )}
          {pay && <PayModal payment={pay} onClose={() => { setPay(null); st.reload(); }} />}
          {receipt && <Modal title="รับเงินสดแล้ว" onClose={() => setReceipt(null)} footer={<button className="btn" onClick={() => window.print()}>พิมพ์</button>}><Receipt p={receipt} /></Modal>}
        </div>
      );
    }}</Loader>
  );
}
