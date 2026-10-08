import { useState } from 'react';
import { api } from '../../api';
import { useData } from '../../ui';
import { featureLabel } from '../../ai/featureLabels';
import { MODEL_SHORT, num, thDateTime } from '../../ai/behind';
import { thDate } from '../../format';
import { BIcon, LoadError, NoModel, RealBadge, Skeleton, StateBox, SynthBadge, TabHead, TechDetails, TrainButton } from './parts';

/*
 * แท็บ "บัตรโมเดล" (RodeMap 3.5) เฉพาะทีม/กรรมการ
 * บัตรโมเดล: ข้อความประจำมาจาก API ส่วนตัวเลขทุกตัว (ช่วงข้อมูล จำนวนแถว จริง/จำลอง) มาจาก model_runs
 * ประวัติการทำงาน: รอบเทรน การให้คะแนนใหม่ และการยืนยัน/แก้ค่ามิเตอร์
 */

const METHOD_TH = { z: 'เทียบประวัติ (z-score)', if: 'Isolation Forest', both: 'ใช้ทั้งสองวิธี' };

function Card({ c, active, lonely }) {
  const run = c.run;
  return (
    <article className="bh-card" aria-labelledby={`card-${c.key}`}>
      <header className="bh-card__head">
        <h3 id={`card-${c.key}`}>{c.title}</h3>
        {run && (run.is_synthetic ? <SynthBadge on profile={run.sim_profile} /> : <RealBadge />)}
      </header>
      {!run && lonely && <StateBox kind="empty" title="ยังไม่เคยเทรนโมเดลนี้">บัตรโมเดลจะแสดงช่วงข้อมูลและจำนวนแถวหลังเทรนครั้งแรก</StateBox>}
      <dl className="bh-kv bh-kv--card">
        <div><dt>วัตถุประสงค์</dt><dd>{c.purpose}</dd></div>
        <div><dt>นิยามป้ายคำตอบ</dt><dd>{c.label}</dd></div>
        <div><dt>ปัจจัยที่โมเดลดู</dt><dd><ul className="bh-list">{c.features.map(f => <li key={f}>{featureLabel(f)}</li>)}</ul></dd></div>
        <div><dt>วิธีที่ใช้</dt><dd>{c.algorithms}{active && <> · ตอนนี้ใช้ <b>{MODEL_SHORT[active]}</b></>}</dd></div>
        <div><dt>แหล่งข้อมูล</dt><dd>{c.source}</dd></div>
        <div><dt>ช่วงเวลาของข้อมูล</dt><dd>{run?.data_from ? `${thDate(run.data_from)} – ${thDate(run.data_to)}` : '–'}</dd></div>
        <div>
          <dt>จำนวนแถว</dt>
          <dd>{run?.n_train != null
            ? c.key === 'risk'
              ? `เทรน ${num(run.n_train)} บิล · ทดสอบ ${num(run.n_test)} บิล${c.late_rate != null ? ` · จ่ายช้า ${Math.round(c.late_rate * 100)}% ของทั้งหมด` : ''}`
              : `${num(run.n_train)} แผง·เดือน`
            : '–'}</dd>
        </div>
        <div><dt>ข้อมูลจริงหรือจำลอง</dt><dd>{run ? (run.is_synthetic ? 'ข้อมูลจำลอง: ผู้ค้าในระบบสาธิตถูกสร้างพฤติกรรมการจ่ายขึ้นมา ตัวเลขคุณภาพจึงยังใช้อ้างกับตลาดจริงไม่ได้' : 'ข้อมูลจริงของตลาด') : '–'}</dd></div>
        <div><dt>ผู้ใช้ผลลัพธ์</dt><dd>{c.users}</dd></div>
        <div><dt>ข้อจำกัด</dt><dd><ul className="bh-list">{c.limitations.map(l => <li key={l}>{l}</li>)}</ul></dd></div>
        <div><dt>เกณฑ์ที่ตั้งไว้</dt><dd>{c.key === 'risk'
          ? `เสี่ยงสูงเมื่อโอกาสจ่ายช้า ≥ ${Math.round(c.thresholds.high * 100)}% · ปานกลาง ≥ ${Math.round(c.thresholds.mid * 100)}%`
          : `${METHOD_TH[c.thresholds.method] || c.thresholds.method} · z ≥ ${c.thresholds.z} · คะแนน Isolation Forest ≥ ${c.thresholds.if}`}</dd></div>
        <div><dt>เทรนล่าสุด</dt><dd>{run ? `${thDateTime(run.trained_at)} โดย ${run.triggered_by || 'ไม่ได้บันทึก'}` : 'ยังไม่เคยเทรน'}</dd></div>
      </dl>
      {run && (
        <TechDetails>
          <dl className="bh-kv bh-kv--tech">
            <div><dt>model_type</dt><dd><code>{run.model_type}</code> · รอบที่ {run.run_id}</dd></div>
            <div><dt>scikit-learn</dt><dd>{run.sklearn_version || 'ไม่ได้บันทึก'}</dd></div>
            {run.auc != null && <div><dt>AUC ชุดทดสอบ</dt><dd>{run.auc.toFixed(3)}</dd></div>}
            {c.alt_runs?.length > 0 && (
              <div><dt>โมเดลอื่นที่เทรนรอบเดียวกัน</dt>
                <dd>{c.alt_runs.map(r => <span key={r.model_type} className="bh-alt"><code>{r.model_type}</code> AUC {r.auc?.toFixed(3) ?? '–'}</span>)}</dd>
              </div>
            )}
          </dl>
        </TechDetails>
      )}
    </article>
  );
}

