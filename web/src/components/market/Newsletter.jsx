import { useState } from 'react';
import Reveal, { RevealLines } from './Reveal';
import { IconArrow } from './icons';

const OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** รับข่าวจากตลาด ตรวจอีเมลฝั่งหน้าเว็บและแสดงสถานะครบทุกแบบ */
export default function Newsletter() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | busy | done | error
  const [msg, setMsg] = useState('');

  const submit = e => {
    e.preventDefault();
    if (!OK.test(email.trim())) {
      setState('error');
      setMsg('กรุณากรอกอีเมลให้ถูกต้อง เช่น name@example.com');
      return;
    }
    setState('busy');
    setMsg('');
    /* ยังไม่มีปลายทางรับสมัครจริง จึงจบที่ฝั่งหน้าเว็บและแจ้งผลให้ชัด */
    setTimeout(() => { setState('done'); setMsg(''); }, 700);
  };

  return (
    <section className="mk-news" id="news" aria-labelledby="mk-news-title">
      <div className="mk-wrap mk-news__inner">
        <div className="mk-news__left">
          <Reveal as="p" className="mk-eyebrow" mode="fade"><em className="mk-head__num">07</em><span>MARKET LETTER</span></Reveal>
          <RevealLines as="h2" id="mk-news-title" className="mk-news__title" lines={['อยู่ใกล้ตลาด', 'ได้ทุกเช้า']} />
        </div>

        <Reveal className="mk-news__right" delay={100}>
          <p className="mk-news__lead">
            เดือนละหนึ่งฉบับ รวมของใหม่ที่คัดมาแล้ว เรื่องของผู้ค้า และวันที่ตลาดมีของพิเศษ ไม่มีโฆษณา ยกเลิกได้ตลอดเวลา
          </p>

          {state === 'done' ? (
            <p className="mk-news__done" role="status">
              <span className="mk-rule" aria-hidden="true" />
              ขอบคุณ เราส่งจดหมายฉบับแรกไปที่ <strong>{email}</strong> แล้ว
            </p>
          ) : (
            <form className="mk-news__form" onSubmit={submit} noValidate>
              <label className="mk-field">
                <span className="mk-sr">อีเมลของคุณ</span>
                <input
                  type="email"
                  name="email"
                  value={email}
                  placeholder="อีเมลของคุณ"
                  autoComplete="email"
                  aria-invalid={state === 'error'}
                  aria-describedby={state === 'error' ? 'mk-news-err' : undefined}
                  onChange={e => { setEmail(e.target.value); if (state === 'error') { setState('idle'); setMsg(''); } }}
                  disabled={state === 'busy'}
                />
              </label>
              <button type="submit" className="mk-btn mk-btn--dark" disabled={state === 'busy'}>
                {state === 'busy' ? 'กำลังส่ง…' : 'สมัครรับข่าว'}
                <IconArrow className="mk-btn__arrow" />
              </button>
              {state === 'error' && <p className="mk-news__err" id="mk-news-err" role="alert">{msg}</p>}
            </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}
