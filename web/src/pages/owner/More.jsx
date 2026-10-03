import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { TH_M, thDateLong } from '../../format';
import { Loader, useApp, useData } from '../../ui';
import DemoReset from '../../components/DemoReset';
import { Bars, Icon, nextIcon } from './parts';

export default function More() {
  const { info, user, logout, unread, bump, toast } = useApp();
  const nav = useNavigate();
  const st = useData(() => api('/owner/dashboard'));
  const [busy, setBusy] = useState(false);

  const advance = async days => {
    setBusy(true);
    try {
      await api('/system/advance', { method: 'POST', body: { days } });
      toast(`เลื่อนวันไป ${days} วันแล้ว`);
      bump();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };

  return (
    <div className="o-page">
      <h1 className="o-h1">เพิ่มเติม</h1>

      <div className="o-split o-split--more">
      <section className="o-sec" aria-labelledby="months-h">
        <h2 id="months-h" className="o-h2">เงินเข้า 6 เดือนล่าสุด</h2>
        <Loader state={st}>{d => (
          <Bars label="เงินเข้าแต่ละเดือน" rows={d.revenue.slice(-6).reverse().map((r, i) => {
            const [y, m] = r.month.split('-').map(Number);
            return { key: r.month, now: i === 0, value: r.rent + r.water + r.elec + r.walkin,
              label: i === 0 ? 'เดือนนี้ (ถึงวันนี้)' : `${TH_M[m - 1]} ${y + 543}` };
          })} />
        )}</Loader>
        <p className="o-note">รวมค่าเช่า ค่าน้ำไฟ และผู้ค้าขาจร นับตามวันที่จ่ายเงินจริง</p>
      </section>

      <div className="o-stack">
      <nav className="o-menu" aria-label="เมนูเพิ่มเติม">
        <Link to="/owner/rates"><Icon name="wallet" />ตั้งราคาค่าเช่า ค่าน้ำ ค่าไฟ{nextIcon}</Link>
        <Link to="/ai/behind"><Icon name="bulb" />เบื้องหลัง AI: ทำไมระบบเตือนแบบนั้น{nextIcon}</Link>
        <Link to="/owner/notifications"><Icon name="message" />ข้อความแจ้งเตือน{unread > 0 && <b className="o-badge">{unread} ใหม่</b>}{nextIcon}</Link>
        <button type="button" onClick={() => { logout(); nav('/login'); }}><Icon name="logout" />ออกจากระบบ ({user?.name})</button>
      </nav>

      {info?.demo_mode && (
        <details className="o-demo">
          <summary>สำหรับการสาธิตระบบ</summary>
          <p>วันที่จำลองตอนนี้: <b>{thDateLong(info.today)}</b></p>
          <div className="o-demo__row">
            <button type="button" className="o-btn o-btn--ghost" disabled={busy} onClick={() => advance(1)}>เลื่อนไป 1 วัน</button>
            <button type="button" className="o-btn o-btn--ghost" disabled={busy} onClick={() => advance(7)}>เลื่อนไป 7 วัน</button>
          </div>
          <DemoReset />
        </details>
      )}
      </div>
      </div>
    </div>
  );
}
