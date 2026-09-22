const crypto = require('crypto');
const config = require('../config');
const { db, tx } = require('../db');
const settings = require('../lib/settings');
const { notify } = require('../lib/notify');
const { HttpError } = require('../lib/http');
const D = require('../lib/dates');
const R = require('../lib/random');
const { TYPES, SEASON_EFF } = require('../lib/constants');
const ml = require('./ml');
const providers = require('./payments');

const riskLevel = (score, ai) => (score == null ? null : score >= ai.risk_high ? 'high' : score >= ai.risk_mid ? 'mid' : 'low');
const refNoFor = (id, date) => `PP${date.replace(/-/g, '').slice(2)}${String(id).padStart(6, '0')}`;
const receiptNoFor = (id, date) => `RC${String(+date.slice(0, 4) + 543).slice(2)}${date.slice(5, 7)}-${String(id).padStart(6, '0')}`;

/* ---------------- AI: ความเสี่ยงค้างชำระ ---------------- */

/** ส่งบิลที่ยังไม่ชำระทั้งหมดให้ ML ประเมินความเสี่ยงใหม่ แล้วบันทึกผลลง D5 */
async function rescoreOpenBills() {
  const ai = await settings.ai();
  const open = await db.q("SELECT id FROM bills WHERE kind = 'monthly' AND status IN ('unpaid','overdue')");
  if (!open.length) return { count: 0 };
  const res = await ml.scoreBills(open.map(r => r.id), ai.risk_model);
  for (const r of res.results) {
    await db.q('UPDATE bills SET risk_score = $1, risk_features = $2, risk_model = $3 WHERE id = $4',
      [r.score, JSON.stringify({ ...r.features, reasons: r.reasons }), res.model, r.bill_id]);
  }
  return { count: res.results.length, model: res.model };
}

/**
 * โหมดสาธิตเท่านั้น: กำหนดวันที่ผู้ค้าคนอื่น "จะ" มาชำระเอง เพื่อให้ระบบดูมีชีวิตเวลาเลื่อนวันที่จำลอง
 * ใช้ sim_discipline ที่ซ่อนไว้ในข้อมูลตัวอย่าง ไม่เกี่ยวกับโมเดล ML
 */
function simPayDate(bill, vendor, f, payWithin) {
  const rng = R.mulberry32(R.hashStr(`${bill.id}-${vendor.id}`));
  const d = vendor.sim_discipline ?? 0.7;
  const tenureEff = f.tenure_years < 1 ? 0.6 : f.tenure_years < 3 ? 0.2 : -0.2;
  const logit = -1.2 + 4.2 * (0.5 - d) + 0.3 * f.late_count + 2.2 * (f.bill_ratio - 1)
    + (TYPES[f.stall_type]?.risk || 0) + (SEASON_EFF[f.season] || 0) + tenureEff + 0.35 * R.randn(rng);
  if (rng() < R.sigmoid(logit)) return D.addDays(bill.due_date, 1 + Math.floor(Math.pow(rng(), 1.4) * 14 * (1.3 - d)));
  return D.addDays(bill.issue_date, 1 + Math.floor(rng() * (payWithin - 1)));
}

/* ---------------- การชำระเงิน (กระบวนการ 4.0) ---------------- */

