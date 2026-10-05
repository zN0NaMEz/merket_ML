import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { presentMode } from '../present';
import { thDate } from '../format';
import { useApp } from '../ui';
import Ambient from './Ambient';

/*
 * เมนูของแต่ละบทบาท: [ลิงก์, ชื่อ, รหัสกระบวนการ (แสดงเฉพาะโหมดนำเสนอ), งานค้างที่แสดงเป็นตัวเลข]
 * รหัส 5.0, 3.0, D7 … อ้างอิงแผนภาพในรายงาน ผู้ใช้ไม่รู้ความหมาย จึงแสดงจำนวนงานค้างแทน (RodeMap ข้อ 4 [S10])
 */
const NAV = {
  vendor: [
    ['/vendor', 'บิลและชำระเงิน', '4.0'],
    ['/vendor/advance', 'ชำระล่วงหน้า', '4.0'],
    ['/vendor/statement', 'เอกสารยื่นกู้', '6.0'],
    ['/vendor/notifications', 'การแจ้งเตือน', 'D7'],
  ],
  staff: [
    ['/staff', 'ติดตามค้างชำระ', '5.0', c => c.overdue && { n: c.overdue, label: `ค้างชำระ ${c.overdue} บิล` }],
    ['/staff/meters', 'จดมิเตอร์และออกบิล', '3.0', c => c.meter_pending && { n: c.meter_pending, text: `รอตรวจ ${c.meter_pending}`, label: `มิเตอร์รอตรวจ ${c.meter_pending} แผง` }],
    ['/staff/vendors', 'ผู้ค้าและสัญญา', '1.0', c => c.contracts_expiring && { n: c.contracts_expiring, text: `ใกล้หมด ${c.contracts_expiring}`, label: `สัญญาใกล้หมด ${c.contracts_expiring} ราย` }],
    ['/staff/walkin', 'พื้นที่ผู้ค้าขาจร', '2.0'],
    ['/staff/ai', 'AI วิเคราะห์', 'ML'],
    ['/ai/behind', 'เบื้องหลัง AI', 'XAI'],
    ['/staff/notifications', 'การแจ้งเตือน', 'D7', c => c.unread && { n: c.unread, label: `ยังไม่อ่าน ${c.unread} รายการ` }],
  ],
  admin: [
    ['/ai/behind', 'เบื้องหลัง AI', 'XAI'],
    ['/admin/notifications', 'การแจ้งเตือน', 'D7'],
  ],
  // เจ้าของตลาดใช้ OwnerLayout (เมนูล่างแบบแอปมือถือ) แยกต่างหาก
};
const ROLE_NAME = { vendor: 'ผู้ค้าประจำ', staff: 'เจ้าหน้าที่สำนักงาน', owner: 'เจ้าของตลาด', admin: 'ทีม/กรรมการ' };

/**
 * แสดงเมื่อเรียก API ไม่ได้ เช่นตอนดีพลอยเฉพาะหน้าเว็บโดยไม่มีเซิร์ฟเวอร์
 * บอกผู้เข้าชมให้ชัดว่าหน้าไหนใช้ได้ แทนที่จะปล่อยให้เจอข้อความ error ดิบ
 */
export function DemoNotice() {
  const { apiDown } = useApp();
  if (!apiDown) return null;
  return (
    <div className="demo-notice" role="status">
      <strong>ส่วนนี้ยังไม่ได้เชื่อมต่อระบบหลังบ้าน</strong>
      <p>
        ลิงก์สาธารณะนี้แสดงเฉพาะหน้าเว็บ ส่วนที่ต้องใช้ข้อมูลจริง เช่น เข้าสู่ระบบ จองพื้นที่ และบิล
        ต้องรันทั้งระบบด้วย <code>docker compose up</code> ในเครื่องก่อน
      </p>
      <NavLink className="btn sm" to="/">กลับไปหน้าตลาด</NavLink>
    </div>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">บ</span>
      <div><strong>ตลาดบัญญัติทรัพย์</strong><small>ระบบบริหารตลาด</small></div>
    </div>
  );
}

