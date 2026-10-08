import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useApp, useData } from '../../ui';
import { IF_LEVEL, zPhrase } from '../../ai/featureLabels';
import { num, thDateTime } from '../../ai/behind';
import { UNDO_TOAST_MS, failMessage, newClientRef, savedMessage, sendWithRetry } from '../../ai/undo';
import MeterChart from './MeterChart';
import { BIcon, LoadError, Skeleton, StateBox, TabHead, TechDetails } from './parts';

/*
 * แท็บ "มิเตอร์ที่ถูกทัก": ทำไมเลขมิเตอร์นี้ถูกทัก (RodeMap 3.3)
 * กราฟย้อนหลัง + ช่วงปกติ + ผลตรวจเป็นภาษาคน · เจ้าหน้าที่กด "ยืนยันค่าถูก" หรือ "แก้ค่า" แล้วเลิกทำได้ใน 6 วินาที
 * ทุกการกดบันทึกลงเซิร์ฟเวอร์ทันทีพร้อมชื่อผู้ทำ · เจ้าของและทีมดูได้อย่างเดียว
 */
const UTIL = { water: 'น้ำ', elec: 'ไฟ' };
const STATE = {
  pending: { label: 'รอตรวจ', tone: 'warn', icon: 'warn' },
  confirmed: { label: 'ยืนยันแล้ว', tone: 'good', icon: 'good' },
  resolved: { label: 'แก้แล้ว ค่าปกติ', tone: 'good', icon: 'good' },
  issued: { label: 'ออกบิลแล้ว', tone: 'none', icon: 'good' },
};
const KIND_TH = { high: 'ใช้มากกว่าปกติ', low: 'ใช้น้อยกว่าปกติ', misread: 'เลขน้อยกว่ารอบก่อน', pattern: 'รูปแบบแปลก' };

function StateTag({ state }) {
  const s = STATE[state] || STATE.pending;
  return <span className={`bh-level bh-level--${s.tone === 'warn' ? 'mid' : s.tone === 'good' ? 'low' : 'none'}`}><BIcon name={s.icon} size={15} />{s.label}</span>;
}

/**
 * toast เลิกทำ: 6 วินาที · aria-live="polite" · ปุ่มเลิกทำ ≥ 44×44 px · ไม่บังปุ่มอื่น (หน้าเว้นที่ด้านล่างให้)
 * วาดผ่าน portal ที่ body เพราะ .page มี animation ที่ใช้ transform ทำให้ position: fixed ข้างในไม่ยึดกับจอ
 */
function UndoToast({ toast, onUndo, onClose, owner }) {
  const [left, setLeft] = useState(UNDO_TOAST_MS);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!toast) return undefined;
    const end = toast.shownAt + UNDO_TOAST_MS;
    setLeft(Math.max(0, end - Date.now()));
    const t = setInterval(() => {
      const ms = end - Date.now();
      setLeft(Math.max(0, ms));
      if (ms <= 0) close.current();
    }, 200);
    return () => clearInterval(t);
  }, [toast]);
  return createPortal(
    <div className={`bh-undo ${owner ? 'bh-undo--owner' : ''}`} aria-live="polite" role="status">
      {toast && (
        <div className={`bh-undo__box ${toast.error ? 'is-error' : ''}`}>
          <p>{toast.text}</p>
          {toast.reviewId && !toast.error && (
            <button type="button" className="bh-undo__btn" onClick={onUndo} disabled={toast.busy}>
              {toast.busy ? 'กำลังเลิกทำ…' : 'เลิกทำ'}
            </button>
          )}
          {toast.retry && <button type="button" className="bh-undo__btn" onClick={toast.retry}>ลองใหม่</button>}
          <button type="button" className="bh-undo__x" onClick={onClose} aria-label="ปิดข้อความ">×</button>
          {!toast.error && <i className="bh-undo__bar" style={{ transform: `scaleX(${left / UNDO_TOAST_MS})` }} aria-hidden="true" />}
        </div>
      )}
    </div>,
    document.body,
  );
}

