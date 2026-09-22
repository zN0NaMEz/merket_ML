import { api } from '../../api';
import { baht, pct, periodLabel } from '../../format';
import { Loader, PageHead, RISK_NAME, RiskCell, SecHead, useData } from '../../ui';
import { RevenueChart } from '../../components/Charts';

// 6.0 รายงานสำหรับเจ้าของตลาด
export default function Dashboard() {
  const st = useData(() => api('/owner/dashboard'));
  return (
    <Loader state={st}>{d => {
      const k = d.kpi;
      const change = k.revenue_prev ? (k.revenue_month - k.revenue_prev) / k.revenue_prev : null;
      return (
        <div className="page">
          <PageHead title="ภาพรวมรายได้" tag="6.0 ออกเอกสารและรายงาน" />
          <div className="kpis">
            <div className="kpi"><small>รายได้เดือนนี้ (ถึงวันนี้)</small><b>฿{baht(k.revenue_month)}</b><small>เดือนก่อน ฿{baht(k.revenue_prev)}{change != null ? ` (${change >= 0 ? '+' : ''}${pct(change)})` : ''}</small></div>
            <div className="kpi"><small>ค้างชำระเกินกำหนด</small><b className={k.overdue_count ? 't-bad' : ''}>฿{baht(k.overdue_amount)}</b><small>{k.overdue_count} บิล · ตัดน้ำไฟอยู่ {k.cut_count} แผง</small></div>
            <div className="kpi"><small>รอครบกำหนด</small><b>฿{baht(k.unpaid_amount)}</b><small>{k.unpaid_count} บิล</small></div>
            <div className="kpi"><small>ชำระตรงเวลา (90 วัน)</small><b>{pct(k.on_time_rate)}</b><small>ใช้แผง {k.occupied}/{k.stalls}</small></div>
          </div>
          <section className="panel">
            <SecHead title="รายได้รายเดือน" sub="12 เดือนล่าสุด แยกตามประเภท (นับตามวันที่ชำระจริง)" />
            <RevenueChart data={d.revenue} />
          </section>
          <section className="panel">
            <SecHead title="ความเสี่ยงค้างชำระของบิลที่ยังเปิดอยู่ (AI)"
              sub={Object.entries(d.risk.levels).map(([l, n]) => `${RISK_NAME[l]} ${n}`).join(' · ')} />
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>แผง</th><th>ผู้ค้า</th><th>รอบบิล</th><th className="num">ยอด</th><th>ความเสี่ยง</th></tr></thead>
              <tbody>{d.risk.top.map(b => (
                <tr key={b.id}>
                  <td><span className="plate">{b.stall_id}</span></td>
                  <td><div className="cell-name">{b.full_name}</div><ul className="reasons">{b.reasons.slice(0, 2).map(r => <li key={r}>{r}</li>)}</ul></td>
                  <td className="nowrap">{periodLabel(b.period)}</td>
                  <td className="num">{baht(b.total)}</td>
                  <td><RiskCell score={b.risk_score} level={b.level} /></td>
                </tr>))}</tbody>
            </table></div>
          </section>
        </div>
      );
    }}</Loader>
  );
}
