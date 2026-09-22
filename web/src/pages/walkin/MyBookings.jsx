import { useState } from 'react';
import { api, localPref } from '../../api';
import { baht, thDate } from '../../format';
import { Chip, Empty, Modal, PageHead, SecHead, useApp } from '../../ui';
import Receipt from '../../components/Receipt';

export default function MyBookings() {
  const { toast } = useApp();
  const [phone, setPhone] = useState(localPref.get('bunyat.walkin.phone') || '');
  const [data, setData] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const search = async e => {
    e?.preventDefault();
    try {
      const [b, n] = await Promise.all([api(`/walkin/bookings?phone=${encodeURIComponent(phone)}`), api(`/walkin/notifications?phone=${encodeURIComponent(phone)}`)]);
      setData({ bookings: b.bookings, notis: n.items });
      localPref.set('bunyat.walkin.phone', phone);
    } catch (ex) { toast(ex.message, 'bad'); }
  };
  return (
    <div className="page">
      <PageHead title="การจองของฉัน" tag="ผู้ค้าขาจร" />
      <form className="panel btn-row" onSubmit={search}>
        <label className="field" style={{ flex: 1, minWidth: 200 }}>เบอร์โทรที่ใช้จอง<input className="input" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} required /></label>
        <button className="btn primary" style={{ alignSelf: 'flex-end' }}>ค้นหา</button>
      </form>
      {data && (
        <>
          <section className="panel">
            <SecHead title="รายการจอง" />
            {data.bookings.length === 0 ? <Empty>ไม่พบการจองของเบอร์นี้</Empty> : (
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>ล็อก</th><th>วันที่</th><th>สินค้า</th><th className="num">ค่าพื้นที่</th><th>สถานะ</th><th /></tr></thead>
                <tbody>{data.bookings.map(b => (
                  <tr key={b.booking_no}>
                    <td><span className="plate">{b.spot}</span></td><td className="nowrap">{thDate(b.booking_date)}</td><td>{b.product}</td>
                    <td className="num">{baht(b.fee)}</td><td><Chip tone={b.status === 'paid' ? 'good' : 'warn'}>{b.status === 'paid' ? 'ยืนยันแล้ว' : 'รอชำระ'}</Chip></td>
                    <td>{b.receipt_no && <button className="btn sm" onClick={async () => setReceipt(await api(`/payments/${b.payment_id}?t=${b.token}`))}>ใบเสร็จ</button>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
          <section className="panel">
            <SecHead title="การแจ้งเตือน" />
            {data.notis.length === 0 ? <Empty>ยังไม่มีการแจ้งเตือน</Empty>
              : <ul className="notis">{data.notis.map(n => <li key={n.id}><time>{thDate(n.created_on)}</time><span>{n.message}</span></li>)}</ul>}
          </section>
        </>
      )}
      {receipt && <Modal title="ใบเสร็จรับเงิน" onClose={() => setReceipt(null)} footer={<button className="btn" onClick={() => window.print()}>พิมพ์</button>}><Receipt p={receipt} /></Modal>}
    </div>
  );
}
