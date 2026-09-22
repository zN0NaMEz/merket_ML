/* ---------- โมชันพื้นฐานของหน้าร้าน: IntersectionObserver + rAF ตัวเดียวใช้ร่วมกัน ---------- */
import { useEffect, useRef, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
export const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia(QUERY).matches;

/** อ่านค่า prefers-reduced-motion แบบ reactive */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReduced);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/* ตัวจับ scroll ตัวเดียวสำหรับทั้งหน้า ลดการผูก listener ซ้ำซ้อน */
const subs = new Set();
let ticking = false;
let bound = false;

function flush() {
  ticking = false;
  const vh = window.innerHeight || 1;
  subs.forEach(fn => { try { fn(vh); } catch { /* ไม่ให้ subscriber เดียวล้มทั้งหน้า */ } });
}
function request() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(flush);
}
function subscribe(fn) {
  subs.add(fn);
  if (!bound) {
    bound = true;
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
  }
  request();
  return () => {
    subs.delete(fn);
    if (subs.size === 0 && bound) {
      bound = false;
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
    }
  };
}

/**
 * เรียก cb(progress, el) ทุกเฟรมที่มีการเลื่อน โดย progress = 0 เมื่อ element เพิ่งโผล่ขอบล่าง
 * และ = 1 เมื่อเลื่อนพ้นขอบบนไปแล้ว ใช้ทำ parallax และ text-fill
 */
export function useScrollProgress(cb, { disabled = false } = {}) {
  const ref = useRef(null);
  const saved = useRef(cb);
  saved.current = cb;
  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return undefined;
    return subscribe(vh => {
      const r = el.getBoundingClientRect();
      const span = r.height + vh;
      const p = span <= 0 ? 0 : (vh - r.top) / span;
      saved.current(p < 0 ? 0 : p > 1 ? 1 : p, el);
    });
  }, [disabled]);
  return ref;
}

/** เพิ่มคลาสเมื่อ element เข้ามาในจอครั้งแรก (ใช้กับ reveal ทุกชนิด) */
export function useInView({ threshold = 0.18, rootMargin = '0px 0px -8% 0px', once = true } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        if (once) io.disconnect();
      } else if (!once) setInView(false);
    }, { threshold, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin, once]);
  return [ref, inView];
}

/** เลื่อนไปยังส่วนที่ระบุ ถ้าผู้ใช้ตั้งค่าลดการเคลื่อนไหวไว้จะกระโดดไปเลยไม่ไถ */
export function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
}

/** ใช้เลือก layout ระหว่างจอเล็กกับจอใหญ่ เพื่อไม่ให้โหลดรูปซ้ำสองชุด */
export function useMediaQuery(query) {
  const [match, setMatch] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
