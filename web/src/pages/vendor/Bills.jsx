import { useState } from 'react';
import { api } from '../../api';
import { baht, periodLabel, thDate } from '../../format';
import { Chip, DueChip, Empty, Loader, Modal, PageHead, SecHead, useApp, useData } from '../../ui';
import PayModal from '../../components/PayModal';
import Receipt from '../../components/Receipt';

export default function Bills() {
  const { toast } = useApp();
  const st = useData(() => api('/vendor/overview'));
  const [sel, setSel] = useState(null);
  const [pay, setPay] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);

  return (
    <Loader state={st}>{d => {
      const selected = sel ?? d.open_bills.map(b => b.id);
      const total = d.open_bills.filter(b => selected.includes(b.id)).reduce((s, b) => s + b.total, 0);
      const toggle = id => setSel(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
      const start = async () => {
        setBusy(true);
        try { setPay(await api('/vendor/payments', { method: 'POST', body: { bill_ids: selected } })); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
      };
      const v = d.vendor;
      return (
        <div className="page">
          <PageHead title="บิลและการชำระเงิน" tag="4.0 รับชำระเงิน"
            sub={<><span className="plate">{v.stall_id}</span>{v.type_name} · ค่าแผง {baht(v.monthly_rent)} บาท/เดือน{v.credit > 0 && <Chip tone="good">ยอดชำระล่วงหน้าคงเหลือ {baht(v.credit)} บาท</Chip>}</>} />
          {v.utility_status === 'cut' && (
            <div className="banner"><strong>แผงนี้ถูกระงับน้ำไฟตั้งแต่ {thDate(v.cut_date)}</strong>
              {v.restore_pending ? 'ชำระครบแล้ว เจ้าหน้าที่กำลังดำเนินการคืนน้ำไฟ' : 'ชำระยอดค้างทั้งหมด ระบบจะแจ้งเจ้าหน้าที่ให้คืนน้ำไฟทันที'}</div>
          )}
          <section className="panel">
            <SecHead title="บิลที่ต้องชำระ" sub="เลือกบิลแล้วชำระผ่าน QR PromptPay" />
            {d.open_bills.length === 0 ? <Empty>ไม่มีบิลค้างชำระ</Empty> : (
              <>
                <div className="bills">
                  {d.open_bills.map(b => (
                    <label className="bill" key={b.id}>
                      <input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggle(b.id)} />
                      <div>
                        <div className="bill-title"><strong>{b.kind === 'advance' ? `ชำระล่วงหน้า${b.label}` : `บิล${periodLabel(b.period)}`}</strong><DueChip bill={b} today={d.today} /></div>
                        {b.kind === 'monthly' && (
                          <div className="bill-lines">
                            <span>ค่าแผง</span><span>{baht(b.rent)}</span>
                            {b.credit_used > 0 && <><span>หักยอดชำระล่วงหน้า</span><span>-{baht(b.credit_used)}</span></>}
                            <span>ค่าน้ำ {b.use_water} หน่วย × {b.water_rate}</span><span>{baht(b.water_amount)}</span>
                            <span>ค่าไฟ {b.use_elec} หน่วย × {b.elec_rate}</span><span>{baht(b.elec_amount)}</span>
                          </div>
                        )}
                        <small>ครบกำหนด {thDate(b.due_date)}</small>
                      </div>
                      <div className="bill-total">฿{baht(b.total)}</div>
                    </label>
                  ))}
                </div>
                <div className="paybar">
                  <span>ยอดที่เลือก <strong>฿{baht(total)}</strong></span>
                  <button className="btn primary" disabled={!selected.length || busy} onClick={start}>ชำระผ่าน QR PromptPay</button>
                </div>
              </>
            )}
          </section>
          <section className="panel">
            <SecHead title="ประวัติการชำระ" sub="12 รายการล่าสุด" />
            {d.history.length === 0 ? <Empty>ยังไม่มีประวัติ</Empty> : (
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>รายการ</th><th>ครบกำหนด</th><th>วันที่ชำระ</th><th className="num">ยอด</th><th /></tr></thead>
                <tbody>{d.history.map(h => (
                  <tr key={h.id}>
                    <td>{h.kind === 'advance' ? `ชำระล่วงหน้า${h.label}` : `บิล${periodLabel(h.period)}`}</td>
                    <td className="nowrap">{h.kind === 'advance' ? '-' : thDate(h.due_date)}</td>
                    <td className="nowrap">{thDate(h.paid_date)} {h.kind === 'monthly' && h.paid_date > h.due_date && <Chip tone="warn">ช้า</Chip>}</td>
                    <td className="num">{baht(h.total)}</td>
                    <td>{h.payment_id && <button className="btn sm" onClick={async () => setReceipt(await api(`/payments/${h.payment_id}?t=${h.token}`))}>ใบเสร็จ</button>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
          {pay && <PayModal payment={pay} onClose={() => { setPay(null); setSel(null); st.reload(); }} />}
          {receipt && <Modal title="ใบเสร็จรับเงิน" onClose={() => setReceipt(null)} footer={<button className="btn" onClick={() => window.print()}>พิมพ์</button>}><Receipt p={receipt} /></Modal>}
        </div>
      );
    }}</Loader>
  );
}
