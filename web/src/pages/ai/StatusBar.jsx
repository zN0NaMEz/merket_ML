import { useId, useState } from 'react';
import { ML_DOT, MODEL_PLAIN, MODEL_SHORT, mlNotice, num, thDateTime, thTime } from '../../ai/behind';
import { BIcon, SynthBadge } from './parts';

/*
 * แถบสถานะ AI บรรทัดเดียวบนสุดของหน้า (RodeMap 3.1)
 * ● AI พร้อมใช้ · โมเดลที่ใช้ เทรนเมื่อ … · [ข้อมูลจำลอง]   กดเพื่อดูรายละเอียด
 * ข้อมูลทั้งหมดมาจาก GET /api/ai/status ซึ่งอ่าน model_runs และ bills ใน Postgres
 */
/** compactText = มุมมองเจ้าของ: ไม่มีชื่ออัลกอริทึมภาษาอังกฤษหรือรุ่นไลบรารี */
export default function StatusBar({ st, compactText }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const s = st.data;

  // ยังไม่เคยได้คำตอบเลย
  if (!s && st.loading) {
    return <div className="bh-bar bh-bar--loading" role="status" aria-busy="true"><span className="sk" /><span className="visually-hidden">กำลังตรวจสถานะ AI…</span></div>;
  }
  if (!s && st.error) {
    return (
      <div className="bh-bar bh-bar--error" role="alert">
        <span className="bh-dot bh-dot--bad" aria-hidden="true" />
        <span className="bh-bar__text">ตรวจสถานะ AI ไม่ได้ เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ระบบจะลองใหม่เองทุก 30 วินาที</span>
        <button type="button" className="btn sm bh-btn" onClick={st.reload}><BIcon name="refresh" size={16} />ลองใหม่</button>
      </div>
    );
  }

  const dot = ML_DOT[s.ml?.state] || ML_DOT.unknown;
  const risk = s.models?.risk;
  const anomaly = s.models?.anomaly;
  const notice = mlNotice(s);
  const stale = Boolean(st.error);                 // รอบล่าสุดถามไม่สำเร็จ แสดงคำตอบรอบก่อน
  const model = MODEL_SHORT[s.active_model] || s.active_model;

  return (
    <section className="bh-status" aria-label="สถานะระบบ AI">
      <button type="button" className={`bh-bar bh-bar--${dot.tone}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        <span className={`bh-dot bh-dot--${dot.tone}`} aria-hidden="true" />
        <span className="bh-bar__text">
          <b>{dot.label}</b>
          <span className="bh-bar__sep" aria-hidden="true">·</span>
          {risk
            ? <span>{compactText ? 'โมเดลเทรนล่าสุด' : `ความเสี่ยง: ${model}`} {thDateTime(risk.trained_at)}</span>
            : <span>ยังไม่มีโมเดลที่เทรนแล้ว</span>}
        </span>
        <SynthBadge on={s.is_synthetic} profile={s.sim_profile} compact />
        <span className="bh-bar__more">{open ? 'ซ่อน' : 'รายละเอียด'}<BIcon name="chevron" size={16} /></span>
      </button>

      {open && (
        <div id={id} className="bh-bar__detail">
          <dl className="bh-kv">
            <div><dt>ระบบ AI</dt><dd>{dot.label}{s.ml?.ms != null && s.ml.state === 'ready' ? ` (ตอบใน ${num(s.ml.ms)} มิลลิวินาที)` : ''}</dd></div>
            <div><dt>โมเดลความเสี่ยงที่ใช้อยู่</dt><dd>{MODEL_PLAIN[s.active_model] || '–'}{!compactText && ` (${model})`}</dd></div>
            <div><dt>รุ่นของโมเดล</dt><dd>{risk ? `รอบเทรนที่ ${risk.run_id} · ${thDateTime(risk.trained_at)}` : 'ยังไม่เคยเทรน'}</dd></div>
            <div><dt>ข้อมูลที่ใช้เทรน</dt><dd>{risk?.n_train != null ? `${num(risk.n_train)} บิล${risk.n_test != null ? ` (กันไว้ทดสอบอีก ${num(risk.n_test)} บิล)` : ''}` : '–'}</dd></div>
            <div><dt>โมเดลตรวจมิเตอร์</dt><dd>{anomaly ? `เทรน ${thDateTime(anomaly.trained_at)} จาก ${num(anomaly.n_train)} แผง·เดือน` : 'ยังไม่เคยเทรน'}</dd></div>
            {!compactText && <div><dt>รุ่น scikit-learn</dt><dd>{risk?.sklearn_version || anomaly?.sklearn_version || 'ไม่ได้บันทึก (เทรนก่อนเพิ่มคอลัมน์นี้)'}</dd></div>}
            <div><dt>ให้คะแนนบิลล่าสุด</dt><dd>{thDateTime(s.scoring?.last_scored_at) || 'ยังไม่เคยให้คะแนน'}</dd></div>
            <div>
              <dt>บิลค้างที่ยังไม่มีคะแนน</dt>
              <dd>{num(s.scoring?.open_unscored)} จาก {num(s.scoring?.open_bills)} ใบ{s.scoring?.open_unscored > 0 && ' · จะได้คะแนนเมื่อเทรนใหม่หรือออกบิลรอบถัดไป'}</dd>
            </div>
            <div><dt>ข้อมูลจริงหรือจำลอง</dt><dd>{s.is_synthetic ? (s.sim_profile === 'clear' ? 'ข้อมูลจำลองแบบความบังเอิญต่ำ (logit × 3) ตัวเลขสูงกว่าที่ตลาดจริงจะทำได้' : 'ข้อมูลจำลองของระบบสาธิต') : 'ข้อมูลจริงของตลาด'}</dd></div>
          </dl>
          <p className="bh-fine">ตรวจสถานะเมื่อ {thTime(s.checked_at)} น. · สถานะอาจช้ากว่าจริงได้ถึง 15 วินาที และหน้านี้ตรวจใหม่เองทุก 30 วินาทีขณะเปิดอยู่</p>
        </div>
      )}

      {notice && (
        <p className={`bh-notice bh-notice--${notice.tone}`} role="status">
          <BIcon name={notice.tone === 'warn' ? 'moon' : 'plug'} size={18} />{notice.text}
        </p>
      )}
      {stale && (
        <p className="bh-notice bh-notice--idle" role="status">
          ตรวจสถานะรอบล่าสุดไม่สำเร็จ กำลังแสดงสถานะเมื่อ {thTime(s.checked_at)} น.
          <button type="button" className="bh-link" onClick={st.reload}>ตรวจอีกครั้ง</button>
        </p>
      )}
    </section>
  );
}
