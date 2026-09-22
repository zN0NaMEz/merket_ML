const router = require('express').Router();
const { db } = require('../db');
const { ah, HttpError } = require('../lib/http');
const walkin = require('../services/walkin');
const billing = require('../services/billing');

// ผู้ค้าขาจร: จองพื้นที่หน้าตลาดโดยไม่ต้องสมัครสมาชิก
router.get('/options', ah(async (_req, res) => res.json(await walkin.options())));
router.get('/availability', ah(async (req, res) => res.json({ date: req.query.date, spots: await walkin.spotsFor(String(req.query.date || '')) })));

router.post('/bookings', ah(async (req, res) => {
  const bk = await walkin.createBooking(req.body || {}, 'walkin');
  const payment = await billing.createPayment({ bookingId: bk.id, payer: `walkin:${bk.phone}`, description: `จองล็อก ${bk.spot} ${bk.booking_date}` });
  res.json({ booking: bk, payment });
}));

router.get('/bookings', ah(async (req, res) => {
  const phone = walkin.normPhone(req.query.phone);
  if (phone.length < 9) throw new HttpError(400, 'กรอกเบอร์โทรที่ใช้จอง');
  const rows = await db.q(`SELECT b.booking_no, b.full_name, b.product, b.booking_date, b.spot, b.fee, b.status,
      p.id AS payment_id, p.access_token AS token, p.receipt_no
    FROM walkin_bookings b LEFT JOIN payments p ON p.id = b.payment_id
    WHERE b.phone = $1 AND b.status <> 'cancelled' ORDER BY b.booking_date DESC LIMIT 30`, [phone]);
  res.json({ bookings: rows });
}));

router.get('/notifications', ah(async (req, res) => {
  const phone = walkin.normPhone(req.query.phone);
  res.json({ items: await db.q('SELECT id, kind, message, created_on FROM notifications WHERE recipient = $1 ORDER BY id DESC LIMIT 50', [`walkin:${phone}`]) });
}));
module.exports = router;