function Clock() {
  const { info, user, bump, toast } = useApp();
  const [busy, setBusy] = useState(false);
  if (!info) return null;
  const canAdvance = info.demo_mode && user && (user.role === 'staff' || user.role === 'owner');
  const advance = async days => {
    setBusy(true);
    try {
      const r = await api('/system/advance', { method: 'POST', body: { days } });
      const t = r.total;
      toast(`ระบบตั้งเวลาทำงาน ${days} วัน: ${t.paid ? `ผู้ค้าชำระ ${t.paid} รายการ · ` : ''}เตือนล่วงหน้า ${t.early} · ส่งต่อเจ้าหน้าที่ ${t.escalated}`);
      bump();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <div className="clock">
      <small>{info.demo_mode ? 'วันที่จำลอง' : 'วันที่'}</small>
      <strong>{thDate(info.today)}</strong>
      {canAdvance && (<>
        <button className="btn sm" disabled={busy} onClick={() => advance(1)} title="เลื่อน 1 วัน และให้ระบบตั้งเวลาทำงาน">+1 วัน</button>
        <button className="btn sm" disabled={busy} onClick={() => advance(7)}>+7 วัน</button>
      </>)}
    </div>
  );
}

/** จำนวนงานค้างของเจ้าหน้าที่ (GET /staff/today) โหลดใหม่เมื่อเปลี่ยนหน้าหรือมีการกระทำ (version) */
function useStaffCounts(enabled) {
  const { version } = useApp();
  const { pathname } = useLocation();
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    api('/staff/today').then(c => alive && setCounts(c)).catch(() => {});
    return () => { alive = false; };
  }, [enabled, version, pathname]);
  return counts;
}

export default function Layout() {
  const { user, logout, unread } = useApp();
  const nav = useNavigate();
  const { search } = useLocation();
  const counts = useStaffCounts(user?.role === 'staff');
  const present = presentMode(search);
  if (!user) return null;
  const base = `/${user.role}`;
  return (
    <div className="app-frame">
      <Ambient tone="auto-paper" placement="fixed" />
      <header className="topbar">
        <Brand />
        <Clock />
        <div className="who">
          <button className="bell" onClick={() => nav(`${base}/notifications`)} aria-label={`การแจ้งเตือน ${unread} รายการใหม่`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            {unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}
          </button>
          <div className="who-name"><span>{user.name}</span><small>{ROLE_NAME[user.role]}</small></div>
          <button className="btn sm" onClick={() => { logout(); nav('/login'); }}>ออกจากระบบ</button>
        </div>
      </header>
      <div className="shell">
        <nav className="nav" aria-label="เมนูหลัก">
          {NAV[user.role].map(([to, label, tag, badgeOf]) => {
            const b = counts && badgeOf ? badgeOf(counts) : null;
            return (
              <NavLink key={to} to={to} end className={({ isActive }) => `nav-item ${isActive ? 'on' : ''}`}>
                <span>{label}</span>
                {b ? <span className="nav-badge" aria-label={b.label}>{b.text || b.n}</span> : present && <small className="nav-code">{tag}</small>}
              </NavLink>
            );
          })}
          {user.role === 'vendor' && (
            <a className="nav-item" href="/guide/"><span>คู่มือผู้ค้า</span><small className="muted">?</small></a>
          )}
        </nav>
        <main className="main"><Outlet /></main>
      </div>
    </div>
  );
}

export function PublicLayout() {
  return (
    <div className="app-frame">
      <Ambient tone="auto-paper" placement="fixed" />
      <header className="public-top">
        <NavLink to="/" className="back-market" aria-label="กลับไปหน้าตลาด"><Brand /></NavLink>
        <nav className="btn-row">
          <NavLink className="btn sm" to="/walkin" end>จองพื้นที่</NavLink>
          <NavLink className="btn sm" to="/walkin/my">การจองของฉัน</NavLink>
          <a className="btn sm" href="/guide/">คู่มือ</a>
          <NavLink className="btn sm" to="/">หน้าตลาด</NavLink>
          <NavLink className="btn sm ghost" to="/login">เข้าสู่ระบบ</NavLink>
        </nav>
      </header>
      <main className="center-page"><DemoNotice /><Outlet /></main>
    </div>
  );
}
