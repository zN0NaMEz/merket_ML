import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { baht, periodLabel, thDate } from '../../format';
import { Chip, Empty, Loader, PageHead, RISK_NAME, RISK_TONE, SecHead, useApp, useData } from '../../ui';
import { FactorBars, Meter, MeterScatter, ScoreHistogram, isFlagged } from '../../components/AiCharts';
import '../../styles/ai.css';

/*
 * หน้า AI สำหรับเจ้าหน้าที่และเจ้าของตลาด
 * ลำดับที่ผู้ใช้เห็น: คำตอบสั้น ๆ → ลองปรับแล้วเห็นผลทันที → ตัวอย่างจากบิลจริง → รายละเอียดทางเทคนิค (พับไว้)
 * การปรับทุกอย่างเป็นแค่การลองดูจนกว่าจะกดบันทึก
 */

const MODELS = {
  lr: { plain: 'แบบถ่วงน้ำหนักปัจจัย', name: 'Logistic Regression', desc: 'บอกได้ว่าแต่ละปัจจัยดันความเสี่ยงขึ้นหรือลง อธิบายให้ผู้ค้าฟังได้ง่าย' },
  rf: { plain: 'แบบต้นไม้ตัดสินใจหลายต้น', name: 'Random Forest', desc: 'จับรูปแบบที่ซับซ้อนได้ดีกว่า แต่บอกได้แค่ว่าปัจจัยไหนสำคัญ' },
};

const RISK_PRESETS = [
  { id: 'sure', label: 'เตือนเฉพาะที่มั่นใจ', hint: 'เตือนน้อยลง แต่แทบทุกรายที่เตือนจ่ายช้าจริง', risk_high: 0.8, risk_mid: 0.5 },
  { id: 'default', label: 'สมดุล', tag: 'ค่าเริ่มต้น', hint: 'ค่าที่ระบบตั้งไว้ตอนติดตั้ง', risk_high: 0.7, risk_mid: 0.4 },
  { id: 'wide', label: 'ไม่อยากให้ใครหลุด', hint: 'เตือนมากขึ้นเผื่อไว้ก่อน มีบางรายที่ไม่จำเป็น', risk_high: 0.5, risk_mid: 0.3 },
];

const METER_PRESETS = [
  { id: 'strict', label: 'เข้มงวด', hint: 'ทักบ่อยขึ้น จับค่าผิดได้มากขึ้น แต่ต้องเดินตรวจซ้ำบ่อย', anomaly_method: 'both', z_threshold: 2.5, if_threshold: 0.58 },
  { id: 'default', label: 'สมดุล', tag: 'ค่าเริ่มต้น', hint: 'ค่าที่ระบบตั้งไว้ตอนติดตั้ง', anomaly_method: 'both', z_threshold: 3, if_threshold: 0.62 },
  { id: 'relaxed', label: 'ผ่อนคลาย', hint: 'ทักเฉพาะค่าที่ผิดปกติชัด ๆ', anomaly_method: 'both', z_threshold: 4, if_threshold: 0.7 },
];

const METHODS = [
  { id: 'both', label: 'ใช้ทั้งสองวิธี', hint: 'ทักเมื่อวิธีใดวิธีหนึ่งเห็นว่าผิดปกติ' },
  { id: 'z', label: 'เทียบกับประวัติของแผง', hint: 'z-score ดูว่าเดือนนี้ห่างจากที่แผงนี้เคยใช้แค่ไหน' },
  { id: 'if', label: 'ให้ AI ดูรูปแบบ', hint: 'Isolation Forest ดูว่าคู่น้ำ–ไฟนี้แปลกจากที่เคยเห็นไหม' },
];

const pct = v => `${Math.round(v * 100)}%`;
const of10 = v => (v == null ? '–' : `${Math.round(v * 10)} ใน 10`);
const r2 = v => Math.round(v * 100) / 100;
const level = (s, high, mid) => (s >= high ? 'high' : s >= mid ? 'mid' : 'low');

