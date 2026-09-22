const jwt = require('jsonwebtoken');
const config = require('../config');
const { HttpError } = require('../lib/http');

function sign(user) {
  return jwt.sign({ sub: user.id, role: user.role, vendor_id: user.vendor_id, name: user.display_name }, config.jwtSecret, { expiresIn: '12h' });
}
function auth(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new HttpError(401, 'กรุณาเข้าสู่ระบบ'));
  try { req.user = jwt.verify(token, config.jwtSecret); next(); } catch { next(new HttpError(401, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')); }
}
const role = (...roles) => (req, _res, next) => (roles.includes(req.user.role) ? next() : next(new HttpError(403, 'ไม่มีสิทธิ์ใช้งานส่วนนี้')));
const recipientOf = user => (user.role === 'vendor' ? `vendor:${user.vendor_id}` : user.role);
module.exports = { sign, auth, role, recipientOf };