function ReviewActions({ d, util, onSaved, onError, busy, setBusy }) {
  const u = d.utilities[util];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const pending = useRef(null);   // { key, ref } ใช้ client_ref เดิมเมื่อกดลองใหม่หลังเน็ตหลุด
  const misread = u.cur != null && u.prev != null && u.cur < u.prev;

  const send = async (decision, newValue) => {
    const key = `${decision}:${util}:${newValue ?? ''}`;
    if (pending.current?.key !== key) pending.current = { key, ref: newClientRef() };
    const body = { decision, utility: util, client_ref: pending.current.ref, ...(decision === 'corrected' ? { new_value: newValue } : {}) };
    setBusy(true);
    try {
      const { data } = await sendWithRetry(() => api(`/ai/readings/${d.stall_id}/${d.period}/review`, { method: 'POST', body }));
      pending.current = null;
      setEditing(false); setValue('');
      onSaved(data);
    } catch (e) {
      onError(failMessage(e, 'save'), e.status ? null : () => send(decision, newValue));
    } finally { setBusy(false); }
  };

  const n = Number(value);
  const err = value === '' ? null
    : !Number.isInteger(n) || n < 0 ? 'ใส่เป็นตัวเลขจำนวนเต็ม'
      : n < u.prev ? `ต้องไม่น้อยกว่าเลขรอบก่อน (${num(u.prev)})`
        : n === u.cur ? 'เท่ากับค่าเดิม ถ้าค่านี้ถูกให้กด "ยืนยันค่าถูก"' : null;

  return (
    <div className="bh-act">
      <div className="bh-act__row">
        <button type="button" className="btn primary bh-btn" disabled={busy || misread} onClick={() => send('confirmed')}>
          <BIcon name="good" size={18} />ยืนยันค่าถูก
        </button>
        <button type="button" className="btn bh-btn" disabled={busy} aria-expanded={editing} onClick={() => setEditing(e => !e)}>แก้ค่า{UTIL[util]}</button>
      </div>
      {misread && <p className="bh-fine">เลขมิเตอร์{UTIL[util]}น้อยกว่ารอบก่อน ยืนยันไม่ได้ ต้องแก้ค่าก่อนออกบิล</p>}
      {editing && (
        <form className="bh-fix" onSubmit={e => { e.preventDefault(); if (!err && value !== '') send('corrected', n); }}>
          <label htmlFor="bh-fix-v">เลขมิเตอร์{UTIL[util]}ที่ถูกต้อง <span className="bh-fine">(รอบก่อน {num(u.prev)} · ที่จดไว้ {num(u.cur)})</span></label>
          <div className="bh-fix__row">
            <input id="bh-fix-v" className="bh-input" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={value}
              onChange={e => setValue(e.target.value.replace(/[^\d]/g, ''))} aria-invalid={Boolean(err)} aria-describedby="bh-fix-help" autoFocus />
            <button type="submit" className="btn primary bh-btn" disabled={busy || Boolean(err) || value === ''}>บันทึกค่าใหม่</button>
          </div>
          <p id="bh-fix-help" className={`bh-fine ${err ? 'bh-err' : ''}`}>
            {err || (value !== '' ? `ใช้เดือนนี้ ${num(n - u.prev)} หน่วย` : 'กรอกเลขบนหน้าปัดมิเตอร์ (ไม่ใช่จำนวนหน่วยที่ใช้)')}
          </p>
        </form>
      )}
    </div>
  );
}

