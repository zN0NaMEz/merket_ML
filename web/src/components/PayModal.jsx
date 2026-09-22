import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { baht } from '../format';
import { Modal, useApp } from '../ui';
import Receipt from './Receipt';

const STEPS = [
  'สร้างรายการชำระเงิน',
  'ขอ QR Code จากระบบชำระเงิน',
  'สแกนจ่ายผ่านแอปธนาคาร',
  'ระบบชำระเงินแจ้งผล (Webhook)',
  'บันทึกการชำระและอัปเดตสถานะบิล',
  'ออกใบเสร็จอิเล็กทรอนิกส์',
];

/**
 * หน้าชำระเงินผ่าน QR (ตาม Sequence Diagram "ชำระเงินผ่านแอป")
 * ถามสถานะจาก API ทุก 3 วินาที ซึ่ง API จะตรวจกับ Omise อีกชั้น (เผื่อ webhook มาไม่ถึง)
 */
export default function PayModal({ payment: initial, title = 'ชำระเงินผ่าน QR PromptPay', onClose }) {
  const { toast, bump } = useApp();
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (p.status !== 'pending') return undefined;
    const t = setInterval(async () => {
      try { setP(await api(`/payments/${p.id}?t=${p.token}`)); } catch { /* ลองใหม่รอบถัดไป */ }
    }, 3000);
    return () => clearInterval(t);
  }, [p.id, p.token, p.status]);

  useEffect(() => {
    if (p.status === 'successful' && !done.current) { done.current = true; bump(); toast(`ชำระสำเร็จ ${baht(p.amount)} บาท`); }
  }, [p.status, p.amount, bump, toast]);

  const simulate = async outcome => {
    setBusy(true);
    try { setP(await api(`/payments/${p.id}/simulate?t=${p.token}`, { method: 'POST', body: { outcome } })); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const close = async () => {
    if (p.status === 'pending') { try { await api(`/payments/${p.id}/cancel?t=${p.token}`, { method: 'POST' }); } catch { /* ignore */ } }
    onClose(p.status === 'successful');
  };

  if (p.status === 'successful') {
    return (
      <Modal title="ชำระเงินสำเร็จ" onClose={close} footer={<><button className="btn no-print" onClick={() => window.print()}>พิมพ์</button><button className="btn primary" onClick={close}>เสร็จสิ้น</button></>}>
        <ol className="steps">{STEPS.map(s => <li key={s} className="done">{s}</li>)}</ol>
        <Receipt p={p} />
        {p.restore_pending && <div className="banner info"><strong>แจ้งเจ้าหน้าที่คืนน้ำไฟแล้ว</strong>ยอดค้างชำระครบ ระบบส่งเรื่องให้เจ้าหน้าที่คืนน้ำไฟแผง {p.stall_id}</div>}
      </Modal>
    );
  }
  const failed = ['failed', 'expired', 'cancelled'].includes(p.status);
  const cur = 2; // ขั้นที่ 1-2 เสร็จเมื่อได้ QR แล้ว
  return (
    <Modal title={title} onClose={close} wide
      footer={<button className="btn" onClick={close}>{failed ? 'ปิด' : 'ยกเลิกรายการ'}</button>}>
      <div className="pay">
        <div className="qr-card">
          {p.qr_path && !failed ? <img src={p.qr_path} alt={`QR PromptPay ยอด ${baht(p.amount)} บาท`} /> : <div style={{ width: 180, height: 180, display: 'grid', placeItems: 'center' }}>QR หมดอายุ</div>}
          <div className="qr-amt">฿{baht(p.amount)}</div>
          <small>อ้างอิง {p.ref_no}</small>
          <small>{p.method}</small>
        </div>
        <div className="stack">
          <ol className="steps" aria-label="ขั้นตอนการชำระเงิน">
            {STEPS.map((s, i) => <li key={s} className={i < cur ? 'done' : i === cur ? (failed ? 'fail' : 'cur') : ''}>{s}</li>)}
          </ol>
          {failed
            ? <p className="pay-status bad">รายการ{p.status === 'expired' ? 'หมดอายุ' : p.status === 'cancelled' ? 'ถูกยกเลิก' : 'ไม่สำเร็จ'}{p.failure_message ? `: ${p.failure_message}` : ''} ยังไม่มีการตัดเงิน</p>
            : <p className="pay-status">เปิดแอปธนาคาร สแกน QR นี้ (บนมือถือให้บันทึกภาพหน้าจอแล้วเลือกจากคลังภาพในแอปธนาคาร) ระบบจะอัปเดตเองเมื่อได้รับผล</p>}
          {p.warning && <p className="hint">{p.warning}</p>}
          {p.test_mode && !failed && (
            <div className="banner warn">
              <strong>โหมดทดสอบ</strong>
              <span className="hint">{p.provider === 'omise' ? 'ใช้ Omise test key ไม่มีเงินจริง ปุ่มด้านล่างเรียก mark_as_paid / mark_as_failed ของ Omise (หรือกด Actions ใน Omise Dashboard)' : 'ยังไม่ได้ตั้งค่า Omise ระบบใช้ผู้ให้บริการจำลอง QR นี้สแกนจ่ายจริงไม่ได้'}</span>
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn primary" disabled={busy} onClick={() => simulate('paid')}>จำลอง: สแกนจ่ายสำเร็จ</button>
                <button className="btn" disabled={busy} onClick={() => simulate('failed')}>จำลอง: ชำระไม่สำเร็จ</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
