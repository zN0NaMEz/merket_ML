const config = require('../../config');
const omise = require('./omise');
const mock = require('./mock');

const providers = { omise, mock };
/** provider ที่ใช้สร้างรายการใหม่ */
const active = () => providers[config.paymentProvider] || mock;
/** provider ของรายการที่มีอยู่แล้ว */
const forPayment = p => providers[p.provider] || null;
module.exports = { active, forPayment };