/** ถ้าใช้เกณฑ์ t กับบิลทดสอบ จะเตือนถูก เตือนเกิน และพลาดกี่ใบ */
function evaluate(rows, model, t) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of rows) {
    const warn = r[model] >= t;
    if (warn && r.y) tp += 1; else if (warn) fp += 1; else if (r.y) fn += 1; else tn += 1;
  }
  const n = rows.length;
  return {
    tp, fp, fn, tn, n, flagged: tp + fp,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    accuracy: n ? (tp + tn) / n : null,
  };
}

export default function AI() {
  const { toast, bump } = useApp();
  const st = useData(() => api('/ai/overview'));
  const [tab, setTab] = useState('risk');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { if (st.data) setDraft(st.data.ai); }, [st.data]);

  const save = async () => {
    setBusy('save');
    try {
      await api('/ai/settings', { method: 'PUT', body: draft });
      toast('บันทึกการตั้งค่า AI แล้ว ผลจะใช้กับการเตือนและการตรวจมิเตอร์รอบถัดไป');
      bump();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(''); }
  };
  const retrain = async () => {
    setBusy('train');
    try {
      const r = await api('/ai/retrain', { method: 'POST' });
      toast(`เทรนใหม่แล้ว จากบิล ${r.risk.n_samples} ใบ และค่ามิเตอร์ ${r.anomaly.n_train} ค่า`);
      bump();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(''); }
  };

  return (
    <Loader state={st}>{d => draft && (
      <div className="page ai-page">
        <PageHead
          title="AI วิเคราะห์"
          sub="AI ช่วยสองงาน: บอกว่าใครมีแนวโน้มจ่ายช้าเพื่อเตือนล่วงหน้า และทักค่ามิเตอร์ที่ดูผิดปกติก่อนออกบิล"
          right={<button className="btn" disabled={!!busy} onClick={retrain}>{busy === 'train' ? 'กำลังเทรน… ราว 10 วินาที' : 'เทรนโมเดลใหม่'}</button>}
        />
        <Status d={d} />

        <Tabs tab={tab} setTab={setTab} />
        <div role="tabpanel" id={`ai-panel-${tab}`} aria-labelledby={`ai-tab-${tab}`} className="ai-panel">
          {tab === 'risk' && (
            d.risk.error ? <MlDown message={d.risk.error} />
              : !d.examples.length ? <NeedsRetrain onRetrain={retrain} busy={busy} />
                : <RiskTab d={d} draft={draft} setDraft={setDraft} />
          )}
          {tab === 'meter' && (
            d.anomaly.error ? <MlDown message={d.anomaly.error} />
              : !(d.anomaly.points?.[0]?.length >= 4) ? <NeedsRetrain onRetrain={retrain} busy={busy} />
                : <MeterTab d={d} draft={draft} setDraft={setDraft} />
          )}
        </div>

        <SaveBar saved={d.ai} draft={draft} busy={busy === 'save'} onSave={save} onReset={() => setDraft(d.ai)} />
      </div>
    )}</Loader>
  );
}

/* ---------------- ส่วนประกอบร่วม ---------------- */

function Status({ d }) {
  const r = d.risk, a = d.anomaly;
  if (r.error && a.error) return null;
  return (
    <p className="ai-status">
      {r.trained_at && <span>เทรนล่าสุด {thDate(r.trained_at.slice(0, 10))}</span>}
      {r.n_samples != null && <span>เรียนจากบิล {r.n_samples} ใบ</span>}
      {a.n_train != null && <span>ค่ามิเตอร์ {a.n_train} ค่า</span>}
      <span>โมเดลที่ใช้อยู่: {MODELS[d.ai.risk_model].plain}</span>
    </p>
  );
}

function Tabs({ tab, setTab }) {
  const tabs = [
    ['risk', 'ทำนายการจ่ายช้า', 'ใครควรได้รับการเตือนก่อนครบกำหนด'],
    ['meter', 'ตรวจค่ามิเตอร์', 'ค่าไหนดูผิดปกติก่อนออกบิล'],
  ];
  const onKey = e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tab === 'risk' ? 'meter' : 'risk';
    setTab(next);
    document.getElementById(`ai-tab-${next}`)?.focus();
  };
  return (
    <div className="ai-tabs" role="tablist" aria-label="งานของ AI">
      {tabs.map(([id, title, hint]) => (
        <button key={id} id={`ai-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`ai-panel-${id}`}
          tabIndex={tab === id ? 0 : -1} className={`ai-tab ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)} onKeyDown={onKey}>
          <strong>{title}</strong><small>{hint}</small>
        </button>
      ))}
    </div>
  );
}

