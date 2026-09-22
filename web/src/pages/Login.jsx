import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { thDate } from '../format';
import { useApp } from '../ui';
import { Brand, DemoNotice } from '../components/Layout';
import Media from '../components/market/Media';
import { AUTH } from '../data/market';

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
    try { const u = await login(form.username, form.password); nav(`/${u.role}`); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <aside className="auth__art">
        <Media photo={AUTH.photo} alt="" ratio={3 / 4} sizes="(max-width: 900px) 100vw, 46vw" priority fill className="auth__media" />
        <span className="auth__veil" aria-hidden="true" />
        <div className="auth__art-body">
          <p className="eyebrow">BANYATSAP MARKET</p>
          <p className="auth__quote">{AUTH.quote}</p>
        </div>
      </aside>

      <main className="auth__panel">
        <div className="auth__inner">
          <div className="auth__head">
            <Link to="/" className="back-market" aria-label="กลับไปหน้าตลาด"><Brand /></Link>
            <Link to="/" className="auth__back">ดูหน้าตลาด</Link>
          </div>

          <div>
            <h1>เข้าสู่ระบบ</h1>
            <p className="auth__lead">
              สำหรับผู้ค้าประจำ เจ้าหน้าที่สำนักงาน และเจ้าของตลาด ดูบิลและชำระเงิน จดมิเตอร์และออกบิล
              ติดตามค้างชำระ พร้อม AI ประเมินความเสี่ยงและตรวจค่ามิเตอร์ผิดปกติ
            </p>
          </div>

          <DemoNotice />

          <form className="login-form" onSubmit={submit}>
            <label className="field">ชื่อผู้ใช้
              <input className="input" autoComplete="username" value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })} required />
            </label>
            <label className="field">รหัสผ่าน
              <input className="input" type="password" autoComplete="current-password" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} required />
            </label>
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn primary" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
          </form>

          {info?.demo_mode && (
            <section className="auth__demo">
              <h2 className="label-th">บัญชีทดลอง</h2>
              <p className="hint">กดเพื่อกรอกให้อัตโนมัติ · ผู้ค้าทุกรายใช้เลขแผงไม่มีขีดเป็นชื่อผู้ใช้</p>
              <div className="quick">
                {DEMO.map(([u, p, label]) => (
                  <button key={u} type="button" className="btn sm" onClick={() => setForm({ username: u, password: p })}>{label}</button>
                ))}
              </div>
            </section>
          )}

          <section className="auth__walkin">
            <div>
              <h2>ผู้ค้าขาจร</h2>
              <p>จองพื้นที่หน้าตลาดรายวันและชำระผ่าน QR ได้ทันที ไม่ต้องสมัครสมาชิก</p>
            </div>
            <Link className="btn" to="/walkin">จองพื้นที่</Link>
          </section>

          {info && (
            <p className="auth__sys">
              {info.demo_mode ? 'โหมดสาธิต · วันที่จำลอง' : 'วันที่'} {thDate(info.today)}
              {' · ชำระเงิน: '}
              {info.payment_provider === 'omise'
                ? `Omise${info.payment_test_mode ? ' (โหมดทดสอบ)' : ''}`
                : 'จำลอง (ยังไม่ได้ตั้งค่า Omise)'}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
