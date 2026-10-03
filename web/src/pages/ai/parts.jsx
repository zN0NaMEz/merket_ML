import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useApp } from '../../ui';
import { EMPTY_MODEL_TEXT, trainLink } from '../../ai/behind';

/* ชิ้นส่วนที่ทุกแท็บของหน้าเบื้องหลัง AI ใช้ร่วมกัน · ข้อความสถานะทุกแบบอยู่ที่นี่ที่เดียวเพื่อให้พูดเหมือนกันทั้งหน้า */

const PATHS = {
  good: <><circle cx="12" cy="12" r="9" /><path d="m8 12.4 2.7 2.7L16 9.6" /></>,
  warn: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4.5" /><path d="M12 17.2h.01" /></>,
  bad: <><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  plug: <><path d="M9 2v6" /><path d="M15 2v6" /><path d="M6 8h12v3a6 6 0 0 1-12 0Z" /><path d="M12 17v5" /></>,
  flask: <><path d="M9 3h6" /><path d="M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7.5 15h9" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  refresh: <><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" /></>,
};
export function BIcon({ name, size = 20 }) {
  return (
    <svg className="bh-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
  );
}

/** ป้าย "ข้อมูลจำลอง" สีอำพัน มีไอคอนและข้อความเสมอ แสดงซ้ำทุกแท็บที่มีตัวเลขจากโมเดล */
export function SynthBadge({ on, compact }) {
  if (!on) return null;
  return (
    <span className="bh-synth" title="โมเดลนี้เทรนจากข้อมูลจำลองของระบบสาธิต ไม่ใช่ประวัติการจ่ายจริงของตลาด">
      <BIcon name="flask" size={compact ? 14 : 16} />ข้อมูลจำลอง
    </span>
  );
}

/** ป้ายบอกว่าข้อมูลมาจากข้อมูลจริง (ใช้ในบัตรโมเดล ให้เห็นทั้งสองกรณีชัด ๆ) */
export const RealBadge = () => <span className="bh-real"><BIcon name="good" size={16} />ข้อมูลจริงของตลาด</span>;

/**
 * กล่องสถานะพิเศษ: empty | asleep | down | error | denied
 * ทุกกล่องบอกว่าเกิดอะไรขึ้นและทำอะไรต่อได้ ไม่ล็อกหน้าจอ
 */
const STATE_ICON = { empty: 'inbox', asleep: 'moon', down: 'plug', error: 'warn', denied: 'lock' };
export function StateBox({ kind, title, children, action }) {
  const live = kind === 'error' || kind === 'down' ? 'alert' : 'status';
  return (
    <div className={`bh-state bh-state--${kind}`} role={live}>
      <BIcon name={STATE_ICON[kind] || 'inbox'} size={26} />
      <div>
        {title && <strong>{title}</strong>}
        {children && <p>{children}</p>}
        {action && <div className="bh-state__act">{action}</div>}
      </div>
    </div>
  );
}

