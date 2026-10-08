import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { TH_M, baht, thDate } from '../../format';
import { Chip, Empty, RISK_NAME, RISK_TONE, SecHead } from '../../ui';
import { Meter } from '../../components/AiCharts';
import { STALL_TYPES, summarySentence } from '../../ai/featureLabels';
import {
  COLUMNS, MAX_ROWS, SAMPLE_NAME, bestModels, decodeBytes, evaluateFile, fileProblem, isCorrect, levelOf, payloadOf, readTable,
  resultsCsv, sampleCsv, summarize,
} from '../../ai/predictFile';

/*
 * แท็บ "ทำนายจากไฟล์" ในหน้า AI วิเคราะห์ (เจ้าหน้าที่ เจ้าของตลาด)
 * 1 ดาวน์โหลดไฟล์ตัวอย่าง → 2 กรอกแล้วบันทึกเป็น CSV → 3 อัปโหลด ตรวจทีละแถว → ให้ AI ทำนาย → ดูผล/สลับโมเดล/ดาวน์โหลดผล
 * อ่านไฟล์ในเบราว์เซอร์ ส่งเฉพาะแถวที่ถูกต้องไป POST /api/ai/predict และเรียก ML เมื่อกดปุ่มเท่านั้น
 * สถานะ: ยังไม่มีไฟล์ · ไฟล์ใช้ไม่ได้ · มีแถวผิด · กำลังทำนาย (บอกเวลาที่ผ่านไปเผื่อบริการกำลังตื่น) · AI ไม่พร้อม · ผิดพลาด · ผลลัพธ์
 * เกณฑ์เสี่ยงสูง/ปานกลางใช้ค่าที่กำลังตั้งในหน้านี้ เหมือนแท็บทำนายการจ่ายช้า
 * ประเมินโมเดล: ผลตอนเทรน (จาก ML ผ่าน /ai/overview) แสดงเสมอ · ถ้าไฟล์มีคอลัมน์ "ผลจริง" วัดกับไฟล์นั้นด้วยในเบราว์เซอร์
 *   (ผลจริงไม่ถูกส่งไปให้ AI) เกณฑ์ตัดสิน 0.5 เท่ากับตอนประเมินหลังเทรน จึงเทียบสองฝั่งได้
 */

const pct = v => `${Math.round(v * 100)}%`;
const PAGE = 12;
const SHORT = { lr: 'LR', rf: 'RF', et: 'ET', gb: 'GB', ens: 'รวม' };

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** วินาทีที่ผ่านไประหว่างรอ (บริการแพลนฟรีอาจใช้เวลาราวหนึ่งนาทีถ้ากำลังพัก) */
function useElapsed(on) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!on) { setS(0); return undefined; }
    const t0 = Date.now();
    const id = setInterval(() => setS(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [on]);
  return s;
}

