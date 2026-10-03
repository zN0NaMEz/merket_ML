/*
 * ชื่อปัจจัยและประโยคอธิบายภาษาไทยของหน้าเบื้องหลัง AI (RodeMap.md หัวข้อ 2 ข้อ 2 และหัวข้อ 5)
 * ห้ามแสดงชื่อคอลัมน์ดิบ (late_count, bill_ratio …) ให้ผู้ใช้เห็น ทุกที่ต้องผ่านไฟล์นี้
 * ไฟล์นี้ไม่มี React ทดสอบได้ด้วย node --test
 */

export const FEATURE_LABELS = {
  late_count: 'จำนวนครั้งที่จ่ายช้า (6 บิลล่าสุด)',
  avg_days_late: 'จำนวนวันที่จ่ายช้าเฉลี่ย',
  bill_ratio: 'ยอดบิลเดือนนี้เทียบกับปกติ',
  tenure_years: 'ระยะเวลาที่เช่าแผง',
  stall_type: 'ประเภทแผง',
  season: 'ช่วงเวลาของวันครบกำหนด',
  use_vs_own_mean_water: 'การใช้น้ำเทียบค่าปกติของแผงเอง',
  use_vs_own_mean_elec: 'การใช้ไฟเทียบค่าปกติของแผงเอง',
  use_vs_peer_mean_water: 'การใช้น้ำเทียบแผงประเภทเดียวกัน',
  use_vs_peer_mean_elec: 'การใช้ไฟเทียบแผงประเภทเดียวกัน',
};

export const STALL_TYPES = { fresh: 'อาหารสด', cooked: 'อาหารปรุงสุก', produce: 'ผักผลไม้', dry: 'ของชำ', clothes: 'เสื้อผ้าและของใช้' };
export const SEASONS = { festival: 'ช่วงเทศกาล', school: 'ช่วงเปิดเทอม', rainy: 'หน้าฝน', normal: 'ช่วงปกติ' };
export const LEVEL_WORD = { high: 'ความเสี่ยงสูง', mid: 'ความเสี่ยงปานกลาง', low: 'ความเสี่ยงต่ำ' };
export const IF_LEVEL = { normal: 'ปกติ', suspicious: 'น่าสงสัย', abnormal: 'ผิดปกติ' };

/** ชื่อปัจจัยภาษาไทย ถ้าไม่รู้จักให้คืนคำกลาง ๆ ไม่คืนชื่อคอลัมน์ */
export const featureLabel = key => FEATURE_LABELS[key] || 'ปัจจัยอื่น';

const fmt1 = v => (Math.round(Number(v) * 10) / 10).toLocaleString('th-TH');

/**
 * วลีบรรยายปัจจัยหนึ่งตัวของบิลนี้ เช่น "จ่ายช้า 3 ครั้งใน 6 บิลล่าสุด"
 * c = { feature, value } · features = risk_features ทั้งก้อน (ใช้ n_prior)
 * value = null (คำอธิบายระดับโมเดล) → คืนชื่อปัจจัยเฉย ๆ
 */
export function describeFactor(c, features = {}) {
  const v = c.value;
  if (v == null) return featureLabel(c.feature);
  switch (c.feature) {
    case 'late_count': {
      const n = features.n_prior || 6;
      return v > 0 ? `จ่ายช้า ${v} ครั้งใน ${n} บิลล่าสุด` : `ไม่เคยจ่ายช้าใน ${n} บิลล่าสุด`;
    }
    case 'avg_days_late':
      return v > 0 ? `ช้าเฉลี่ย ${fmt1(v)} วันต่อบิล` : 'จ่ายตรงเวลาทุกบิลที่ผ่านมา';
    case 'bill_ratio': {
      const pct = Math.round(Math.abs(v - 1) * 100);
      if (v >= 1.05) return `ยอดเดือนนี้สูงกว่าปกติ ${pct}%`;
      if (v <= 0.95) return `ยอดเดือนนี้ต่ำกว่าปกติ ${pct}%`;
      return 'ยอดเดือนนี้ใกล้เคียงปกติ';
    }
    case 'tenure_years':
      return v < 1 ? `เพิ่งเช่าแผงได้ ${Math.max(1, Math.round(v * 12))} เดือน` : `เช่าแผงมาแล้ว ${fmt1(v)} ปี`;
    case 'stall_type':
      return `แผงประเภท${STALL_TYPES[v] || 'อื่น'}`;
    case 'season':
      return `ครบกำหนด${SEASONS[v] || 'ช่วงปกติ'}`;
    default:
      return featureLabel(c.feature);
  }
}

