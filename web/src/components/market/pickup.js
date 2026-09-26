/* ---------- ใบนัดรับของที่สั่งจากหน้าเว็บ: รหัส จุดรับ และลำดับการเดิน ---------- */
import { PICKUP, ZONES } from '../../data/market';

const ZONE_ORDER = ZONES.map(z => z.id);

/** แผงของผู้ผลิตในผังตลาด (จับจากชื่อร้าน) ไม่มีแผงประจำ = รับที่จุดรับของหน้าสำนักงาน */
export function stallOf(maker) {
  for (const z of ZONES) {
    const s = z.stalls.find(x => x.name === maker);
    if (s) return { plate: s.plate, name: s.name, hours: s.hours, zone: z.id, where: `โซน ${z.id} · ${z.th}`, desk: false };
  }
  return { ...PICKUP.desk, zone: null, where: PICKUP.desk.where, desk: true };
}

/** จัดของในใบนัดเป็นจุดรับ เรียงตามทางเดินจากประตูหน้า (โซน A → D) จุดรับของหน้าสำนักงานไว้ท้าย */
export function pickupStops(lines) {
  const byKey = new Map();
  for (const l of lines) {
    const st = stallOf(l.maker);
    const key = st.desk ? 'desk' : st.plate;
    if (!byKey.has(key)) byKey.set(key, { key, ...st, makers: new Set(), items: [], subtotal: 0 });
    const g = byKey.get(key);
    g.makers.add(l.maker);
    g.items.push(l);
    g.subtotal += l.price * l.qty;
  }
  const rank = g => (g.desk ? 99 : ZONE_ORDER.indexOf(g.zone));
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b) || a.plate.localeCompare(b.plate));
}

const pad2 = n => String(n).padStart(2, '0');
/** วันที่ตามเวลาไทยในรูป YYYY-MM-DD */
export const bangkokToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
export const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** รหัสนัดรับอ่านออกเสียงง่าย: BT-เดือนวัน-เลขสี่หลัก */
export const newPickupCode = today => `BT-${today.slice(5, 7)}${today.slice(8, 10)}-${pad2(Math.floor(Math.random() * 100))}${pad2(Math.floor(Math.random() * 100))}`;
