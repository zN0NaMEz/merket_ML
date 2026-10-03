import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useApp, useData } from '../../ui';
import { thDateTime } from '../../ai/behind';
import { METRIC_LABEL, MODEL_LABEL, TASK_LABEL, VERDICT, hypothesisDetail, insights, modelList, pct, toCsv } from '../../ai/evaluation';
import { BIcon, LoadError, Skeleton, StateBox, SynthBadge, TabHead, TechDetails } from './parts';

/*
 * แท็บ "ทดสอบหลายชุดข้อมูล" (model evaluation) · เฉพาะทีม/กรรมการ
 * ML สร้างข้อมูลจำลองหลายสถานการณ์ (seed คงที่) แล้ววัดผลทุกโมเดลด้วยขั้นตอนเดียวกับการเทรนจริง
 * ผลอยู่ในตาราง model_evaluations หน้านี้อ่านจากฐานข้อมูลอย่างเดียว ปุ่ม "รันการทดสอบ" เท่านั้นที่เรียก ML
 */
const f3 = v => (v == null ? '–' : Number(v).toFixed(3));
const POLL_MS = 5000;

const RISK_COLS = [
  ['auc', 'AUC', 'แยกบิลช้า/ตรงเวลาได้ดีแค่ไหน (0.5 = เดาสุ่ม)'],
  ['pr_auc', 'PR-AUC', 'เหมาะกับข้อมูลไม่สมดุล ค่าเดาสุ่ม = สัดส่วนบิลที่จ่ายช้า'],
  ['cv', 'CV AUC ± SD', '5-fold cross-validation บนข้อมูลทั้งชุด'],
  ['precision', 'Precision', 'ที่เตือน จ่ายช้าจริงกี่ส่วน'],
  ['recall', 'Recall', 'ที่จ่ายช้าจริง เตือนทันกี่ส่วน'],
  ['f1', 'F1', 'ค่าเฉลี่ยฮาร์มอนิกของ precision กับ recall'],
  ['accuracy', 'Accuracy', 'ทายถูกทั้งหมดกี่ส่วน'],
  ['brier', 'Brier ↓', 'ความคลาดเคลื่อนของความน่าจะเป็น ยิ่งต่ำยิ่งดี'],
];
const ANOM_COLS = [
  ['precision', 'Precision', 'ที่ทัก ผิดปกติจริงกี่ส่วน'],
  ['recall', 'Recall', 'ค่าผิดปกติจริง ทักได้กี่ส่วน'],
  ['f1', 'F1', 'สมดุลระหว่าง precision กับ recall'],
  ['auc', 'AUC', 'แยกค่าผิดปกติจากค่าปกติด้วยคะแนนได้ดีแค่ไหน'],
  ['pr_auc', 'PR-AUC', 'ค่าเดาสุ่ม = สัดส่วนค่าผิดปกติ'],
  ['fa', 'ทักผิด/100 ค่า ↓', 'จำนวนครั้งที่ทักค่าปกติ ต่อการอ่าน 100 ค่า'],
  ['kinds', 'จับได้: สูง / ต่ำ', 'recall แยกชนิด: ใช้มากผิดปกติ / ใช้น้อยผิดปกติ (ชุดน้ำ–ไฟสวนทางแสดงเป็นชนิดเดียว)'],
];

function cell(r, key) {
  if (key === 'cv') return r.cv_auc_mean == null ? '–' : `${f3(r.cv_auc_mean)} ± ${f3(r.cv_auc_std)}`;
  if (key === 'fa') return r.extra?.false_alarms_per_100 ?? '–';
  if (key === 'kinds') {
    const k = r.extra?.recall_by_kind || {};
    if (k.pattern != null && k.high == null && k.low == null) return `สวนทาง ${pct(k.pattern)}`;
    return `${k.high == null ? '–' : pct(k.high)} / ${k.low == null ? '–' : pct(k.low)}`;
  }
  return f3(r[key]);
}

