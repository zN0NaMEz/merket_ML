import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../ui';
import { TABS, noModelYet, pickTab, tabsFor } from '../../ai/behind';
import StatusBar from './StatusBar';
import useAiStatus from './useAiStatus';
import ModelCard from './ModelCard';
import BillsTab from './BillsTab';
import MetersTab from './MetersTab';
import QualityTab from './QualityTab';
import EvalTab from './EvalTab';
import { NoModel } from './parts';
import '../../styles/behind.css';

/*
 * หน้า "เบื้องหลัง AI" /ai/behind (RodeMap.md)
 * แถบสถานะบรรทัดเดียวบนสุด แล้วแท็บตามบทบาท · ทุกแท็บอ่านจาก Postgres ผ่าน /api/ai/* ไม่เรียก ML ตอนเปิดหน้า
 * ซ่อนแท็บตามบทบาทที่หน้าเว็บ และ API ตรวจสิทธิ์ซ้ำทุก route
 */
const PANELS = { bills: BillsTab, meters: MetersTab, quality: QualityTab, card: ModelCard, eval: EvalTab };

export default function Behind() {
  const { user } = useApp();
  const [params, setParams] = useSearchParams();
  const status = useAiStatus();
  const tabRefs = useRef({});
  const role = user.role;
  const tabs = tabsFor(role);
  const tab = pickTab(role, params.get('tab'));
  const owner = role === 'owner';

  const go = key => {
    const next = new URLSearchParams(params);
    next.set('tab', key);
    next.delete('bill'); next.delete('reading');
    setParams(next, { replace: true });
  };
  // ลูกศรซ้าย/ขวา Home/End เลื่อนระหว่างแท็บ (รูปแบบ tablist ของ WAI-ARIA)
  const onKey = e => {
    const i = tabs.indexOf(tab);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (j == null) return;
    e.preventDefault();
    const key = tabs[(j + tabs.length) % tabs.length];
    go(key);
    tabRefs.current[key]?.focus();
  };

  const Panel = PANELS[tab];
  const empty = noModelYet(status.data);

  return (
    <div className={`bh ${owner ? 'bh--owner' : 'page'}`}>
      <header className="bh-head">
        <h1>เบื้องหลัง AI</h1>
        <p>AI ของตลาดดูอะไร ทำไมให้คะแนนแบบนั้น และเชื่อถือได้แค่ไหน · AI แค่ทักและให้เหตุผล คนเป็นผู้ตัดสินสุดท้าย</p>
      </header>

      <StatusBar st={status} compactText={owner} />

      <div className="bh-tabs" role="tablist" aria-label="หัวข้อของเบื้องหลัง AI" onKeyDown={onKey}>
        {tabs.map(k => (
          <button key={k} type="button" role="tab" id={`bh-tab-${k}`} aria-selected={tab === k} aria-controls={`bh-panel-${k}`}
            tabIndex={tab === k ? 0 : -1} ref={el => { tabRefs.current[k] = el; }}
            className={`bh-tab ${tab === k ? 'is-on' : ''}`} onClick={() => go(k)}>
            <span>{owner && k === 'quality' ? 'คุณภาพโมเดล (สรุป)' : TABS[k].label}</span>
            <small>{TABS[k].hint}</small>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`bh-panel-${tab}`} aria-labelledby={`bh-tab-${tab}`} className="bh-tabpanel">
        {empty && tab !== 'card' && tab !== 'eval'
          ? <NoModel onDone={status.reload} />
          : <Panel status={status.data} onTrained={status.reload} role={role} />}
      </div>
    </div>
  );
}