function Kpi({ label, value, note }) {
  return (
    <div className="ai-kpi">
      <span className="ai-kpi__label">{label}</span>
      <b className="ai-kpi__value">{value}</b>
      <span className="ai-kpi__note">{note}</span>
    </div>
  );
}

function Slider({ id, label, hint, value, min, max, step, onChange, format = pct, disabled }) {
  return (
    <div className={`ai-slider ${disabled ? 'is-off' : ''}`}>
      <label htmlFor={id} className="ai-slider__head"><span>{label}</span><b>{format(value)}</b></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={e => onChange(Number(e.target.value))} aria-valuetext={format(value)} />
      {hint && <small>{hint}</small>}
    </div>
  );
}

function MlDown({ message }) {
  return (
    <div className="error-box">
      <strong>ติดต่อบริการ AI ไม่ได้ตอนนี้</strong>
      <p>{message}</p>
      <p className="hint">ส่วนอื่นของระบบยังใช้งานได้ตามปกติ ถ้าบริการเพิ่งตื่นจากการพัก ให้รอราวหนึ่งนาทีแล้วรีเฟรชหน้านี้</p>
    </div>
  );
}

function NeedsRetrain({ onRetrain, busy }) {
  return (
    <div className="banner info">
      <strong>ต้องเทรนโมเดลใหม่หนึ่งครั้งเพื่อดูกราฟและตัวอย่าง</strong>
      <p>โมเดลที่มีอยู่ถูกเทรนก่อนระบบจะเก็บคะแนนรายบิลไว้ให้ดู กดเทรนใหม่แล้วหน้านี้จะแสดงข้อมูลครบ ใช้เวลาราว 10 วินาที</p>
      <button type="button" className="btn primary" disabled={!!busy} onClick={onRetrain} style={{ marginTop: 10 }}>
        {busy === 'train' ? 'กำลังเทรน…' : 'เทรนโมเดลใหม่'}
      </button>
    </div>
  );
}

/** แถบบันทึก โผล่มาเมื่อมีค่าที่ลองปรับแต่ยังไม่บันทึก บอกให้เห็นว่าอะไรจะเปลี่ยน */
function SaveBar({ saved, draft, busy, onSave, onReset }) {
  const changes = [];
  if (draft.risk_model !== saved.risk_model) changes.push(`โมเดล: ${MODELS[saved.risk_model].plain} → ${MODELS[draft.risk_model].plain}`);
  if (draft.risk_high !== saved.risk_high) changes.push(`เสี่ยงสูง ${pct(saved.risk_high)} → ${pct(draft.risk_high)}`);
  if (draft.risk_mid !== saved.risk_mid) changes.push(`ปานกลาง ${pct(saved.risk_mid)} → ${pct(draft.risk_mid)}`);
  if (draft.anomaly_method !== saved.anomaly_method) {
    const name = id => METHODS.find(m => m.id === id)?.label;
    changes.push(`วิธีตรวจ: ${name(saved.anomaly_method)} → ${name(draft.anomaly_method)}`);
  }
  if (draft.z_threshold !== saved.z_threshold) changes.push(`เกณฑ์ z ${saved.z_threshold} → ${draft.z_threshold}`);
  if (draft.if_threshold !== saved.if_threshold) changes.push(`เกณฑ์ความแปลก ${saved.if_threshold} → ${draft.if_threshold}`);
  if (!changes.length) return null;
  return (
    <div className="ai-savebar" role="region" aria-label="การตั้งค่าที่ยังไม่บันทึก">
      <div className="ai-savebar__text">
        <strong>ยังไม่ได้บันทึก</strong>
        <span>{changes.join(' · ')}</span>
      </div>
      <div className="btn-row">
        <button type="button" className="btn" onClick={onReset} disabled={busy}>ยกเลิกการปรับ</button>
        <button type="button" className="btn primary" onClick={onSave} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}</button>
      </div>
    </div>
  );
}

/* ---------------- งานที่ 1: ทำนายการจ่ายช้า ---------------- */

