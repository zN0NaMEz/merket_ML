import { useState } from 'react';
import { api } from '../../api';
import { baht, periodLabel, phoneFmt, thDate } from '../../format';
import { Chip, Empty, Loader, PageHead, RiskCell, useData } from '../../ui';

export default function Outstanding() {
  const st = useData(() => api('/owner/outstanding'));
  const [zone, setZone] = useState('');
  return (
    <Loader state={st}>{d => {
      const rows = d.rows.filter(r => !zone || r.zone === zone);
      const over = rows.filter(r => r.status === 'overdue');
      return (
        <div className="page">
          <PageHead title="ยอดค้างชำระ" tag="5.0 ติดตามค้างชำระ"
            sub={`เกินกำหนด ${over.length} บิล ฿${baht(over.reduce((s, r) => s + r.total, 0))} · รอครบกำหนด ${rows.length - over.length} บิล`}
            right={<select className="input" style={{ width: 'auto' }} value={zone} onChange={e => setZone(e.target.value)} aria-label="กรองตามโซน">
              <option value="">ทุกโซน</option>{['A', 'B', 'C', 'D', 'E'].map(z => <option key={z} value={z}>โซน {z}</option>)}
            </select>} />
          <section className="panel">
            {rows.length === 0 ? <Empty>ไม่มีรายการ</Empty> : (
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>แผง</th><th>ผู้ค้า</th><th>รอบบิล</th><th className="num">ยอด</th><th>สถานะ</th><th>ความเสี่ยง (AI)</th></tr></thead>
                <tbody>{rows.map(r => (
                  <tr key={r.id}>
                    <td><span className="plate">{r.stall_id}</span></td>
                    <td><div className="cell-name">{r.full_name}</div><small>{phoneFmt(r.phone)}</small></td>
                    <td className="nowrap">{periodLabel(r.period)}<br /><small>ครบกำหนด {thDate(r.due_date)}</small></td>
                    <td className="num">{baht(r.total)}</td>
                    <td>{r.status === 'overdue' ? <Chip tone="bad">เกิน {r.days} วัน</Chip> : <Chip>อีก {-r.days} วัน</Chip>}{r.utility_status === 'cut' && <> <Chip tone="bad">ตัดน้ำไฟ</Chip></>}</td>
                    <td><RiskCell score={r.risk_score} level={r.level} /></td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </section>
        </div>
      );
    }}</Loader>
  );
}
