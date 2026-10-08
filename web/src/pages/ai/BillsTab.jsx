import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { baht, periodLabel, thDate } from '../../format';
import { useApp, useData } from '../../ui';
import { LEVEL_WORD, describeFactor, featureLabel, summarySentence } from '../../ai/featureLabels';
import { MODEL_PLAIN, MODEL_SHORT, riskPct as pct, thDateTime } from '../../ai/behind';
import { BIcon, LoadError, Skeleton, StateBox, TabHead, TechDetails } from './parts';

/*
 * แท็บ "บิลเสี่ยง": ทำไมบิลนี้ได้คะแนนนี้ (RodeMap 3.2)
 * รายการบิลค้าง → เลือกบิล → กล่องสรุประดับ + ประโยคภาษาไทย + แท่งปัจจัยสองทิศ
 * ทุกอย่างอ่านจาก bills.risk_features ที่เก็บไว้ตอนให้คะแนน ไม่เรียก ML
 * หน้านี้เป็นของเจ้าหน้าที่ เจ้าของ และทีม เท่านั้น (API ปฏิเสธผู้ค้า)
 */

const LEVEL_ICON = { high: 'warn', mid: 'warn', low: 'good' };
const METHOD_TH = { linear: 'ถ่วงน้ำหนักจากสัมประสิทธิ์ (coef × ค่าที่ standardize)', tree_path: 'แยกตามเส้นทางในต้นไม้ (Saabas)', shap: 'SHAP TreeExplainer', permutation: 'ความสำคัญระดับโมเดล (permutation importance)' };

/** ป้ายระดับ: สี + ไอคอน + คำ เสมอ */
function LevelTag({ level }) {
  if (!level) return <span className="bh-level bh-level--none">ยังไม่มีคะแนน</span>;
  return <span className={`bh-level bh-level--${level}`}><BIcon name={LEVEL_ICON[level]} size={15} />{LEVEL_WORD[level].replace('ความ', '')}</span>;
}

/**
 * แท่งปัจจัยสองทิศ: ซ้าย = ลดความเสี่ยง ขวา = เพิ่มความเสี่ยง
 * ความยาวเทียบกับปัจจัยที่แรงที่สุดของบิลนี้ ทิศบอกด้วยตำแหน่ง สี ลูกศร และคำ (ไม่ใช้สีอย่างเดียว)
 */
function FactorDiverging({ contributions, features, global }) {
  const max = Math.max(...contributions.map(c => Math.abs(c.contribution))) || 1;
  return (
    <figure className="bh-fx">
      {!global && (
        <div className="bh-fx__axis" aria-hidden="true"><span>← ลดความเสี่ยง</span><span>เพิ่มความเสี่ยง →</span></div>
      )}
      <ul className={`bh-fx__list ${global ? 'is-global' : ''}`}>
        {contributions.map(c => {
          const w = `${Math.max(4, (Math.abs(c.contribution) / max) * 100)}%`;
          const text = global ? featureLabel(c.feature) : describeFactor(c, features);
          const dirWord = c.direction === 'up' ? 'เพิ่ม' : c.direction === 'down' ? 'ลด' : 'ไม่มีผล';
          return (
            <li key={c.feature} className={`bh-fx__row is-${c.direction}`}
              aria-label={global ? text : `${text}: ${c.direction === 'up' ? 'เพิ่มความเสี่ยง' : c.direction === 'down' ? 'ลดความเสี่ยง' : 'แทบไม่มีผล'}`}>
              <span className="bh-fx__label">{text}</span>
              {global ? (
                <span className="bh-fx__track bh-fx__track--mag"><i className="bh-fx__bar" style={{ width: w }} /></span>
              ) : (
                <span className="bh-fx__track" aria-hidden="true">
                  <span className="bh-fx__half bh-fx__half--down">{c.direction === 'down' && <i className="bh-fx__bar" style={{ width: w }} />}</span>
                  <span className="bh-fx__half bh-fx__half--up">{c.direction === 'up' && <i className="bh-fx__bar" style={{ width: w }} />}</span>
                </span>
              )}
              {!global && <span className="bh-fx__dir">{c.direction === 'up' ? '▲' : c.direction === 'down' ? '▼' : '•'} {dirWord}</span>}
            </li>
          );
        })}
      </ul>
      <figcaption className="bh-fine">
        {global
          ? 'แท่งยาว = โมเดลโดยรวมให้น้ำหนักกับปัจจัยนั้นมาก (บอกทิศทางของบิลนี้ไม่ได้)'
          : 'แท่งยาว = ปัจจัยนั้นมีผลต่อคะแนนของบิลนี้มาก เทียบกับปัจจัยอื่นของบิลเดียวกัน'}
      </figcaption>
    </figure>
  );
}