/** ต่อวลีด้วย "และ" แบบภาษาไทย */
const joinTh = xs => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(' ')} และ${xs[xs.length - 1]}`);
/** "เพราะ" เว้นวรรคก่อนตัวเลข */
const because = t => `เพราะ${/^\d/.test(t) ? ' ' : ''}${t}`;

/**
 * ประโยคสรุปหนึ่งประโยค เช่น "ความเสี่ยงสูง เพราะจ่ายช้า 3 ครั้งใน 6 บิลล่าสุด และยอดเดือนนี้สูงกว่าปกติ 20%"
 * level = high | mid | low · contributions = [{feature, value, direction}] เรียงจากแรงมากไปน้อย
 * scope = 'global' → บอกว่าเป็นปัจจัยหลักของโมเดล ไม่ใช่ของบิลนี้
 */
export function summarySentence({ level, contributions = [], features = {}, scope = 'local' }) {
  const word = LEVEL_WORD[level] || 'ยังไม่มีคะแนน';
  if (!contributions.length) return `${word} · ยังไม่มีคำอธิบายของบิลนี้`;
  if (scope === 'global') {
    return `${word} · ปัจจัยหลักของโมเดลโดยรวมคือ${joinTh(contributions.slice(0, 2).map(c => featureLabel(c.feature)))} (ไม่ใช่เหตุผลเฉพาะของบิลนี้)`;
  }
  const ups = contributions.filter(c => c.direction === 'up').slice(0, 2).map(c => describeFactor(c, features));
  const downs = contributions.filter(c => c.direction === 'down').slice(0, 2).map(c => describeFactor(c, features));
  if (level === 'low') {
    if (!downs.length) return `${word} · ไม่มีปัจจัยใดดันความเสี่ยงขึ้นมาก`;
    return `${word} ${because(joinTh(downs))}`;
  }
  if (!ups.length) return `${word} · ปัจจัยที่ดันขึ้นมีน้ำหนักใกล้กันหลายตัว`;
  return `${word} ${because(joinTh(ups))}${downs.length ? ` แม้ว่า${downs[0]}` : ''}`;
}

/** z-score เป็นภาษาคน (3.3): "สูงกว่าปกติของร้านนี้ราว 4.2 เท่าของความแปรปรวน" */
export function zPhrase(z) {
  if (z == null || Number.isNaN(Number(z))) return 'ไม่ได้คำนวณ (ประวัติไม่พอ)';
  const a = Math.abs(Number(z));
  if (a < 1) return 'ใกล้เคียงปกติของร้านนี้';
  return `${z > 0 ? 'สูง' : 'ต่ำ'}กว่าปกติของร้านนี้ราว ${fmt1(a)} เท่าของความแปรปรวน`;
}

const n0 = v => Math.round(Number(v)).toLocaleString('th-TH');

/**
 * ข้อความเมื่อชี้/แตะจุดบนกราฟมิเตอร์ (3.3)
 * จุดที่ตรวจ: "อ่านได้ 412 หน่วย · คาดไว้ราว 95 หน่วย (ปกติ 70–120)"
 * จุดในอดีต: "ส.ค. 69 · ใช้ 88 หน่วย"
 */
export function meterTip({ value, band, label, current }) {
  if (value == null) return `${label ? `${label} · ` : ''}ไม่มีข้อมูล`;
  if (!current) return `${label ? `${label} · ` : ''}ใช้ ${n0(value)} หน่วย`;
  const head = `อ่านได้ ${n0(value)} หน่วย`;
  if (!band) return `${head} · ยังไม่มีช่วงปกติ (ประวัติไม่ถึง 3 เดือน)`;
  return `${head} · คาดไว้ราว ${n0(band.mean)} หน่วย (ปกติ ${n0(band.low)}–${n0(band.high)})`;
}

/** ค่าเดือนนี้อยู่ตรงไหนเทียบกับช่วงปกติ */
export function bandPosition(value, band) {
  if (value == null || !band) return null;
  if (value > band.high) return 'above';
  if (value < band.low) return 'below';
  return 'inside';
}
