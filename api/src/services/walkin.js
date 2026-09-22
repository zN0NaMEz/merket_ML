const { db } = require('../db');
const settings = require('../lib/settings');
const { HttpError } = require('../lib/http');
const D = require('../lib/dates');
const { WALKIN_SPOTS, PRODUCTS } = require('../lib/constants');

const normPhone = p => String(p || '').replace(/\D/g, '');
const DAYS_AHEAD = 14;

async function options() {
  const today = await settings.today();
  const rates = await settings.rates();
  return { fee: rates.walkin_fee, spots: WALKIN_SPOTS, products: PRODUCTS,
    dates: Array.from({ length: DAYS_AHEAD }, (_, i) => D.addDays(today, i)) };
}

async function spotsFor(date, withNames = false) {
  const rows = await db.q(`SELECT spot, full_name, phone, product, status, created_by, booking_no FROM walkin_bookings
    WHERE booking_date = $1 AND status <> 'cancelled'`, [date]);
  const m = Object.fromEntries(rows.map(r => [r.spot, r]));
  return WALKIN_SPOTS.map(spot => {
    const b = m[spot];
    if (!b) return { spot, taken: false };
    return withNames ? { spot, taken: true, status: b.status, full_name: b.full_name, phone: b.phone, product: b.product, created_by: b.created_by, booking_no: b.booking_no }
      : { spot, taken: true };
  });
}

/** สร้างการจอง (กระบวนการ 2.0) สถานะรอชำระ ล็อกจะถูกปล่อยคืนถ้าชำระไม่สำเร็จ */
async function createBooking({ full_name, phone, product, date, spot }, createdBy) {
  const opt = await options();
  const ph = normPhone(phone);
  if (!full_name || String(full_name).trim().length < 2) throw new HttpError(400, 'กรอกชื่อผู้จอง');
  if (ph.length < 9 || ph.length > 10) throw new HttpError(400, 'เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก');
  if (!opt.dates.includes(date)) throw new HttpError(400, `จองได้ล่วงหน้าไม่เกิน ${DAYS_AHEAD} วัน`);
  if (!opt.spots.includes(spot)) throw new HttpError(400, 'ไม่พบล็อกที่เลือก');
  if (!opt.products.includes(product)) throw new HttpError(400, 'เลือกประเภทสินค้า');
  const { id } = await db.one("SELECT nextval(pg_get_serial_sequence('walkin_bookings','id')) AS id");
  try {
    return await db.one(`INSERT INTO walkin_bookings (id, booking_no, full_name, phone, product, booking_date, spot, fee, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) RETURNING *`,
      [id, `BK${date.replace(/-/g, '').slice(2)}-${String(id).padStart(4, '0')}`, String(full_name).trim(), ph, product, date, spot, opt.fee, createdBy]);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, `ล็อก ${spot} วันที่ ${D.thDate(date)} ถูกจองแล้ว เลือกล็อกอื่น`);
    throw e;
  }
}
module.exports = { normPhone, options, spotsFor, createBooking };
