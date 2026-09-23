import { useEffect, useRef } from 'react';

/*
 * พื้นหลังเคลื่อนไหวที่ใช้ร่วมกันทั้งหน้าร้านและระบบหลังบ้าน
 *
 * ทำจาก "แสงกับฝุ่น" แทนการไล่สี ให้เข้ากับภาษาภาพแบบ premium ที่เลี่ยงพื้นหลัง gradient
 *   - แสง: วงแสงนุ่มขนาดใหญ่ลอยช้ามาก เป็น CSS ล้วน ให้ GPU ทำงาน
 *   - ฝุ่น: เม็ดเล็ก ๆ ลอยขึ้นช้า ๆ เหมือนฝุ่นในแสงเช้า วาดบน canvas
 *
 * ความเข้มของแสงแต่ละโทนคำนวณจากงบคอนทราสต์ WCAG AA ไว้แล้ว (ดูค่าใน styles.css)
 *
 * props
 *   tone       cream | paper | dark | auto-cream | auto-paper
 *              auto-* เปลี่ยนเป็นโทนมืดเองเมื่อระบบใช้ธีมมืด
 *   placement  fixed = ตรึงกับจอเป็นพื้นหลังทั้งหน้า · fill = เต็มกล่องแม่
 *   pools      แสดงวงแสงหรือไม่ บนภาพถ่ายให้ปิด เหลือแต่ฝุ่น
 *   density    ความหนาแน่นของฝุ่น 1 = ปกติ
 *
 * กล่องแม่ต้องมี isolation: isolate ชั้นนี้จึงอยู่เหนือพื้นของกล่องแต่ใต้เนื้อหา
 */

/* ตัวจับเวลาตัวเดียวสำหรับทุกอินสแตนซ์ */
const jobs = new Set();
let raf = 0;
let prev = 0;

function tick(t) {
  raf = requestAnimationFrame(tick);
  if (!prev) { prev = t; return; }
  const dt = t - prev;
  if (dt < 30) return;                       // ~30 เฟรมต่อวินาที พอสำหรับการเคลื่อนไหวช้าและประหยัดแบตเตอรี่
  prev = t;
  const s = Math.min(dt, 100) / 1000;
  jobs.forEach(job => job(s));
}

function run(job) {
  jobs.add(job);
  if (!raf) { prev = 0; raf = requestAnimationFrame(tick); }
  return () => {
    jobs.delete(job);
    if (!jobs.size && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
}

const TAU = Math.PI * 2;

function mote(w, h, fresh) {
  return {
    x: Math.random() * w,
    y: fresh ? h + Math.random() * 30 : Math.random() * h,
    r: 0.5 + Math.random() ** 2 * 1.7,       // ส่วนใหญ่เล็กมาก มีเม็ดใหญ่ปนบ้าง
    vy: 4 + Math.random() * 9,               // พิกเซลต่อวินาที
    sway: 6 + Math.random() * 16,
    phase: Math.random() * TAU,
    freq: 0.04 + Math.random() * 0.12,       // รอบต่อวินาทีของการส่าย
    a: 0.3 + Math.random() * 0.7,
    tw: 0.15 + Math.random() * 0.45,         // ความเร็วการกะพริบ
  };
}

export default function Ambient({ tone = 'cream', placement = 'fill', pools = true, density = 1, className = '' }) {
  const root = useRef(null);
  const canvas = useRef(null);

  useEffect(() => {
    const el = root.current;
    const cv = canvas.current;
    let ctx = null;
    try { ctx = cv && cv.getContext ? cv.getContext('2d') : null; } catch { ctx = null; }
    if (!el || !ctx) return undefined;

    const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
    const saveData = Boolean(navigator.connection && navigator.connection.saveData);

    let w = 1;
    let h = 1;
    let time = 0;
    let motes = [];
    let rgb = [120, 93, 49];
    let peak = 0.25;
    let halo = false;
    let visible = placement === 'fixed';
    let stop = null;

    const readTone = () => {
      const cs = getComputedStyle(el);
      const parts = cs.getPropertyValue('--amb-dust').trim().split(/\s+/).map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) rgb = parts;
      peak = parseFloat(cs.getPropertyValue('--amb-dust-a')) || 0.25;
      halo = cs.getPropertyValue('--amb-halo').trim() === '1';
    };

    const draw = s => {
      time += s;
      ctx.clearRect(0, 0, w, h);
      const [r, g, b] = rgb;
      const fade = h * 0.12;
      for (const m of motes) {
        if (s) {
          m.y -= m.vy * s;
          if (m.y < -12) Object.assign(m, mote(w, h, true));
        }
        const x = m.x + Math.sin(m.phase + time * m.freq * TAU) * m.sway;
        const edge = Math.min(1, m.y / fade, (h - m.y) / fade);
        if (edge <= 0) continue;
        const a = peak * m.a * edge * (0.55 + 0.45 * Math.sin(m.phase * 1.7 + time * m.tw * TAU));
        if (a < 0.004) continue;
        if (halo && m.r > 1.2) {
          ctx.fillStyle = `rgba(${r},${g},${b},${a * 0.16})`;
          ctx.beginPath(); ctx.arc(x, m.y, m.r * 3.4, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.beginPath(); ctx.arc(x, m.y, m.r, 0, TAU); ctx.fill();
      }
    };

    const resize = () => {
      const box = el.getBoundingClientRect();
      w = Math.max(1, Math.round(box.width));
      h = Math.max(1, Math.round(box.height));
      const dpr = Math.min(1.25, window.devicePixelRatio || 1);   // ฝุ่นนุ่มอยู่แล้ว ไม่ต้องคมเท่าจอ retina
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.round(Math.max(10, Math.min(80, ((w * h) / 24000) * density * (saveData ? 0.4 : 1))));
      while (motes.length < target) motes.push(mote(w, h, false));
      motes.length = target;
      draw(0);
    };

    /* วิ่งเฉพาะตอนเห็นบนจอ แท็บไม่ได้ซ่อน และผู้ใช้ไม่ได้ขอลดการเคลื่อนไหว */
    const sync = () => {
      const active = visible && !mqReduce.matches && !document.hidden;
      el.classList.toggle('is-idle', !active);
      if (active && !stop) stop = run(draw);
      if (!active && stop) { stop(); stop = null; }
    };

    readTone();
    resize();
    sync();

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(resize); ro.observe(el); }
    else window.addEventListener('resize', resize);

    let io = null;
    if (placement !== 'fixed') {
      if (typeof IntersectionObserver !== 'undefined') {
        io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { rootMargin: '160px 0px' });
        io.observe(el);
      } else { visible = true; sync(); }
    }

    const onTheme = () => { readTone(); draw(0); };
    document.addEventListener('visibilitychange', sync);
    mqReduce.addEventListener('change', sync);
    mqDark.addEventListener('change', onTheme);

    return () => {
      if (stop) stop();
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
      if (io) io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      mqReduce.removeEventListener('change', sync);
      mqDark.removeEventListener('change', onTheme);
    };
  }, [placement, density, tone]);

  return (
    <div ref={root} className={`amb amb--${tone} amb--${placement} ${className}`.trim()} aria-hidden="true">
      {pools && (
        <>
          <i className="amb__pool amb__pool--a" />
          <i className="amb__pool amb__pool--b" />
          <i className="amb__pool amb__pool--c" />
        </>
      )}
      <i className="amb__grain" />
      <canvas ref={canvas} className="amb__dust" />
    </div>
  );
}