function BillExplain({ id }) {
  const { user } = useApp();
  const st = useData(() => api(`/ai/bills/${id}/explain`), [id]);
  if (st.error && !st.data) return <LoadError error={st.error} onRetry={st.reload} what="คำอธิบายของบิลนี้" />;
  if (!st.data || st.loading && st.data.bill.id !== id) return <Skeleton kind="chart" label="กำลังโหลดคำอธิบาย…" />;
  const d = st.data;
  const b = d.bill;
  const global = d.scope === 'global';
  const sentence = !d.contributions.length && d.legacy_reasons.length
    ? `${LEVEL_WORD[d.level]} · ตามเหตุผลที่ระบบบันทึกไว้ด้านล่าง`
    : summarySentence({ level: d.level, contributions: d.contributions, features: d.features, scope: d.scope });

  return (
    <article className="bh-explain" aria-labelledby="bh-explain-h">
      <header className="bh-explain__head">
        <h3 id="bh-explain-h">แผง {b.stall_id}{b.vendor_name && <small> · {b.vendor_name}</small>}</h3>
        <p>บิล{periodLabel(b.period)} · {baht(b.total)} บาท · ครบกำหนด {thDate(b.due_date)}{b.status === 'overdue' && <b className="bh-overdue"> · เลยกำหนดแล้ว</b>}</p>
      </header>

      {!d.scored ? (
        <StateBox kind="empty" title="บิลนี้ยังไม่มีคะแนน">
          ระบบจะให้คะแนนเมื่อเทรนโมเดลใหม่หรือออกบิลรอบถัดไป ระหว่างนี้ใช้ประวัติการจ่ายของผู้ค้าประกอบการตัดสินใจได้ตามปกติ
        </StateBox>
      ) : (
        <>
          {/* ระดับสูง: กล่องแดง + ไอคอน + คำว่า "ความเสี่ยงสูง" · กลาง: กล่องอ่อน · ต่ำ: ไม่เน้น */}
          <div className={`bh-verdict bh-verdict--${d.level}`} role={d.level === 'high' ? 'alert' : undefined}>
            {d.level !== 'low' && <BIcon name="warn" size={26} />}
            <div>
              <p className="bh-verdict__text">{sentence}</p>
              <p className="bh-verdict__score">
                โอกาสจ่ายช้าราว <b>{pct(d.score)}</b>
                <span> · เกณฑ์ที่ตั้งไว้: สูง ≥ {pct(d.thresholds.high)} ปานกลาง ≥ {pct(d.thresholds.mid)}</span>
              </p>
            </div>
          </div>

          {global && (
            <p className="bh-notice bh-notice--idle" role="note">
              <BIcon name="warn" size={18} />
              <span>โมเดลที่ใช้อยู่อธิบายรายบิลไม่ได้ จึงแสดงปัจจัยหลักของโมเดลโดยรวมแทน ไม่ใช่เหตุผลเฉพาะของบิลนี้</span>
            </p>
          )}
          {d.stale && (
            <p className="bh-notice" role="note">
              <BIcon name="refresh" size={18} />
              <span>คะแนนนี้มาจากโมเดลรุ่นก่อน (ให้คะแนนเมื่อ {thDateTime(d.scored_at)}) จะอัปเดตเมื่อให้คะแนนบิลค้างรอบถัดไป</span>
            </p>
          )}

          {d.contributions.length > 0 ? (
            <section aria-label={global ? 'ปัจจัยหลักของโมเดล' : 'ปัจจัยที่มีผลต่อคะแนนของบิลนี้'}>
              <h4 className="bh-h4">{global ? 'โมเดลโดยรวมดูอะไรเป็นหลัก' : 'ปัจจัยที่มีผลกับบิลนี้มากที่สุด'}</h4>
              <FactorDiverging contributions={d.contributions} features={d.features} global={global} />
            </section>
          ) : d.legacy_reasons.length > 0 ? (
            <section>
              <h4 className="bh-h4">เหตุผลที่ระบบบันทึกไว้</h4>
              <ul className="bh-list">{d.legacy_reasons.map(r => <li key={r}>{r}</li>)}</ul>
              <p className="bh-fine">บิลนี้ให้คะแนนก่อนระบบเก็บปัจจัยแบบละเอียด จะเห็นกราฟปัจจัยหลังให้คะแนนรอบถัดไป</p>
            </section>
          ) : (
            <StateBox kind="empty" title="ยังไม่มีคำอธิบายของบิลนี้">จะมีหลังให้คะแนนบิลค้างรอบถัดไป</StateBox>
          )}

          <p className="bh-fine">
            ให้คะแนนเมื่อ {thDateTime(d.scored_at) || '–'} ด้วยโมเดล{MODEL_PLAIN[d.model] || ''}
            {d.run && <> · โมเดลรุ่นนี้เทรนเมื่อ {thDateTime(d.run.trained_at)}</>}
            {' · '}คะแนนใช้ประกอบการตัดสินใจ ไม่ได้ตัดสินแทนเจ้าหน้าที่
          </p>
        </>
      )}

      {user.role === 'admin' && d.scored && (
        <TechDetails>
          <dl className="bh-kv bh-kv--tech">
            <div><dt>โมเดล</dt><dd>{MODEL_SHORT[d.model] || d.model} · รอบเทรน {d.run?.run_id ?? '–'}</dd></div>
            <div><dt>วิธีอธิบาย</dt><dd>{METHOD_TH[d.explain?.method] || d.explain?.method || '–'} · scope {d.explain?.scope || '–'}</dd></div>
            <div><dt>หน่วยของแรง</dt><dd>{d.explain?.unit === 'logit' ? 'log-odds (ฐาน + ผลรวม = logit ของคะแนน)' : d.explain?.unit === 'probability' ? 'ความน่าจะเป็น (ฐาน + ผลรวม = คะแนน)' : d.explain?.unit || '–'}</dd></div>
            <div><dt>ค่าฐาน</dt><dd>{d.explain?.base != null ? Number(d.explain.base).toFixed(4) : '–'}</dd></div>
          </dl>
          <table className="bh-table">
            <thead><tr><th scope="col">ฟีเจอร์</th><th scope="col">ค่าของบิล</th><th scope="col">แรง</th></tr></thead>
            <tbody>
              {d.contributions.map(c => (
                <tr key={c.feature}><td><code>{c.feature}</code></td><td>{c.value ?? '–'}</td><td>{c.contribution > 0 ? '+' : ''}{c.contribution.toFixed(4)}</td></tr>
              ))}
            </tbody>
          </table>
        </TechDetails>
      )}
    </article>
  );
}