function RiskTab({ d, draft, setDraft }) {
  const rows = d.examples;
  const m = draft.risk_model;
  const ev = useMemo(() => evaluate(rows, m, draft.risk_high), [rows, m, draft.risk_high]);
  const warnNow = d.open.filter(o => o.score >= draft.risk_high);

  const setHigh = v => setDraft(x => ({ ...x, risk_high: r2(v), risk_mid: x.risk_mid >= v ? r2(v - 0.05) : x.risk_mid }));
  const setMid = v => setDraft(x => ({ ...x, risk_mid: r2(Math.min(v, x.risk_high - 0.05)) }));

  return (
    <>
      <div className="ai-kpis">
        <Kpi label="เตือนแล้วจ่ายช้าจริง" value={of10(ev.precision)} note={`AI เตือน ${ev.flagged} ใบ จ่ายช้าจริง ${ev.tp} ใบ`} />
        <Kpi label="จับคนจ่ายช้าได้" value={of10(ev.recall)} note={`จ่ายช้าจริง ${ev.tp + ev.fn} ใบ เตือนทัน ${ev.tp} ใบ`} />
        <Kpi label="ทายถูกรวม" value={pct(ev.accuracy)} note={`จาก ${ev.n} บิลที่ AI ไม่เคยเห็นตอนเรียน`} />
        <Kpi label="ตอนนี้จะเตือนล่วงหน้า" value={`${warnNow.length} ราย`}
          note={warnNow.length ? warnNow.map(o => o.stall_id).join(' · ') : 'ยังไม่มีบิลค้างที่ถึงเกณฑ์'} />
      </div>

      <section className="panel">
        <SecHead title="ปรับเกณฑ์การเตือน" sub="ลองกดหรือเลื่อนแล้วดูผลได้ทันที ระบบยังไม่เปลี่ยนจนกว่าจะกดบันทึก" />
        <div className="ai-presets" role="group" aria-label="ชุดเกณฑ์สำเร็จรูป">
          {RISK_PRESETS.map(p => {
            const e = evaluate(rows, m, p.risk_high);
            const on = draft.risk_high === p.risk_high && draft.risk_mid === p.risk_mid;
            return (
              <button key={p.id} type="button" className={`ai-preset ${on ? 'is-on' : ''}`} aria-pressed={on}
                onClick={() => setDraft(x => ({ ...x, risk_high: p.risk_high, risk_mid: p.risk_mid }))}>
                <strong>{p.label}{p.tag && <em>{p.tag}</em>}</strong>
                <span>{p.hint}</span>
                <small>เตือน {e.flagged} ใบ · ถูก {of10(e.precision)} · จับได้ {of10(e.recall)}</small>
              </button>
            );
          })}
        </div>

        <div className="ai-sliders">
          <Slider id="ai-high" label="เสี่ยงสูง ตั้งแต่" value={draft.risk_high} min={0.3} max={0.95} step={0.05} onChange={setHigh}
            hint="บิลที่ได้คะแนนถึงเกณฑ์นี้ ผู้ค้าจะได้รับแจ้งเตือนล่วงหน้า 5 วันก่อนครบกำหนด" />
          <Slider id="ai-mid" label="เสี่ยงปานกลาง ตั้งแต่" value={draft.risk_mid} min={0.1} max={0.9} step={0.05} onChange={setMid}
            hint="แสดงเป็นสีเหลืองในหน้าติดตามค้างชำระ ให้เจ้าหน้าที่จับตา ไม่มีการส่งแจ้งเตือน" />
        </div>

        <ScoreHistogram rows={rows} model={m} high={draft.risk_high} mid={draft.risk_mid} />

        <p className="ai-say" aria-live="polite">
          ถ้าตั้ง <b>เสี่ยงสูง {pct(draft.risk_high)}</b> กับบิลทดสอบ {ev.n} ใบ AI จะเตือน <b>{ev.flagged} ใบ</b>
          {' '}— จ่ายช้าจริง {ev.tp} ใบ เตือนเกินไป {ev.fp} ใบ และมีบิลที่จ่ายช้าแต่ไม่ได้รับการเตือน {ev.fn} ใบ
        </p>
      </section>

      <OpenBills open={d.open} high={draft.risk_high} mid={draft.risk_mid} />
      <Examples rows={rows} model={m} high={draft.risk_high} mid={draft.risk_mid} />

      <div className="two">
        <section className="panel">
          <SecHead title="AI ดูอะไรบ้าง" sub={m === 'lr'
            ? 'ปัจจัยที่มีผลมากที่สุดอยู่บนสุด ความยาวแท่งคือแรงที่ดันคะแนนขึ้นหรือลง'
            : 'ปัจจัยที่ AI ใช้มากที่สุดอยู่บนสุด โมเดลแบบนี้บอกได้แค่ความสำคัญ ไม่บอกทิศทาง'} />
          <FactorBars weights={d.risk.models[m].weights} signed={m === 'lr'} />
        </section>
        <ModelPicker d={d} rows={rows} draft={draft} setDraft={setDraft} />
      </div>

      <RiskTech d={d} ev={ev} draft={draft} />
    </>
  );
}

