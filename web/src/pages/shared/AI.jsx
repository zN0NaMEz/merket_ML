import { useEffect, useState } from 'react';
import { api } from '../../api';
import { pct, periodLabel, thDate } from '../../format';
import { Chip, Empty, Loader, PageHead, SecHead, useApp, useData } from '../../ui';
import { AnomalyScatter } from '../../components/Charts';

const MODEL_NAME = { lr: 'Logistic Regression', rf: 'Random Forest' };

export default function AI() {
  const { toast, bump } = useApp();
  const st = useData(() => api('/ai/overview'));
  const [cfg, setCfg] = useState(null);
  const [view, setView] = useState('lr');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (st.data) { setCfg(st.data.ai); setView(st.data.ai.risk_model); } }, [st.data]);

  const save = async patch => {
    setBusy(true);
    try { const r = await api('/ai/settings', { method: 'PUT', body: patch }); setCfg(r.ai); toast('บันทึกการตั้งค่า AI แล้ว'); bump(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const retrain = async () => {
    setBusy(true);
    try { const r = await api('/ai/retrain', { method: 'POST' }); toast(`เทรนใหม่แล้ว จาก ${r.risk.n_samples} บิล และมิเตอร์ ${r.anomaly.n_train} ค่า`); bump(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };

  return (
    <Loader state={st}>{d => {
      if (!cfg) return null;
      const risk = d.risk, m = risk.models?.[view];
      return (
        <div className="page">
          <PageHead title="AI วิเคราะห์" tag="Machine Learning"
            sub={risk.error ? risk.error : `เทรนล่าสุด ${thDate(risk.trained_at?.slice(0, 10))} · ข้อมูล ${risk.n_samples} บิล (train ${risk.n_train} / test ${risk.n_test})`}
            right={<button className="btn" disabled={busy} onClick={retrain}>เทรนโมเดลใหม่</button>} />

          <section className="panel">
            <SecHead title="1. ทำนายความเสี่ยงค้างชำระ (Classification)"
              sub={`ทำนายว่าบิลแต่ละใบจะถูกชำระหลังวันครบกำหนดหรือไม่ จากประวัติ 6 บิลล่าสุด ยอดบิล ระยะเวลาเช่า ประเภทแผง และฤดูกาล · อัตราจ่ายช้าในข้อมูล ${pct(risk.late_rate, 1)}`} />
            <div className="btn-row" style={{ marginBottom: 14 }}>
              <div className="seg" role="radiogroup" aria-label="ดูผลโมเดล">
                {['lr', 'rf'].map(k => <label key={k}><input type="radio" name="view" checked={view === k} onChange={() => setView(k)} />{MODEL_NAME[k]}</label>)}
              </div>
              {cfg.risk_model === view ? <Chip tone="good">ใช้งานอยู่</Chip> : <button className="btn sm" disabled={busy} onClick={() => save({ risk_model: view })}>ใช้โมเดลนี้</button>}
            </div>
            {m && (
              <div className="two">
                <div className="stack">
                  <div className="tbl-wrap"><table className="tbl"><tbody>
                    <tr><td>Accuracy</td><td className="num">{pct(m.accuracy, 1)}</td></tr>
                    <tr><td>Precision (ทายว่าช้าแล้วช้าจริง)</td><td className="num">{pct(m.precision, 1)}</td></tr>
                    <tr><td>Recall (จับคนจ่ายช้าได้)</td><td className="num">{pct(m.recall, 1)}</td></tr>
                    <tr><td>F1-score</td><td className="num">{m.f1.toFixed(3)}</td></tr>
                    <tr><td>ROC-AUC (test set)</td><td className="num"><b>{m.auc.toFixed(3)}</b></td></tr>
                    <tr><td>ROC-AUC (5-fold CV)</td><td className="num">{m.cv_auc_mean.toFixed(3)} ± {m.cv_auc_std.toFixed(3)}</td></tr>
                  </tbody></table></div>
                  <div>
                    <h3 style={{ marginBottom: 6 }}>Confusion matrix (test set, เกณฑ์ 0.5)</h3>
                    <div className="cm">
                      <div /><div className="h">ทาย: ตรงเวลา</div><div className="h">ทาย: จ่ายช้า</div>
                      <div className="h">จริง: ตรงเวลา</div><div className="v ok">{m.confusion.tn}</div><div className="v no">{m.confusion.fp}</div>
                      <div className="h">จริง: จ่ายช้า</div><div className="v no">{m.confusion.fn}</div><div className="v ok">{m.confusion.tp}</div>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 style={{ marginBottom: 6 }}>{view === 'lr' ? 'น้ำหนักฟีเจอร์ (coefficient หลัง standardize)' : 'ความสำคัญของฟีเจอร์ (feature importance)'}</h3>
                  <Weights weights={m.weights} signed={view === 'lr'} />
                </div>
              </div>
            )}
            <h3>เกณฑ์ระดับความเสี่ยง</h3>
            <form className="btn-row" onSubmit={e => { e.preventDefault(); save({ risk_high: cfg.risk_high, risk_mid: cfg.risk_mid }); }}>
              <label className="field">เสี่ยงสูง ≥<input className="input num" type="number" step="0.05" min="0.05" max="0.99" value={cfg.risk_high} onChange={e => setCfg({ ...cfg, risk_high: Number(e.target.value) })} /></label>
              <label className="field">เสี่ยงปานกลาง ≥<input className="input num" type="number" step="0.05" min="0.01" max="0.95" value={cfg.risk_mid} onChange={e => setCfg({ ...cfg, risk_mid: Number(e.target.value) })} /></label>
              <button className="btn" disabled={busy} style={{ alignSelf: 'flex-end' }}>บันทึกเกณฑ์</button>
              <span className="hint" style={{ alignSelf: 'flex-end' }}>ผู้ค้าเสี่ยงสูงจะได้รับแจ้งเตือนล่วงหน้า 5 วันก่อนครบกำหนด</span>
            </form>
          </section>

          <section className="panel">
            <SecHead title="2. ตรวจจับค่ามิเตอร์ผิดปกติ (Anomaly Detection)"
              sub={d.anomaly.error ? d.anomaly.error : `Isolation Forest ${d.anomaly.n_estimators} ต้น เทรนจากเลขมิเตอร์ในอดีต ${d.anomaly.n_train} ค่า · คะแนนปกติ p50 ${d.anomaly.score_p50?.toFixed(3)} p99 ${d.anomaly.score_p99?.toFixed(3)}`} />
            <div className="two">
              <div>
                <AnomalyScatter history={d.anomaly.points || []} current={(d.draft || []).filter(r => r.x)} />
                <p className="hint">จุดสีเทาคือค่าในอดีต ถ้ามีการกรอกมิเตอร์รอบปัจจุบัน จะแสดงเป็นจุดสีเขียว/แดง</p>
              </div>
              <form className="stack" onSubmit={e => { e.preventDefault(); save({ anomaly_method: cfg.anomaly_method, z_threshold: cfg.z_threshold, if_threshold: cfg.if_threshold }); }}>
                <label className="field">วิธีตรวจจับ
                  <select className="input" value={cfg.anomaly_method} onChange={e => setCfg({ ...cfg, anomaly_method: e.target.value })}>
                    <option value="both">z-score หรือ Isolation Forest (แนะนำ)</option>
                    <option value="z">z-score อย่างเดียว</option>
                    <option value="if">Isolation Forest อย่างเดียว</option>
                  </select>
                </label>
                <label className="field">เกณฑ์ z-score (|z| มากกว่า)<input className="input" type="number" step="0.5" min="1" max="10" value={cfg.z_threshold} onChange={e => setCfg({ ...cfg, z_threshold: Number(e.target.value) })} /></label>
                <label className="field">เกณฑ์ Isolation Forest score (มากกว่า)<input className="input" type="number" step="0.01" min="0.4" max="0.95" value={cfg.if_threshold} onChange={e => setCfg({ ...cfg, if_threshold: Number(e.target.value) })} /></label>
                <button className="btn" disabled={busy}>บันทึกการตั้งค่า</button>
              </form>
            </div>
            <h3>ประวัติค่าผิดปกติที่ตรวจพบ</h3>
            {d.logs.length === 0 ? <Empty>ยังไม่มี</Empty> : (
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>แผง</th><th>รอบ</th><th>สาเหตุที่ AI แจ้ง</th><th>ผลตรวจสอบ</th><th className="num">IF score</th></tr></thead>
                <tbody>{d.logs.map((l, i) => (
                  <tr key={i}><td><span className="plate">{l.stall_id}</span></td><td className="nowrap">{periodLabel(l.period)}</td><td>{l.reason}</td><td>{l.resolution}</td><td className="num">{l.if_score?.toFixed(3) ?? '-'}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        </div>
      );
    }}</Loader>
  );
}

function Weights({ weights, signed }) {
  const max = Math.max(...weights.map(w => Math.abs(w.value))) || 1;
  const sorted = [...weights].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return (
    <div>{sorted.map(w => {
      const f = Math.abs(w.value) / max;
      const style = signed
        ? (w.value >= 0 ? { left: '50%', width: `${f * 50}%`, background: 'var(--chili)' } : { right: '50%', width: `${f * 50}%`, background: 'var(--leaf)' })
        : { left: 0, width: `${f * 100}%`, background: 'var(--tarp)' };
      return (
        <div className="wbar" key={w.feature}>
          <span>{w.label}</span>
          <div className="track">{signed && <i className="mid" />}<span style={style} /></div>
          <span className="num">{w.value.toFixed(2)}</span>
        </div>
      );
    })}
    {signed && <p className="hint">แดง = เพิ่มโอกาสจ่ายช้า · เขียว = ลดโอกาสจ่ายช้า</p>}
    </div>
  );
}
