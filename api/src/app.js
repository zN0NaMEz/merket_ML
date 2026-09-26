/* ตัวแอป Express ล้วน ๆ ไม่เปิดพอร์ตเอง เพื่อให้ใช้ได้ทั้งเซิร์ฟเวอร์จริงและ serverless */
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { db } = require('./db');
const { HttpError } = require('./lib/http');
const { auth, role } = require('./middleware/auth');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/walkin', require('./routes/walkin'));
app.use('/api/vendor', auth, role('vendor'), require('./routes/vendor'));
app.use('/api/staff', auth, role('staff'), require('./routes/staff'));
app.use('/api/owner', auth, role('owner'), require('./routes/owner'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/common'));

app.use((_req, _res, next) => next(new HttpError(404, 'ไม่พบ API ที่เรียก')));
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === '23505' ? 409 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && !err.status ? 'เกิดข้อผิดพลาดในระบบ' : err.message, details: err.details });
});

module.exports = app;
