import { useState } from 'react';
import { api } from '../../api';
import { useData } from '../../ui';
import { thDate } from '../../format';
import { MODEL_PLAIN, MODEL_SHORT, num, thDateTime } from '../../ai/behind';
import { AucHistory, CalibrationChart, ConfusionMatrix, ImportanceBars } from './QualityCharts';
import DriftSection from './DriftSection';
import { BIcon, LoadError, NoModel, Skeleton, StateBox, TabHead, TechDetails } from './parts';

/*
 * แท็บ "คุณภาพโมเดล" (RodeMap 3.4)
 * เจ้าของ: สรุปภาษาง่าย ไม่เกิน 4 ข้อ + กราฟ AUC ข้ามรอบ
 * ทีม/กรรมการ: AUC/precision/recall พร้อม CV ค่าเฉลี่ย ± SD, confusion matrix, calibration, ความสำคัญของปัจจัย, ประวัติ
 * ตัวเลขทุกตัวมาจาก model_runs ถ้าไม่มีให้แสดงว่าไม่มี ไม่เติมค่าเอง
 */
const f3 = v => (v == null ? '–' : Number(v).toFixed(3));
const pct = v => (v == null ? '–' : `${Math.round(v * 100)}%`);
const TREND = { better: { word: 'ดีขึ้นจากรอบก่อน', icon: 'good', tone: 'good' }, same: { word: 'ใกล้เคียงรอบก่อน', icon: 'good', tone: 'idle' }, worse: { word: 'แย่ลงจากรอบก่อน', icon: 'warn', tone: 'bad' } };
const AUC_TONE = { 'ดี': 'good', 'พอใช้': 'warn', 'อ่อน': 'bad', 'ใช้ไม่ได้': 'bad' };

function OwnerSummary({ d }) {
  const s = d.summary;
  if (!s) return <NoModel />;
  const tr = s.trend && TREND[s.trend.word];
  return (
    <>
      <ul className="bh-owner-q">
        <li className={`bh-owner-q__card is-${AUC_TONE[s.auc_word] || 'idle'}`}>
          <span className="bh-owner-q__k">ระบบแยกบิลที่จะจ่ายช้าได้</span>
          <b className="bh-owner-q__v">{s.auc_word || '–'}</b>
          <span className="bh-owner-q__s">คะแนน {s.auc != null ? s.auc.toFixed(2) : '–'} จากเต็ม 1.00 (0.50 = เดาสุ่ม)</span>
        </li>
        <li className="bh-owner-q__card">
          <span className="bh-owner-q__k">บิลที่จ่ายช้าจริง 10 ใบ</span>
          <b className="bh-owner-q__v">เตือนถูก {s.caught_of10 ?? '–'} ใบ</b>
          <span className="bh-owner-q__s">อีก {s.caught_of10 == null ? '–' : 10 - s.caught_of10} ใบระบบไม่ได้เตือน</span>
        </li>
        <li className="bh-owner-q__card">
          <span className="bh-owner-q__k">ที่ระบบเตือน 10 ใบ</span>
          <b className="bh-owner-q__v">จ่ายช้าจริง {s.right_of10 ?? '–'} ใบ</b>
          <span className="bh-owner-q__s">ที่เหลือคือเตือนเผื่อไว้ก่อน</span>
        </li>
        <li className={`bh-owner-q__card is-${tr?.tone || 'idle'}`}>
          <span className="bh-owner-q__k">เทียบกับการเทรนครั้งก่อน</span>
          <b className="bh-owner-q__v">{tr ? <><BIcon name={tr.icon} size={24} />{tr.word}</> : 'ยังไม่มีรอบก่อนให้เทียบ'}</b>
          <span className="bh-owner-q__s">เทรนล่าสุด {thDateTime(s.trained_at)}</span>
        </li>
      </ul>
      <p className="bh-fine">
        วัดจากบิล {num(s.n_test)} ใบที่กันไว้ไม่ให้ระบบเห็นตอนเรียน · เรียนจากบิล {num(s.n_train)} ใบ
        {s.data_from && <> ช่วง {thDate(s.data_from)} – {thDate(s.data_to)}</>}
        {s.is_synthetic && ' · ตัวเลขทั้งหมดมาจากข้อมูลจำลอง ยังใช้อ้างกับตลาดจริงไม่ได้'}
      </p>
      <section className="bh-sec">
        <h3>ความแม่นของแต่ละครั้งที่เทรน</h3>
        {d.history.length ? <AucHistory runs={d.history.map((h, i) => ({ ...h, id: h.id ?? i }))} owner /> : <StateBox kind="empty" title="ยังไม่มีประวัติการเทรน" />}
      </section>
    </>
  );
}

