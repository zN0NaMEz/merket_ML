const router = require('express').Router();
const { db } = require('../db');
const { ah } = require('../lib/http');
const billing = require('../services/billing');

/**
 * Omise webhook: ตั้งค่า URL นี้ใน Omise Dashboard (Webhooks) เช่น https://<โดเมน>/api/webhooks/omise
 * ไม่เชื่อข้อมูลใน body ตรง ๆ แต่ดึง charge จาก Omise อีกครั้งเพื่อยืนยันสถานะตามคำแนะนำของ Omise
 */
router.post('/omise', ah(async (req, res) => {
  const ev = req.body || {};
  if (ev.key === 'charge.complete' && ev.data && ev.data.id) {
    const p = await db.one("SELECT * FROM payments WHERE provider = 'omise' AND provider_charge_id = $1", [ev.data.id]);
    if (p) await billing.syncPayment(p);
  }
  res.json({ received: true });
}));
module.exports = router;
