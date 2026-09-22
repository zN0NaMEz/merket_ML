const router = require('express').Router();
const crypto = require('crypto');
const config = require('../config');
const { db } = require('../db');
const { ah, HttpError } = require('../lib/http');
const billing = require('../services/billing');
const providers = require('../services/payments');

// เข้าถึงรายการชำระด้วย access token ที่ได้ตอนสร้างรายการ (ใช้ได้ทั้งผู้ค้าประจำและผู้ค้าขาจรที่ไม่ได้ login)
async function load(req) {
  const p = await db.one('SELECT * FROM payments WHERE id = $1', [Number(req.params.id) || 0]);
  const t = String(req.query.t || '');
  const ok = p && t.length === p.access_token.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(p.access_token));
  if (!ok) throw new HttpError(404, 'ไม่พบรายการชำระเงิน');
  return p;
}

router.get('/:id', ah(async (req, res) => {
  const p = await load(req);
  let warning = null;
  try { await billing.syncPayment(p); } catch (e) { warning = `ตรวจสถานะกับผู้ให้บริการไม่สำเร็จ: ${e.message}`; }
  res.json({ ...(await billing.paymentView(p.id)), warning });
}));

router.get('/:id/qr', ah(async (req, res) => {
  const p = await load(req);
  const provider = providers.forPayment(p);
  const img = provider && (await provider.fetchQr(p));
  if (!img) throw new HttpError(404, 'ไม่พบ QR Code');
  res.set('Content-Type', img.contentType).set('Cache-Control', 'no-store').send(img.body);
}));

// โหมดทดสอบ: จำลองผลการสแกนจ่าย (Omise test key ใช้ mark_as_paid / mark_as_failed)
router.post('/:id/simulate', ah(async (req, res) => {
  if (!config.paymentTestMode) throw new HttpError(403, 'ปุ่มจำลองใช้ได้เฉพาะโหมดทดสอบ');
  const p = await load(req);
  const outcome = req.body?.outcome === 'failed' ? 'failed' : 'paid';
  if (p.status !== 'pending') return res.json(await billing.paymentView(p.id));
  if (p.provider === 'mock') {
    await billing.applyPaymentResult(p.id, outcome === 'paid' ? 'successful' : 'failed',
      { failureMessage: outcome === 'failed' ? 'จำลอง: ธนาคารปฏิเสธรายการ' : null });
  } else if (p.provider === 'omise') {
    await providers.forPayment(p).testMark(p.provider_charge_id, outcome);
    await billing.syncPayment(p);
  }
  res.json(await billing.paymentView(p.id));
}));

router.post('/:id/cancel', ah(async (req, res) => {
  const p = await load(req);
  if (p.status === 'pending') {
    const provider = providers.forPayment(p);
    if (provider && p.provider_charge_id) await provider.cancel(p.provider_charge_id);
    await billing.applyPaymentResult(p.id, 'cancelled');
  }
  res.json(await billing.paymentView(p.id));
}));
module.exports = router;
