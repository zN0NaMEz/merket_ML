/* เปิดเซิร์ฟเวอร์จริง ใช้ตอนรันด้วย Docker หรือ npm run dev */
const app = require('./app');
const config = require('./config');
const { db } = require('./db');
const scheduler = require('./jobs/scheduler');
const billing = require('./services/billing');

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
