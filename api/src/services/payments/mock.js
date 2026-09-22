/**
 * ผู้ให้บริการจำลอง ใช้เมื่อยังไม่ได้ตั้งค่า OMISE_SECRET_KEY
 * QR ที่สร้างเป็นข้อความอ้างอิงเท่านั้น ไม่ใช่ PromptPay จริง จึงสแกนจ่ายเงินไม่ได้
 */
const QRCode = require('qrcode');

async function createCharge({ refNo }) {
  return { chargeId: `mock_${refNo}`, status: 'pending', qrUrl: null, raw: { mock: true } };
}
async function getCharge() { return null; }            // สถานะเปลี่ยนผ่านปุ่มจำลองเท่านั้น
async function testMark(_id, outcome) { return { status: outcome === 'paid' ? 'successful' : 'failed' }; }
async function cancel() {}
async function fetchQr(payment) {
  const svg = await QRCode.toString(`BUNYAT-MOCK|${payment.ref_no}|${payment.amount}THB`, { type: 'svg', margin: 1, width: 240 });
  return { contentType: 'image/svg+xml', body: Buffer.from(svg) };
}
module.exports = { name: 'mock', createCharge, getCharge, testMark, cancel, fetchQr };
