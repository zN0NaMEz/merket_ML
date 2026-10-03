import { useState } from 'react';
import { api } from '../../api';
import { useApp, useData } from '../../ui';
import { STALL_TYPES, SEASONS, featureLabel } from '../../ai/featureLabels';
import { thDateTime } from '../../ai/behind';
import { BIcon, LoadError, Skeleton, StateBox } from './parts';

/*
 * รอบ 5 (เสริม): รายงานการเปลี่ยนแปลงของข้อมูลรายเดือน + สรุปการตรวจมิเตอร์เพื่อช่วยปรับเกณฑ์ · เฉพาะทีม/กรรมการ
 * อ่านรายงานที่บันทึกไว้ใน drift_reports ไม่เรียก ML ตอนเปิดหน้า · ปุ่ม "สร้างรายงานใหม่" เท่านั้นที่เรียก ML
 */
const LEVEL = {
  stable: { word: 'คงที่', tone: 'low', icon: 'good' },
  moderate: { word: 'เปลี่ยนพอสมควร', tone: 'mid', icon: 'warn' },
  significant: { word: 'เปลี่ยนมาก ควรเทรนใหม่', tone: 'high', icon: 'warn' },
};
const f3 = v => (v == null ? '–' : Number(v).toFixed(3));
const pct = v => (v == null ? '–' : `${Math.round(v * 100)}%`);
const CAT_NAME = { stall_type: STALL_TYPES, season: SEASONS };

/** chance = permutation test แยกจากความบังเอิญไม่ได้ (p ≥ 0.05) ไม่นับเป็นการเปลี่ยนจริง */
function LevelTag({ level, chance }) {
  if (chance && level && level !== 'stable') {
    return <span className="bh-level bh-level--none" title="PSI สูง แต่ทดสอบแล้วยังแยกจากความบังเอิญไม่ได้">อาจเป็นความบังเอิญ</span>;
  }
  const l = LEVEL[level];
  if (!l) return <span className="bh-level bh-level--none">ข้อมูลไม่พอ</span>;
  return <span className={`bh-level bh-level--${l.tone}`}><BIcon name={l.icon} size={15} />{l.word}</span>;
}

/** ตัวแปรประเภท: บอกหมวดที่สัดส่วนเปลี่ยนมากที่สุด */
function biggestShift(f) {
  const keys = Object.keys(f.ref_share || {});
  if (!keys.length) return '–';
  const k = keys.reduce((a, b) => (Math.abs((f.cur_share[b] ?? 0) - (f.ref_share[b] ?? 0)) > Math.abs((f.cur_share[a] ?? 0) - (f.ref_share[a] ?? 0)) ? b : a));
  return `${CAT_NAME[f.feature]?.[k] || k}: ${pct(f.ref_share[k])} → ${pct(f.cur_share[k])}`;
}

