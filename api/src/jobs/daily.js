/**
 * งานประจำวันของ "ระบบตั้งเวลา" (Use Case: ตรวจสอบค้างชำระและแจ้งเตือน)
 *  1. แจ้งเตือนล่วงหน้าเฉพาะผู้ค้าที่ AI ประเมินว่าเสี่ยงสูง (ก่อนครบกำหนด 5 วัน)
 *  2. เปลี่ยนสถานะบิลที่เลยกำหนดเป็นค้างชำระ แจ้งเตือนผู้ค้าทุกวัน
 *  3. ค้างเกินกำหนดที่ตั้งไว้ (ค่าเริ่มต้น 3 วัน) ส่งต่อเจ้าหน้าที่และเจ้าของตลาด
 *  4. แจ้งเจ้าหน้าที่เมื่อถึงรอบจดมิเตอร์
 */
const config = require('../config');
const { db } = require('../db');
const settings = require('../lib/settings');
const { notify } = require('../lib/notify');
const D = require('../lib/dates');
const R = require('../lib/random');
const billing = require('../services/billing');
const meters = require('../services/meters');

async function runDaily(date) {
  const rates = await settings.rates();
  const ai = await settings.ai();
  let paid = 0, early = 0, over = 0, esc = 0;

  // (โหมดสาธิต) ผู้ค้าคนอื่นชำระผ่านแอปตามวันที่จำลองไว้
  if (config.demoMode) {
    const due = await db.q(`SELECT id, vendor_id FROM bills WHERE kind = 'monthly' AND status IN ('unpaid','overdue')
      AND sim_pay_date IS NOT NULL AND sim_pay_date <= $1`, [date]);
    for (const b of due) {
      const { id } = await db.one("SELECT nextval(pg_get_serial_sequence('payments','id')) AS id");
      const bill = await db.one('SELECT total FROM bills WHERE id = $1', [b.id]);
      await db.q(`INSERT INTO payments (id, ref_no, provider, access_token, amount, status, payer, vendor_id)
        VALUES ($1,$2,'simulated',md5(random()::text),$3,'pending',$4,$5)`, [id, billing.refNoFor(id, date), bill.total, `vendor:${b.vendor_id}`, b.vendor_id]);
      await db.q('INSERT INTO payment_bills (payment_id, bill_id, amount) VALUES ($1,$2,$3)', [id, b.id, bill.total]);
      await billing.applyPaymentResult(id, 'successful');
      paid++;
    }
  }

  const open = await db.q(`SELECT b.*, v.full_name FROM bills b JOIN vendors v ON v.id = b.vendor_id
    WHERE b.kind = 'monthly' AND b.status IN ('unpaid','overdue') ORDER BY b.due_date`);
  for (const b of open) {
    const toDue = D.diffDays(b.due_date, date);
    if (toDue >= 0 && toDue <= 5 && b.risk_score != null && b.risk_score >= ai.risk_high && !b.early_reminded_on) {
      early++;
      await db.q('UPDATE bills SET early_reminded_on = $1 WHERE id = $2', [date, b.id]);
      await notify(`vendor:${b.vendor_id}`, 'ai',
        `แจ้งเตือนล่วงหน้า บิล${D.periodLabel(b.period)} ยอด ${D.baht(b.total)} บาท ครบกำหนด ${D.thDate(b.due_date)}${toDue ? ` (อีก ${toDue} วัน)` : ' (วันนี้)'}`, date);
      // โหมดสาธิต: การเตือนล่วงหน้าทำให้บางคนชำระตรงเวลาขึ้น
      if (config.demoMode && b.sim_pay_date && b.sim_pay_date > b.due_date && R.mulberry32(R.hashStr(`${b.id}-rem`))() < 0.45) {
        await db.q('UPDATE bills SET sim_pay_date = due_date WHERE id = $1', [b.id]);
      }
    }
    if (date > b.due_date) {
      over++;
      const od = D.diffDays(date, b.due_date);
      if (b.status !== 'overdue') await db.q("UPDATE bills SET status = 'overdue' WHERE id = $1", [b.id]);
      await notify(`vendor:${b.vendor_id}`, 'overdue', `บิล${D.periodLabel(b.period)} ยอด ${D.baht(b.total)} บาท ค้างชำระ ${od} วัน กรุณาชำระ`, date);
      if (od > rates.overdue_days && !b.escalated_on) {
        esc++;
        await db.q('UPDATE bills SET escalated_on = $1 WHERE id = $2', [date, b.id]);
        const msg = `แผง ${b.stall_id} (${b.full_name}) ค้างชำระบิล${D.periodLabel(b.period)} เกิน ${rates.overdue_days} วัน`;
        await notify('staff', 'overdue', msg, date);
        await notify('owner', 'overdue', msg, date);
      }
    }
  }

  const period = await meters.currentPeriod();
  const round = (await settings.get('meter_round')) || {};
  if (date >= D.periodEnd(period) && !round[period]) {
    round[period] = date;
    await settings.set('meter_round', round);
    await notify('staff', 'system', `ถึงรอบจดมิเตอร์เดือน${D.periodLabel(period)} บันทึกเลขมิเตอร์เพื่อออกบิล`, date);
  }

  const summary = `${config.demoMode ? `ผู้ค้าชำระผ่านแอป ${paid} รายการ ` : ''}ตรวจบิลค้างชำระ ${over} รายการ แจ้งเตือนล่วงหน้า (AI) ${early} ราย ส่งต่อเจ้าหน้าที่ ${esc} ราย`;
  await db.q('INSERT INTO job_logs (run_date, job, summary) VALUES ($1,$2,$3)', [date, 'daily', summary]);
  return { date, paid, early, overdue: over, escalated: esc, summary };
}

module.exports = { runDaily };
