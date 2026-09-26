/**
 * สร้างข้อมูลตัวอย่าง: npm run seed  (ล้างข้อมูลเดิมทั้งหมด)
 *                     npm run seed:if-empty  (ข้ามถ้ามีข้อมูลแล้ว ใช้ตอนเริ่ม container)
 * ตั้ง SEED_ANCHOR=YYYY-MM-01 เพื่อกำหนดเดือนตั้งต้นเอง (ค่าเริ่มต้น = วันที่ 1 ของเดือนปัจจุบัน)
 *
 * reseed() ถูกเรียกจาก POST /api/admin/reseed ได้ด้วย (ปุ่มรีเซ็ตข้อมูลสาธิตก่อนนำเสนอ)
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { pool, db, tx } = require('../db');
const D = require('../lib/dates');
const settings = require('../lib/settings');
const { DEFAULT_RATES, DEFAULT_AI } = require('../lib/constants');
const { generate } = require('./generator');
const billing = require('../services/billing');
const ml = require('../services/ml');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SCHEMA = process.env.SCHEMA_FILE || path.join(__dirname, '../../../db/init/01_schema.sql');

async function main() {
  for (let i = 0; ; i++) {
    try { await db.q('SELECT 1'); break; } catch (e) { if (i > 30) throw e; console.log('รอฐานข้อมูล...'); await sleep(2000); }
  }
  if (fs.existsSync(SCHEMA)) await pool.query(fs.readFileSync(SCHEMA, 'utf8'));
  if (process.argv.includes('--if-empty')) {
    const { n } = await db.one('SELECT count(*)::int AS n FROM vendors');
    if (n > 0) { console.log('มีข้อมูลอยู่แล้ว ข้ามการ seed'); return; }
  }
  const r = await reseed({ log: console.log });
  if (!r.ml || r.ml.error) console.log('ML service ยังไม่พร้อม ระบบจะเทรนโมเดลอัตโนมัติเมื่อ ML service ทำงาน');
  console.log('\nบัญชีทดลอง: staff / staff1234 | owner / owner1234 | ผู้ค้า: เลขแผงไม่มีขีด เช่น a04 / vendor1234');
}

/* ใช้โยนออกจาก transaction เพื่อให้ฐานข้อมูลย้อนกลับทั้งหมดในโหมดทดลอง */
const DRY_RUN = Symbol('dry-run');
/* หมายเลขล็อกของการรีเซ็ต กันการกดซ้ำพร้อมกันสองครั้ง */
const RESEED_LOCK = 424242;

/**
 * ล้างข้อมูลทั้งหมดแล้วสร้างข้อมูลตัวอย่างชุดใหม่ จากนั้นเทรนโมเดลและประเมินความเสี่ยงบิลค้าง
 *   dryRun  ทำทุกขั้นตอนใน transaction แล้วย้อนกลับ ใช้วัดเวลาโดยไม่แตะข้อมูลจริง (ไม่เทรนโมเดล)
 *   train   เทรนโมเดลต่อหลังสร้างข้อมูล
 * คืนสรุปจำนวนข้อมูล เวลาที่ใช้ และผลการเทรน (ถ้าเทรนไม่สำเร็จ ข้อมูลยังถูกรีเซ็ตแล้ว)
 */
