import { useCallback, useEffect, useRef, useState } from 'react';
import { POLL_MS, shouldPoll } from '../../ai/behind';

/*
 * สถานะ AI ของแถบบนสุด (RodeMap 3.1 และ 4.5)
 * - ใช้ fetch ตรง ๆ ไม่แนบ Authorization เพราะ /api/ai/status เป็นข้อมูลสาธารณะ
 *   คำขอที่มี Authorization จะไม่ถูก cache ที่ CDN ทำให้ทุกคนยิง /health ของ ML ซ้ำ
 * - ถามใหม่ทุก 30 วินาที และหยุดเมื่อแท็บของเบราว์เซอร์ถูกซ่อน (document.visibilityState)
 * - ถ้าถามไม่สำเร็จ คงข้อมูลรอบก่อนไว้ แล้วบอกว่าเป็นข้อมูลเก่า
 * - reload() หลังผู้ใช้กดเอง (เทรนใหม่ ลองใหม่) ใส่ ?fresh= เพื่อข้าม cache ทั้งของเบราว์เซอร์และ CDN ครั้งเดียว
 *   เพราะ stale-while-revalidate ทำให้เบราว์เซอร์คืนคำตอบเก่าก่อน ผู้ใช้จะเห็นว่า "ยังไม่มีโมเดล" ทั้งที่เพิ่งเทรนเสร็จ
 *   การถามตามรอบ 30 วินาทียังใช้ URL เดิมที่ cache ได้
 */
async function fetchStatus(signal, fresh) {
  const url = fresh ? `/api/ai/status?fresh=${Date.now()}` : '/api/ai/status';
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const err = new Error(data?.error || `ตรวจสถานะ AI ไม่ได้ (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export default function useAiStatus() {
  const [state, setState] = useState({ data: null, error: null, loading: true, fetchedAt: 0 });
  const timer = useRef(null);
  const ctrl = useRef(null);
  const lastAt = useRef(0);

  const load = useCallback(async fresh => {
    clearTimeout(timer.current);
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState(s => ({ ...s, loading: true }));
    try {
      const data = await fetchStatus(c.signal, fresh === true);
      lastAt.current = Date.now();
      setState({ data, error: null, loading: false, fetchedAt: lastAt.current });
    } catch (e) {
      if (c.signal.aborted) return;
      lastAt.current = Date.now();
      setState(s => ({ ...s, error: e, loading: false }));
    }
    if (!c.signal.aborted && shouldPoll(document.visibilityState)) timer.current = setTimeout(() => load(false), POLL_MS);
  }, []);

  useEffect(() => {
    load(false);
    const onVis = () => {
      if (!shouldPoll(document.visibilityState)) { clearTimeout(timer.current); return; }
      // กลับมาที่แท็บ: ถ้าครบรอบแล้วถามทันที ไม่งั้นนัดถามตามเวลาที่เหลือ
      const wait = Math.max(0, lastAt.current + POLL_MS - Date.now());
      clearTimeout(timer.current);
      timer.current = setTimeout(() => load(false), wait);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(timer.current);
      ctrl.current?.abort();
    };
  }, [load]);

  const reload = useCallback(() => load(true), [load]);
  return { ...state, reload };
}