function Metric({ label, hint, test, cv }) {
  return (
    <li className="bh-metric">
      <span className="bh-metric__k">{label}</span>
      <b className="bh-metric__v">{f3(test)}</b>
      <span className="bh-metric__cv">{cv ? <>CV {f3(cv.mean)} ± {f3(cv.sd)}</> : 'ไม่มีผล CV'}</span>
      <span className="bh-fine">{hint}</span>
    </li>
  );
}

function FullView({ d }) {
  const [pick, setPick] = useState(d.active_model);
  const m = d.models[pick] || d.models[d.active_model] || d.models.lr || d.models.rf;
  if (!d.models.lr && !d.models.rf) return <NoModel />;
  return (
    <>
      <div className="bh-seg" role="group" aria-label="เลือกโมเดล">
        {['lr', 'rf'].map(k => (
          <button key={k} type="button" className={`bh-seg__btn ${pick === k ? 'is-on' : ''}`} aria-pressed={pick === k} onClick={() => setPick(k)} disabled={!d.models[k]}>
            {MODEL_SHORT[k]}{d.active_model === k && ' · ใช้อยู่'}
          </button>
        ))}
      </div>
      {m && (
        <>
          <p className="bh-fine">
            {MODEL_PLAIN[pick]} · เทรน {thDateTime(m.trained_at)} โดย {m.triggered_by || 'ไม่ได้บันทึก'} · เทรน {num(m.n_train)} / ทดสอบ {num(m.n_test)} บิล
            {m.late_rate != null && ` · จ่ายช้า ${pct(m.late_rate)} ของข้อมูล`}
          </p>
          <ul className="bh-metrics">
            <Metric label="AUC" hint="แยกบิลช้า/ตรงเวลาได้ดีแค่ไหน 0.5 = เดาสุ่ม" test={m.test.auc} cv={m.cv?.auc} />
            <Metric label="Precision" hint="ที่เตือน จ่ายช้าจริงกี่ส่วน" test={m.test.precision} cv={m.cv?.precision} />
            <Metric label="Recall" hint="ที่จ่ายช้าจริง เตือนทันกี่ส่วน" test={m.test.recall} cv={m.cv?.recall} />
            <Metric label="Accuracy" hint={`ทายถูกทั้งหมดกี่ส่วน (ข้อมูลจ่ายช้า ${pct(m.late_rate)})`} test={m.test.accuracy} cv={m.cv?.accuracy} />
          </ul>
          <p className="bh-fine">ค่าตัวใหญ่ = ชุดทดสอบ 25% · CV = 5-fold cross-validation บนชุดเทรน (ค่าเฉลี่ย ± SD แบบตัวอย่าง)</p>

          <div className="bh-qgrid">
            <section className="bh-sec">
              <h3>ผลทายของชุดทดสอบ</h3>
              {m.confusion ? <ConfusionMatrix c={m.confusion} nTest={m.n_test} /> : <StateBox kind="empty" title="รอบเทรนนี้ไม่ได้บันทึกผลทายรายช่อง" />}
            </section>
            <section className="bh-sec">
              <h3>โอกาสที่ระบบบอก ตรงกับที่เกิดจริงไหม</h3>
              {m.calibration ? <CalibrationChart cal={m.calibration} /> : <StateBox kind="empty" title="รอบเทรนนี้ไม่ได้บันทึก calibration" />}
            </section>
          </div>

          <section className="bh-sec">
            <h3>โมเดลดูปัจจัยไหนเป็นหลัก</h3>
            {m.importance?.length ? <ImportanceBars items={m.importance} /> : <StateBox kind="empty" title="รอบเทรนนี้ไม่ได้บันทึกความสำคัญของปัจจัย" />}
          </section>

          <TechDetails>
            <dl className="bh-kv bh-kv--tech">
              <div><dt>รอบเทรน</dt><dd><code>{m.model_type}</code> #{m.run_id} · scikit-learn {m.sklearn_version || '–'}</dd></div>
              <div><dt>F1 ชุดทดสอบ</dt><dd>{f3(m.test.f1)}</dd></div>
              <div><dt>ช่วงข้อมูล</dt><dd>{m.data_from ? `${m.data_from} ถึง ${m.data_to}` : '–'}</dd></div>
              {m.calibration && <div><dt>Calibration</dt><dd>{m.calibration.strategy} · {m.calibration.n_bins} ช่อง · Brier {f3(m.calibration.brier)}</dd></div>}
            </dl>
            {m.cv && (
              <table className="bh-table">
                <thead><tr><th scope="col">ตัวชี้วัด</th>{m.cv.auc.folds.map((_, i) => <th key={i} scope="col">พับ {i + 1}</th>)}<th scope="col">เฉลี่ย ± SD</th></tr></thead>
                <tbody>
                  {Object.entries(m.cv).map(([k, v]) => (
                    <tr key={k}><td>{k}</td>{v.folds.map((f, i) => <td key={i}>{f3(f)}</td>)}<td>{f3(v.mean)} ± {f3(v.sd)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </TechDetails>
        </>
      )}

      <section className="bh-sec">
        <h3>AUC ของแต่ละรอบเทรน</h3>
        <p className="bh-sub">ดูว่าโมเดลดีขึ้นหรือแย่ลงเมื่อเทรนใหม่ (เช่น หลังข้อมูลเพิ่ม หรือพฤติกรรมการจ่ายเปลี่ยน)</p>
        {d.history.length ? <AucHistory runs={d.history} /> : <StateBox kind="empty" title="ยังไม่มีประวัติการเทรน" />}
      </section>

      {d.anomaly && (
        <section className="bh-sec">
          <h3>โมเดลตรวจมิเตอร์</h3>
          <p className="bh-sub">
            ไม่มีป้ายคำตอบ จึงวัด AUC ไม่ได้ ดูคุณภาพจากการยืนยัน/แก้ค่าของเจ้าหน้าที่ในบัตรโมเดลและรายงาน drift แทน ·
            เทรน {thDateTime(d.anomaly.trained_at)} จาก {num(d.anomaly.n_train)} แผง·เดือน
          </p>
        </section>
      )}

      <DriftSection />
    </>
  );
}

export default function QualityTab({ status, role }) {
  const st = useData(() => api('/ai/quality'));
  const owner = role === 'owner';
  return (
    <div className="bh-panel">
      <TabHead title={owner ? 'ระบบเตือนแม่นแค่ไหน' : 'คุณภาพโมเดลความเสี่ยง'} synthetic={status?.is_synthetic}
        sub={owner ? 'สรุปจากการทดสอบกับบิลที่รู้ผลแล้ว ว่าระบบเตือนถูกบ่อยแค่ไหน' : 'ผลวัดจากรอบเทรนล่าสุดของแต่ละโมเดล ทุกตัวเลขมาจากตาราง model_runs'} />
      {st.error && !st.data && <LoadError error={st.error} onRetry={st.reload} what="คุณภาพโมเดล" />}
      {!st.data && !st.error && <div className="bh-qgrid"><Skeleton kind="chart" /><Skeleton kind="chart" /></div>}
      {st.data && (st.data.view === 'owner' ? <OwnerSummary d={st.data} /> : <FullView d={st.data} />)}
    </div>
  );
}
