/* ---------- สถานะของหน้าร้าน: ตะกร้า รายการที่บันทึกไว้ และแผงที่เปิดอยู่ ---------- */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { localPref } from '../../api';
import { PICKUP, PRODUCTS } from '../../data/market';
import { addDays, bangkokToday, newPickupCode } from './pickup';

const MarketCtx = createContext(null);
export const useMarket = () => useContext(MarketCtx);

const read = (key, fallback) => {
  try { const v = JSON.parse(localPref.get(key) || 'null'); return Array.isArray(v) ? v : fallback; }
  catch { return fallback; }
};
const write = (key, value) => localPref.set(key, JSON.stringify(value));

export function MarketProvider({ children }) {
  const [cart, setCart] = useState(() => read('mk.cart', []));
  const [saved, setSaved] = useState(() => read('mk.saved', []));
  // ใบนัดรับที่ยังไม่หมดเวลา เก็บไว้ในเครื่องนี้ เปิดดูซ้ำได้จากตะกร้า
  const [pickups, setPickups] = useState(() => read('mk.pickups', []).filter(p => p.until >= bangkokToday()));
  const [mapZone, setMapZone] = useState(null);     // โซนที่ผังตลาดควรเปิด เมื่อกดดูตำแหน่งจากใบนัดรับ
  const [overlay, setOverlay] = useState(null); // 'search' | 'cart' | 'saved' | 'menu'
  const [seed, setSeed] = useState('');            // คำค้นตั้งต้นเมื่อเปิดช่องค้นหาจากที่อื่น
  const [browse, setBrowse] = useState(null);      // { kind: 'category' | 'collection', id } เมื่อเปิดจากการ์ด
  const [detail, setDetail] = useState(null);   // { kind: 'product' | 'seller', id }
  const [note, setNote] = useState('');

  useEffect(() => { write('mk.cart', cart); }, [cart]);
  useEffect(() => { if (overlay !== 'search') setBrowse(null); }, [overlay]);
  useEffect(() => { write('mk.saved', saved); }, [saved]);
  useEffect(() => { write('mk.pickups', pickups); }, [pickups]);

  /* ล็อกการเลื่อนหน้าเมื่อมีชั้นซ้อนเปิดอยู่ และคืนค่าเดิมเมื่อปิด */
  const locked = Boolean(overlay || detail);
  useEffect(() => {
    if (!locked) return undefined;
    const { overflow, paddingRight } = document.body.style;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    return () => { document.body.style.overflow = overflow; document.body.style.paddingRight = paddingRight; };
  }, [locked]);

  /* ปิดทุกชั้นด้วย Escape */
  useEffect(() => {
    if (!locked) return undefined;
    const onKey = e => { if (e.key === 'Escape') { setDetail(null); setOverlay(null); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [locked]);

  useEffect(() => {
    if (!note) return undefined;
    const t = setTimeout(() => setNote(''), 3200);
    return () => clearTimeout(t);
  }, [note]);

  const addToCart = useCallback((id, qty = 1) => {
    setCart(c => {
      const found = c.find(x => x.id === id);
      return found ? c.map(x => (x.id === id ? { ...x, qty: Math.min(99, x.qty + qty) } : x)) : [...c, { id, qty }];
    });
    const p = PRODUCTS.find(x => x.id === id);
    setNote(p ? `เพิ่ม “${p.name}” ลงตะกร้าแล้ว` : 'เพิ่มลงตะกร้าแล้ว');
  }, []);

  const setQty = useCallback((id, qty) => {
    setCart(c => (qty <= 0 ? c.filter(x => x.id !== id) : c.map(x => (x.id === id ? { ...x, qty } : x))));
  }, []);

  const toggleSaved = useCallback(id => {
    setSaved(s => {
      const has = s.includes(id);
      setNote(has ? 'นำออกจากรายการที่บันทึกแล้ว' : 'บันทึกไว้ดูภายหลังแล้ว');
      return has ? s.filter(x => x !== id) : [...s, id];
    });
  }, []);

  const lines = useMemo(
    () => cart.map(x => ({ ...x, product: PRODUCTS.find(p => p.id === x.id) })).filter(x => x.product),
    [cart],
  );
  const count = lines.reduce((n, x) => n + x.qty, 0);
  const total = lines.reduce((n, x) => n + x.qty * x.product.price, 0);

  /* ออกใบนัดรับ: เก็บรายการ ณ ตอนนี้ไว้ในใบนัด แล้วล้างตะกร้า คืนรหัสนัดรับ */
  const issuePickup = useCallback(() => {
    const today = bangkokToday();
    const slip = {
      code: newPickupCode(today),
      issued: today,
      until: addDays(today, PICKUP.days),
      lines: lines.map(x => ({ id: x.id, qty: x.qty, name: x.product.name, price: x.product.price, maker: x.product.maker })),
      total,
    };
    setPickups(ps => [slip, ...ps]);
    setCart([]);
    return slip;
  }, [lines, total]);

  const cancelPickup = useCallback(code => setPickups(ps => ps.filter(p => p.code !== code)), []);

  /* ใส่ของจากใบนัดที่ยกเลิกกลับเข้าตะกร้า */
  const restorePickup = useCallback(slip => {
    setCart(c => {
      const next = [...c];
      for (const l of slip.lines) {
        if (!PRODUCTS.some(p => p.id === l.id)) continue;
        const found = next.find(x => x.id === l.id);
        if (found) found.qty = Math.min(99, found.qty + l.qty);
        else next.push({ id: l.id, qty: l.qty });
      }
      return next.map(x => ({ ...x }));
    });
  }, []);

  const value = useMemo(() => ({
    cart: lines, count, total, addToCart, setQty, clearCart: () => setCart([]),
    pickups, issuePickup, cancelPickup, restorePickup, mapZone, setMapZone,
    saved, toggleSaved, isSaved: id => saved.includes(id),
    overlay, setOverlay, detail, setDetail, note, setNote,
    seed, openSearch: q => { setBrowse(null); setSeed(q || ''); setOverlay('search'); },
    browse, openBrowse: (kind, id) => { setSeed(''); setBrowse({ kind, id }); setOverlay('search'); },
    clearBrowse: () => setBrowse(null),
    closeAll: () => { setOverlay(null); setDetail(null); },
  }), [lines, count, total, addToCart, setQty, pickups, issuePickup, cancelPickup, restorePickup, mapZone, saved, toggleSaved, overlay, detail, note, seed, browse]);

  return <MarketCtx.Provider value={value}>{children}</MarketCtx.Provider>;
}