function MetricTable({ task, rows, datasets, best, cols }) {
  const order = datasets.filter(d => d.task === task).map(d => d.key);
  const caption = task === 'risk'
    ? 'ผลวัดโมเดลความเสี่ยงจ่ายช้าในแต่ละชุดข้อมูลจำลอง (ชุดทดสอบ 25%, เกณฑ์ 0.5)'
    : 'ผลวัดวิธีตรวจค่ามิเตอร์ผิดปกติในแต่ละชุดข้อมูลจำลอง (40% ช่วงหลัง)';
  return (
    <div className="bh-scroll" tabIndex={0} role="region" aria-label={caption}>
      <table className="bh-table bh-evt">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">ชุดข้อมูล</th>
            <th scope="col">{task === 'risk' ? 'โมเดล' : 'วิธี'}</th>
            {cols.map(([k, label, hint]) => <th key={k} scope="col" title={hint}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {order.map(key => {
            const rs = rows.filter(r => r.task === task && r.dataset === key);
            const d = datasets.find(x => x.task === task && x.key === key);
            const win = best[`${task}/${key}`];
            return rs.map((r, i) => {
              const isBest = win?.models.includes(r.model);
              return (
                <tr key={`${key}-${r.model}`} className={`${i === 0 ? 'is-first' : ''} ${r.model === 'baseline' ? 'is-ref' : ''} ${isBest ? 'is-best' : ''}`}>
                  {i === 0 && (
                    <th scope="rowgroup" rowSpan={rs.length} className="bh-evt__ds">
                      {d?.title || key}
                      <small>{d ? `ทดสอบ ${(d.n_test ?? d.n_rows).toLocaleString('th-TH')} ${task === 'risk' ? 'บิล' : 'ค่า'} จากทั้งหมด ${d.n_rows.toLocaleString('th-TH')}` : ''}</small>
                    </th>
                  )}
                  <td className="bh-evt__model">
                    {MODEL_LABEL[r.model] || r.model}
                    {isBest && <span className="bh-best" title={`สูงสุดของชุดนี้ตาม ${win.metric === 'cv_auc_mean' ? 'CV AUC' : 'F1'}`}>★ ดีที่สุด</span>}
                  </td>
                  {cols.map(([k]) => <td key={k} className="bh-num">{cell(r, k)}</td>)}
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

function Summary({ summary, datasets }) {
  const count = t => datasets.filter(d => d.task === t).length;
  return (
    <div className="bh-scroll" tabIndex={0} role="region" aria-label="ค่าเฉลี่ยข้ามทุกชุดข้อมูล">
      <table className="bh-table bh-evt">
        <thead>
          <tr><th scope="col">งาน</th><th scope="col">โมเดล / วิธี</th><th scope="col">AUC เฉลี่ย ± SD</th><th scope="col">PR-AUC เฉลี่ย ± SD</th>
            <th scope="col">F1 เฉลี่ย ± SD</th><th scope="col">ดีที่สุดกี่ชุด</th></tr>
        </thead>
        <tbody>
          {summary.map(s => (
            <tr key={`${s.task}-${s.model}`} className={s.model === 'baseline' ? 'is-ref' : ''}>
              <td>{TASK_LABEL[s.task]}</td>
              <td>{MODEL_LABEL[s.model] || s.model}</td>
              {['auc', 'pr_auc', 'f1'].map(m => (
                <td key={m} className="bh-num">{s.metrics[m] ? `${f3(s.metrics[m].mean)} ± ${f3(s.metrics[m].sd)}` : '–'}</td>
              ))}
              <td className="bh-num">{s.model === 'baseline' ? '–' : `${s.wins} / ${count(s.task)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ชุดที่ออกแบบให้โมเดลต่างกัน: สมมติฐาน ค่าที่วัดได้ และผลตัดสิน */
function Hypotheses({ items }) {
  return (
    <ul className="bh-hyp">
      {[...items].sort((a, b) => (a.task === b.task ? 0 : a.task === 'risk' ? -1 : 1)).map(h => {
        const v = VERDICT[h.held] || VERDICT.unclear;
        return (
          <li key={`${h.task}-${h.dataset}`} className={`bh-hyp__item is-${h.held}`}>
            <div className="bh-hyp__head">
              <b>{h.title}</b>
              <span className={`bh-level bh-level--${v.tone}`}><span aria-hidden="true">{v.icon}</span> {v.word}</span>
            </div>
            <p className="bh-hyp__claim">คาดว่า <b>{modelList(h.expect)}</b> ชนะ เพราะ{h.hypothesis}</p>
            <p className="bh-hyp__vals">
              {METRIC_LABEL[h.metric] || h.metric}:{' '}
              {Object.entries(h.values).map(([m, val], i) => (
                <span key={m}>{i ? ' · ' : ''}{MODEL_LABEL[m] || m} <b>{f3(val)}</b></span>
              ))}
            </p>
            <p className="bh-fine">{hypothesisDetail(h)}</p>
          </li>
        );
      })}
    </ul>
  );
}

function download(rows, datasets, batchId) {
  const blob = new Blob([toCsv(rows, datasets)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `model-evaluation-${batchId}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function EvalTab() {
  const { toast } = useApp();
  const [batchId, setBatchId] = useState(null);
  const st = useData(() => api(`/ai/evaluations${batchId ? `?batch=${batchId}` : ''}`), [batchId]);
  const [starting, setStarting] = useState(false);
  const d = st.data;
  const running = d?.running && !d.running.stale ? d.running : null;

  // ระหว่างรัน ถามความคืบหน้าทุก 5 วินาที (เฉพาะตอนแท็บของเบราว์เซอร์เปิดอยู่) จบแล้วโหลดผลใหม่เอง
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') st.reload(); }, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running?.id]);

  const run = async () => {
    setStarting(true);
    try {
      const r = await api('/ai/evaluations/run', { method: 'POST' });
      toast(r.already_running ? 'มีการทดสอบที่กำลังรันอยู่แล้ว แสดงความคืบหน้าของชุดนั้น' : 'เริ่มทดสอบแล้ว ใช้เวลาไม่กี่นาที หน้านี้จะอัปเดตเอง');
      setBatchId(null);
      st.reload();
    } catch (e) {
      toast(e.status === 503 || !e.status ? 'ระบบ AI ยังไม่พร้อม รอประมาณ 1 นาทีแล้วลองอีกครั้ง' : e.message, 'bad');
    } finally { setStarting(false); }
  };

  const doneBatches = (d?.batches || []).filter(b => b.status === 'done');
  const lastFailed = d?.batches?.[0]?.status === 'failed' ? d.batches[0] : null;
  const notes = d ? insights(d.rows, d.datasets) : [];

  return (
    <div className="bh-panel">
      <TabHead title="ทดสอบโมเดลกับข้อมูลจำลองหลายชุด" synthetic
        sub="สร้างตลาดจำลองหลายสถานการณ์ แล้ววัดผลทุกโมเดลด้วยวิธีเดียวกับการเทรนจริง เพื่อดูว่าโมเดลเก่งและอ่อนตรงไหน ไม่กระทบโมเดลที่ใช้งานจริง"
        right={(
          <div className="bh-evbar">
            <button type="button" className="btn primary bh-btn" onClick={run} disabled={starting || Boolean(running)} aria-busy={starting}>
              {running ? 'กำลังทดสอบ…' : starting ? 'กำลังเริ่ม…' : 'รันการทดสอบใหม่'}
            </button>
            {d?.rows?.length > 0 && (
              <button type="button" className="btn bh-btn" onClick={() => download(d.rows, d.datasets, d.batch.id)}>ดาวน์โหลด CSV</button>
            )}
          </div>
        )} />

      {running && (
        <div className="bh-progress" role="status" aria-live="polite">
          <p>กำลังทดสอบชุดที่ {running.id} · เสร็จ {running.progress} จาก {running.total} ชุดข้อมูล (เริ่ม {thDateTime(running.created_at)})</p>
          <div className="bh-progress__bar" role="progressbar" aria-valuemin={0} aria-valuemax={running.total} aria-valuenow={running.progress}
            aria-label="ความคืบหน้าการทดสอบ">
            <i style={{ width: `${running.total ? (running.progress / running.total) * 100 : 5}%` }} />
          </div>
          <p className="bh-fine">{d?.batch ? 'ผลชุดล่าสุดที่เสร็จแล้วยังแสดงอยู่ด้านล่างระหว่างรอ' : 'ผลจะแสดงที่นี่เมื่อทดสอบเสร็จ หน้านี้อัปเดตเองทุก 5 วินาที'}</p>
        </div>
      )}
      {lastFailed && !running && (
        <p className="bh-notice bh-notice--bad" role="alert"><BIcon name="warn" size={18} />
          <span>การทดสอบชุดที่ {lastFailed.id} ไม่สำเร็จ: {lastFailed.error || 'ไม่ทราบสาเหตุ'} กด "รันการทดสอบใหม่" เพื่อลองอีกครั้ง</span></p>
      )}

      {st.error && !d && <LoadError error={st.error} onRetry={st.reload} what="ผลการทดสอบ" />}
      {!d && !st.error && <><Skeleton kind="card" /><Skeleton kind="list" /></>}
      {d && !d.batch && !running && (
        <StateBox kind="empty" title="ยังไม่เคยทดสอบ" action={<button type="button" className="btn primary bh-btn" onClick={run} disabled={starting}>รันการทดสอบ</button>}>
          กด "รันการทดสอบ" ระบบจะสร้างข้อมูลจำลอง 12 ชุดแล้ววัดผลทุกโมเดล ใช้เวลาราว 1–5 นาที (นานขึ้นถ้าระบบ AI เพิ่งตื่น)
        </StateBox>
      )}

      {d?.batch && (
        <>
          <div className="bh-evmeta">
            <p className="bh-fine">
              ผลชุดที่ {d.batch.id} · เสร็จเมื่อ {thDateTime(d.batch.finished_at)} · สั่งโดย {d.batch.triggered_by || 'ไม่ได้บันทึก'}
            </p>
            {doneBatches.length > 1 && (
              <label className="bh-evpick">ดูผลชุดก่อนหน้า
                <select className="bh-input" value={d.batch.id} onChange={e => setBatchId(Number(e.target.value))}>
                  {doneBatches.map(b => <option key={b.id} value={b.id}>ชุดที่ {b.id} · {thDateTime(b.finished_at)}</option>)}
                </select>
              </label>
            )}
          </div>

          {notes.length > 0 && (
            <section className="bh-sec" aria-labelledby="ev-notes">
              <h3 id="ev-notes">ข้อสังเกตจากผลวัด</h3>
              <ul className="bh-evnotes">
                {notes.map((n, i) => <li key={i} className={`is-${n.tone}`}><BIcon name="warn" size={16} /><span>{n.text}</span></li>)}
              </ul>
            </section>
          )}

          {d.hypotheses?.length > 0 && (
            <section className="bh-sec" aria-labelledby="ev-hyp">
              <h3 id="ev-hyp">ชุดที่ออกแบบให้โมเดลต่างกัน: เป็นไปตามคาดไหม</h3>
              <p className="bh-sub">
                แต่ละชุดสร้างให้มีจุดที่โมเดลหนึ่งควรได้เปรียบ แล้ววัดว่าจริงไหม · ความเสี่ยงเทียบผล 5-fold CV แบบจับคู่ (paired t-test)
                มิเตอร์เทียบ F1 · ผลที่ "สรุปไม่ได้" ก็เป็นข้อมูล: แปลว่าข้อมูลแบบนั้นแยกโมเดลไม่ออก
              </p>
              <p className="bh-fine">
                เป็นไปตามคาด {d.hypotheses.filter(h => h.held === 'yes').length} · สวนทาง {d.hypotheses.filter(h => h.held === 'no').length} ·
                สรุปไม่ได้ {d.hypotheses.filter(h => h.held === 'unclear').length} จาก {d.hypotheses.length} ชุด
              </p>
              <Hypotheses items={d.hypotheses} />
            </section>
          )}

          <section className="bh-sec" aria-labelledby="ev-ds">
            <h3 id="ev-ds">ข้อมูลจำลองที่ใช้ ({d.datasets.length} ชุด)</h3>
            <p className="bh-sub">สร้างจาก seed คงที่ รันซ้ำได้ข้อมูลเดิมทุกครั้ง · ส่งออกเป็น CSV ได้ด้วยคำสั่ง <code>python -m app.benchmark --export DIR</code></p>
            <div className="bh-dsgrid">
              {['risk', 'anomaly'].map(task => (
                <div key={task}>
                  <h4 className="bh-h4">{TASK_LABEL[task]}</h4>
                  <ul className="bh-dslist">
                    {d.datasets.filter(x => x.task === task).map(x => (
                      <li key={x.key}>
                        <b>{x.title}</b>{' '}
                        <span className="bh-fine">
                          ({x.n_rows.toLocaleString('th-TH')} {task === 'risk' ? 'บิล' : 'ค่ามิเตอร์'} · {task === 'risk' ? 'จ่ายช้า' : 'ผิดปกติ'} {pct(x.positive_rate)}
                          {x.n_test != null && ` · ใช้วัดผล ${x.n_test.toLocaleString('th-TH')}`} · seed {x.seed})
                        </span>
                        <p>{x.description}</p>
                        {x.expect?.length > 0 && <p className="bh-dslist__exp">ออกแบบให้ {modelList(x.expect)} ได้เปรียบ</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="bh-sec" aria-labelledby="ev-risk">
            <h3 id="ev-risk">โมเดลความเสี่ยงจ่ายช้า</h3>
            <p className="bh-sub">★ ดีที่สุด = CV AUC เฉลี่ยสูงสุดของชุดนั้น (นิ่งกว่าชุดทดสอบชุดเดียว ไม่นับเกณฑ์อ้างอิง) · คอลัมน์อื่นจากชุดทดสอบ 25% ที่เกณฑ์ 0.5 · ชี้ที่หัวคอลัมน์เพื่อดูความหมาย</p>
            <MetricTable task="risk" rows={d.rows} datasets={d.datasets} best={d.best} cols={RISK_COLS} />
          </section>

          <section className="bh-sec" aria-labelledby="ev-anom">
            <h3 id="ev-anom">วิธีตรวจค่ามิเตอร์ผิดปกติ</h3>
            <p className="bh-sub">ข้อมูลจำลองรู้คำตอบว่าค่าไหนผิดปกติ จึงวัด precision/recall ได้ (ข้อมูลจริงไม่มีป้ายคำตอบ) · ★ ดีที่สุด = F1 สูงสุดของชุดนั้น</p>
            <MetricTable task="anomaly" rows={d.rows} datasets={d.datasets} best={d.best} cols={ANOM_COLS} />
          </section>

          <section className="bh-sec" aria-labelledby="ev-sum">
            <h3 id="ev-sum">สรุปเฉลี่ยทุกชุดข้อมูล</h3>
            <Summary summary={d.summary} datasets={d.datasets} />
          </section>

          {d.protocol && (
            <TechDetails title="วิธีวัดผลและรายละเอียดรายแถว">
              <dl className="bh-kv bh-kv--tech">
                <div><dt>ความเสี่ยง: การแบ่งข้อมูล</dt><dd>{d.protocol.risk?.split} · {d.protocol.risk?.cv} · เกณฑ์ {d.protocol.risk?.threshold}</dd></div>
                <div><dt>มิเตอร์: การแบ่งข้อมูล</dt><dd>{d.protocol.anomaly?.split} · z ≥ {d.protocol.anomaly?.z_threshold} · Isolation Forest ≥ {d.protocol.anomaly?.if_threshold}</dd></div>
              </dl>
              <div className="bh-scroll" tabIndex={0} role="region" aria-label="confusion matrix รายแถว">
                <table className="bh-table bh-evt">
                  <thead><tr><th scope="col">งาน</th><th scope="col">ชุดข้อมูล</th><th scope="col">โมเดล</th><th scope="col">TP</th><th scope="col">FP</th>
                    <th scope="col">FN</th><th scope="col">TN</th><th scope="col">เทรน / ทดสอบ</th><th scope="col">CV AUC รายพับ</th></tr></thead>
                  <tbody>
                    {d.rows.map(r => (
                      <tr key={`${r.task}-${r.dataset}-${r.model}`}>
                        <td>{r.task}</td><td><code>{r.dataset}</code></td><td><code>{r.model}</code></td>
                        {['tp', 'fp', 'fn', 'tn'].map(k => <td key={k} className="bh-num">{r.extra?.confusion?.[k] ?? '–'}</td>)}
                        <td className="bh-num">{r.extra?.n_train ?? '–'} / {r.extra?.n_test ?? '–'}</td>
                        <td className="bh-num">{r.extra?.cv_scores?.auc?.map(f3).join(', ') || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TechDetails>
          )}
          <p className="bh-fine"><SynthBadge on compact /> ตัวเลขในแท็บนี้มาจากข้อมูลจำลองทั้งหมด ใช้เปรียบเทียบจุดแข็งจุดอ่อนของโมเดล ไม่ใช่ความแม่นกับตลาดจริง (ดูแท็บคุณภาพโมเดล)</p>
        </>
      )}
    </div>
  );
}
