const express = require('express');
const cors = require('cors');
const config = require('./config');
const { db } = require('./db');
const { HttpError } = require('./lib/http');
const { auth, role } = require('./middleware/auth');
const scheduler = require('./jobs/scheduler');
const billing = require('./services/billing');

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
app.use('/api', require('./routes/common'));

app.use((_req, _res, next) => next(new HttpError(404, 'ไม่พบ API ที่เรียก')));
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === '23505' ? 409 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && !err.status ? 'เกิดข้อผิดพลาดในระบบ' : err.message, details: err.details });
});

/** ตอนเริ่มระบบ ถ้ามีบิลที่ยังไม่มีคะแนนความเสี่ยง ให้ ML ประเมิน (รอ ML service พร้อมสูงสุด ~2 นาที) */
async function warmup() {
  for (let i = 0; i < 24; i++) {
    try {
      const n = await db.one("SELECT count(*)::int AS n FROM bills WHERE kind = 'monthly' AND status IN ('unpaid','overdue') AND risk_score IS NULL");
      if (n.n === 0) return;
      const r = await billing.rescoreOpenBills();
      console.log(`[warmup] ประเมินความเสี่ยงบิลค้าง ${r.count} รายการด้วยโมเดล ${r.model}`);
      return;
    } catch (e) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  console.warn('[warmup] ML service ยังไม่พร้อม ข้ามการประเมินความเสี่ยงตอนเริ่มระบบ');
}

app.listen(config.port, () => {
  console.log(`API พร้อมที่ http://localhost:${config.port} | payment=${config.paymentProvider}${config.paymentTestMode ? ' (test)' : ''} | demo=${config.demoMode}`);
  scheduler.start();
  warmup();
});
