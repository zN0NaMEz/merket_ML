/* ---------- สถานะของหน้าร้าน: ตะกร้า รายการที่บันทึกไว้ และแผงที่เปิดอยู่ ---------- */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { localPref } from '../../api';
import { PRODUCTS } from '../../data/market';

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
  const [overlay, setOverlay] = useState(null); // 'search' | 'cart' | 'saved' | 'menu'
  const [seed, setSeed] = useState('');            // คำค้นตั้งต้นเมื่อเปิดช่องค้นหาจากที่อื่น
  const [detail, setDetail] = useState(null);   // { kind: 'product' | 'seller', id }
  const [note, setNote] = useState('');

  useEffect(() => { write('mk.cart', cart); }, [cart]);
  useEffect(() => { write('mk.saved', saved); }, [saved]);

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

  const value = useMemo(() => ({
    cart: lines, count, total, addToCart, setQty, clearCart: () => setCart([]),
    saved, toggleSaved, isSaved: id => saved.includes(id),
    overlay, setOverlay, detail, setDetail, note, setNote,
    seed, openSearch: q => { setSeed(q || ''); setOverlay('search'); },
    closeAll: () => { setOverlay(null); setDetail(null); },
  }), [lines, count, total, addToCart, setQty, saved, toggleSaved, overlay, detail, note, seed]);

  return <MarketCtx.Provider value={value}>{children}</MarketCtx.Provider>;
}
