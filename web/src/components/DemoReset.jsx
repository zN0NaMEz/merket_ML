import { useEffect, useState } from 'react';
import { api } from '../api';
import { thDate } from '../format';
import { Modal, SecHead, useApp } from '../ui';

const KEY_STORE = 'bunyat.reseed-key';
const keyStore = {
  get() { try { return sessionStorage.getItem(KEY_STORE) || ''; } catch { return ''; } },
  set(v) { try { sessionStorage.setItem(KEY_STORE, v); } catch { /* private mode */ } },
};

const sec = ms => (ms / 1000).toFixed(1);
const auc = v => (v == null ? '-' : v.toFixed(2));

function errorText(e) {
  if (e.status === 404) return 'เซิร์ฟเวอร์ยังไม่ได้เปิดการรีเซ็ต ต้องตั้งค่า RESEED_KEY ที่ API ก่อน';
  if (e.status === 403 || e.status === 409) return e.message;
  if (e.status === 504 || e.status === 502) return 'เซิร์ฟเวอร์ตอบช้าเกินเวลา ข้อมูลอาจรีเซ็ตไปแล้วบางส่วน ลองกดรีเซ็ตอีกครั้ง';
  return e.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
}

function Result({ r }) {
  const counts = `ผู้ค้า ${r.vendors} ราย · แผง ${r.stalls} แผง · บิล ${r.bills} ใบ · ค่ามิเตอร์ ${r.meters} รายการ`;
  if (r.dry_run) {
    return (
      <div className="reset-result">
        <strong>ทดลองผ่าน ยังไม่มีข้อมูลใดถูกเปลี่ยน</strong>
        <p>สร้างข้อมูลชุดใหม่ได้ครบ ({counts}) ใช้เวลาเขียนฐานข้อมูล {sec(r.db_ms)} วินาที ตอนรีเซ็ตจริงจะเทรน AI ต่ออีกราว 5–40 วินาที</p>
        {r.ml_awake === false && <p className="t-bad">ติดต่อเซิร์ฟเวอร์ AI ไม่ได้ ลองกดทดลองอีกครั้งในอีกสักครู่ก่อนรีเซ็ตจริง</p>}
      </div>
    );
  }
  const ml = r.ml && !r.ml.error;
  return (
    <div className="reset-result">
      <strong>รีเซ็ตเสร็จแล้วใน {sec(r.total_ms ?? r.db_ms)} วินาที</strong>
      <p>{counts}</p>
      <p>วันที่จำลองกลับไปเป็น {thDate(r.demo_date)} และการตั้งค่า AI กลับเป็นค่าเริ่มต้น</p>
      {ml
        ? <p>เทรนโมเดล AI ใหม่แล้ว (AUC {auc(r.ml.auc_lr)} / {auc(r.ml.auc_rf)}) และให้คะแนนบิลที่เปิดอยู่ {r.ml.rescored} ใบ</p>
        : <p className="t-bad">ข้อมูลกลับมาครบแล้ว แต่เทรน AI ไม่สำเร็จ เข้าไปกด “เทรนโมเดลใหม่” ในหน้า AI อีกครั้ง</p>}
    </div>
  );
}

/** ปุ่มล้างข้อมูลสาธิตให้กลับเป็นชุดตั้งต้น ใช้ก่อนเริ่มพรีเซนต์ แสดงเฉพาะโหมดสาธิต */
export default function DemoReset() {
  const { info, bump, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(keyStore.get);
  const [busy, setBusy] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!busy) return undefined;
    const start = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [busy]);

  if (!info?.demo_mode) return null;

  const run = async dryRun => {
    const k = key.trim();
    if (!k) { setError('กรอกรหัสรีเซ็ตก่อน'); return; }
    setBusy(dryRun ? 'dry' : 'reset'); setError(''); setResult(null);
    try {
      const r = await api('/admin/reseed', { method: 'POST', body: { dry_run: dryRun }, headers: { 'x-reseed-key': k } });
      keyStore.set(k);
      setResult(r);
      if (!dryRun) { bump(); toast('รีเซ็ตข้อมูลสาธิตเรียบร้อย'); }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const close = () => { if (!busy) { setOpen(false); setResult(null); setError(''); } };
  const done = result && !result.dry_run;

  return (
    <section className="panel reset-panel">
      <SecHead
        title="เครื่องมือสาธิต"
        sub="ล้างข้อมูลทั้งหมดแล้วสร้างชุดตัวอย่างเดิมขึ้นใหม่ กดก่อนเริ่มพรีเซนต์เพื่อให้ทุกหน้ากลับเป็นสภาพตั้งต้น"
        right={<button type="button" className="btn sm" onClick={() => setOpen(true)}>รีเซ็ตข้อมูลสาธิต…</button>}
      />
      {open && (
        <Modal
          title="รีเซ็ตข้อมูลสาธิต"
          onClose={close}
          footer={done
            ? <button type="button" className="btn primary" onClick={close}>เสร็จแล้ว</button>
            : (<>
              <button type="button" className="btn" disabled={!!busy} onClick={() => run(true)}>
                {busy === 'dry' ? `กำลังทดลอง… ${elapsed} วิ` : 'ทดลองก่อน (ไม่ลบข้อมูล)'}
              </button>
              <button type="button" className="btn danger" disabled={!!busy} onClick={() => run(false)}>
                {busy === 'reset' ? `กำลังรีเซ็ต… ${elapsed} วิ` : 'ลบและสร้างใหม่'}
              </button>
            </>)}
        >
          <div className="reset-body">
            <p>บิล การชำระเงิน ค่ามิเตอร์ การแจ้งเตือน ผู้ค้า และการตั้งค่าที่แก้ไว้ทั้งหมดจะถูกลบ แล้วสร้างชุดตัวอย่างเดิมกลับมา ย้อนกลับไม่ได้ บัญชีทดลองใช้รหัสเดิม</p>
            {!done && (
              <form onSubmit={e => e.preventDefault()}>
                <label className="field">รหัสรีเซ็ต
                  <input className="input" type="password" autoComplete="off" value={key} disabled={!!busy}
                    onChange={e => { setKey(e.target.value); setError(''); }} />
                </label>
              </form>
            )}
            {busy === 'reset' && <p className="muted" role="status">อย่าปิดหน้านี้ ปกติใช้เวลาไม่เกิน 1 นาที (ถ้าเซิร์ฟเวอร์ AI เพิ่งตื่นอาจนานกว่านั้น)</p>}
            {error && <div className="error-box" role="alert">{error}</div>}
            {result && <Result r={result} />}
          </div>
        </Modal>
      )}
    </section>
  );
}