function MeterExplain({ k, onChanged }) {
  const { user, toast: appToast } = useApp();
  const [stall, period] = k.split('/');
  const st = useData(() => api(`/ai/readings/${stall}/${period}/explain`), [k]);
  const [util, setUtil] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const owner = user.role === 'owner';

  useEffect(() => { setUtil(null); setToast(null); }, [k]);
  if (st.error && !st.data) return <LoadError error={st.error} onRetry={st.reload} what="ข้อมูลมิเตอร์" />;
  if (!st.data || (st.loading && st.data.stall_id !== stall)) return <Skeleton kind="chart" label="กำลังโหลดกราฟมิเตอร์…" />;
  const d = st.data;
  const flaggedUtils = d.flagged_utilities || [];
  const cur = util || flaggedUtils[0] || 'water';
  const data = d.utilities[cur];

  const after = () => { st.reload(); onChanged(); };
  const onSaved = r => { setToast({ text: savedMessage(r), reviewId: r.review_id, shownAt: Date.now() }); after(); };
  const onError = (text, retry) => setToast({ text, error: true, retry, shownAt: Date.now() + 60000 });
  const undo = async () => {
    setToast(t => t && { ...t, busy: true });
    try {
      const { data: r } = await sendWithRetry(() => api(`/ai/reviews/${toast.reviewId}/undo`, { method: 'POST' }));
      setToast(null);
      appToast(r.already ? 'เลิกทำไปแล้ว' : 'เลิกทำแล้ว คืนค่าเดิม');
      after();
    } catch (e) {
      setToast(t => t && { ...t, busy: false, text: failMessage(e, 'undo'), error: Boolean(e.status) });
    }
  };

  return (
    <article className="bh-explain" aria-labelledby="bh-meter-h">
      <header className="bh-explain__head">
        <h3 id="bh-meter-h">แผง {d.stall_id}{d.vendor_name && <small> · {d.vendor_name}</small>}</h3>
        <p>{d.type_name} · มิเตอร์รอบ{d.period_label} · {d.source === 'draft' ? 'ยังไม่ออกบิล' : 'ออกบิลแล้ว'}</p>
      </header>

      {d.flagged && d.reasons.length > 0 && (
        <div className={`bh-verdict bh-verdict--${d.kind === 'misread' || d.if_level === 'abnormal' ? 'high' : 'mid'}`}>
          <BIcon name="warn" size={26} />
          <div>
            <p className="bh-verdict__text">AI ทักค่านี้เพราะ</p>
            <ul className="bh-list">{d.reasons.map(r => <li key={r}>{r}</li>)}</ul>
          </div>
        </div>
      )}
      {d.source === 'reading' && !d.reasons.length && d.first_flag && (
        <div className="bh-verdict bh-verdict--mid">
          <BIcon name="warn" size={26} />
          <div>
            <p className="bh-verdict__text">ตอนจด AI ทักค่าเดิมเพราะ</p>
            <ul className="bh-list">{d.first_flag.reasons.map(r => <li key={r}>{r}</li>)}</ul>
            <p className="bh-fine">ค่าในกราฟเป็นค่าที่ออกบิลจริง (หลังเจ้าหน้าที่ตรวจแล้ว) ดูประวัติการตรวจด้านล่าง</p>
          </div>
        </div>
      )}
      {!d.has_check && (
        <p className="bh-notice bh-notice--idle" role="note"><BIcon name="warn" size={18} />
          <span>ค่านี้ออกบิลก่อนระบบเริ่มเก็บผลตรวจของ AI ช่วงปกติด้านล่างคำนวณย้อนหลังจากประวัติด้วยสูตรเดียวกัน</span></p>
      )}
      {d.stale && (
        <p className="bh-notice" role="note"><BIcon name="refresh" size={18} />
          <span>ค่าถูกแก้หลัง AI ตรวจ ผลตรวจด้านล่างเป็นของค่าเดิม AI จะตรวจซ้ำเมื่อเปิดหน้าจดมิเตอร์หรือตอนออกบิล</span></p>
      )}

      <div className="bh-seg" role="group" aria-label="เลือกมิเตอร์">
        {['water', 'elec'].map(x => (
          <button key={x} type="button" className={`bh-seg__btn ${cur === x ? 'is-on' : ''}`} aria-pressed={cur === x} onClick={() => setUtil(x)}>
            {UTIL[x]}{flaggedUtils.includes(x) && <span className="bh-seg__flag"> · ถูกทัก</span>}
          </button>
        ))}
      </div>

      <MeterChart key={`${k}-${cur}`} history={d.history.map(h => ({ period: h.period, value: h[cur], flagged: h.flagged }))}
        current={{ period: d.period, value: data.use, flagged: flaggedUtils.includes(cur) }} band={data.band}
        unitLabel={`ใช้${UTIL[cur]}`} compact={owner} />

      <ul className="bh-facts">
        <li><b>เดือนนี้</b> ใช้{UTIL[cur]} {num(data.use)} หน่วย{data.band && <> · ปกติของแผงนี้ {num(data.band.low)}–{num(data.band.high)} หน่วย (เฉลี่ย {num(data.band.mean)})</>}</li>
        <li><b>เทียบกับประวัติของแผงนี้</b> {zPhrase(data.z)}</li>
        {d.if_level && <li><b>{owner ? 'รูปแบบการใช้น้ำ–ไฟโดยรวม' : 'รูปแบบน้ำ–ไฟ (Isolation Forest)'}</b> <span className={`bh-if bh-if--${d.if_level}`}>{IF_LEVEL[d.if_level]}</span></li>}
        {d.window && <li className="bh-fine">ใช้ประวัติ {d.window.n} เดือน ({d.window.from} ถึง {d.window.to}){d.checked_at && ` · AI ตรวจเมื่อ ${thDateTime(d.checked_at)}`}</li>}
      </ul>

      {d.can_review ? (
        <ReviewActions d={d} util={cur} busy={busy} setBusy={setBusy} onSaved={onSaved} onError={onError} />
      ) : d.source === 'draft' ? (
        <p className="bh-fine">เฉพาะเจ้าหน้าที่สำนักงานยืนยันหรือแก้ค่าได้ หน้านี้ดูได้อย่างเดียว</p>
      ) : null}

      {d.reviews.length > 0 && (
        <section aria-label="ประวัติการตรวจค่านี้">
          <h4 className="bh-h4">ใครตรวจค่านี้แล้วบ้าง</h4>
          <ol className="bh-audit">
            {d.reviews.map(r => (
              <li key={r.id} className={`bh-audit__item bh-audit__item--review ${r.undone_at ? 'is-undone' : ''}`}>
                <span className="bh-audit__icon"><BIcon name={r.decision === 'confirmed' ? 'good' : 'refresh'} size={18} /></span>
                <div className="bh-audit__body">
                  <p className="bh-audit__what">
                    {r.decision === 'confirmed' ? `ยืนยันค่า${UTIL[r.utility]} ${num(r.new_value)} ว่าถูก` : `แก้ค่า${UTIL[r.utility]} ${num(r.old_value)} → ${num(r.new_value)}`}
                  </p>
                  <p className="bh-audit__meta">
                    {r.reviewer || 'ไม่ทราบชื่อ'} · {thDateTime(r.reviewed_at)} · {r.source === 'meters' ? 'จากหน้าจดมิเตอร์' : 'จากหน้าเบื้องหลัง AI'}
                    {r.undone_at && <> · <span className="bh-undone">เลิกทำแล้ว</span></>}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {user.role === 'admin' && d.has_check && (
        <TechDetails>
          <dl className="bh-kv bh-kv--tech">
            <div><dt>z เทียบประวัติแผง</dt><dd>น้ำ {d.utilities.water.z ?? '–'} · ไฟ {d.utilities.elec.z ?? '–'} (เกณฑ์ {d.z_threshold})</dd></div>
            <div><dt>z เทียบแผงประเภทเดียวกัน</dt><dd>น้ำ {d.utilities.water.peer_z ?? '–'} · ไฟ {d.utilities.elec.peer_z ?? '–'}</dd></div>
            <div><dt>คะแนน Isolation Forest</dt><dd>{d.if_score ?? '–'} (เกณฑ์ {d.if_threshold})</dd></div>
            <div><dt>วิธีทัก</dt><dd><code>{d.method}</code> · ประเภท <code>{d.kind}</code> ({KIND_TH[d.kind] || '–'})</dd></div>
            <div><dt>ช่วงปกติ</dt><dd>mean ± {data.band?.k} × SD · {data.band_source === 'check' ? 'จากผลตรวจที่เก็บไว้' : 'คำนวณย้อนหลัง'}</dd></div>
          </dl>
        </TechDetails>
      )}

      <UndoToast toast={toast} onUndo={undo} onClose={() => setToast(null)} owner={owner} />
      {toast && <div className="bh-undo__spacer" aria-hidden="true" />}
    </article>
  );
}

export default function MetersTab({ status }) {
  const [params, setParams] = useSearchParams();
  const st = useData(() => api('/ai/readings'));
  const detailRef = useRef(null);
  const picked = useRef(false);
  const all = st.data ? [...st.data.current, ...st.data.past] : [];
  const wanted = params.get('reading');
  const selected = all.find(i => i.key === wanted)?.key ?? all[0]?.key ?? null;

  useEffect(() => {
    if (!picked.current || !detailRef.current) return;
    if (window.matchMedia('(max-width: 899px)').matches) detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    picked.current = false;
  }, [selected]);

  const pick = key => {
    picked.current = true;
    const next = new URLSearchParams(params);
    next.set('reading', key);
    setParams(next, { replace: true });
  };
  const row = it => (
    <li key={it.key}>
      <button type="button" className={`bh-billrow ${it.key === selected ? 'is-on' : ''}`} aria-current={it.key === selected ? 'true' : undefined} onClick={() => pick(it.key)}>
        <span className="bh-billrow__top"><b>แผง {it.stall_id}</b><StateTag state={it.state} /></span>
        <span className="bh-billrow__name">{it.vendor_name || it.type_name}{it.source === 'reading' && ` · รอบ ${it.period}`}</span>
        <span className="bh-billrow__why">
          {it.utilities.length ? `${it.utilities.map(x => UTIL[x]).join(' + ')} · ` : ''}{KIND_TH[it.kind] || (it.has_check ? 'ตรวจซ้ำแล้วปกติ' : 'ถูกทักตอนออกบิล')}
          {it.review && it.state === 'confirmed' && ` · ยืนยันโดย ${it.review.reviewer}`}
        </span>
      </button>
    </li>
  );

  return (
    <div className="bh-panel">
      <TabHead title="ทำไมเลขมิเตอร์นี้ถูกทัก" synthetic={status?.is_synthetic} profile={status?.sim_profile}
        sub="AI เทียบการใช้น้ำ–ไฟเดือนนี้กับประวัติของแผงเองและแผงประเภทเดียวกัน แล้วทักค่าที่ควรเดินไปตรวจหน้างาน คนเป็นผู้ยืนยันหรือแก้ค่า" />
      {st.error && !st.data && <LoadError error={st.error} onRetry={st.reload} what="รายการมิเตอร์" />}
      {!st.data && !st.error && <div className="bh-split"><Skeleton kind="list" /><Skeleton kind="chart" /></div>}
      {st.data && !all.length && (
        <StateBox kind="empty" title="ไม่มีค่ามิเตอร์ที่ถูกทัก">
          รอบ{st.data.period_label} ยังไม่มีค่าที่ AI ทัก เมื่อเจ้าหน้าที่จดมิเตอร์และกดตรวจ ค่าที่ผิดปกติจะขึ้นที่นี่
        </StateBox>
      )}
      {st.data && all.length > 0 && (
        <div className="bh-split">
          <div className="bh-billcol">
            <h3 className="bh-h4">รอบ{st.data.period_label} {st.data.count.pending > 0 ? `· รอตรวจ ${st.data.count.pending} แผง` : '· ตรวจครบแล้ว'}</h3>
            {st.data.current.length
              ? <ul className="bh-bills">{st.data.current.map(row)}</ul>
              : <p className="bh-fine">รอบนี้ยังไม่มีค่าที่ถูกทัก</p>}
            {st.data.past.length > 0 && (
              <details className="bh-past" open={st.data.past.some(p => p.key === selected)}>
                <summary>ค่าที่ถูกทักในรอบก่อน ๆ ({st.data.past.length})</summary>
                <ul className="bh-bills">{st.data.past.map(row)}</ul>
              </details>
            )}
          </div>
          <div className="bh-split__detail" ref={detailRef}>
            {selected && <MeterExplain k={selected} onChanged={st.reload} />}
          </div>
        </div>
      )}
    </div>
  );
}