async function createPayment({ billIds = [], bookingId = null, payer, vendorId = null, description }) {
  const today = await settings.today();
  const provider = providers.active();
  let amount = 0;
  if (bookingId) {
    const bk = await db.one('SELECT fee FROM walkin_bookings WHERE id = $1', [bookingId]);
    amount = bk.fee;
  } else {
    const bills = await db.q("SELECT id, total FROM bills WHERE id = ANY($1) AND status IN ('unpaid','overdue')", [billIds]);
    if (bills.length !== billIds.length) throw new HttpError(409, 'มีบิลที่ชำระแล้วหรือไม่พบ กรุณาโหลดหน้าใหม่');
    amount = bills.reduce((s, b) => s + b.total, 0);
  }
  if (amount <= 0) throw new HttpError(400, 'ยอดชำระต้องมากกว่า 0 บาท');
  if (provider.name === 'omise' && amount < 20) throw new HttpError(400, 'PromptPay ผ่าน Omise รับยอดขั้นต่ำ 20 บาท');

  const { id } = await db.one("SELECT nextval(pg_get_serial_sequence('payments','id')) AS id");
  const refNo = refNoFor(id, today);
  const token = crypto.randomBytes(16).toString('hex');
  await tx(async t => {
    await t.q(`INSERT INTO payments (id, ref_no, provider, access_token, amount, status, payer, vendor_id, booking_id)
      VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8)`, [id, refNo, provider.name, token, amount, payer, vendorId, bookingId]);
    for (const bid of billIds) {
      await t.q('INSERT INTO payment_bills (payment_id, bill_id, amount) SELECT $1, id, total FROM bills WHERE id = $2', [id, bid]);
    }
  });
  try {
    const ch = await provider.createCharge({ amount, refNo, description: description || `ตลาดบัญญัติทรัพย์ ${refNo}` });
    await db.q('UPDATE payments SET provider_charge_id = $1, qr_url = $2, raw = $3 WHERE id = $4',
      [ch.chargeId, ch.qrUrl, JSON.stringify(ch.raw), id]);
  } catch (e) {
    await applyPaymentResult(id, 'failed', { failureMessage: e.message });
    throw new HttpError(502, 'สร้างรายการชำระเงินไม่สำเร็จ: ' + e.message);
  }
  return paymentView(id);
}

/** รับเงินสดที่สำนักงาน (เช่น เจ้าหน้าที่จองพื้นที่ให้ผู้ค้าขาจร) */
async function createCashPayment({ bookingId, payer }) {
  const today = await settings.today();
  const bk = await db.one('SELECT fee FROM walkin_bookings WHERE id = $1', [bookingId]);
  const { id } = await db.one("SELECT nextval(pg_get_serial_sequence('payments','id')) AS id");
  await db.q(`INSERT INTO payments (id, ref_no, provider, access_token, amount, status, payer, booking_id)
    VALUES ($1,$2,'cash',$3,$4,'pending',$5,$6)`, [id, refNoFor(id, today), crypto.randomBytes(16).toString('hex'), bk.fee, payer, bookingId]);
  await applyPaymentResult(id, 'successful');
  return paymentView(id);
}

/**
 * บันทึกผลการชำระ (ขั้นตอนหลัง webhook ใน Sequence Diagram)
 * อัปเดตสถานะบิล ออกเลขใบเสร็จ และถ้าแผงเคยถูกตัดน้ำไฟ แจ้งเจ้าหน้าที่ให้คืนน้ำไฟ
 */