export default function PredictFromFile({ models, activeModel, high, mid, train, trainInfo }) {
  const [file, setFile] = useState(null);          // { name, table } หรือ { name, fatal }
  const [state, setState] = useState({ step: 'idle' });   // idle | busy | done | error
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const elapsed = useElapsed(state.step === 'busy');

  const reset = () => { setFile(null); setState({ step: 'idle' }); if (inputRef.current) inputRef.current.value = ''; };

  const load = async f => {
    setState({ step: 'idle' });
    const problem = fileProblem(f);
    if (problem) { setFile({ name: f?.name || '', fatal: problem }); return; }
    try {
      const text = decodeBytes(new Uint8Array(await f.arrayBuffer()));
      const table = readTable(text);
      setFile(table.fatal ? { name: f.name, fatal: table.fatal } : { name: f.name, table });
    } catch {
      setFile({ name: f.name, fatal: 'อ่านไฟล์ไม่ได้ ลองบันทึกเป็น CSV UTF-8 อีกครั้ง' });
    }
  };
  const useSample = () => {
    setState({ step: 'idle' });
    setFile({ name: SAMPLE_NAME, table: readTable(sampleCsv()), sample: true });
  };

  const predict = async () => {
    const rows = file.table.rows;
    setState({ step: 'busy' });
    try {
      const out = await api('/ai/predict', { method: 'POST', body: { rows: rows.map(r => payloadOf(r.value)) } });
      const results = out.results.map((r, i) => ({ ...r, input: rows[i].value, line: rows[i].line }));
      setState({ step: 'done', out: { ...out, results } });
    } catch (e) {
      // fetch ล้มเองโดยไม่มีสถานะ = เน็ตหลุดหรือเซิร์ฟเวอร์ไม่ตอบ
      setState({ step: 'error', status: e.status, details: e.details,
        message: e.status ? e.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง' });
    }
  };

  const onDrop = e => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) load(f);
  };

  return (
    <>
      <section className="panel pf">
        <SecHead title="ทำนายจากไฟล์ของคุณ"
          sub="กรอกข้อมูลบิลที่อยากรู้ลงไฟล์ตัวอย่าง แล้วอัปโหลดให้ AI ทำนายว่ามีโอกาสจ่ายช้าแค่ไหน ใช้ได้ทั้งผู้ค้าในระบบและกรณีสมมติ" />
        <ol className="pf-steps">
          <li className="pf-step">
            <span className="pf-step__no" aria-hidden="true">1</span>
            <div className="pf-step__body">
              <strong>ดาวน์โหลดไฟล์ตัวอย่าง</strong>
              <p>ไฟล์ CSV เปิดด้วย Excel หรือ Google Sheets ได้ มีตัวอย่างให้ดู 8 แถว ลบแล้วกรอกของจริงแทนได้เลย</p>
              <button type="button" className="btn" onClick={() => download(SAMPLE_NAME, sampleCsv())}>ดาวน์โหลดไฟล์ตัวอย่าง (.csv)</button>
              <details className="pf-cols">
                <summary>ดูว่าแต่ละคอลัมน์ต้องกรอกอะไร</summary>
                <dl>
                  {COLUMNS.map(c => (
                    <div key={c.key}><dt>{c.th}{c.required ? '' : ' (ไม่บังคับ)'}</dt><dd>{c.hint}</dd></div>
                  ))}
                </dl>
              </details>
            </div>
          </li>
          <li className="pf-step">
            <span className="pf-step__no" aria-hidden="true">2</span>
            <div className="pf-step__body">
              <strong>กรอกข้อมูลแล้วบันทึกเป็น CSV</strong>
              <p>หนึ่งแถวต่อหนึ่งบิลที่ต้องการทำนาย ไม่เกิน {MAX_ROWS} แถว · ใน Excel เลือก &ldquo;บันทึกเป็น&rdquo; ชนิด <b>CSV UTF-8</b></p>
            </div>
          </li>
          <li className="pf-step">
            <span className="pf-step__no" aria-hidden="true">3</span>
            <div className="pf-step__body">
              <strong>อัปโหลดไฟล์</strong>
              <div className={`pf-drop ${drag ? 'is-drag' : ''}`}
                onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
                <label className="btn primary pf-pick">
                  <input ref={inputRef} type="file" accept=".csv,text/csv" className="pf-file"
                    onChange={e => e.target.files?.[0] && load(e.target.files[0])} />
                  เลือกไฟล์ CSV
                </label>
                <span className="pf-drop__or">หรือลากไฟล์มาวางที่นี่</span>
              </div>
              <button type="button" className="btn ghost pf-try" onClick={useSample}>ยังไม่มีไฟล์? ลองกับไฟล์ตัวอย่างเลย</button>
            </div>
          </li>
        </ol>
        <p className="hint pf-privacy">เบราว์เซอร์อ่านไฟล์ในเครื่องของคุณ ระบบส่งเฉพาะค่าในตารางไปให้ AI คำนวณ และไม่บันทึกข้อมูลที่อัปโหลดไว้</p>
      </section>

      {file && <FileCheck file={file} state={state} elapsed={elapsed} onPredict={predict} onReset={reset} />}
      {state.step === 'done' && (
        <Results out={state.out} models={models} activeModel={activeModel} high={high} mid={mid} fileName={file?.name}
          train={train} trainInfo={trainInfo} />
      )}
    </>
  );
}

