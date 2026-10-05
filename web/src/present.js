/*
 * โหมดนำเสนอ (RodeMap ข้อ 4): แสดงรหัสกระบวนการ (5.0, 3.0, D7 …) ไว้อ้างอิงกับแผนภาพในรายงาน
 * ค่าเริ่มต้นปิด เปิดด้วย ?present=1 ปิดด้วย ?present=0 จำไว้ในเครื่องนี้ (localStorage)
 */
import { localPref } from './api';

const KEY = 'bunyat.present';

/** อ่านค่าจาก URL (ถ้ามี) แล้วคืนสถานะปัจจุบัน */
export function presentMode(search = typeof window !== 'undefined' ? window.location.search : '') {
  const q = new URLSearchParams(search).get('present');
  if (q === '1') localPref.set(KEY, '1');
  else if (q === '0') localPref.del(KEY);
  return localPref.get(KEY) === '1';
}
