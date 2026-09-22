import { useEffect } from 'react';
import { api } from '../../api';
import { thDate } from '../../format';
import { Chip, Empty, Loader, PageHead, useApp, useData } from '../../ui';

const KIND = { bill: ['บิล', ''], overdue: ['ค้างชำระ', 'bad'], ai: ['AI เตือนล่วงหน้า', 'warn'], utility: ['น้ำไฟ', 'warn'], payment: ['ชำระเงิน', 'good'], system: ['ระบบ', ''] };

export default function Notifications() {
  const { refreshUnread } = useApp();
  const st = useData(() => api('/notifications'));
  useEffect(() => {
    if (st.data?.unread) api('/notifications/read-all', { method: 'POST' }).then(refreshUnread).catch(() => {});
  }, [st.data, refreshUnread]);
  return (
    <div className="page">
      <PageHead title="การแจ้งเตือน" tag="D7 การแจ้งเตือน" />
      <section className="panel">
        <Loader state={st}>{d => d.items.length === 0 ? <Empty>ยังไม่มีการแจ้งเตือน</Empty> : (
          <ul className="notis">{d.items.map(n => (
            <li key={n.id} className={n.read_at ? '' : 'new'}>
              <time>{thDate(n.created_on)}</time>
              <span><Chip tone={KIND[n.kind]?.[1]}>{KIND[n.kind]?.[0] || n.kind}</Chip> {n.message}</span>
            </li>
          ))}</ul>
        )}</Loader>
      </section>
    </div>
  );
}
