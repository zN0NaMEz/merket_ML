import { useState } from 'react';
import { api } from '../../api';
import { baht, periodLabel, phoneFmt, thDate } from '../../format';
import { Chip, Empty, Loader, PageHead, RiskCell, SecHead, useApp, useData } from '../../ui';

// 5.0 ติดตามค้างชำระ: เรียงลำดับความสำคัญด้วยคะแนนความเสี่ยงจาก AI
export default function FollowUp() {
  const { toast, bump, info } = useApp();
  const st = useData(() => api('/staff/followup'));
  const [busy, setBusy] = useState(false);
  const act = async (path, msg) => {
    setBusy(true);
    try { await api(path, { method: 'POST' }); toast(msg); bump(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Loader state={st}>{d => (
      <div className="page">
        <PageHead title="ติดตามค้างชำระ" tag="5.0 ติดตามค้างชำระ"
          sub={`ค้างเกิน ${d.rates.overdue_days} วันระบบส่งต่อเจ้าหน้าที่อัตโนมัติ · ผู้ค้าที่ AI ประเมินว่าเสี่ยงสูงจะได้รับแจ้งเตือนล่วงหน้า 5 วัน`}
          right={!info?.demo_mode && <button className="btn" disabled={busy} onClick={() => act('/system/run-daily', 'รันงานประจำวันแล้ว')}>รันงานประจำวันตอนนี้</button>} />

        <div className="two">
          <section className="panel">
            <SecHead title="ต้องตัดน้ำไฟ" sub={`ค้างชำระเกิน ${d.rates.overdue_days} วันและยังไม่ถูกตัด`} />
            {d.to_cut.length === 0 ? <Empty>ไม่มีรายการ</Empty> : (
              <div className="tbl-wrap"><table className="tbl"><tbody>{d.to_cut.map(c => (
                <tr key={c.stall_id}>
                  <td><span className="plate">{c.stall_id}</span></td>
                  <td><div className="cell-name">{c.full_name}</div><small>{phoneFmt(c.phone)} · ค้าง {c.bills} บิล สูงสุด {c.max_days} วัน</small></td>
                  <td className="num">{baht(c.total)}</td>
                  <td><button className="btn sm danger" disabled={busy} onClick={() => act(`/staff/stalls/${c.stall_id}/cut`, `บันทึกตัดน้ำไฟแผง ${c.stall_id} แล้ว`)}>บันทึกตัดน้ำไฟ</button></td>
                </tr>))}</tbody></table></div>
            )}
          </section>
          <section className="panel">
            <SecHead title="ต้องคืนน้ำไฟ" sub="ผู้ค้าชำระยอดค้างครบแล้ว" />
            {d.to_restore.length === 0 ? <Empty>ไม่มีรายการ</Empty> : (
              <div className="tbl-wrap"><table className="tbl"><tbody>{d.to_restore.map(c => (
                <tr key={c.stall_id}>
                  <td><span className="plate">{c.stall_id}</span></td>
                  <td><div className="cell-name">{c.full_name}</div><small>ถูกตัดตั้งแต่ {thDate(c.cut_date)}</small></td>
                  <td><button className="btn sm primary" disabled={busy} onClick={() => act(`/staff/stalls/${c.stall_id}/restore`, `คืนน้ำไฟแผง ${c.stall_id} แล้ว`)}>บันทึกคืนน้ำไฟ</button></td>
                </tr>))}</tbody></table></div>
            )}
            {d.cut_now.length > 0 && <p className="hint" style={{ marginTop: 10 }}>ถูกตัดน้ำไฟอยู่: {d.cut_now.map(c => c.stall_id).join(', ')}</p>}
          </section>
        </div>

        <section className="panel">
          <SecHead title={`บิลค้างชำระ (${d.overdue.length})`} />
          {d.overdue.length === 0 ? <Empty>ไม่มีบิลค้างชำระ</Empty> : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>แผง</th><th>ผู้ค้า</th><th>รอบบิล</th><th className="num">ยอด</th><th>เกินกำหนด</th><th>น้ำไฟ</th><th /></tr></thead>
              <tbody>{d.overdue.map(b => (
                <tr key={b.id}>
                  <td><span className="plate">{b.stall_id}</span></td>
                  <td><div className="cell-name">{b.full_name}</div><small>{phoneFmt(b.phone)}</small></td>
                  <td className="nowrap">{periodLabel(b.period)}</td>
                  <td className="num">{baht(b.total)}</td>
                  <td><Chip tone="bad">{b.days_overdue} วัน</Chip>{b.escalated_on && <small className="tag-src">ส่งต่อแล้ว</small>}</td>
                  <td>{b.utility_status === 'cut' ? <Chip tone="bad">ตัดแล้ว</Chip> : <Chip>ปกติ</Chip>}</td>
                  <td><button className="btn sm" onClick={() => act(`/staff/bills/${b.id}/remind`, `ส่งแจ้งเตือนแผง ${b.stall_id} แล้ว`)}>แจ้งเตือน</button></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </section>

        <section className="panel">
          <SecHead title="บิลที่ยังไม่ครบกำหนด เรียงตามความเสี่ยงจาก AI"
            sub={`โมเดล ${d.ai.risk_model === 'lr' ? 'Logistic Regression' : 'Random Forest'} · เสี่ยงสูง ≥ ${Math.round(d.ai.risk_high * 100)}% · ควรโทรติดตามรายที่อยู่บนสุดก่อน`} />
          {d.upcoming.length === 0 ? <Empty>ไม่มีบิลที่รอครบกำหนด</Empty> : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>แผง</th><th>ผู้ค้า</th><th className="num">ยอด</th><th>ครบกำหนด</th><th>โอกาสจ่ายช้า</th><th /></tr></thead>
              <tbody>{d.upcoming.map(b => (
                <tr key={b.id}>
                  <td><span className="plate">{b.stall_id}</span></td>
                  <td><div className="cell-name">{b.full_name}</div><ul className="reasons">{b.reasons.slice(0, 3).map(r => <li key={r}>{r}</li>)}</ul></td>
                  <td className="num">{baht(b.total)}</td>
                  <td className="nowrap">{thDate(b.due_date)}<br /><small>{b.days_to_due === 0 ? 'วันนี้' : `อีก ${b.days_to_due} วัน`}</small></td>
                  <td><RiskCell score={b.risk_score} level={b.level} />{b.early_reminded_on && <small>เตือนล่วงหน้าแล้ว {thDate(b.early_reminded_on)}</small>}</td>
                  <td><button className="btn sm" onClick={() => act(`/staff/bills/${b.id}/remind`, `ส่งแจ้งเตือนแผง ${b.stall_id} แล้ว`)}>แจ้งเตือน</button></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </section>

        <section className="panel">
          <SecHead title="บันทึกระบบตั้งเวลา" />
          <ul className="notis">{d.jobs.map((j, i) => <li key={i}><time>{thDate(j.run_date)}</time><span>{j.summary}</span></li>)}</ul>
        </section>
      </div>
    )}</Loader>
  );
}
