/**
 * สร้างข้อมูลตัวอย่างย้อนหลัง 17 เดือนสำหรับเทรนโมเดลและสาธิตระบบ
 * - ผู้ค้า 32 ราย ใน 35 แผง (โซน A-E) มีวินัยการชำระต่างกัน (ค่าซ่อน sim_discipline)
 * - เลขมิเตอร์มีฤดูกาล (หน้าร้อนใช้ไฟมาก) และมีค่าผิดปกติในอดีต 1 ครั้ง
 * - บิลเดือนล่าสุดของ 4 แผงค้างชำระเกินกำหนด (2 แผงถูกตัดน้ำไฟแล้ว)
 * anchor = วันที่ 1 ของเดือนปัจจุบัน ซึ่งเป็นวันที่ต้องจดมิเตอร์ของเดือนก่อน
 */
const D = require('../lib/dates');
const R = require('../lib/random');
const { TYPES, SEASON_EFF, DEFAULT_RATES } = require('../lib/constants');

const NAMES = ['สมศรี ทองดี','บุญมี แก้วใส','ละเอียด ชมชื่น','ประยูร ศรีสุข','วันเพ็ญ มณีรัตน์','สมชาย พึ่งบุญ','จันทร์เพ็ญ ดวงดี','อำนวย รุ่งเรือง',
  'สุดารัตน์ บุญเกิด','ทองใบ สายสุข','มาลี ใจงาม','ประเสริฐ มั่นคง','นงลักษณ์ ศรีทอง','สุรชัย แสงทอง','เยาวลักษณ์ พูลผล','ชูชาติ ทองคำ',
  'พิมพ์ใจ รักษ์ไทย','วิชัย เจริญสุข','อรุณี สุขสม','ธนพล ทรัพย์มาก','กาญจนา ใจเย็น','สมหมาย ดีมาก','รัตนา เพชรงาม','บุญเรือน สายทอง',
  'นิภา แก้วมณี','เกษม ศรีวงศ์','ศิริพร บุญมา','ยุทธนา คงดี','ลำดวน หอมหวล','อนันต์ ชัยมงคล','จิราพร ทองสุข','สมพงษ์ ใจบุญ'];

function seasonOf(date) {
  const m = Number(date.slice(5, 7));
  if ([12, 1, 4].includes(m)) return 'festival';
  if ([5, 6].includes(m)) return 'school';
  if ([8, 9, 10].includes(m)) return 'rainy';
  return 'normal';
}
function daysLateAsOf(b, asOf) {
  if (b.paid_date && b.paid_date <= asOf) return Math.max(0, D.diffDays(b.paid_date, b.due_date));
  return Math.max(0, D.diffDays(asOf, b.due_date));
}
function features(v, prior, bill) {
  const last6 = prior.slice(-6);
  let late = 0;
  for (const b of last6) if (daysLateAsOf(b, bill.issue_date) > 0) late++;
  const last3 = prior.slice(-3);
  const base = last3.length ? R.mean(last3.map(b => b.total)) : 0;
  return { late, ratio: base ? bill.total / base : 1, tenure: D.diffDays(bill.issue_date, v.since) / 365, season: seasonOf(bill.due_date) };
}