function Report({ r }) {
  if (r.status !== 'ok') return <StateBox kind="empty" title="รายงานนี้ไม่มีข้อมูลให้เทียบ">{r.message}</StateBox>;
  return (
    <div className="bh-drift">
      <div className="bh-drift__head">
        <p>เทียบบิลเดือน <b>{r.current.period}</b> ({r.current.n} ใบ) กับ 12 เดือนก่อนหน้า <b>{r.reference.from} ถึง {r.reference.to}</b> ({r.reference.n} ใบ)</p>
        <LevelTag level={r.overall} />
      </div>
      {r.small_sample && (
        <p className="bh-notice" role="note"><BIcon name="warn" size={18} />
          <span>เดือนนี้มีข้อมูล {r.current.n} ใบ ซึ่งน้อย ระบบจึงแบ่งช่องให้น้อยลงเพื่อลดความแกว่ง แต่ยังควรดูแนวโน้มหลายเดือนประกอบ</span></p>
      )}
      <table className="bh-table">
        <thead><tr><th scope="col">ปัจจัย</th><th scope="col">PSI</th><th scope="col">แกว่งปกติราว</th><th scope="col">p</th><th scope="col">ระดับ</th><th scope="col">อ้างอิง → เดือนนี้</th></tr></thead>
        <tbody>
          {r.features.map(f => (
            <tr key={f.feature}>
              <td>{featureLabel(f.feature)}</td>
              <td>{f3(f.psi)}</td>
              <td>{f3(f.noise_floor)}</td>
              <td>{f.p_value ?? '–'}</td>
              <td><LevelTag level={f.level} chance={f.chance} /></td>
              <td>{f.kind === 'numeric' ? `${f3(f.ref_mean)} → ${f3(f.cur_mean)} (ค่าเฉลี่ย)` : biggestShift(f)}</td>
            </tr>
          ))}
          {(r.excluded || []).map(e => (
            <tr key={e.feature}><td>{featureLabel(e.feature)}</td><td colSpan={5} className="bh-fine">ไม่นับ: {e.reason}</td></tr>
          ))}
          {r.meters && ['water', 'elec'].map(u => (
            <tr key={u}>
              <td>
                การใช้{u === 'water' ? 'น้ำ' : 'ไฟ'}เทียบค่าปกติของแผง (มิเตอร์ {r.meters.period}
                {r.meters.reference_kind === 'same_month' ? ' เทียบเดือนเดียวกันของปีก่อน' : ' เทียบ 12 เดือนก่อนหน้า'}
                {r.meters.excludes_flagged && ' · ไม่นับค่าที่ AI ทัก'})
              </td>
              <td>{f3(r.meters.utilities[u].psi)}</td>
              <td>{f3(r.meters.utilities[u].noise_floor)}</td>
              <td>{r.meters.utilities[u].p_value ?? '–'}</td>
              <td><LevelTag level={r.meters.utilities[u].level} chance={r.meters.utilities[u].chance} /></td>
              <td>{f3(r.meters.utilities[u].ref_mean)} → {f3(r.meters.utilities[u].cur_mean)} เท่า</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="bh-fine">
        สัดส่วนบิลที่จ่ายช้า: อ้างอิง {pct(r.label.ref_rate)} ({r.label.ref_n} ใบ) · เดือนนี้ {r.label.cur_rate == null ? 'ยังไม่รู้ผล (ยังไม่ถึงกำหนด)' : `${pct(r.label.cur_rate)} (${r.label.cur_n} ใบที่รู้ผลแล้ว)`}
        {' · '}PSI &lt; {r.thresholds.stable} คงที่ · {r.thresholds.stable}–{r.thresholds.moderate} เปลี่ยนพอสมควร · &gt; {r.thresholds.moderate} เปลี่ยนมาก
        {' · '}"แกว่งปกติราว" = PSI ที่ได้จากการสุ่มอย่างเดียวเมื่อข้อมูลมีเท่านี้ ถ้า PSI ใกล้ค่านี้ แปลว่ายังแยกไม่ออกจากความบังเอิญ
        {r.permutation && <>{' · '}p = สัดส่วนที่สุ่มสลับข้อมูล {r.permutation.n} รอบแล้วได้ PSI สูงเท่านี้ ถ้า p ≥ {r.permutation.alpha} ถือว่าอาจเป็นความบังเอิญ และไม่นับในระดับรวม</>}
      </p>
    </div>
  );
}

function ReviewStats({ s, thresholds }) {
  return (
    <div className="bh-drift">
      <p className="bh-sub">
        นับการตัดสินล่าสุดของแต่ละแผงต่อรอบ แยกตามว่าตอนถูกทัก z ห่างจากเกณฑ์ปัจจุบัน (z = {thresholds.z}) แค่ไหน ·
        "แก้ค่า" = AI จับเลขที่จดผิดได้ · "ยืนยันว่าเลขถูก" = เลขถูก แต่การใช้อาจผิดปกติจริง
      </p>
      {s.total === 0 && s.misread === 0 ? (
        <StateBox kind="empty" title="ยังไม่มีการยืนยันหรือแก้ค่า">เมื่อเจ้าหน้าที่ตรวจค่าที่ AI ทัก สรุปจะขึ้นที่นี่</StateBox>
      ) : (
        <table className="bh-table">
          <thead><tr><th scope="col">ช่วงตอนถูกทัก</th><th scope="col">ตรวจแล้ว</th><th scope="col">แก้ค่า</th><th scope="col">ยืนยันว่าเลขถูก</th><th scope="col">ต้องแก้</th></tr></thead>
          <tbody>
            {s.buckets.map(b => (
              <tr key={b.key}><td>{b.label}</td><td>{b.n}</td><td>{b.corrected}</td><td>{b.confirmed}</td><td>{b.n ? pct(b.corrected_rate) : '–'}</td></tr>
            ))}
            <tr><td>เลขน้อยกว่ารอบก่อน</td><td>{s.misread}</td><td>{s.misread}</td><td>–</td><td>{s.misread ? '100%' : '–'}</td></tr>
          </tbody>
        </table>
      )}
      {s.suggestion ? (
        <p className="bh-notice" role="note"><BIcon name="warn" size={18} /><span>{s.suggestion.text} (ปรับได้ที่หน้า "AI วิเคราะห์" ของเจ้าหน้าที่)</span></p>
      ) : s.note ? <p className="bh-fine">{s.note}</p> : <p className="bh-fine">ยังไม่มีช่วงใดที่ควรปรับเกณฑ์</p>}
      {s.no_snapshot > 0 && <p className="bh-fine">อีก {s.no_snapshot} รายการบันทึกก่อนระบบเก็บผลตรวจ ณ ตอนตัดสิน จึงไม่นับรวม</p>}
    </div>
  );
}

export default function DriftSection() {
  const { toast } = useApp();
  const st = useData(() => api('/ai/drift'));
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await api('/ai/drift/run', { method: 'POST' });
      toast('สร้างรายงานการเปลี่ยนแปลงของข้อมูลแล้ว');
      st.reload();
    } catch (e) {
      toast(e.status === 503 ? 'ระบบ AI ยังไม่พร้อม รอประมาณ 1 นาทีแล้วลองอีกครั้ง' : e.message, 'bad');
    } finally { setBusy(false); }
  };
  const latest = st.data?.reports?.[0];
  return (
    <>
      <section className="bh-sec" aria-labelledby="drift-h">
        <div className="bh-tabhead">
          <div>
            <h3 id="drift-h">ข้อมูลเปลี่ยนไปจากตอนเทรนไหม (data drift)</h3>
            <p>ถ้าพฤติกรรมการจ่ายหรือการใช้น้ำไฟเปลี่ยนมาก โมเดลที่เทรนจากข้อมูลเก่าอาจแม่นน้อยลง ระบบสร้างรายงานเองทุกครั้งที่ออกบิลรายเดือน</p>
          </div>
          <button type="button" className="btn bh-btn" onClick={run} disabled={busy} aria-busy={busy}>
            {busy ? 'กำลังสร้างรายงาน…' : 'สร้างรายงานใหม่'}
          </button>
        </div>
        {st.error && !st.data && <LoadError error={st.error} onRetry={st.reload} what="รายงาน drift" />}
        {!st.data && !st.error && <Skeleton kind="card" />}
        {st.data && !latest && (
          <StateBox kind="empty" title="ยังไม่มีรายงาน">รายงานแรกจะถูกสร้างเมื่อออกบิลรอบถัดไป หรือกด "สร้างรายงานใหม่"</StateBox>
        )}
        {latest && (
          <>
            <p className="bh-fine">รายงานล่าสุด {thDateTime(latest.created_at)}{latest.triggered_by && ` · ${latest.triggered_by}`}</p>
            <Report r={latest} />
            {st.data.reports.length > 1 && (
              <details className="bh-past">
                <summary>รายงานก่อนหน้า ({st.data.reports.length - 1})</summary>
                <ul className="bh-list">
                  {st.data.reports.slice(1).map(r => (
                    <li key={r.id}>{thDateTime(r.created_at)} · เดือน {r.current?.period ?? '–'} · <LevelTag level={r.overall} /></li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>
      {st.data && (
        <section className="bh-sec" aria-labelledby="rv-h">
          <h3 id="rv-h">ผลการตรวจค่ามิเตอร์ที่ AI ทัก (ใช้ประกอบการปรับเกณฑ์)</h3>
          <ReviewStats s={st.data.reviews} thresholds={st.data.thresholds} />
        </section>
      )}
    </>
  );
}