/* ---------- ประวัติการทำงานของ AI ---------- */
const KIND = {
  train: { label: 'เทรนโมเดล', icon: 'refresh' },
  rescore: { label: 'ให้คะแนนบิลใหม่', icon: 'good' },
  review: { label: 'ตรวจค่ามิเตอร์', icon: 'warn' },
};
const FILTERS = [['all', 'ทั้งหมด'], ['train', 'เทรน'], ['rescore', 'ให้คะแนน'], ['review', 'มิเตอร์']];
const MODEL_TH = { risk_lr: 'ความเสี่ยง (Logistic Regression)', risk_rf: 'ความเสี่ยง (Random Forest)', risk_et: 'ความเสี่ยง (Extra Trees)',
  risk_gb: 'ความเสี่ยง (Gradient Boosting)', risk_ens: 'ความเสี่ยง (โมเดลรวม)', risk: 'ความเสี่ยง (รุ่นเดิม)', anomaly: 'ตรวจมิเตอร์' };
const UTIL = { water: 'น้ำ', elec: 'ไฟ' };

function describe(it) {
  const d = it.detail || {};
  if (it.kind === 'train') {
    return `${MODEL_TH[it.subject] || it.subject}${d.n_train != null ? ` · ${num(d.n_train)} แถว` : ''}${d.auc != null ? ` · AUC ${Number(d.auc).toFixed(3)}` : ''}`;
  }
  if (it.kind === 'rescore') return d.summary || '';
  const what = d.decision === 'corrected'
    ? `แก้ค่า${UTIL[d.utility] || ''} ${num(d.old_value)} → ${num(d.new_value)}`
    : `ยืนยันค่า${UTIL[d.utility] || ''} ${num(d.new_value ?? d.old_value)} ว่าถูก`;
  return `แผง ${it.subject} · ${what}`;
}

function Audit() {
  const [limit, setLimit] = useState(60);
  const [filter, setFilter] = useState('all');
  const st = useData(() => api(`/ai/audit?limit=${limit}`), [limit]);
  if (st.error && !st.data) return <LoadError error={st.error} onRetry={st.reload} what="ประวัติการทำงาน" />;
  if (!st.data) return <Skeleton kind="list" label="กำลังโหลดประวัติการทำงาน…" />;
  const items = st.data.items.filter(i => filter === 'all' || i.kind === filter);
  return (
    <>
      <div className="bh-filter" role="group" aria-label="กรองประวัติ">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" className={`bh-chipbtn ${filter === k ? 'is-on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {!items.length
        ? <StateBox kind="empty" title="ยังไม่มีประวัติ">{filter === 'review' ? 'ยังไม่มีใครยืนยันหรือแก้ค่ามิเตอร์ที่ AI ทัก' : 'ประวัติจะเริ่มบันทึกเมื่อมีการเทรนหรือให้คะแนนบิล'}</StateBox>
        : (
          <ol className="bh-audit">
            {items.map((it, i) => {
              const undone = it.kind === 'review' && it.detail?.undone_at;
              return (
                <li key={`${it.kind}-${it.at}-${i}`} className={`bh-audit__item bh-audit__item--${it.kind} ${undone ? 'is-undone' : ''}`}>
                  <span className="bh-audit__icon"><BIcon name={KIND[it.kind].icon} size={18} /></span>
                  <div className="bh-audit__body">
                    <p className="bh-audit__what"><b>{KIND[it.kind].label}</b> {describe(it)}</p>
                    <p className="bh-audit__meta">
                      <time dateTime={it.at}>{thDateTime(it.at)}</time>
                      {it.actor && <> · โดย {it.actor}</>}
                      {undone && <> · <span className="bh-undone">เลิกทำแล้วเมื่อ {thDateTime(it.detail.undone_at)}</span></>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      {st.data.items.length >= limit && limit < 200 && (
        <button type="button" className="btn bh-btn" onClick={() => setLimit(l => Math.min(200, l + 60))} disabled={st.loading}>ดูเพิ่ม</button>
      )}
    </>
  );
}

export default function ModelCard({ status, onTrained }) {
  const st = useData(() => api('/ai/card'));
  const anyRun = st.data?.cards.some(c => c.run);
  return (
    <div className="bh-panel">
      <TabHead title="บัตรโมเดล" synthetic={status?.is_synthetic} profile={status?.sim_profile}
        sub="โมเดลแต่ละตัวเทรนจากข้อมูลอะไร ช่วงไหน ใช้ทำอะไร และมีข้อจำกัดอะไร"
        right={<TrainButton onDone={() => { st.reload(); onTrained?.(); }} />} />
      {st.error && !st.data && <LoadError error={st.error} onRetry={st.reload} what="บัตรโมเดล" />}
      {!st.data && !st.error && <div className="bh-cards"><Skeleton kind="card" /><Skeleton kind="card" /></div>}
      {st.data && (
        <>
          {!anyRun && <NoModel onDone={() => { st.reload(); onTrained?.(); }} />}
          <div className="bh-cards">
            {st.data.cards.map(c => <Card key={c.key} c={c} lonely={anyRun} active={c.key === 'risk' ? st.data.active_model : null} />)}
          </div>
          <p className="bh-fine">ผู้รับผิดชอบ: {st.data.responsible}</p>
        </>
      )}

      <section className="bh-sec" aria-labelledby="audit-h">
        <h3 id="audit-h">ประวัติการทำงานของ AI</h3>
        <p className="bh-sub">ทุกครั้งที่เทรน ให้คะแนนบิลใหม่ หรือมีคนยืนยัน/แก้ค่ามิเตอร์ที่ AI ทัก รายการที่เลิกทำยังอยู่ในประวัติ (ไม่ลบทิ้ง)</p>
        <Audit />
      </section>
    </div>
  );
}