function generate(anchor, seed = 20261001) {
  const rng = R.mulberry32(seed);
  const rates = { ...DEFAULT_RATES };
  const HIST_LAST = D.prevPeriod(D.periodOf(anchor), 2);
  const HIST_FIRST = D.prevPeriod(HIST_LAST, 16);
  const out = { stall_types: [], stalls: [], vendors: [], contracts: [], meters: [], bills: [], payments: [], bookings: [], notifications: [], anomaly_logs: [], job_logs: [] };

  for (const [code, t] of Object.entries(TYPES)) {
    out.stall_types.push({ code, name: t.name, zone: t.zone, monthly_rent: t.rent });
    for (let i = 1; i <= t.count; i++) {
      out.stalls.push({ id: `${t.zone}-${D.pad2(i)}`, type_code: code, init_water: 1000 + Math.floor(rng() * 8000), init_elec: 5000 + Math.floor(rng() * 30000), utility_status: 'on', cut_date: null });
    }
  }
  const vacant = new Set(['A-08', 'C-07', 'E-07']);
  const occ = out.stalls.filter(s => !vacant.has(s.id));
  const BAD = { 3: 0.08, 9: 0.15, 16: 0.1, 27: 0.22, 30: 0.12 };
  const NEW = { 30: -410, 12: -330, 20: -262, 6: -468, 24: -227 };
  occ.forEach((st, i) => {
    const d = BAD[i] !== undefined ? BAD[i] : 0.35 + 0.65 * rng();
    const since = NEW[i] ? D.addDays(anchor, NEW[i]) : D.addDays(D.addDays(anchor, -365 * 13), Math.floor(rng() * 365 * 11));
    const phone = `08${Math.floor(rng() * 10)}${String(Math.floor(rng() * 1000)).padStart(3, '0')}${String(Math.floor(rng() * 10000)).padStart(4, '0')}`;
    const v = { idx: i + 1, code: `V${String(i + 1).padStart(3, '0')}`, full_name: NAMES[i], phone, stall_id: st.id, type_code: st.type_code, since,
      sim_discipline: Math.round(d * 1000) / 1000, sim_scale_w: Math.exp(0.25 * R.randn(rng)), sim_scale_e: Math.exp(0.25 * R.randn(rng)) };
    out.vendors.push(v);
    let y = Number(since.slice(0, 4)), end = since;
    while (end <= anchor) { y++; end = `${y}${since.slice(4)}`; }
    out.contracts.push({ vendor_idx: v.idx, stall_id: st.id, start_date: since, end_date: D.addDays(D.iso(D.parseD(end)), -1), deposit: TYPES[st.type_code].rent * 2 });
  });

  const periods = [];
  for (let p = HIST_FIRST; p <= HIST_LAST; p = D.nextPeriod(p)) periods.push(p);
  const last = Object.fromEntries(out.stalls.map(s => [s.id, { w: s.init_water, e: s.init_elec }]));
  const vBills = Object.fromEntries(out.vendors.map(v => [v.idx, []]));
  const FORCE_UNPAID = new Set(['A-04', 'B-03', 'C-03', 'E-05']);
  const leakPeriod = D.prevPeriod(HIST_LAST, 5);
  for (const p of periods) {
    const month = Number(p.slice(5, 7));
    const sw = [3, 4, 5].includes(month) ? 1.15 : 1;
    const se = [3, 4, 5].includes(month) ? 1.3 : [11, 12, 1].includes(month) ? 0.85 : 1;
    for (const v of out.vendors) {
      if (D.periodOf(v.since) >= p) continue;
      const t = TYPES[v.type_code];
      let uw = Math.max(0, Math.round(t.w * v.sim_scale_w * sw * (1 + 0.12 * R.randn(rng))));
      const ue = Math.max(0, Math.round(t.e * v.sim_scale_e * se * (1 + 0.10 * R.randn(rng))));
      const leak = p === leakPeriod && v.stall_id === 'A-06';
      if (leak) uw = Math.round(uw * 3.2);
      const lr = last[v.stall_id];
      out.meters.push({ stall_id: v.stall_id, period: p, prev_water: lr.w, cur_water: lr.w + uw, prev_elec: lr.e, cur_elec: lr.e + ue,
        use_water: uw, use_elec: ue, recorded_on: D.periodEnd(p), flagged: leak });
      lr.w += uw; lr.e += ue;
      const issue = D.periodStart(D.nextPeriod(p)), due = D.addDays(issue, rates.pay_within_days - 1);
      const waterAmt = uw * rates.water_rate, elecAmt = ue * rates.elec_rate;
      const bill = { vendor_idx: v.idx, stall_id: v.stall_id, period: p, rent: t.rent, use_water: uw, use_elec: ue, water_rate: rates.water_rate,
        elec_rate: rates.elec_rate, water_amount: waterAmt, elec_amount: elecAmt, total: t.rent + waterAmt + elecAmt,
        issue_date: issue, due_date: due, status: 'paid', paid_date: null, escalated_on: null };
      const prior = vBills[v.idx];
      const f = features(v, prior, bill);
      const tenureEff = f.tenure < 1 ? 0.6 : f.tenure < 3 ? 0.2 : -0.2;
      const logit = -1.2 + 4.2 * (0.5 - v.sim_discipline) + 0.3 * f.late + 2.2 * (f.ratio - 1) + t.risk + SEASON_EFF[f.season] + tenureEff + 0.35 * R.randn(rng);
      const late = rng() < R.sigmoid(logit);
      if (p === HIST_LAST && FORCE_UNPAID.has(v.stall_id)) {
        bill.status = 'overdue';
        bill.escalated_on = D.addDays(due, rates.overdue_days + 1);
      } else if (late) {
        bill.paid_date = D.addDays(due, 1 + Math.floor(Math.pow(rng(), 1.4) * 14 * (1.3 - v.sim_discipline)));
      } else {
        bill.paid_date = D.addDays(issue, Math.floor(rng() * rates.pay_within_days));
      }
      if (bill.paid_date && bill.paid_date >= anchor) bill.paid_date = D.addDays(anchor, -1);
      out.bills.push(bill); prior.push(bill);
    }
  }
  const lastDue = D.addDays(D.periodStart(D.nextPeriod(HIST_LAST)), rates.pay_within_days - 1);
  const cutDate = D.addDays(lastDue, 5);
  for (const sid of ['A-04', 'C-03']) { const s = out.stalls.find(x => x.id === sid); s.utility_status = 'cut'; s.cut_date = cutDate; }

  // รายได้ผู้ค้าขาจรย้อนหลัง (ยอดรวมรายเดือน)
  for (let p = D.prevPeriod(D.periodOf(anchor), 12); p < D.periodOf(anchor); p = D.nextPeriod(p)) {
    out.payments.push({ kind: 'aggregate', amount: rates.walkin_fee * (90 + Math.floor(rng() * 45)), paid_date: D.periodEnd(p) });
  }
  const WK = [['สมใจ ขายดี', 'อาหารและขนม', '0812245518'], ['ชไมพร รุ่งโรจน์', 'ผักผลไม้', '0893107742'], ['วีระ ทองมา', 'ของใช้ในบ้าน', '0864550193'],
    ['อัมพร สุขเจริญ', 'อาหารและขนม', '0927183360'], ['ปรีชา ดีงาม', 'เสื้อผ้า', '0849026621'], ['บัวผัน ศรีจันทร์', 'ดอกไม้และพวงมาลัย', '0875612208']];
  [[0, 'F-01', 0], [0, 'F-02', 1], [0, 'F-05', 2], [0, 'F-06', 3], [1, 'F-03', 4], [1, 'F-04', 0], [2, 'F-01', 5]].forEach(([d, spot, w], i) => {
    const date = D.addDays(anchor, d);
    out.bookings.push({ full_name: WK[w][0], phone: WK[w][2], product: WK[w][1], booking_date: date, spot, fee: rates.walkin_fee,
      created_by: i % 2 ? 'staff' : 'walkin', method: i % 2 ? 'cash' : 'mock', paid_date: D.addDays(date, -1 - (i % 3)) });
  });

  const lastLabel = D.periodLabel(HIST_LAST);
  for (const b of out.bills.filter(x => x.status === 'overdue')) {
    const v = out.vendors.find(x => x.idx === b.vendor_idx);
    const msg = `แผง ${b.stall_id} (${v.full_name}) ค้างชำระบิล${lastLabel} เกิน ${rates.overdue_days} วัน`;
    out.notifications.push({ recipient: 'staff', kind: 'overdue', message: msg, created_on: b.escalated_on });
    out.notifications.push({ recipient: 'owner', kind: 'overdue', message: msg, created_on: b.escalated_on });
    out.notifications.push({ recipient: `vendor_idx:${v.idx}`, kind: 'overdue', created_on: anchor,
      message: `บิล${lastLabel} ยอด ${D.baht(b.total)} บาท ค้างชำระ ${D.diffDays(anchor, b.due_date)} วัน กรุณาชำระ` });
  }
  for (const sid of ['A-04', 'C-03']) {
    const v = out.vendors.find(x => x.stall_id === sid);
    out.notifications.push({ recipient: `vendor_idx:${v.idx}`, kind: 'utility', created_on: cutDate, message: `แผง ${sid} ถูกระงับน้ำไฟตั้งแต่ ${D.thDate(cutDate)} จนกว่าจะชำระยอดค้าง` });
  }
  const meterPeriod = D.prevPeriod(D.periodOf(anchor));
  out.notifications.push({ recipient: 'staff', kind: 'system', created_on: D.periodEnd(meterPeriod), message: `ถึงรอบจดมิเตอร์เดือน${D.periodLabel(meterPeriod)} บันทึกเลขมิเตอร์เพื่อออกบิล` });
  out.anomaly_logs.push({ stall_id: 'A-06', period: leakPeriod, detected_on: D.periodEnd(leakPeriod), reason: 'ใช้น้ำ 3.2 เท่าของปกติ อาจมีท่อรั่ว', resolution: 'ยืนยันค่าที่จด พบท่อรั่วและซ่อมแล้ว' });
  const misPeriod = D.prevPeriod(HIST_LAST, 2);
  out.anomaly_logs.push({ stall_id: 'D-02', period: misPeriod, detected_on: D.periodEnd(misPeriod), reason: 'เลขมิเตอร์ไฟน้อยกว่ารอบก่อน อาจจดผิด', resolution: 'แก้ไขค่าแล้ว' });
  out.job_logs.push({ run_date: D.addDays(anchor, -1), job: 'daily', summary: 'ตรวจบิลค้างชำระ 4 รายการ แจ้งเตือนล่วงหน้า (AI) 0 ราย ส่งต่อเจ้าหน้าที่ 0 ราย' });
  out.meta = { anchor, hist_first: HIST_FIRST, hist_last: HIST_LAST, meter_period: meterPeriod, meter_round: { [meterPeriod]: D.periodEnd(meterPeriod) } };
  return out;
}

module.exports = { generate };
