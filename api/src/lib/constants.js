// ค่าเฉลี่ยการใช้น้ำ/ไฟ (w, e) และ risk ใช้เฉพาะการสร้างข้อมูลตัวอย่างและโหมดสาธิต
const TYPES = {
  fresh:   { name: 'อาหารสด',          zone: 'A', count: 8, rent: 3000, w: 16, e: 110, risk: 0 },
  cooked:  { name: 'อาหารปรุงสุก',      zone: 'B', count: 7, rent: 3500, w: 13, e: 210, risk: 0.15 },
  produce: { name: 'ผักผลไม้',          zone: 'C', count: 7, rent: 2500, w: 7,  e: 55,  risk: 0.25 },
  dry:     { name: 'ของชำ',             zone: 'D', count: 6, rent: 2800, w: 3,  e: 85,  risk: -0.3 },
  clothes: { name: 'เสื้อผ้าและของใช้', zone: 'E', count: 7, rent: 2200, w: 2,  e: 40,  risk: 0.45 },
};
const SEASON_EFF = { festival: -0.5, school: 0.45, rainy: 0.35, normal: 0 };
const WALKIN_SPOTS = Array.from({ length: 12 }, (_, i) => `F-${String(i + 1).padStart(2, '0')}`);
const PRODUCTS = ['อาหารและขนม', 'ผักผลไม้', 'ของใช้ในบ้าน', 'เสื้อผ้า', 'ดอกไม้และพวงมาลัย', 'อื่น ๆ'];
const DEFAULT_RATES = { water_rate: 18, elec_rate: 8, walkin_fee: 150, pay_within_days: 10, overdue_days: 3 };
const DEFAULT_AI = { risk_model: 'lr', risk_high: 0.7, risk_mid: 0.4, anomaly_method: 'both', z_threshold: 3, if_threshold: 0.62 };
module.exports = { TYPES, SEASON_EFF, WALKIN_SPOTS, PRODUCTS, DEFAULT_RATES, DEFAULT_AI };
