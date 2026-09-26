import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, localPref } from '../../api';
import { baht, thDate } from '../../format';
import { Loader, PageHead, SecHead, useApp, useData } from '../../ui';
import PayModal from '../../components/PayModal';
import { DatePicker, SpotGrid } from './SpotPicker';

// ผู้ค้าขาจร: จองพื้นที่ (2.0) และชำระผ่าน QR (4.0) โดยไม่ต้องสมัครสมาชิก
export default function Book() {
  const { toast } = useApp();
  const nav = useNavigate();
  const opt = useData(() => api('/walkin/options'));
  // มาจากผังในคู่มือ: ?spot=F-04&date=2026-09-01 เลือกไว้ให้ถ้ายังว่าง
  const [params] = useSearchParams();
  const wanted = useRef({ date: params.get('date'), spot: params.get('spot') });
  const [date, setDate] = useState(null);
  const [spot, setSpot] = useState(null);
  const [form, setForm] = useState({ full_name: '', phone: localPref.get('bunyat.walkin.phone') || '', product: '' });
  const [pay, setPay] = useState(null);
  const [busy, setBusy] = useState(false);
  const d = date || (opt.data?.dates.includes(wanted.current.date) ? wanted.current.date : opt.data?.dates[0]);
  const av = useData(() => (d ? api(`/walkin/availability?date=${d}`) : Promise.resolve(null)), [d]);
  useEffect(() => { setSpot(null); }, [d]);
  useEffect(() => {
    const want = wanted.current.spot;
    if (!want || !av.data || av.data.date !== d) return;
    // ล็อกที่ขอยังไม่ว่างวันนี้: รอจนผู้ใช้เลือกวันที่ล็อกนั้นว่าง
    if (av.data.spots.some(s => s.spot === want && !s.taken)) { setSpot(want); wanted.current.spot = null; }
  }, [av.data, d]);

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/walkin/bookings', { method: 'POST', body: { ...form, date: d, spot } });
      localPref.set('bunyat.walkin.phone', form.phone);
      setPay(r.payment);
    } catch (ex) { toast(ex.message, 'bad'); av.reload(); } finally { setBusy(false); }
  };

  return (
    <Loader state={opt}>{o => (
      <div className="page">
        <PageHead title="จองพื้นที่หน้าตลาด" tag="2.0 จองแผง/พื้นที่" sub={`ค่าพื้นที่ ${baht(o.fee)} บาทต่อวัน · จองล่วงหน้าได้ ${o.dates.length} วัน`} />
        <section className="panel">
          <SecHead title="1. เลือกวันที่และล็อก" />
          <div className="stack">
            <DatePicker dates={o.dates} value={d} onChange={setDate} />
            {av.data ? <SpotGrid spots={av.data.spots} value={spot} onPick={setSpot} /> : <div className="loading">กำลังโหลด…</div>}
          </div>
        </section>
        <section className="panel">
          <SecHead title="2. ข้อมูลผู้จอง" sub={spot ? `ล็อก ${spot} วันที่ ${thDate(d)}` : 'เลือกล็อกที่ว่างก่อน'} />
          <form onSubmit={submit} className="stack">
            <div className="fields">
              <label className="field">ชื่อ-นามสกุล<input className="input" required minLength={2} value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></label>
              <label className="field">เบอร์โทร<input className="input" required inputMode="tel" pattern="[0-9\- ]{9,12}" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
              <label className="field">ประเภทสินค้า
                <select className="input" required value={form.product} onChange={e => setForm({ ...form, product: e.target.value })}>
                  <option value="">เลือก</option>{o.products.map(p => <option key={p}>{p}</option>)}
                </select>
              </label>
            </div>
            <div className="paybar">
              <span>ค่าพื้นที่ <strong>฿{baht(o.fee)}</strong></span>
              <button className="btn primary" disabled={!spot || busy}>จองและชำระผ่าน QR</button>
            </div>
          </form>
        </section>
        {pay && <PayModal payment={pay} title={`ชำระค่าพื้นที่ ล็อก ${spot}`} onClose={ok => { setPay(null); if (ok) nav('/walkin/my'); else av.reload(); }} />}
      </div>
    )}</Loader>
  );
}
