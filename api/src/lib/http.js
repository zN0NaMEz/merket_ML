class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
/** ห่อ async route handler ให้ส่ง error ไปที่ error middleware */
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = { HttpError, ah };
