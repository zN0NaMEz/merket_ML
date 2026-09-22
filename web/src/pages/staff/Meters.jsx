import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { thDate } from '../../format';
import { Chip, Loader, PageHead, useApp, useData } from '../../ui';

const KIND = { misread: 'จดผิด', high: 'สูงผิดปกติ', low: 'ต่ำผิดปกติ', pattern: 'รูปแบบผิดปกติ' };

// 3.0 บันทึกมิเตอร์และออกบิล: AI ตรวจค่าผิดปกติทันทีที่กรอก และบล็อกการออกบิลจนกว่าจะตรวจครบ
export default function Meters() {
  const { toast, info, bump } = useApp();
  const nav = useNavigate();
  const st = useData(() => api('/staff/meters'));
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);

  const send = async readings => {
    try { st.setData(await api('/staff/meters/check', { method: 'POST', body: { readings } })); } catch (e) { toast(e.message, 'bad'); }
  };
  const commit = async (row, field) => {
    const e = edits[row.stall_id];
    if (!e || e[field] === undefined) return;
    const val = e[field] === '' ? null : Number(e[field]);
    if (val !== row[field]) await send([{ stall_id: row.stall_id, cur_water: row.cur_water, cur_elec: row.cur_elec, [field]: val, ack: false }]);
    setEdits(x => { const r = { ...x[row.stall_id] }; delete r[field]; return { ...x, [row.stall_id]: r }; });
  };
  const sample = async () => { setBusy(true); try { st.setData(await api('/staff/meters/sample', { method: 'POST' })); setEdits({}); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  const issue = async () => {
    setBusy(true);
    try {
      const r = await api('/staff/meters/issue', { method: 'POST' });
      toast(r.summary); bump(); nav('/staff');
    } catch (e) { toast(e.message, 'bad'); st.reload(); } finally { setBusy(false); }
  };

  return (
    <Loader state={st}>{d => {
      const res = Object.fromEntries((d.results || []).map(r => [r.stall_id, r]));
      const filled = d.rows.filter(r => r.cur_water != null && r.cur_elec != null).length;
      const flagged = (d.results || []).filter(r => r.anomaly);
      const unresolved = flagged.filter(r => r.kind === 'misread' || !d.rows.find(x => x.stall_id === r.stall_id)?.ack);
      const val = (row, f) => edits[row.stall_id]?.[f] ?? (row[f] ?? '');
      return (
        <div className="page">
          <PageHead title={`จดมิเตอร์รอบ${d.period_label}`} tag="3.0 บันทึกมิเตอร์และออกบิล"
            sub={<>AI ตรวจแต่ละแผงเทียบประวัติ 12 เดือนและแผงประเภทเดียวกัน · วิธี {d.ai.anomaly_method === 'both' ? 'z-score + Isolation Forest' : d.ai.anomaly_method === 'z' ? 'z-score' : 'Isolation Forest'}</>}
            right={info?.demo_mode && <button className="btn" disabled={busy} onClick={sample}>กรอกค่าจากเครื่องจดมิเตอร์ (ตัวอย่าง)</button>} />
          {!d.can_record && <div className="banner warn"><strong>ยังไม่ถึงรอบจด</strong>รอบ{d.period_label} บันทึกและออกบิลได้ตั้งแต่ {thDate(d.record_from)}</div>}
          {d.ml_error && <div className="banner"><strong>ML service ไม่พร้อม</strong>{d.ml_error}</div>}
          <section className="panel">
            <div className="tbl-wrap"><table className="tbl meter-tbl">
              <thead><tr><th>แผง</th><th className="num">น้ำ ก่อนหน้า</th><th>น้ำ ครั้งนี้</th><th className="num">ใช้</th><th className="num">ไฟ ก่อนหน้า</th><th>ไฟ ครั้งนี้</th><th className="num">ใช้</th><th>ผลตรวจ AI</th></tr></thead>
              <tbody>{d.rows.map(row => {
                const r = res[row.stall_id];
                const cls = r?.anomaly ? (row.ack && r.kind !== 'misread' ? 'acked' : 'flag') : '';
                return (
                  <tr key={row.stall_id} className={cls}>
                    <td><span className="plate">{row.stall_id}</span><br /><small>{row.vendor_name}</small></td>
                    <td className="num">{row.prev_water.toLocaleString()}</td>
                    <td><input className="input num" inputMode="numeric" aria-label={`เลขมิเตอร์น้ำ ${row.stall_id}`} value={val(row, 'cur_water')}
                      onChange={e => setEdits(x => ({ ...x, [row.stall_id]: { ...x[row.stall_id], cur_water: e.target.value.replace(/\D/g, '') } }))}
                      onBlur={() => commit(row, 'cur_water')} /></td>
                    <td className="num use">{r?.use_water ?? ''}</td>
                    <td className="num">{row.prev_elec.toLocaleString()}</td>
                    <td><input className="input num" inputMode="numeric" aria-label={`เลขมิเตอร์ไฟ ${row.stall_id}`} value={val(row, 'cur_elec')}
                      onChange={e => setEdits(x => ({ ...x, [row.stall_id]: { ...x[row.stall_id], cur_elec: e.target.value.replace(/\D/g, '') } }))}
                      onBlur={() => commit(row, 'cur_elec')} /></td>
                    <td className="num use">{r?.use_elec ?? ''}</td>
                    <td className="ai-cell">
                      {!r ? <span className="muted">รอกรอก</span>
                        : r.kind === 'skip' ? <Chip>ประวัติไม่พอ</Chip>
                          : !r.anomaly ? <><Chip tone="good">ปกติ</Chip><div className="scores">IF {r.if_score} · z น้ำ {r.z_water} ไฟ {r.z_elec}</div></>
                            : <>
                              <Chip tone="bad">{KIND[r.kind]}</Chip>
                              <ul className="reasons">{r.reasons.map(x => <li key={x}>{x}</li>)}</ul>
                              {r.if_score != null && <div className="scores">IF {r.if_score} · z น้ำ {r.z_water} ไฟ {r.z_elec}</div>}
                              {r.kind === 'misread'
                                ? <small className="t-bad">แก้ไขตัวเลขก่อนออกบิล</small>
                                : <label className="ack"><input type="checkbox" checked={row.ack} onChange={e => send([{ stall_id: row.stall_id, cur_water: row.cur_water, cur_elec: row.cur_elec, ack: e.target.checked }])} />ตรวจหน้างานแล้ว ค่าถูกต้อง</label>}
                            </>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          </section>
          <div className="meter-foot">
            <div className="counts">
              <span>กรอกแล้ว <b>{filled}/{d.rows.length}</b></span>
              <span>AI พบผิดปกติ <b>{flagged.length}</b></span>
              <span>รอตรวจ <b className={unresolved.length ? 't-bad' : ''}>{unresolved.length}</b></span>
            </div>
            <button className="btn primary" disabled={busy || !d.can_record || filled < d.rows.length || unresolved.length > 0} onClick={issue}>ยืนยันและออกบิล {d.rows.length} แผง</button>
          </div>
        </div>
      );
    }}</Loader>
  );
}
