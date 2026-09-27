import { NavLink, Outlet } from 'react-router-dom';
import { thDateLong } from '../format';
import { useApp } from '../ui';
import { Icon } from '../pages/owner/parts';
import '../styles/owner.css';

/* เมนูล่างแบบแอปมือถือ ไม่เกิน 4 อัน มีไอคอนและชื่อภาษาไทย */
const TABS = [
  ['/owner', 'วันนี้', 'home'],
  ['/owner/unpaid', 'ค้างจ่าย', 'wallet'],
  ['/owner/stalls', 'แผงตลาด', 'stalls'],
  ['/owner/more', 'เพิ่มเติม', 'more'],
];

/** โครงหน้าของเจ้าของตลาด: หัวบอกชื่อตลาดกับวันที่ · เนื้อหา · แถบเมนูล่าง */
export default function OwnerLayout() {
  const { user, info, unread } = useApp();
  if (!user) return null;
  return (
    <div className="own">
      <header className="own__top">
        <p className="own__brand"><span aria-hidden="true">บ</span>ตลาดบัญญัติทรัพย์</p>
        {info && <p className="own__date">{thDateLong(info.today)}</p>}
      </header>
      <main className="own__main"><Outlet /></main>
      <nav className="own__tabs" aria-label="เมนูหลัก">
        {TABS.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === '/owner'} className={({ isActive }) => `own__tab ${isActive ? 'is-on' : ''}`}>
            <span className="own__tabicon"><Icon name={icon} size={28} />{icon === 'more' && unread > 0 && <i className="own__dot" aria-hidden="true" />}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