async function reseed({ dryRun = false, train = true, log = () => {} } = {}) {
  const started = Date.now();
  const anchor = process.env.SEED_ANCHOR || `${D.periodOf(D.bangkokToday())}-01`;
  const g = generate(anchor);
  log(`สร้างข้อมูลตัวอย่าง: ประวัติ ${g.meta.hist_first} ถึง ${g.meta.hist_last} รอบมิเตอร์ปัจจุบัน ${g.meta.meter_period}`);
  const vendorPw = await bcrypt.hash('vendor1234', 10);

  try {
  await tx(async t => {
    // ล็อกผูกกับ transaction จึงปลดเองเมื่อจบ ใช้ได้แม้ผ่าน connection pooler
    const { ok } = await t.one('SELECT pg_try_advisory_xact_lock($1) AS ok', [RESEED_LOCK]);
    if (!ok) { const e = new Error('กำลังรีเซ็ตข้อมูลอยู่ รอให้รอบก่อนเสร็จก่อน'); e.status = 409; throw e; }
    await t.q(`TRUNCATE notifications, job_logs, model_runs, anomaly_logs, payment_bills, payments, walkin_bookings, bills,
      meter_drafts, meter_readings, contracts, users, vendors, stalls, stall_types, settings RESTART IDENTITY CASCADE`);
    for (const s of g.stall_types) await t.q('INSERT INTO stall_types VALUES ($1,$2,$3,$4)', [s.code, s.name, s.zone, s.monthly_rent]);
    for (const s of g.stalls) {
      await t.q('INSERT INTO stalls (id, type_code, utility_status, cut_date, init_water, init_elec) VALUES ($1,$2,$3,$4,$5,$6)',
        [s.id, s.type_code, s.utility_status, s.cut_date, s.init_water, s.init_elec]);
    }
    const vid = {};
    for (const v of g.vendors) {
      const r = await t.one(`INSERT INTO vendors (code, full_name, phone, stall_id, since, sim_discipline, sim_scale_w, sim_scale_e)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [v.code, v.full_name, v.phone, v.stall_id, v.since, v.sim_discipline, v.sim_scale_w, v.sim_scale_e]);
      vid[v.idx] = r.id;
      await t.q(`INSERT INTO users (username, password_hash, role, vendor_id, display_name) VALUES ($1,$2,'vendor',$3,$4)`,
        [v.stall_id.replace('-', '').toLowerCase(), vendorPw, r.id, v.full_name]);
    }
    await t.q(`INSERT INTO users (username, password_hash, role, display_name) VALUES ('staff',$1,'staff','เจ้าหน้าที่สำนักงาน'), ('owner',$2,'owner','เจ้าของตลาด')`,
      [await bcrypt.hash('staff1234', 10), await bcrypt.hash('owner1234', 10)]);
    for (const c of g.contracts) {
      await t.q('INSERT INTO contracts (vendor_id, stall_id, start_date, end_date, deposit) VALUES ($1,$2,$3,$4,$5)', [vid[c.vendor_idx], c.stall_id, c.start_date, c.end_date, c.deposit]);
    }
    for (const m of g.meters) {
      await t.q(`INSERT INTO meter_readings (stall_id, period, prev_water, cur_water, prev_elec, cur_elec, use_water, use_elec, recorded_on, flagged)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [m.stall_id, m.period, m.prev_water, m.cur_water, m.prev_elec, m.cur_elec, m.use_water, m.use_elec, m.recorded_on, m.flagged]);
    }
    const newPayment = async (provider, amount, payer, paidDate, extra = {}) => {
      const { id } = await t.one("SELECT nextval(pg_get_serial_sequence('payments','id')) AS id");
      await t.q(`INSERT INTO payments (id, ref_no, provider, access_token, amount, status, payer, vendor_id, booking_id, paid_date, receipt_no, created_at)
        VALUES ($1,$2,$3,md5(random()::text),$4,'successful',$5,$6,$7,$8,$9,$10)`,
        [id, billing.refNoFor(id, paidDate), provider, amount, payer, extra.vendor_id || null, extra.booking_id || null, paidDate, billing.receiptNoFor(id, paidDate), `${paidDate}T10:00:00+07:00`]);
      return id;
    };
    for (const b of g.bills) {
      const v = vid[b.vendor_idx];
      const bill = await t.one(`INSERT INTO bills (bill_no, kind, vendor_id, stall_id, period, rent, use_water, use_elec, water_rate, elec_rate,
          water_amount, elec_amount, total, issue_date, due_date, status, paid_date, escalated_on)
        VALUES ($1,'monthly',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
        [`INV-${b.period.replace('-', '')}-${b.stall_id}`, v, b.stall_id, b.period, b.rent, b.use_water, b.use_elec, b.water_rate, b.elec_rate,
          b.water_amount, b.elec_amount, b.total, b.issue_date, b.due_date, b.status, b.paid_date, b.escalated_on]);
      if (b.paid_date) {
        const pid = await newPayment('simulated', b.total, `vendor:${v}`, b.paid_date, { vendor_id: v });
        await t.q('INSERT INTO payment_bills (payment_id, bill_id, amount) VALUES ($1,$2,$3)', [pid, bill.id, b.total]);
        await t.q('UPDATE bills SET payment_id = $1 WHERE id = $2', [pid, bill.id]);
      }
    }
    for (const p of g.payments) await newPayment('aggregate', p.amount, 'walkin', p.paid_date);
    for (const [i, b] of g.bookings.entries()) {
      const bk = await t.one(`INSERT INTO walkin_bookings (booking_no, full_name, phone, product, booking_date, spot, fee, status, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'paid',$8) RETURNING id`,
        [`BK${b.booking_date.replace(/-/g, '').slice(2)}-${String(i + 1).padStart(4, '0')}`, b.full_name, b.phone, b.product, b.booking_date, b.spot, b.fee, b.created_by]);
      const pid = await newPayment(b.method, b.fee, `walkin:${b.phone}`, b.paid_date, { booking_id: bk.id });
      await t.q('UPDATE walkin_bookings SET payment_id = $1 WHERE id = $2', [pid, bk.id]);
    }
    for (const n of g.notifications) {
      const rec = n.recipient.startsWith('vendor_idx:') ? `vendor:${vid[n.recipient.split(':')[1]]}` : n.recipient;
      await t.q('INSERT INTO notifications (recipient, kind, message, created_on) VALUES ($1,$2,$3,$4)', [rec, n.kind, n.message, n.created_on]);
    }
    for (const a of g.anomaly_logs) {
      await t.q('INSERT INTO anomaly_logs (stall_id, period, detected_on, reason, resolution) VALUES ($1,$2,$3,$4,$5)', [a.stall_id, a.period, a.detected_on, a.reason, a.resolution]);
    }
    for (const j of g.job_logs) await t.q('INSERT INTO job_logs (run_date, job, summary) VALUES ($1,$2,$3)', [j.run_date, j.job, j.summary]);
    await settings.set('rates', DEFAULT_RATES, t);
    await settings.set('ai', DEFAULT_AI, t);
    await settings.set('clock', config.demoMode ? { demo_date: anchor } : {}, t);
    await settings.set('demo', { anomaly_period: g.meta.meter_period }, t);
    await settings.set('meter_round', g.meta.meter_round, t);
    if (dryRun) throw DRY_RUN;
  });
  } catch (e) {
    if (e !== DRY_RUN) throw e;
  }

  const summary = {
    dry_run: dryRun, demo_date: anchor,
    vendors: g.vendors.length, stalls: g.stalls.length, bills: g.bills.length, meters: g.meters.length,
    bookings: g.bookings.length, db_ms: Date.now() - started,
  };
  log(`${dryRun ? 'ทดลอง (ย้อนกลับแล้ว)' : 'บันทึกแล้ว'}: ผู้ค้า ${g.vendors.length} ราย บิล ${g.bills.length} ใบ เลขมิเตอร์ ${g.meters.length} ค่า · ${summary.db_ms} ms`);
  if (dryRun) {
    // ปลุก ML service ไว้ก่อน ตอนรีเซ็ตจริงจะได้ไม่เสียเวลารอเซิร์ฟเวอร์ตื่น
    const t0 = Date.now();
    summary.ml_awake = await ml.health().then(() => true, () => false);
    summary.ml_ms = Date.now() - t0;
    return summary;
  }
  if (!train) return summary;

  const mlStarted = Date.now();
  try {
    const r = await ml.trainRisk();
    const a = await ml.trainAnomaly();
    const s = await billing.rescoreOpenBills();
    summary.ml = { auc_lr: r.models.lr.auc, auc_rf: r.models.rf.auc, n_samples: r.n_samples, n_meter: a.n_train, rescored: s.count, ms: Date.now() - mlStarted };
    log(`เทรนโมเดลแล้ว (AUC: LR ${r.models.lr.auc.toFixed(3)}, RF ${r.models.rf.auc.toFixed(3)}) ประเมินความเสี่ยง ${s.count} บิล`);
  } catch (e) {
    summary.ml = { error: e.message, ms: Date.now() - mlStarted };
  }
  summary.total_ms = Date.now() - started;
  return summary;
}

module.exports = { reseed };

if (require.main === module) {
  main().then(() => pool.end()).catch(async e => { console.error(e); await pool.end(); process.exit(1); });
}