/** แสดงทีละ 8 ใบ ไม่ให้มือถือต้องเลื่อนผ่านบิลทั้งตลาดก่อนถึงคำอธิบาย */
const PAGE = 8;
const FILTERS = [['all', 'ทั้งหมด'], ['high', 'เสี่ยงสูง'], ['mid', 'ปานกลาง'], ['low', 'ต่ำ'], ['unscored', 'ยังไม่มีคะแนน']];

export default function BillsTab({ status }) {
  const [params, setParams] = useSearchParams();
  const st = useData(() => api('/ai/bills'));
  const detailRef = useRef(null);
  const [limit, setLimit] = useState(PAGE);
  const filter = FILTERS.some(([k]) => k === params.get('level')) ? params.get('level') : 'all';
  const setQuery = (k, v) => {
    const next = new URLSearchParams(params);
    if (v == null) next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };

  const items = st.data?.items || [];
  const shown = items.filter(it => filter === 'all' || (it.level || 'unscored') === filter);
  const wanted = Number(params.get('bill'));
  const selected = shown.find(it => it.id === wanted)?.id ?? shown[0]?.id ?? null;
  // บิลที่เลือกอยู่ต้องอยู่ในรายการเสมอ แม้อยู่เกินหน้าแรก
  const visible = shown.filter((it, i) => i < limit || it.id === selected);

  // จอแคบ: เลือกบิลแล้วเลื่อนไปที่คำอธิบาย
  const picked = useRef(false);
  useEffect(() => {
    if (!picked.current || !detailRef.current) return;
    if (window.matchMedia('(max-width: 899px)').matches) detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    picked.current = false;
  }, [selected]);

  const synthetic = st.data?.is_synthetic ?? status?.is_synthetic;
  return (
    <div className="bh-panel">
      <TabHead title="ทำไมบิลนี้ได้คะแนนนี้" synthetic={synthetic} profile={status?.sim_profile}
        sub="เลือกบิลค้างเพื่อดูว่าปัจจัยไหนทำให้ AI ให้คะแนนความเสี่ยงจ่ายช้าสูงหรือต่ำ" />

      {st.error && !st.data && <LoadError error={st.error} onRetry={st.reload} what="รายการบิล" />}
      {!st.data && !st.error && <div className="bh-split"><Skeleton kind="list" /><Skeleton kind="chart" /></div>}
      {st.data && !items.length && (
        <StateBox kind="empty" title="ไม่มีบิลค้างตอนนี้">ทุกบิลรายเดือนชำระแล้ว บิลใหม่จะได้คะแนนทันทีที่ออกบิลรอบถัดไป</StateBox>
      )}
      {st.data && items.length > 0 && (
        <>
          <div className="bh-filter" role="group" aria-label="กรองตามระดับ">
            {FILTERS.map(([k, l]) => {
              const n = k === 'all' ? items.length : st.data.count[k];
              if (k !== 'all' && !n) return null;
              return (
                <button key={k} type="button" className={`bh-chipbtn ${filter === k ? 'is-on' : ''}`} aria-pressed={filter === k}
                  onClick={() => { setLimit(PAGE); setQuery('level', k === 'all' ? null : k); }}>{l} {n}</button>
              );
            })}
          </div>
          <div className="bh-split">
            <div className="bh-billcol">
            <ul className="bh-bills" aria-label="บิลค้าง เรียงจากเสี่ยงมากไปน้อย">
              {visible.map(it => (
                <li key={it.id}>
                  <button type="button" className={`bh-billrow ${it.id === selected ? 'is-on' : ''}`} aria-current={it.id === selected ? 'true' : undefined}
                    onClick={() => { picked.current = true; setQuery('bill', String(it.id)); }}>
                    <span className="bh-billrow__top">
                      <b>แผง {it.stall_id}</b>
                      <LevelTag level={it.level} />
                    </span>
                    <span className="bh-billrow__name">{it.vendor_name} · {periodLabel(it.period)}</span>
                    <span className="bh-billrow__why">
                      {it.score != null && <b>{pct(it.score)}</b>}
                      {it.lead && it.scope === 'local' ? describeFactor(it.lead, { n_prior: it.n_prior }) : it.score == null ? 'ยังไม่ได้ให้คะแนน' : 'ดูปัจจัยหลักของโมเดล'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {shown.length > visible.length && (
              <button type="button" className="btn bh-btn bh-more" onClick={() => setLimit(l => l + PAGE)}>
                แสดงเพิ่ม ({shown.length - visible.length} ใบ)
              </button>
            )}
            </div>
            <div className="bh-split__detail" ref={detailRef}>
              {selected != null ? <BillExplain id={selected} /> : <StateBox kind="empty" title="ไม่มีบิลในกลุ่มนี้">ลองเลือกกลุ่มอื่นด้านบน</StateBox>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
