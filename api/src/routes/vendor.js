const router = require('express').Router();
const { db } = require('../db');
const { ah, HttpError } = require('../lib/http');
const settings = require('../lib/settings');
const D = require('../lib/dates');
const billing = require('../services/billing');

// ผู้ค้าประจำ: ดูบิล ชำระผ่านแอป ชำระล่วงหน้า ขอเอกสารยื่นกู้
router.get('/overview', ah(async (req, res) => {
  const vid = req.user.vendor_id;
  const vendor = await db.one(`SELECT v.id, v.code, v.full_name, v.phone, v.stall_id, v.since, v.credit, s.type_code, t.name AS type_name,
      t.monthly_rent, s.utility_status, s.cut_date, s.restore_pending
    FROM vendors v JOIN stalls s ON s.id = v.stall_id JOIN stall_types t ON t.code = s.type_code WHERE v.id = $1`, [vid]);
  const open = await db.q(`SELECT id, bill_no, kind, period, label, rent, credit_used, use_water, use_elec, water_rate, elec_rate,
      water_amount, elec_amount, total, issue_date, due_date, status
    FROM bills WHERE vendor_id = $1 AND status IN ('unpaid','overdue') ORDER BY due_date, id`, [vid]);
  const history = await db.q(`SELECT b.id, b.kind, b.period, b.label, b.total, b.due_date, b.paid_date, p.id AS payment_id,
      p.receipt_no, p.access_token AS token
    FROM bills b LEFT JOIN payments p ON p.id = b.payment_id
    WHERE b.vendor_id = $1 AND b.status = 'paid' ORDER BY b.paid_date DESC, b.id DESC LIMIT 12`, [vid]);
  const contract = await db.one("SELECT * FROM contracts WHERE vendor_id = $1 AND status = 'active' ORDER BY end_date DESC LIMIT 1", [vid]);
  res.json({ today: await settings.today(), vendor, open_bills: open, history, contract });
}));

router.post('/payments', ah(async (req, res) => {
  const vid = req.user.vendor_id;
  const ids = (req.body?.bill_ids || []).map(Number).filter(Number.isInteger);
  if (!ids.length) throw new HttpError(400, 'เลือกบิลที่ต้องการชำระ');
  const own = await db.q("SELECT id FROM bills WHERE id = ANY($1) AND vendor_id = $2 AND status IN ('unpaid','overdue')", [ids, vid]);
  if (own.length !== ids.length) throw new HttpError(409, 'มีบิลที่ชำระแล้วหรือไม่ใช่ของคุณ กรุณาโหลดหน้าใหม่');
  res.json(await billing.createPayment({ billIds: ids, payer: `vendor:${vid}`, vendorId: vid }));
}));

router.post('/advance', ah(async (req, res) => {
  const plan = req.body?.plan;
  if (!['weekly', 'monthly'].includes(plan)) throw new HttpError(400, 'เลือกชำระรายสัปดาห์หรือรายเดือน');
  const bill = await billing.createAdvanceBill(req.user.vendor_id, plan);
  res.json(await billing.createPayment({ billIds: [bill.id], payer: `vendor:${req.user.vendor_id}`, vendorId: req.user.vendor_id }));
}));

// ข้อมูลสำหรับเอกสารสรุปรายเดือนเพื่อยื่นกู้ (กระบวนการ 6.0)
router.get('/statement', ah(async (req, res) => {
  const months = [6, 12].includes(Number(req.query.months)) ? Number(req.query.months) : 6;
  const vid = req.user.vendor_id;
  const today = await settings.today();
  const vendor = await db.one(`SELECT v.full_name, v.stall_id, v.since, t.name AS type_name FROM vendors v
    JOIN stalls s ON s.id = v.stall_id JOIN stall_types t ON t.code = s.type_code WHERE v.id = $1`, [vid]);
  const bills = (await db.q(`SELECT period, total, due_date, paid_date, status FROM bills
    WHERE vendor_id = $1 AND kind = 'monthly' AND status <> 'cancelled' ORDER BY period DESC LIMIT $2`, [vid, months])).reverse();
  const paid = bills.filter(b => b.status === 'paid');
  const onTime = paid.filter(b => b.paid_date <= b.due_date).length;
  res.json({
    today, months, vendor, bills,
    summary: {
      total_paid: paid.reduce((s, b) => s + b.total, 0),
      on_time: onTime, count: bills.length,
      on_time_rate: bills.length ? onTime / bills.length : 0,
      avg_monthly: bills.length ? Math.round(bills.reduce((s, b) => s + b.total, 0) / bills.length) : 0,
      outstanding: bills.filter(b => b.status !== 'paid').reduce((s, b) => s + b.total, 0),
      tenure_days: D.diffDays(today, vendor.since),
    },
  });
}));
module.exports = router;