/* ---------------- ตรวจไฟล์ + สั่งทำนาย ---------------- */

function FileCheck({ file, state, elapsed, onPredict, onReset }) {
  if (file.fatal) {
    return (
      <div className="error-box pf-msg" role="alert">
        <strong>ใช้ไฟล์ {file.name ? `"${file.name}"` : 'นี้'} ไม่ได้</strong>
        <p>{file.fatal}</p>
        <button type="button" className="btn" onClick={onReset}>เลือกไฟล์ใหม่</button>
      </div>
    );
  }
  const { rows, invalid, total } = file.table;
  const busy = state.step === 'busy';
  return (
    <section className="panel pf-check" aria-labelledby="pf-check-title">
      <h2 id="pf-check-title" className="pf-check__title">{file.sample ? 'ไฟล์ตัวอย่าง' : `ไฟล์ "${file.name}"`}</h2>
      <p className="pf-check__sum">
        อ่านได้ {total} แถว · <b>พร้อมทำนาย {rows.length} แถว</b>
        {invalid.length > 0 && <> · <span className="pf-bad">ต้องแก้ {invalid.length} แถว</span></>}
      </p>
      {invalid.length > 0 && (
        <div className="banner warn pf-invalid">
          <strong>แถวที่ต้องแก้ในไฟล์ (เลขบรรทัดตรงกับใน Excel)</strong>
          <ul>
            {invalid.slice(0, 20).map(r => (
              <li key={r.line}><b>บรรทัด {r.line}{r.ref ? ` · ${r.ref}` : ''}:</b> {r.errors.join(' · ')}</li>
            ))}
          </ul>
          {invalid.length > 20 && <p>และอีก {invalid.length - 20} แถว</p>}
          {rows.length > 0 && <p>ทำนายเฉพาะแถวที่ถูกต้องไปก่อนได้ แล้วแก้แถวที่เหลือในไฟล์ภายหลัง</p>}
        </div>
      )}
      <div className="btn-row pf-actions">
        {rows.length > 0 && (
          <button type="button" className="btn primary pf-go" disabled={busy} onClick={onPredict}>
            {busy ? 'AI กำลังทำนาย…' : state.step === 'done' ? `ทำนายใหม่ ${rows.length} แถว` : `ให้ AI ทำนาย ${rows.length} แถว`}
          </button>
        )}
        <button type="button" className="btn" disabled={busy} onClick={onReset}>เลือกไฟล์อื่น</button>
      </div>
      <p className="pf-live" role="status" aria-live="polite">
        {busy && (elapsed < 5 ? `กำลังส่ง ${rows.length} แถวให้ AI…`
          : `รอ AI มา ${elapsed} วินาที · ถ้าบริการ AI พักอยู่ อาจใช้เวลาราว 1 นาทีในการเปิด`)}
        {state.step === 'done' && `ทำนายเสร็จแล้ว ${state.out.results.length} แถว ดูผลด้านล่าง`}
      </p>
      {state.step === 'error' && <PredictError state={state} onRetry={onPredict} rows={rows} />}
    </section>
  );
}

function PredictError({ state, onRetry, rows }) {
  const asleep = state.status === 503 || state.status === 504;
  const notTrained = state.status === 409;
  return (
    <div className="error-box pf-msg" role="alert">
      <strong>{asleep ? 'บริการ AI ยังไม่พร้อมตอนนี้' : notTrained ? 'ยังไม่มีโมเดลที่เทรนไว้' : 'ทำนายไม่สำเร็จ'}</strong>
      <p>
        {asleep ? 'บริการ AI อาจกำลังตื่นจากการพัก (แพลนฟรีจะพักเมื่อไม่มีใครใช้ 15 นาที) รอสักครู่แล้วกดลองอีกครั้ง ข้อมูลในไฟล์ยังอยู่ ไม่ต้องอัปโหลดใหม่'
          : notTrained ? `${state.message} · กดปุ่ม "เทรนโมเดลใหม่" ด้านบนของหน้าก่อน แล้วกลับมาทำนายอีกครั้ง`
            : state.message}
      </p>
      {Array.isArray(state.details) && state.details.length > 0 && (
        <ul>{state.details.slice(0, 5).map(d => <li key={d.index}>บรรทัด {rows[d.index]?.line ?? d.index + 2}: {d.errors.join(' · ')}</li>)}</ul>
      )}
      <button type="button" className="btn" onClick={onRetry}>ลองอีกครั้ง</button>
    </div>
  );
}

