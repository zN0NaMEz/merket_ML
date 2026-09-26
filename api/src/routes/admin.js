const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { HttpError, ah } = require('../lib/http');
const { reseed } = require('../seed/seed');

const router = express.Router();

/* เทียบรหัสด้วยเวลาคงที่ ความยาวต่างกันก็ไม่รั่วเพราะเทียบค่าแฮช */
function sameKey(given, expected) {
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * POST /api/admin/reseed  รีเซ็ตข้อมูลสาธิตทั้งหมด (ใช้ก่อนนำเสนอ)
 * header  x-reseed-key: <RESEED_KEY>
 * body    { dry_run?: boolean }  ทดลองโดยย้อนข้อมูลกลับ ใช้ตรวจว่าทันเวลาโดยไม่แตะข้อมูลจริง
 *
 * ไม่ผูกกับการล็อกอิน เพื่อให้กู้ระบบได้แม้ข้อมูลผู้ใช้เสียหาย รหัสลับยาวพอจนเดาไม่ได้
 * รหัสผิดตอบ 403 ไม่ใช่ 401 เพราะหน้าเว็บจะ logout ผู้ใช้ทันทีเมื่อเจอ 401
 */
router.post('/reseed', ah(async (req, res) => {
  if (!config.reseedKey) throw new HttpError(404, 'ไม่พบ API ที่เรียก');
  const given = String(req.get('x-reseed-key') || '').trim();
  if (!given || !sameKey(given, config.reseedKey)) throw new HttpError(403, 'รหัสรีเซ็ตไม่ถูกต้อง');
  const dryRun = Boolean(req.body && req.body.dry_run);
  try {
    res.json(await reseed({ dryRun }));
  } catch (e) {
    if (e.status === 409) throw new HttpError(409, e.message);
    throw e;
  }
}));

module.exports = router;