function OpenBills({ open, high, mid }) {
  return (
    <section className="panel">
      <SecHead title="บิลที่ค้างอยู่ตอนนี้" sub="ผลของเกณฑ์ที่กำลังตั้งกับบิลจริงในวันนี้" />
      {open.length === 0 ? <Empty>ไม่มีบิลค้างชำระที่ AI ประเมินไว้</Empty> : (
        <ul className="ai-open">
          {open.map(o => {
            const lv = level(o.score, high, mid);
            return (
              <li key={o.id}>
                <span className="plate">{o.stall_id}</span>
                <span className="ai-open__who"><strong>{o.vendor}</strong><small>บิล{periodLabel(o.period)} · {baht(o.total)} บาท</small></span>
                <span className="ai-open__score"><Meter value={o.score} label="คะแนนความเสี่ยง" /><b>{pct(o.score)}</b></span>
                <Chip tone={RISK_TONE[lv]}>{RISK_NAME[lv]}</Chip>
                <span className="ai-open__act">{lv === 'high' ? 'จะได้รับแจ้งเตือนล่วงหน้า' : lv === 'mid' ? 'เจ้าหน้าที่จับตา' : 'ไม่มีการแจ้งเตือน'}</span>
                <ul className="reasons ai-open__why">{o.reasons.map(r => <li key={r}>{r}</li>)}</ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Examples({ rows, model, high, mid }) {
  const [show, setShow] = useState('all');
  const [limit, setLimit] = useState(6);
  const judged = useMemo(() => rows
    .map(r => ({ ...r, warn: r[model] >= high, ok: (r[model] >= high) === Boolean(r.y) }))
    .sort((a, b) => b[model] - a[model]), [rows, model, high]);
  const list = judged.filter(r => show === 'all' || (show === 'hit' ? r.ok : !r.ok));
  const hits = judged.filter(r => r.ok).length;
  const filters = [['all', `ทั้งหมด ${judged.length}`], ['hit', `ทายถูก ${hits}`], ['miss', `ทายพลาด ${judged.length - hits}`]];

  return (
    <section className="panel">
      <SecHead title="ตัวอย่างการทำนายจากบิลจริง"
        sub="บิลเหล่านี้ AI ไม่เคยเห็นตอนเรียน จึงใช้วัดได้ว่าทายแม่นแค่ไหน เรียงจากคะแนนสูงไปต่ำ"
        right={(
          <div className="seg" role="radiogroup" aria-label="กรองตัวอย่าง">
            {filters.map(([id, label]) => (
              <label key={id}><input type="radio" name="ai-ex" checked={show === id} onChange={() => { setShow(id); setLimit(6); }} />{label}</label>
            ))}
          </div>
        )} />
      {list.length === 0 ? <Empty>ไม่มีตัวอย่างในกลุ่มนี้</Empty> : (
        <>
          <div className="ai-examples">
            {list.slice(0, limit).map(e => {
              const lv = level(e[model], high, mid);
              return (
                <article className="ai-ex" key={e.bill_id}>
                  <header className="ai-ex__head">
                    <span className="plate">{e.stall_id}</span>
                    <span><strong>{e.vendor}</strong><small>บิล{periodLabel(e.period)} · {baht(e.total)} บาท</small></span>
                  </header>
                  <div className="ai-ex__score">
                    <Meter value={e[model]} label="คะแนนความเสี่ยง" /><b>{pct(e[model])}</b>
                    <Chip tone={RISK_TONE[lv]}>{RISK_NAME[lv]}</Chip>
                  </div>
                  <dl className="ai-ex__facts">
                    <div><dt>AI</dt><dd>{e.warn ? 'เตือนล่วงหน้า' : 'ไม่เตือน'}</dd></div>
                    <div><dt>ผลจริง</dt><dd>{e.y ? (e.paid ? `จ่ายช้า ${e.days_late} วัน` : `ยังค้าง เลยกำหนด ${e.days_late} วัน`) : 'จ่ายตรงเวลา'}</dd></div>
                  </dl>
                  <Chip tone={e.ok ? 'good' : 'bad'}>{e.ok ? '✓ ทายถูก' : '✗ ทายพลาด'}</Chip>
                  <ul className="reasons">{e.reasons.map(r => <li key={r}>{r}</li>)}</ul>
                </article>
              );
            })}
          </div>
          {list.length > limit && (
            <button type="button" className="btn ai-more" onClick={() => setLimit(n => n + 6)}>
              ดูเพิ่มอีก {Math.min(6, list.length - limit)} ตัวอย่าง (เหลือ {list.length - limit})
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ModelPicker({ d, rows, draft, setDraft }) {
  return (
    <section className="panel">
      <SecHead title="เลือกโมเดล" sub={`เทียบกันที่เกณฑ์เสี่ยงสูง ${pct(draft.risk_high)} ที่กำลังตั้ง`} />
      <div className="ai-models" role="radiogroup" aria-label="โมเดลทำนาย">
        {['lr', 'rf'].map(k => {
          const e = evaluate(rows, k, draft.risk_high);
          const md = d.risk.models[k];
          const on = draft.risk_model === k;
          return (
            <label key={k} className={`ai-model ${on ? 'is-on' : ''}`}>
              <input type="radio" name="ai-model" checked={on} onChange={() => setDraft(x => ({ ...x, risk_model: k }))} />
              <span className="ai-model__head">
                <strong>{MODELS[k].plain}</strong>
                {d.ai.risk_model === k && <Chip tone="good">ใช้งานอยู่</Chip>}
              </span>
              <small className="ai-model__name">{MODELS[k].name}</small>
              <span className="ai-model__desc">{MODELS[k].desc}</span>
              {[['เตือนแล้วจ่ายช้าจริง', e.precision], ['จับคนจ่ายช้าได้', e.recall], ['ทายถูกรวม', e.accuracy]].map(([label, v]) => (
                <span className="ai-model__row" key={label}><span>{label}</span><Meter value={v} label={label} /><b>{v == null ? '–' : pct(v)}</b></span>
              ))}
              <span className="ai-model__auc">
                แยกคนจ่ายช้าออกจากคนจ่ายตรงได้ <b>{md.auc.toFixed(2)}</b>
                <small>1.00 = แยกได้สมบูรณ์ · 0.50 = เท่ากับเดาสุ่ม</small>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function RiskTech({ d, ev, draft }) {
  const md = d.risk.models[draft.risk_model];
  return (
    <details className="panel ai-tech">
      <summary>รายละเอียดทางเทคนิค สำหรับทำรายงาน</summary>
      <div className="two">
        <div>
          <h3>Confusion matrix ที่เกณฑ์ {pct(draft.risk_high)} ({MODELS[draft.risk_model].name})</h3>
          <div className="cm">
            <div /><div className="h">AI: ไม่เตือน</div><div className="h">AI: เตือน</div>
            <div className="h">จริง: ตรงเวลา</div><div className="v ok">{ev.tn}</div><div className="v no">{ev.fp}</div>
            <div className="h">จริง: จ่ายช้า</div><div className="v no">{ev.fn}</div><div className="v ok">{ev.tp}</div>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl"><tbody>
            <tr><td>ROC-AUC (test set)</td><td className="num">{md.auc.toFixed(3)}</td></tr>
            <tr><td>ROC-AUC (5-fold CV)</td><td className="num">{md.cv_auc_mean.toFixed(3)} ± {md.cv_auc_std.toFixed(3)}</td></tr>
            <tr><td>Accuracy / Precision / Recall ที่เกณฑ์ 0.5</td><td className="num">{pct(md.accuracy)} / {pct(md.precision)} / {pct(md.recall)}</td></tr>
            <tr><td>F1-score ที่เกณฑ์ 0.5</td><td className="num">{md.f1.toFixed(3)}</td></tr>
            <tr><td>ข้อมูลเทรน / ทดสอบ</td><td className="num">{d.risk.n_train} / {d.risk.n_test} บิล</td></tr>
            <tr><td>อัตราจ่ายช้าในข้อมูล</td><td className="num">{pct(d.risk.late_rate)}</td></tr>
          </tbody></table>
        </div>
      </div>
    </details>
  );
}

/* ---------------- งานที่ 2: ตรวจค่ามิเตอร์ ---------------- */

function MeterTab({ d, draft, setDraft }) {
  const pts = d.anomaly.points;
  const count = useMemo(
    () => pts.filter(p => isFlagged(p, draft.anomaly_method, draft.z_threshold, draft.if_threshold)).length,
    [pts, draft.anomaly_method, draft.z_threshold, draft.if_threshold]);
  const rate = count / pts.length;
  const perRound = Math.round(rate * d.stalls * 10) / 10;
  const usesZ = draft.anomaly_method !== 'if';
  const usesIf = draft.anomaly_method !== 'z';
  const current = (d.draft || []).filter(r => r.x);

  return (
    <>
      <div className="ai-kpis">
        <Kpi label="จะทักให้ตรวจซ้ำ" value={`≈ ${perRound} แผง`} note={`ต่อการจดมิเตอร์หนึ่งรอบ จาก ${d.stalls} แผง`} />
        <Kpi label="สัดส่วนที่ถูกทัก" value={pct(rate)} note={`ถ้าย้อนดูค่าในอดีต ${pts.length} ค่า จะทัก ${count} ค่า`} />
        <Kpi label="ตรวจพบย้อนหลัง" value={`${d.logs.length} ครั้ง`} note="ดูเหตุผลและผลตรวจด้านล่าง" />
      </div>

      <section className="panel">
        <SecHead title="ปรับความเข้มงวดในการทัก" sub="ลองกดหรือเลื่อนแล้วจุดบนกราฟจะเปลี่ยนสีทันที ระบบยังไม่เปลี่ยนจนกว่าจะกดบันทึก" />
        <div className="ai-presets" role="group" aria-label="ชุดการตั้งค่าสำเร็จรูป">
          {METER_PRESETS.map(p => {
            const n = pts.filter(x => isFlagged(x, p.anomaly_method, p.z_threshold, p.if_threshold)).length;
            const on = draft.anomaly_method === p.anomaly_method && draft.z_threshold === p.z_threshold && draft.if_threshold === p.if_threshold;
            return (
              <button key={p.id} type="button" className={`ai-preset ${on ? 'is-on' : ''}`} aria-pressed={on}
                onClick={() => setDraft(x => ({ ...x, anomaly_method: p.anomaly_method, z_threshold: p.z_threshold, if_threshold: p.if_threshold }))}>
                <strong>{p.label}{p.tag && <em>{p.tag}</em>}</strong>
                <span>{p.hint}</span>
                <small>≈ {Math.round((n / pts.length) * d.stalls * 10) / 10} แผงต่อรอบ · {pct(n / pts.length)} ของค่าในอดีต</small>
              </button>
            );
          })}
        </div>

        <fieldset className="ai-methods">
          <legend className="label-th">วิธีตรวจ</legend>
          {METHODS.map(mt => (
            <label key={mt.id} className={`ai-method ${draft.anomaly_method === mt.id ? 'is-on' : ''}`}>
              <input type="radio" name="ai-method" checked={draft.anomaly_method === mt.id} onChange={() => setDraft(x => ({ ...x, anomaly_method: mt.id }))} />
              <strong>{mt.label}</strong><small>{mt.hint}</small>
            </label>
          ))}
        </fieldset>

        <div className="ai-sliders">
          <Slider id="ai-z" label="ห่างจากปกติเกินกี่เท่า (z)" value={draft.z_threshold} min={1.5} max={6} step={0.5}
            format={v => `${v} เท่า`} disabled={!usesZ}
            onChange={v => setDraft(x => ({ ...x, z_threshold: v }))}
            hint={usesZ ? 'ยิ่งตั้งต่ำ ยิ่งทักง่าย · ใช้กับการเทียบประวัติของแผง' : 'วิธีที่เลือกไม่ได้ใช้เกณฑ์นี้'} />
          <Slider id="ai-if" label="ความแปลกของรูปแบบเกิน" value={draft.if_threshold} min={0.45} max={0.85} step={0.01}
            format={v => v.toFixed(2)} disabled={!usesIf}
            onChange={v => setDraft(x => ({ ...x, if_threshold: r2(v) }))}
            hint={usesIf ? 'ยิ่งตั้งต่ำ ยิ่งทักง่าย · คะแนนปกติส่วนใหญ่อยู่ราว ' + (d.anomaly.score_p50?.toFixed(2) ?? '–') : 'วิธีที่เลือกไม่ได้ใช้เกณฑ์นี้'} />
        </div>

        <MeterScatter points={pts} method={draft.anomaly_method} z={draft.z_threshold} ifThr={draft.if_threshold} current={current} />

        <p className="ai-say" aria-live="polite">
          ด้วยการตั้งค่านี้ ถ้าย้อนกลับไปดูค่ามิเตอร์ในอดีต {pts.length} ค่า ระบบจะทัก <b>{count} ค่า ({pct(rate)})</b>
          {' '}เฉลี่ยราว <b>{perRound} แผง</b>ต่อการจดมิเตอร์หนึ่งรอบที่เจ้าหน้าที่ต้องไปตรวจซ้ำ
        </p>
      </section>

      <section className="panel">
        <SecHead title="ค่าที่เคยถูกทักจริง" sub="เหตุผลที่ AI แจ้ง และผลหลังเจ้าหน้าที่ไปตรวจ" />
        {d.logs.length === 0 ? <Empty>ยังไม่เคยมีค่าที่ถูกทัก</Empty> : (
          <div className="ai-examples">
            {d.logs.map((l, i) => (
              <article className="ai-ex" key={i}>
                <header className="ai-ex__head">
                  <span className="plate">{l.stall_id}</span>
                  <span><strong>รอบ{periodLabel(l.period)}</strong><small>ตรวจพบ {thDate(l.detected_on)}</small></span>
                </header>
                <dl className="ai-ex__facts">
                  <div><dt>AI ทักว่า</dt><dd>{l.reason}</dd></div>
                  <div><dt>ผลตรวจ</dt><dd>{l.resolution || 'ยังไม่ได้บันทึกผล'}</dd></div>
                </dl>
                {l.if_score != null && <small className="hint">ความแปลกของรูปแบบ {Number(l.if_score).toFixed(2)}</small>}
              </article>
            ))}
          </div>
        )}
      </section>

      <details className="panel ai-tech">
        <summary>รายละเอียดทางเทคนิค สำหรับทำรายงาน</summary>
        <div className="tbl-wrap">
          <table className="tbl"><tbody>
            <tr><td>Isolation Forest</td><td className="num">{d.anomaly.n_estimators} ต้น · เทรนจาก {d.anomaly.n_train} ค่า</td></tr>
            <tr><td>คะแนนความแปลก p50 / p95 / p99</td><td className="num">{d.anomaly.score_p50?.toFixed(3)} / {d.anomaly.score_p95?.toFixed(3)} / {d.anomaly.score_p99?.toFixed(3)}</td></tr>
            <tr><td>เกณฑ์ z (เทียบประวัติแผง / เทียบแผงประเภทเดียวกัน)</td><td className="num">{draft.z_threshold} / {draft.z_threshold + 1}</td></tr>
            <tr><td>ข้อมูลที่ใช้</td><td>log(ค่าใช้ ÷ ค่าเฉลี่ย 12 เดือนของแผง) และ log(ค่าใช้ ÷ ค่าเฉลี่ยแผงประเภทเดียวกัน) ทั้งน้ำและไฟ</td></tr>
          </tbody></table>
        </div>
      </details>
    </>
  );
}