/* ---------------- ประเมินโมเดล ---------------- */

const f2 = v => (v == null ? '–' : v.toFixed(2));
const pctOr = v => (v == null ? '–' : pct(v));
/** [ตัวชี้วัด, ชื่อที่ผู้ใช้อ่าน, รูปแบบตัวเลข] ชื่อไทยตรงกับแท็บทำนายการจ่ายช้า */
const EVAL_ROWS = [
  ['auc', 'แยกช้า/ตรงได้ (AUC)', f2],
  ['accuracy', 'ทายถูกรวม (Accuracy)', pctOr],
  ['precision', 'เตือนแล้วช้าจริง (Precision)', pctOr],
  ['recall', 'จับคนจ่ายช้าได้ (Recall)', pctOr],
  ['f1', 'F1', f2],
];
/** ตอนเทรน: AUC ใช้ค่าเฉลี่ย 5-fold CV (นิ่งกว่า) ตัวอื่นมาจากชุดทดสอบ 25% ที่เกณฑ์ 0.5 */
const trainCell = (t, key, fmt) => {
  if (!t) return '–';
  if (key === 'auc') return t.cv_auc_mean != null ? `${f2(t.cv_auc_mean)} ± ${f2(t.cv_auc_std)}` : f2(t.auc);
  return fmt(t[key]);
};