async function applyPaymentResult(paymentId, status, { failureMessage = null, raw = null } = {}) {
  if (status === 'pending') return { changed: false };
  return tx(async t => {
    const p = await t.one('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId]);
    if (!p || p.status !== 'pending') return { changed: false };
    const today = await settings.today(t);
    if (raw) await t.q('UPDATE payments SET raw = $1 WHERE id = $2', [JSON.stringify(raw), p.id]);

    if (status !== 'successful') {
      await t.q('UPDATE payments SET status = $1, failure_message = $2 WHERE id = $3', [status, failureMessage, p.id]);
      if (p.booking_id) await t.q("UPDATE walkin_bookings SET status = 'cancelled' WHERE id = $1 AND status = 'pending'", [p.booking_id]);
      await t.q(`UPDATE bills SET status = 'cancelled' WHERE kind = 'advance' AND status = 'unpaid'
        AND id IN (SELECT bill_id FROM payment_bills WHERE payment_id = $1)`, [p.id]);
      return { changed: true, status };
    }

    const receiptNo = receiptNoFor(p.id, today);
    await t.q("UPDATE payments SET status = 'successful', paid_date = $1, receipt_no = $2 WHERE id = $3", [today, receiptNo, p.id]);
    const out = { changed: true, status, restore: null };

    if (p.booking_id) {
      const bk = await t.one("UPDATE walkin_bookings SET status = 'paid', payment_id = $1 WHERE id = $2 RETURNING *", [p.id, p.booking_id]);
      await notify(`walkin:${bk.phone}`, 'payment', `ยืนยันการจองล็อก ${bk.spot} วันที่ ${D.thDate(bk.booking_date)} ชำระแล้ว ${D.baht(p.amount)} บาท ใบเสร็จ ${receiptNo}`, today, t);
      return out;
    }

    const bills = await t.q('SELECT b.* FROM bills b JOIN payment_bills pb ON pb.bill_id = b.id WHERE pb.payment_id = $1', [p.id]);
    for (const b of bills) {
      if (!['unpaid', 'overdue'].includes(b.status)) continue;
      await t.q("UPDATE bills SET status = 'paid', paid_date = $1, payment_id = $2 WHERE id = $3", [today, p.id, b.id]);
      if (b.kind === 'advance') await t.q('UPDATE vendors SET credit = credit + $1 WHERE id = $2', [b.total, b.vendor_id]);
    }
    const vendor = await t.one('SELECT v.*, s.utility_status, s.restore_pending FROM vendors v JOIN stalls s ON s.id = v.stall_id WHERE v.id = $1', [p.vendor_id]);
    await notify(`vendor:${vendor.id}`, 'payment', `ชำระสำเร็จ ${D.baht(p.amount)} บาท ใบเสร็จเลขที่ ${receiptNo}`, today, t);
    if (vendor.utility_status === 'cut' && !vendor.restore_pending) {
      const left = await t.one("SELECT count(*) AS n FROM bills WHERE vendor_id = $1 AND status = 'overdue'", [vendor.id]);
      if (left.n === 0) {
        await t.q('UPDATE stalls SET restore_pending = true WHERE id = $1', [vendor.stall_id]);
        await notify('staff', 'utility', `แผง ${vendor.stall_id} (${vendor.full_name}) ชำระยอดค้างครบแล้ว ให้คืนน้ำไฟ`, today, t);
        out.restore = vendor.stall_id;
      }
    }
    return out;
  });
}

/** ถ้ารายการยังรอผล ดึงสถานะจาก gateway (ใช้คู่กับ webhook กันกรณี webhook มาไม่ถึง เช่นรันบน localhost) */
async function syncPayment(p) {
  if (p.status !== 'pending' || !p.provider_charge_id) return;
  const provider = providers.forPayment(p);
  if (!provider) return;
  const r = await provider.getCharge(p.provider_charge_id);
  if (r && r.status !== 'pending') await applyPaymentResult(p.id, r.status, { failureMessage: r.failureMessage, raw: r.raw });
}

async function paymentView(id) {
  const p = await db.one('SELECT * FROM payments WHERE id = $1', [id]);
  if (!p) return null;
  let items = [], payerName = '', stallId = '', restorePending = false;
  if (p.booking_id) {
    const bk = await db.one('SELECT * FROM walkin_bookings WHERE id = $1', [p.booking_id]);
    items = [{ label: `ค่าพื้นที่หน้าตลาด ล็อก ${bk.spot} วันที่ ${D.thDate(bk.booking_date)}`, amount: bk.fee }];
    payerName = bk.full_name; stallId = bk.spot;
  } else {
    const bills = await db.q('SELECT b.* FROM bills b JOIN payment_bills pb ON pb.bill_id = b.id WHERE pb.payment_id = $1 ORDER BY b.period', [id]);
    items = bills.map(b => ({
      label: b.kind === 'advance' ? `ค่าแผงล่วงหน้า (${b.label})` : `บิล${D.periodLabel(b.period)} (ค่าแผง ค่าน้ำ ค่าไฟ)`,
      amount: b.total,
    }));
    if (p.vendor_id) {
      const v = await db.one('SELECT v.full_name, v.stall_id, s.restore_pending FROM vendors v JOIN stalls s ON s.id = v.stall_id WHERE v.id = $1', [p.vendor_id]);
      payerName = v.full_name; stallId = v.stall_id; restorePending = v.restore_pending;
    }
  }
  const methodLabel = { omise: 'PromptPay (Omise)', mock: 'PromptPay (จำลอง)', cash: 'เงินสด', simulated: 'PromptPay (จำลองในโหมดสาธิต)', aggregate: 'รวมรายได้ขาจร' }[p.provider];
  return {
    id: p.id, ref_no: p.ref_no, amount: p.amount, status: p.status, provider: p.provider, method: methodLabel,
    test_mode: config.paymentTestMode && ['mock', 'omise'].includes(p.provider),
    qr_path: ['mock', 'omise'].includes(p.provider) ? `/api/payments/${p.id}/qr?t=${p.access_token}` : null,
    token: p.access_token, created_at: p.created_at, paid_date: p.paid_date, receipt_no: p.receipt_no,
    failure_message: p.failure_message, items, payer_name: payerName, stall_id: stallId, restore_pending: restorePending,
  };
}

/* ---------------- ชำระล่วงหน้า ---------------- */

async function createAdvanceBill(vendorId, plan) {
  const today = await settings.today();
  const v = await db.one(`SELECT v.*, t.monthly_rent FROM vendors v JOIN stalls s ON s.id = v.stall_id
    JOIN stall_types t ON t.code = s.type_code WHERE v.id = $1`, [vendorId]);
  const amount = plan === 'weekly' ? Math.round(v.monthly_rent / 4 / 10) * 10 : v.monthly_rent;
  const label = plan === 'weekly' ? 'รายสัปดาห์' : 'รายเดือน';
  const billNo = `ADV-${today.replace(/-/g, '')}-${v.stall_id}-${crypto.randomBytes(2).toString('hex')}`;
  return db.one(`INSERT INTO bills (bill_no, kind, vendor_id, stall_id, label, rent, total, issue_date, due_date, status)
    VALUES ($1,'advance',$2,$3,$4,$5,$5,$6,$6,'unpaid') RETURNING *`, [billNo, v.id, v.stall_id, label, amount, today]);
}

/* ---------------- ตัด/คืนน้ำไฟ ---------------- */

async function cutUtility(stallId) {
  const today = await settings.today();
  const s = await db.one(`SELECT s.*, v.id AS vendor_id FROM stalls s JOIN vendors v ON v.stall_id = s.id WHERE s.id = $1`, [stallId]);
  if (!s) throw new HttpError(404, 'ไม่พบแผง');
  if (s.utility_status === 'cut') throw new HttpError(409, `แผง ${stallId} ถูกตัดน้ำไฟอยู่แล้ว`);
  await db.q("UPDATE stalls SET utility_status = 'cut', cut_date = $1, restore_pending = false WHERE id = $2", [today, stallId]);
  await notify(`vendor:${s.vendor_id}`, 'utility', `แผง ${stallId} ถูกระงับน้ำไฟตั้งแต่ ${D.thDate(today)} จนกว่าจะชำระยอดค้าง`, today);
  await notify('owner', 'utility', `เจ้าหน้าที่บันทึกตัดน้ำไฟแผง ${stallId}`, today);
}

async function restoreUtility(stallId) {
  const today = await settings.today();
  const s = await db.one(`SELECT s.*, v.id AS vendor_id FROM stalls s JOIN vendors v ON v.stall_id = s.id WHERE s.id = $1`, [stallId]);
  if (!s) throw new HttpError(404, 'ไม่พบแผง');
  await db.q("UPDATE stalls SET utility_status = 'on', cut_date = NULL, restore_pending = false WHERE id = $1", [stallId]);
  await notify(`vendor:${s.vendor_id}`, 'utility', `แผง ${stallId} คืนน้ำไฟเรียบร้อยแล้ว`, today);
}

module.exports = {
  riskLevel, rescoreOpenBills, simPayDate, createPayment, createCashPayment, applyPaymentResult, syncPayment,
  paymentView, createAdvanceBill, cutUtility, restoreUtility, refNoFor, receiptNoFor,
};
