import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, session } from './api';
import { diffDays } from './format';

/* ---------- context: ผู้ใช้, วันที่ระบบ, toast ---------- */
const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }) {
  const [user, setUser] = useState(session.user());
  const [info, setInfo] = useState(null);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [unread, setUnread] = useState(0);
  const [apiDown, setApiDown] = useState(false);

  const toast = useCallback((text, tone = '') => {
    const id = Math.random();
    setToasts(t => [...t, { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);
  const refreshInfo = useCallback(
    () => api('/system/info').then(d => { setInfo(d); setApiDown(false); }).catch(() => setApiDown(true)),
    [],
  );
  const refreshUnread = useCallback(() => {
    if (!session.token()) return;
    api('/notifications').then(d => setUnread(d.unread)).catch(() => {});
  }, []);
  const bump = useCallback(() => { setVersion(v => v + 1); refreshInfo(); refreshUnread(); }, [refreshInfo, refreshUnread]);

  useEffect(() => { refreshInfo(); }, [refreshInfo]);
  useEffect(() => { refreshUnread(); const t = setInterval(refreshUnread, 30000); return () => clearInterval(t); }, [refreshUnread, user]);

  const login = async (username, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { username, password } });
    session.save(r.token, r.user);
    setUser(r.user);
    return r.user;
  };
  const logout = () => { session.clear(); setUser(null); };

  return (
    <AppCtx.Provider value={{ user, login, logout, info, apiDown, version, bump, toast, unread, refreshUnread }}>
      {children}
      <div id="toasts" aria-live="polite">
        {toasts.map(t => <div key={t.id} className={`toast ${t.tone}`} role="status">{t.text}</div>)}
      </div>
    </AppCtx.Provider>
  );
}

/** โหลดข้อมูลจาก API และโหลดใหม่เมื่อวันที่ระบบเปลี่ยน */
export function useData(fn, deps = []) {
  const { version } = useApp();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setState(s => ({ ...s, loading: true }));
    fn().then(d => alive && setState({ data: d, error: null, loading: false }))
      .catch(e => alive && setState({ data: null, error: e, loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, n]);
  return { ...state, reload: () => setN(x => x + 1), setData: d => setState(s => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

export function Loader({ state, children }) {
  if (state.error && !state.data) return <div className="error-box">{state.error.message}</div>;
  if (!state.data) return <div className="loading">กำลังโหลด…</div>;
  return children(state.data);
}

/* ---------- องค์ประกอบพื้นฐาน ---------- */
export const Plate = ({ id, size }) => <span className={`plate ${size || ''}`}>{id}</span>;
export const Chip = ({ tone, children }) => <span className={`chip ${tone || ''}`}>{children}</span>;

export function PageHead({ title, sub, tag, right }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="btn-row">{right}{tag && <span className="ptag">{tag}</span>}</div>
    </div>
  );
}

export function SecHead({ title, sub, right }) {
  return (
    <div className="sec-head">
      <div><h2>{title}</h2>{sub && <p className="sub">{sub}</p>}</div>
      {right}
    </div>
  );
}

export const RISK_NAME = { high: 'เสี่ยงสูง', mid: 'เสี่ยงปานกลาง', low: 'เสี่ยงต่ำ' };
export const RISK_TONE = { high: 'bad', mid: 'warn', low: 'good' };
export function RiskCell({ score, level }) {
  if (score == null) return <span className="muted">ยังไม่ประเมิน</span>;
  const p = Math.round(score * 100);
  return (
    <div className="risk" title={`โอกาสจ่ายช้า ${p}%`}>
      <div className="risk-bar"><span className={`risk-fill ${level}`} style={{ width: `${p}%` }} /></div>
      <span className="risk-num">{p}%</span>
      <Chip tone={RISK_TONE[level]}>{RISK_NAME[level]}</Chip>
    </div>
  );
}

export function DueChip({ bill, today }) {
  if (bill.status === 'paid') return <Chip tone="good">ชำระแล้ว</Chip>;
  const d = diffDays(today, bill.due_date);
  if (d > 0) return <Chip tone="bad">เกินกำหนด {d} วัน</Chip>;
  if (d === 0) return <Chip tone="warn">ครบกำหนดวันนี้</Chip>;
  return <Chip>ครบกำหนดอีก {-d} วัน</Chip>;
}

export function Modal({ title, onClose, wide, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector('button, input, select, a');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="ปิด">×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Empty = ({ children, action }) => <div className="empty">{children}{action && <div>{action}</div>}</div>;