function ModelEval({ out, model, models, avail, train, trainInfo }) {
  const evals = useMemo(() => Object.fromEntries(avail.map(k => [k, evaluateFile(out.results, k)])), [out, avail]);
  const best = useMemo(() => Object.fromEntries(EVAL_ROWS.map(([key]) => [key, bestModels(evals, key)])), [evals]);
  const e0 = evals[avail[0]] || { n: 0 };
  const labeled = e0.n;
  const cur = evals[model];
  return (
    <section className="pf-eval" aria-labelledby="pf-eval-title">
      <h3 id="pf-eval-title" className="pf-eval__title">ประเมินโมเดล</h3>
      <p className="pf-eval__lead">
        {labeled
          ? <>วัดกับ <b>{labeled} แถว</b>ในไฟล์ที่ใส่ผลจริงไว้ (จ่ายช้า {e0.pos} · ตรงเวลา {e0.neg}) เทียบกับผลตอนเทรน · ทายว่าจ่ายช้าเมื่อคะแนนตั้งแต่ 50%</>
          : <>ไฟล์นี้ยังไม่มีผลจริง จึงแสดงเฉพาะผลประเมินตอนเทรน · ใส่คอลัมน์ &ldquo;ผลจริง (ถ้ารู้)&rdquo; ว่าจ่ายช้าหรือตรงเวลา แล้วระบบจะวัดให้ว่า AI ทายแม่นแค่ไหนกับไฟล์นี้</>}
      </p>
      {labeled > 0 && labeled < 30 && (
        <p className="banner warn pf-eval__note">มีผลจริงแค่ {labeled} แถว ตัวเลขของไฟล์นี้แกว่งได้มาก ควรมีอย่างน้อย 30 แถวที่มีทั้งจ่ายช้าและตรงเวลาจึงพอเชื่อได้</p>
      )}
      {labeled > 0 && (e0.pos === 0 || e0.neg === 0) && (
        <p className="banner warn pf-eval__note">ผลจริงมีแต่{e0.pos ? 'จ่ายช้า' : 'ตรงเวลา'} จึงคิด AUC ไม่ได้ ต้องมีทั้งสองแบบ</p>
      )}
      {!train && <p className="banner info pf-eval__note">ยังไม่มีผลประเมินตอนเทรน (บริการ AI ไม่ตอบตอนเปิดหน้า) รีเฟรชหน้านี้เมื่อบริการพร้อม</p>}

      <div className="pf-evals">
        {avail.map(k => (
          <article key={k} className={`pf-ev ${k === model ? 'is-on' : ''}`}>
            <header className="pf-ev__head">
              <strong>{models[k].plain}</strong>
              {k === model && <Chip>กำลังดู</Chip>}
              <small>{models[k].name}</small>
            </header>
            <table className="pf-ev__tbl">
              <thead><tr><th scope="col">ตัวชี้วัด</th>{labeled > 0 && <th scope="col">ไฟล์นี้</th>}<th scope="col">ตอนเทรน</th></tr></thead>
              <tbody>
                {EVAL_ROWS.map(([key, label, fmt]) => (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    {labeled > 0 && <td className="num">{fmt(evals[k][key])}{best[key].has(k) && <span className="pf-best">ดีสุด</span>}</td>}
                    <td className="num">{trainCell(train?.[k], key, fmt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
      </div>

      {labeled > 0 && cur && (
        <div className="pf-cm">
          <p className="pf-cm__title"><b>{models[model].plain}</b> กับไฟล์นี้ (เกณฑ์ 50%)</p>
          <div className="cm">
            <div /><div className="h">AI: ตรงเวลา</div><div className="h">AI: จ่ายช้า</div>
            <div className="h">จริง: ตรงเวลา</div>
            <div className="v ok">{cur.tn}<small>ทายถูก</small></div><div className="v no">{cur.fp}<small>เตือนเกิน</small></div>
            <div className="h">จริง: จ่ายช้า</div>
            <div className="v no">{cur.fn}<small>หลุด</small></div><div className="v ok">{cur.tp}<small>ทายถูก</small></div>
          </div>
        </div>
      )}

      {labeled > 0 && (
        <p className="hint pf-eval__note">
          ถ้าแถวในไฟล์เป็นบิลเก่าที่อยู่ในระบบแล้ว โมเดลเคยเห็นบิลเหล่านั้นตอนเทรน ตัวเลขของไฟล์จะดีเกินจริง
          ใช้บิลที่ครบกำหนดหลังวันเทรนล่าสุด{trainInfo?.trained_at ? ` (${thDate(trainInfo.trained_at.slice(0, 10))})` : ''} จะวัดได้ตรงกว่า
        </p>
      )}
      <details className="pf-eval__how">
        <summary>วิธีอ่านตัวเลข</summary>
        <dl>
          <div><dt>แยกช้า/ตรงได้ (AUC)</dt><dd>หยิบบิลจ่ายช้ากับบิลตรงเวลามาอย่างละใบ AI ให้คะแนนบิลจ่ายช้าสูงกว่ากี่ครั้งในร้อย 1.00 = แยกได้สมบูรณ์ · 0.50 = เท่าเดาสุ่ม</dd></div>
          <div><dt>ทายถูกรวม (Accuracy)</dt><dd>ทายถูกกี่ส่วนจากทั้งหมด ถ้าบิลส่วนใหญ่จ่ายตรงเวลา ค่านี้สูงได้แม้ AI ไม่เก่ง จึงต้องดูคู่กับตัวอื่น</dd></div>
          <div><dt>เตือนแล้วช้าจริง (Precision)</dt><dd>ในบิลที่ AI ทายว่าจ่ายช้า จ่ายช้าจริงกี่ส่วน (เตือนเกินน้อย = สูง)</dd></div>
          <div><dt>จับคนจ่ายช้าได้ (Recall)</dt><dd>ในบิลที่จ่ายช้าจริง AI ทายทันกี่ส่วน (หลุดน้อย = สูง)</dd></div>
          <div><dt>F1</dt><dd>ค่าเฉลี่ยแบบฮาร์มอนิกของ Precision กับ Recall สูงเมื่อทั้งสองค่าสูงพร้อมกัน</dd></div>
          <div><dt>ตอนเทรน</dt><dd>AUC = ค่าเฉลี่ยจาก 5-fold cross-validation ± ความแกว่ง · ตัวอื่นวัดกับบิล 25% ที่กันไว้ไม่ให้โมเดลเห็นตอนเรียน{trainInfo?.n_test ? ` (${trainInfo.n_test} บิล)` : ''} ที่เกณฑ์ 50%</dd></div>
        </dl>
      </details>
    </section>
  );
}

/* ---------------- ผลลัพธ์ ---------------- */

function Results({ out, models, activeModel, high, mid, fileName, train, trainInfo }) {
  const avail = out.models.filter(k => models[k]);
  const [model, setModel] = useState(avail.includes(activeModel) ? activeModel : avail[0]);
  const [show, setShow] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  const sum = useMemo(() => summarize(out.results, model, high, mid), [out, model, high, mid]);
  const list = useMemo(() => out.results
    .map(r => ({ ...r, score: r.scores[model], level: levelOf(r.scores[model], high, mid) }))
    .filter(r => show === 'all' || r.level === show)
    .sort((a, b) => b.score - a.score), [out, model, high, mid, show]);
  const meta = out.explain?.[model] || {};
  const filters = [['all', `ทั้งหมด ${sum.n}`], ['high', `${RISK_NAME.high} ${sum.high}`], ['mid', `${RISK_NAME.mid} ${sum.mid}`], ['low', `${RISK_NAME.low} ${sum.low}`]];
  const save = () => download(`ผลทำนาย-${(fileName || 'ไฟล์').replace(/\.csv$/i, '')}.csv`, resultsCsv(out.results, {
    models: avail, model, names: Object.fromEntries(avail.map(k => [k, models[k].name])), high, mid, levelWord: RISK_NAME,
  }));

  return (
    <section className="panel pf-res" aria-labelledby="pf-res-title">
      <SecHead title={<span id="pf-res-title">ผลการทำนาย {sum.n} แถว</span>}
        sub={`เรียงจากโอกาสจ่ายช้ามากไปน้อย · เสี่ยงสูง ≥ ${pct(high)} · ปานกลาง ≥ ${pct(mid)} ตามเกณฑ์ที่กำลังตั้งในหน้านี้`}
        right={<button type="button" className="btn" onClick={save}>ดาวน์โหลดผล (.csv)</button>} />

      <fieldset className="pf-models">
        <legend>ดูผลของโมเดล</legend>
        <div className="pf-models__opts">
          {avail.map(k => (
            <label key={k} className={`pf-model ${model === k ? 'is-on' : ''}`}>
              <input type="radio" name="pf-model" checked={model === k} onChange={() => { setModel(k); setLimit(PAGE); }} />
              <span><strong>{models[k].plain}</strong><small>{models[k].name}{k === activeModel ? ' · ใช้งานอยู่' : ''}</small></span>
            </label>
          ))}
        </div>
      </fieldset>

      <ModelEval out={out} model={model} models={models} avail={avail} train={train} trainInfo={trainInfo} />

      {meta.scope === 'global' && (
        <p className="banner info">โมเดลนี้อธิบายรายแถวไม่ได้ในตอนนี้ เหตุผลที่แสดงเป็นปัจจัยหลักของโมเดลโดยรวม ไม่ใช่เหตุผลเฉพาะของแถวนั้น</p>
      )}

      {/* ปุ่มกรองบอกจำนวนแต่ละระดับไปในตัว จึงไม่ต้องมีกล่องสรุปแยก */}
      <div className="seg pf-filter" role="radiogroup" aria-label="กรองตามระดับความเสี่ยง">
        {filters.map(([id, label]) => (
          <label key={id}><input type="radio" name="pf-show" checked={show === id} onChange={() => { setShow(id); setLimit(PAGE); }} />{label}</label>
        ))}
      </div>

      {list.length === 0 ? <Empty>ไม่มีแถวในกลุ่มนี้</Empty> : (
        <>
          <div className="ai-examples pf-cards">
            {list.slice(0, limit).map(r => <ResultCard key={r.line} r={r} model={model} models={models} avail={avail} scope={meta.scope} />)}
          </div>
          {list.length > limit && (
            <button type="button" className="btn ai-more" onClick={() => setLimit(n => n + PAGE)}>
              ดูเพิ่มอีก {Math.min(PAGE, list.length - limit)} แถว (เหลือ {list.length - limit})
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ResultCard({ r, model, models, avail, scope }) {
  const f = r.features, inp = r.input;
  const ratio = Math.round((f.bill_ratio - 1) * 100);
  return (
    <article className="ai-ex pf-card">
      <header className="pf-card__head">
        <strong>{inp.ref || `บรรทัด ${r.line}`}</strong>
        <small>แผง{STALL_TYPES[inp.stall_type]} · ครบกำหนดเดือน{TH_M[inp.due_month - 1]}{inp.ref ? ` · บรรทัด ${r.line}` : ''}</small>
      </header>
      <div className="ai-ex__score">
        <Meter value={r.score} label="โอกาสจ่ายช้า" /><b>{pct(r.score)}</b>
        <Chip tone={RISK_TONE[r.level]}>{RISK_NAME[r.level]}</Chip>
      </div>
      <p className="pf-card__say">{summarySentence({ level: r.level, contributions: r.contributions?.[model] || [], features: f, scope })}</p>
      <dl className="ai-ex__facts">
        <div><dt>ประวัติ</dt><dd>{inp.n_prior ? `จ่ายช้า ${inp.late_count} จาก ${inp.n_prior} บิล${inp.late_count ? ` รวม ${inp.days_late_total} วัน` : ''}` : 'ยังไม่มีบิลก่อนหน้า'}</dd></div>
        <div><dt>ยอดบิล</dt><dd><span className="num">{baht(inp.bill_total)} บาท</span>{f.n_prior > 0 && inp.prev_avg > 0 ? ` (${ratio === 0 ? 'เท่าปกติ' : `${ratio > 0 ? 'สูง' : 'ต่ำ'}กว่าปกติ ${Math.abs(ratio)}%`})` : ''}</dd></div>
        {inp.actual != null && (
          <div><dt>ผลจริง</dt><dd>{inp.actual ? 'จ่ายช้า' : 'ตรงเวลา'}{' '}
            {isCorrect(r, model) ? <Chip tone="good">✓ ทายถูก</Chip> : <Chip tone="bad">✗ ทายพลาด</Chip>}</dd></div>
        )}
        <div><dt>เช่ามาแล้ว</dt><dd>{inp.tenure_years < 1 ? `${Math.max(1, Math.round(inp.tenure_years * 12))} เดือน` : `${Math.round(inp.tenure_years * 10) / 10} ปี`}</dd></div>
        {f.n_prior > 0 && (
          <div><dt>พฤติกรรม</dt><dd>
            {f.filled?.length === 3 ? 'ไม่ได้กรอก ใช้ค่าเฉลี่ยของตลาด' : (
              <>จ่ายก่อนกำหนด {Math.round(f.early_days_avg * 10) / 10} วัน · เปิดดูบิล {Math.round(f.seen_rate * 100)}% · จ่ายผ่านแอป {Math.round(f.app_share * 100)}%
                {f.filled?.length > 0 && ' (บางช่องใช้ค่าเฉลี่ยของตลาด)'}</>
            )}
          </dd></div>
        )}
      </dl>
      {avail.length > 1 && (
        <p className="pf-card__others">
          โมเดลอื่น: {avail.filter(k => k !== model).map(k => <span key={k} title={models[k].name}>{SHORT[k] || k} {pct(r.scores[k])}</span>)}
        </p>
      )}
      <ul className="reasons">{r.reasons.map(x => <li key={x}>{x}</li>)}</ul>
    </article>
  );
}
