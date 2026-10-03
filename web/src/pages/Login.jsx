import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { thDate } from '../format';
import { useApp } from '../ui';
import { DemoNotice } from '../components/Layout';
import { fluidSimulation } from '../components/fluidInk';
import '../styles/login.css';

const DEMO = [
  ['staff', 'staff1234', 'เจ้าหน้าที่'],
  ['owner', 'owner1234', 'เจ้าของตลาด'],
  ['admin', 'admin1234', 'ทีม/กรรมการ (ดู AI)'],
  ['a04', 'vendor1234', 'ผู้ค้า A-04 (ค้างชำระ)'],
  ['a01', 'vendor1234', 'ผู้ค้า A-01'],
];

const HEADING = 'เข้าสู่ระบบ';
const SUB = 'ผู้ค้าดูบิลและจ่ายค่าน้ำไฟ เจ้าหน้าที่จดมิเตอร์และออกบิล เจ้าของตลาดติดตามค้างชำระ พร้อม AI ช่วยประเมินความเสี่ยง';

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * เผยข้อความทีละคำ ภาษาไทยไม่มีช่องว่างระหว่างคำจึงตัดคำด้วย Intl.Segmenter
 * ข้อความเต็มอยู่ใน visually-hidden ให้โปรแกรมอ่านหน้าจออ่านรวดเดียว ส่วนคำที่แยกไว้ซ่อนจากโปรแกรมอ่าน
 */
function Words({ text, delay, stagger }) {
  const parts = segmenter ? [...segmenter.segment(text)].map(s => s.segment) : text.split(/(\s+)/);
  let n = 0;
  return (
    <>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {parts.map((w, i) => (/^\s+$/.test(w)
          ? ' '
          : <span key={i} className="flow__w" style={{ '--wdl': `${delay + (n++) * stagger}ms` }}>{w}</span>))}
      </span>
    </>
  );
}

export default function Login() {
  const { login, info } = useApp();
  const nav = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [picked, setPicked] = useState(null);
  const [inn, setInn] = useState(false);          // เริ่มเผยเนื้อหา
  const [still, setStill] = useState(false);      // ไม่มี WebGL หรือผู้ใช้ขอลดการเคลื่อนไหว → พื้นหลังนิ่ง
  const submitRef = useRef(null);
  const canvasRef = useRef(null);

  /* พื้นหลังหมึก + เผยเนื้อหาหลังเฟรมแรก */
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.flow = '';
    let destroy = null;
    if (reduced()) setStill(true);
    else {
      try { destroy = fluidSimulation(canvasRef.current); }
      catch { setStill(true); }
    }
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setInn(true)); });
    return () => {
      cancelAnimationFrame(r1); cancelAnimationFrame(r2);
      destroy?.();
      delete html.dataset.flow;
    };
  }, []);

  const submit = async e => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { const u = await login(form.username, form.password); nav(`/${u.role}`); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  /* เลือกบัญชีทดลองแล้วย้ายโฟกัสไปปุ่มเข้าสู่ระบบ กด Enter ต่อได้ทันที */
  const pickDemo = (username, password) => {
    setForm({ username, password });
    setPicked(username);
    setErr('');
    submitRef.current?.focus();
  };

  const badge = info?.demo_mode ? `โหมดสาธิต · วันที่จำลอง ${thDate(info.today)}` : 'ผู้ค้า · เจ้าหน้าที่ · เจ้าของตลาด';
  const pay = info && (info.payment_provider === 'omise'
    ? `Omise${info.payment_test_mode ? ' (โหมดทดสอบ)' : ''}`
    : 'จำลอง (ยังไม่ได้ตั้งค่า Omise)');

  return (
    <div className={`flow ${inn ? 'is-in' : ''} ${still ? 'is-still' : ''}`}>
      <canvas ref={canvasRef} className="flow__canvas" aria-hidden="true" />
      <div className="flow__scrim" aria-hidden="true" />

      <header className="flow__nav rise" style={{ '--d': '150ms', '--from': '-0.75' }}>
        <Link to="/" className="flow__brand" aria-label="ตลาดบัญญัติทรัพย์ กลับไปหน้าตลาด">
          <span className="flow__mark" aria-hidden="true">บ</span>
          บัญญัติทรัพย์
        </Link>
        <nav className="flow__links" aria-label="ลิงก์ตลาด">
          <Link to="/">หน้าตลาด</Link>
          <a href="/guide/">คู่มือผู้ค้า</a>
          <Link to="/walkin">ผู้ค้าขาจร</Link>
        </nav>
        <Link to="/walkin" className="flow__pill">จองพื้นที่</Link>
      </header>

      <main className="flow__center">
        <p className="flow__badge rise" style={{ '--d': '320ms' }}>{badge}</p>
        <h1 className="flow__h"><Words text={HEADING} delay={480} stagger={85} /></h1>
        <p className="flow__sub"><Words text={SUB} delay={1150} stagger={22} /></p>

        <div className="flow__notice rise" style={{ '--d': '1400ms' }}><DemoNotice /></div>

        <form className="flow__form rise" style={{ '--d': '1450ms' }} onSubmit={submit}>
          <div className="flow__bar">
            <label className="flow__field">
              <span className="visually-hidden">ชื่อผู้ใช้</span>
              <input autoComplete="username" placeholder="ชื่อผู้ใช้" value={form.username} required
                onChange={e => { setForm({ ...form, username: e.target.value }); setPicked(null); }} />
            </label>
            <span className="flow__sep" aria-hidden="true" />
            <span className="flow__field">
              <label htmlFor="login-pw" className="visually-hidden">รหัสผ่าน</label>
              <input id="login-pw" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="รหัสผ่าน"
                value={form.password} required
                onChange={e => { setForm({ ...form, password: e.target.value }); setPicked(null); }} />
              <button type="button" className="flow__eye" onClick={() => setShowPw(v => !v)} aria-pressed={showPw} aria-controls="login-pw">
                {showPw ? 'ซ่อน' : 'แสดง'}
              </button>
            </span>
            <button ref={submitRef} className="flow__pill flow__submit" disabled={busy}>
              {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
          </div>
          {err && <p className="flow__err" role="alert">{err}</p>}
        </form>

        <div className="flow__more rise" style={{ '--d': '1550ms' }}>
          {info?.demo_mode && (
            <section className="flow__demo" aria-labelledby="flow-demo-h">
              <h2 id="flow-demo-h">บัญชีทดลอง <small>กดเพื่อกรอกให้ แล้วกด Enter</small></h2>
              <div className="flow__chips">
                {DEMO.map(([u, p, label]) => (
                  <button key={u} type="button" className={`flow__chip ${picked === u ? 'is-on' : ''}`}
                    aria-pressed={picked === u} onClick={() => pickDemo(u, p)}>{label}</button>
                ))}
              </div>
            </section>
          )}
          <p className="flow__walkin">
            ผู้ค้าขาจรไม่ต้องสมัครสมาชิก <Link to="/walkin">จองพื้นที่รายวันและจ่ายผ่าน QR</Link>
            {' · '}<a href="/guide/">อ่านคู่มือ</a>
          </p>
        </div>
      </main>

      <footer className="flow__foot rise" style={{ '--d': '1650ms' }}>
        <span>© 2569 ตลาดบัญญัติทรัพย์ — ระบบบริหารตลาด</span>
        {info && <span>ชำระเงิน: {pay}</span>}
      </footer>
    </div>
  );
}
