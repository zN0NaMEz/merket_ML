import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { thDate } from '../format';
import { useApp } from '../ui';
import { Brand } from '../components/Layout';

const DEMO = [
  ['staff', 'staff1234', 'เจ้าหน้าที่'],
  ['owner', 'owner1234', 'เจ้าของตลาด'],
  ['a04', 'vendor1234', 'ผู้ค้า A-04 (ค้างชำระ ถูกตัดน้ำไฟ)'],
  ['a01', 'vendor1234', 'ผู้ค้า A-01'],
];

export default function Login() {
  const { login, info } = useApp();
  const nav = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { const u = await login(form.username, form.password); nav(`/${u.role}`); } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <div className="login">
      <Link to="/" className="back-market" aria-label="กลับไปหน้าตลาด"><Brand /></Link>
      <section className="hero">
        <span className="plate lg" aria-hidden="true">A-04</span>
        <h1>ระบบบริหารตลาดบัญญัติทรัพย์</h1>
        <p className="lead">จัดการผู้ค้าและสัญญา จองแผง จดมิเตอร์และออกบิล รับชำระผ่าน QR PromptPay ติดตามค้างชำระ พร้อม AI ประเมินความเสี่ยงค้างชำระและตรวจจับค่ามิเตอร์ผิดปกติ</p>
        {info && <p className="clock-line">{info.demo_mode ? 'โหมดสาธิต · วันที่จำลอง' : 'วันที่'} {thDate(info.today)} · ชำระเงิน: {info.payment_provider === 'omise' ? `Omise${info.payment_test_mode ? ' (โหมดทดสอบ)' : ''}` : 'จำลอง (ยังไม่ได้ตั้งค่า Omise)'}</p>}
      </section>
      <div className="login-grid">
        <section className="panel">
          <h2>เข้าสู่ระบบ</h2>
          <form className="login-form" onSubmit={submit} style={{ marginTop: 12 }}>
            <label className="field">ชื่อผู้ใช้
              <input className="input" autoComplete="username" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required />
            </label>
            <label className="field">รหัสผ่าน
              <input className="input" type="password" autoComplete="current-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
            </label>
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn primary" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
          </form>
          {info?.demo_mode && (
            <div style={{ marginTop: 18 }}>
              <p className="hint">บัญชีทดลอง (กดเพื่อกรอกให้) ผู้ค้าทุกรายใช้เลขแผงไม่มีขีดเป็นชื่อผู้ใช้</p>
              <div className="quick" style={{ marginTop: 6 }}>
                {DEMO.map(([u, p, label]) => <button key={u} type="button" className="btn sm" onClick={() => setForm({ username: u, password: p })}>{label}</button>)}
              </div>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>ผู้ค้าขาจร</h2>
          <p className="muted" style={{ margin: '8px 0 14px' }}>จองพื้นที่หน้าตลาดรายวันและชำระผ่าน QR ได้ทันที ไม่ต้องสมัครสมาชิก</p>
          <div className="btn-row">
            <Link className="btn primary" to="/walkin">จองพื้นที่</Link>
            <Link className="btn" to="/walkin/my">ดูการจองของฉัน</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