/** error จาก API เป็นภาษาคน พร้อมปุ่มลองใหม่ · 403 = ไม่มีสิทธิ์ (API ตรวจซ้ำแม้แท็บถูกซ่อนอยู่แล้ว) */
export function LoadError({ error, onRetry, what = 'ข้อมูลส่วนนี้' }) {
  if (error?.status === 403) {
    return <StateBox kind="denied" title="บทบาทของคุณไม่มีสิทธิ์ดูส่วนนี้">ถ้าคิดว่าควรเห็น ติดต่อผู้ดูแลระบบของตลาด</StateBox>;
  }
  const offline = !error?.status || error.status >= 500;
  return (
    <StateBox kind="error" title={`โหลด${what}ไม่สำเร็จ`}
      action={onRetry && <button type="button" className="btn bh-btn" onClick={onRetry}><BIcon name="refresh" size={18} />ลองใหม่</button>}>
      {offline ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจอินเทอร์เน็ตแล้วกดลองใหม่' : error.message}
    </StateBox>
  );
}

/** skeleton ของกราฟและตาราง ขนาดใกล้ของจริงเพื่อไม่ให้หน้ากระโดดตอนโหลดเสร็จ */
export function Skeleton({ kind = 'chart', label = 'กำลังโหลด…' }) {
  return (
    <div className={`bh-skel bh-skel--${kind}`} role="status" aria-busy="true">
      {kind === 'chart' && <><span className="sk sk--title" /><span className="bh-skel__plot" /><span className="sk sk--short" /></>}
      {kind === 'list' && <>{[0, 1, 2, 3].map(i => <span key={i} className="bh-skel__row" />)}</>}
      {kind === 'card' && <><span className="sk sk--title" /><span className="sk" /><span className="sk" /><span className="sk" /><span className="sk sk--short" /></>}
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

/** accordion รายละเอียดเชิงเทคนิค ปิดไว้ตั้งต้นเสมอ (หัวข้อ 5) */
export function TechDetails({ children, title = 'รายละเอียดเชิงเทคนิค' }) {
  return (
    <details className="bh-tech">
      <summary><BIcon name="chevron" size={18} />{title}</summary>
      <div className="bh-tech__body">{children}</div>
    </details>
  );
}

/**
 * ปุ่มเทรนโมเดลใหม่: เจ้าหน้าที่ถูกพาไปหน้า AI (ที่มีปุ่มเทรนและตั้งค่าอยู่แล้ว)
 * เจ้าของและทีม/กรรมการกดเทรนจากหน้านี้ได้เลย (API อนุญาตทั้งสามบทบาท)
 */
export function TrainButton({ onDone, label = 'เทรนโมเดลใหม่' }) {
  const { user, toast, bump } = useApp();
  const [busy, setBusy] = useState(false);
  const link = trainLink(user?.role);
  if (link && user.role === 'staff') return <Link className="btn primary bh-btn" to={link}>{label}</Link>;
  const run = async () => {
    setBusy(true);
    try {
      const r = await api('/ai/retrain', { method: 'POST' });
      toast(`เทรนใหม่แล้ว · ให้คะแนนบิลค้างใหม่ ${r.rescored?.count ?? 0} ใบ`);
      bump();
      onDone?.();
    } catch (e) {
      toast(e.status === 503 ? 'ระบบ AI ยังไม่พร้อม รอประมาณ 1 นาทีแล้วลองอีกครั้ง' : e.message, 'bad');
    } finally { setBusy(false); }
  };
  return (
    <button type="button" className="btn primary bh-btn" disabled={busy} onClick={run} aria-busy={busy}>
      {busy ? 'กำลังเทรน… (อาจใช้ 1–2 นาทีถ้าระบบ AI เพิ่งตื่น)' : label}
    </button>
  );
}

/** สถานะว่างของทั้งหน้า: ยังไม่มีโมเดลที่เทรนแล้ว */
export function NoModel({ onDone }) {
  const { user } = useApp();
  // เจ้าหน้าที่ถูกพาไปหน้า AI ตามข้อความในแผน · เจ้าของและทีมกดเทรนจากปุ่มในกล่องนี้ได้เลย
  const text = user?.role === 'staff' ? EMPTY_MODEL_TEXT : "ยังไม่มีโมเดลที่เทรนแล้ว กดปุ่ม 'เทรนโมเดลใหม่' ด้านล่างเพื่อเริ่ม";
  return <StateBox kind="empty" title="ยังไม่มีโมเดล" action={<TrainButton onDone={onDone} />}>{text}</StateBox>;
}

/** หัวเรื่องของแท็บ + ป้ายข้อมูลจำลองซ้ำทุกแท็บ */
export function TabHead({ title, sub, synthetic, right }) {
  return (
    <div className="bh-tabhead">
      <div>
        <h2>{title}<SynthBadge on={synthetic} compact /></h2>
        {sub && <p>{sub}</p>}
      </div>
      {right}
    </div>
  );
}
