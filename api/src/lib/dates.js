const TH_M = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TH_MF = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const pad2 = n => String(n).padStart(2, '0');
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = dt => dt.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = parseD(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((parseD(a) - parseD(b)) / 86400000);
const periodOf = s => s.slice(0, 7);
function nextPeriod(p) { let [y, m] = p.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${pad2(m)}`; }
function prevPeriod(p, n = 1) { let [y, m] = p.split('-').map(Number); for (let i = 0; i < n; i++) { m--; if (m < 1) { m = 12; y--; } } return `${y}-${pad2(m)}`; }
const periodStart = p => `${p}-01`;
const periodEnd = p => addDays(periodStart(nextPeriod(p)), -1);
const periodLabel = p => { const [y, m] = p.split('-').map(Number); return `${TH_MF[m - 1]} ${y + 543}`; };
const thDate = s => { if (!s) return '-'; const d = parseD(s); return `${d.getUTCDate()} ${TH_M[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`; };
/** วันที่ปัจจุบันตามเวลาประเทศไทย */
const bangkokToday = () => iso(new Date(Date.now() + 7 * 3600 * 1000));
const baht = n => Math.round(n).toLocaleString('th-TH');

module.exports = { TH_M, TH_MF, pad2, parseD, iso, addDays, diffDays, periodOf, nextPeriod, prevPeriod, periodStart, periodEnd, periodLabel, thDate, bangkokToday, baht };
