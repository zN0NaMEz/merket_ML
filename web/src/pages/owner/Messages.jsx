import { useEffect } from 'react';
import { api } from '../../api';
import { thDate } from '../../format';
import { Loader, useApp, useData } from '../../ui';
import { Icon } from './parts';

/* ประเภทข้อความ: คำ + ไอคอน + สี */
const KIND = {
  overdue: ['ค้างจ่าย', 'bad'], utility: ['น้ำไฟ', 'warn'], bill: ['ออกบิล', 'good'],
  payment: ['ได้รับเงิน', 'good'], ai: ['เตือนล่วงหน้า', 'warn'], system: ['ระบบ', 'good'],
};

export default function Messages() {
  const { refreshUnread } = useApp();
  const st = useData(() => api('/notifications'));
  useEffect(() => {
    if (st.data?.unread) api('/notifications/read-all', { method: 'POST' }).then(refreshUnread).catch(() => {});
  }, [st.data, refreshUnread]);
  return (
    <div className="o-page">
      <h1 className="o-h1">ข้อความแจ้งเตือน</h1>
      <Loader state={st}>{d => d.items.length === 0 ? (
        <p className="o-headline o-headline--good"><Icon name="good" size={28} />ยังไม่มีข้อความ</p>
      ) : (
        <ul className="o-msgs">{d.items.map(n => {
          const [word, tone] = KIND[n.kind] || ['ระบบ', 'good'];
          return (
            <li key={n.id} className={n.read_at ? '' : 'is-new'}>
              <p className="o-msgs__meta">
                <span className={`o-status o-status--${tone}`}><Icon name={tone} size={20} />{word}</span>
                <time>{thDate(n.created_on)}</time>{!n.read_at && <b>ใหม่</b>}
              </p>
              <p className="o-msgs__text">{n.message}</p>
            </li>
          );
        })}</ul>
      )}</Loader>
    </div>
  );
}
