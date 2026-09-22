/**
 * Omise (Opn Payments) PromptPay
 * - สร้าง source + charge ในคำขอเดียว: POST /charges  source[type]=promptpay
 * - QR อยู่ที่ charge.source.scannable_code.image.download_uri
 * - ผลการชำระมาทาง webhook event "charge.complete" แล้วดึง charge ซ้ำเพื่อยืนยันสถานะ
 * - โหมดทดสอบ: POST /charges/:id/mark_as_paid หรือ mark_as_failed
 */
const config = require('../../config');
const API = 'https://api.omise.co';

function authHeader() {
  return 'Basic ' + Buffer.from(config.omise.secretKey + ':').toString('base64');
}

async function request(path, { method = 'GET', form } = {}) {
  const opts = { method, headers: { Authorization: authHeader() }, signal: AbortSignal.timeout(20000) };
  if (form) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(form).toString();
  }
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.object === 'error') {
    const err = new Error(`Omise: ${data?.message || res.status}`);
    err.status = 502;
    throw err;
  }
  return data;
}

function mapStatus(s) {
  if (s === 'successful') return 'successful';
  if (s === 'failed' || s === 'reversed') return 'failed';
  if (s === 'expired') return 'expired';
  return 'pending';
}

async function createCharge({ amount, refNo, description }) {
  const charge = await request('/charges', {
    method: 'POST',
    form: {
      amount: String(Math.round(amount * 100)),      // หน่วยสตางค์
      currency: 'THB',
      'source[type]': 'promptpay',
      description,
      'metadata[ref_no]': refNo,
    },
  });
  return {
    chargeId: charge.id,
    status: mapStatus(charge.status),
    qrUrl: charge.source?.scannable_code?.image?.download_uri || null,
    raw: { id: charge.id, status: charge.status, expires_at: charge.expires_at },
  };
}

async function getCharge(chargeId) {
  const c = await request(`/charges/${chargeId}`);
  return { status: mapStatus(c.status), failureMessage: c.failure_message || null, raw: { id: c.id, status: c.status, paid_at: c.paid_at } };
}

async function testMark(chargeId, outcome) {
  const path = outcome === 'paid' ? 'mark_as_paid' : 'mark_as_failed';
  const c = await request(`/charges/${chargeId}/${path}`, { method: 'POST' });
  return { status: mapStatus(c.status) };
}

async function cancel(chargeId) {
  try { await request(`/charges/${chargeId}/expire`, { method: 'POST' }); } catch (_) { /* ถ้าหมดอายุไปแล้วก็ไม่เป็นไร */ }
}

async function fetchQr(payment) {
  if (!payment.qr_url) return null;
  const res = await fetch(payment.qr_url, { headers: { Authorization: authHeader() } });
  if (!res.ok) return null;
  return { contentType: res.headers.get('content-type') || 'image/svg+xml', body: Buffer.from(await res.arrayBuffer()) };
}

module.exports = { name: 'omise', createCharge, getCharge, testMark, cancel, fetchQr };
