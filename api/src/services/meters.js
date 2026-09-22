const config = require('../config');
const { db, tx } = require('../db');
const settings = require('../lib/settings');
const { notify } = require('../lib/notify');
const { HttpError } = require('../lib/http');
const D = require('../lib/dates');
const R = require('../lib/random');
const { TYPES } = require('../lib/constants');
const ml = require('./ml');
const billing = require('./billing');

/** รอบมิเตอร์ที่ต้องจด = เดือนถัดจากบิลรายเดือนล่าสุด */
async function currentPeriod() {
  const r = await db.one("SELECT max(period) AS p FROM bills WHERE kind = 'monthly'");
  if (r && r.p) return D.nextPeriod(r.p.trim());
  return D.prevPeriod(D.periodOf(await settings.today()));
}

async function draftView(includeSim = false) {
  const period = await currentPeriod();
  const today = await settings.today();
  const stalls = await db.q(`SELECT s.id AS stall_id, s.type_code, t.name AS type_name, s.init_water, s.init_elec,
      v.id AS vendor_id, v.full_name, v.sim_scale_w, v.sim_scale_e
    FROM stalls s JOIN stall_types t ON t.code = s.type_code JOIN vendors v ON v.stall_id = s.id AND v.active
    ORDER BY s.id`);
  const prev = await db.q(`SELECT DISTINCT ON (stall_id) stall_id, cur_water, cur_elec FROM meter_readings
    WHERE period < $1 ORDER BY stall_id, period DESC`, [period]);
  const drafts = await db.q('SELECT * FROM meter_drafts WHERE period = $1', [period]);
  const pm = Object.fromEntries(prev.map(r => [r.stall_id, r]));
  const dm = Object.fromEntries(drafts.map(r => [r.stall_id, r]));
  const rows = stalls.map(s => ({
    stall_id: s.stall_id, type_code: s.type_code, type_name: s.type_name, vendor_id: s.vendor_id, vendor_name: s.full_name,
    prev_water: pm[s.stall_id]?.cur_water ?? s.init_water, prev_elec: pm[s.stall_id]?.cur_elec ?? s.init_elec,
    cur_water: dm[s.stall_id]?.cur_water ?? null, cur_elec: dm[s.stall_id]?.cur_elec ?? null,
    ack: dm[s.stall_id]?.ack ?? false, ever_flagged: dm[s.stall_id]?.ever_flagged ?? false,
    ...(includeSim ? { _scale: [s.sim_scale_w ?? 1, s.sim_scale_e ?? 1] } : {}),
  }));
  return { period, period_label: D.periodLabel(period), record_from: D.periodEnd(period), can_record: today >= D.periodEnd(period), rows };
}

async function saveDraft(period, readings) {
  for (const r of readings) {
    const w = Number.isInteger(r.cur_water) ? r.cur_water : null;
    const e = Number.isInteger(r.cur_elec) ? r.cur_elec : null;
    await db.q(`INSERT INTO meter_drafts (stall_id, period, cur_water, cur_elec, ack) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (stall_id, period) DO UPDATE SET cur_water = EXCLUDED.cur_water, cur_elec = EXCLUDED.cur_elec,
      ack = EXCLUDED.ack, updated_at = now()`, [r.stall_id, period, w, e, !!r.ack]);
  }
}

/** บันทึกค่าที่กรอก แล้วให้ ML ตรวจทุกแผงที่กรอกครบ ผลที่ผิดปกติจะถูกจำไว้เพื่อลง anomaly_logs ตอนออกบิล */
async function check(readings = []) {
  const period = await currentPeriod();
  if (readings.length) await saveDraft(period, readings);
  const view = await draftView();
  const filled = view.rows.filter(r => r.cur_water != null && r.cur_elec != null);
  const ai = await settings.ai();
  const results = filled.length
    ? (await ml.checkReadings(period, filled.map(r => ({ stall_id: r.stall_id, cur_water: r.cur_water, cur_elec: r.cur_elec })), ai)).results
    : [];
  for (const r of results) {
    if (r.anomaly) {
      await db.q('UPDATE meter_drafts SET ever_flagged = true, flag_reason = $1 WHERE stall_id = $2 AND period = $3',
        [r.reasons.join(' '), r.stall_id, period]);
    }
  }
  return { ...(await draftView()), results, ai };
}

/** โหมดสาธิต: สร้างค่าที่จดจากเครื่องจดมิเตอร์ตัวอย่าง รอบแรกหลัง seed จะมีค่าผิดปกติ 4 แผงไว้ให้ AI จับ */
async function fillSample() {
  if (!config.demoMode) throw new HttpError(403, 'ใช้ได้เฉพาะโหมดสาธิต');
  const view = await draftView(true);
  const period = view.period;
  const demo = (await settings.get('demo')) || {};
  const means = await db.q(`SELECT stall_id, avg(use_water)::float AS mw, avg(use_elec)::float AS me FROM meter_readings
    WHERE period < $1 AND period >= $2 GROUP BY stall_id`, [period, D.prevPeriod(period, 12)]);
  const mm = Object.fromEntries(means.map(m => [m.stall_id, m]));
  const rng = R.mulberry32(Number(period.replace('-', '')) * 7 + 3);
  const month = Number(period.slice(5, 7));
  const sw = [3, 4, 5].includes(month) ? 1.15 : 1;
  const se = [3, 4, 5].includes(month) ? 1.3 : [11, 12, 1].includes(month) ? 0.85 : 1;
  const out = {};
  for (const r of view.rows) {
    const t = TYPES[r.type_code];
    const uw = Math.max(0, Math.round(t.w * r._scale[0] * sw * (1 + 0.12 * R.randn(rng))));
    const ue = Math.max(0, Math.round(t.e * r._scale[1] * se * (1 + 0.10 * R.randn(rng))));
    out[r.stall_id] = { stall_id: r.stall_id, cur_water: r.prev_water + uw, cur_elec: r.prev_elec + ue, ack: false };
  }
  const inj = (sid, fn) => { const row = view.rows.find(x => x.stall_id === sid); if (row && out[sid]) fn(out[sid], row, mm[sid] || { mw: 1, me: 1 }); };
  if (demo.anomaly_period === period) {
    inj('A-03', (o, row, m) => { o.cur_water = row.prev_water + Math.round(m.mw * 3.4); });
    inj('B-02', (o, row) => { o.cur_elec = row.prev_elec + 9; });
    inj('C-04', (o, row) => { o.cur_water = row.prev_water - 37; });
    inj('E-02', (o, row, m) => { o.cur_elec = row.prev_elec + Math.round(m.me * 2.6); });
  } else {
    const a = view.rows[Math.floor(rng() * view.rows.length)], b = view.rows[Math.floor(rng() * view.rows.length)];
    inj(a.stall_id, (o, row, m) => { o.cur_water = row.prev_water + Math.round(m.mw * 3); });
    if (b.stall_id !== a.stall_id) inj(b.stall_id, (o, row, m) => { o.cur_elec = row.prev_elec + Math.round(m.me * 0.15); });
  }
  await db.q('DELETE FROM meter_drafts WHERE period = $1', [period]);
  return check(Object.values(out));
}

/** ยืนยันเลขมิเตอร์และออกบิล (3.0 -> D4, D5) แล้วให้ AI ประเมินความเสี่ยงค้างชำระของบิลใหม่ */
async function issueBills(userId) {
  const today = await settings.today();
  const view = await draftView();
  const { period } = view;
  if (!view.can_record) throw new HttpError(400, `รอบ${view.period_label} ออกบิลได้ตั้งแต่ ${D.thDate(view.record_from)}`);
  const missing = view.rows.filter(r => r.cur_water == null || r.cur_elec == null);
  if (missing.length) throw new HttpError(422, `ยังไม่ได้กรอกเลขมิเตอร์ ${missing.length} แผง`, { missing: missing.map(r => r.stall_id) });
  const ai = await settings.ai();
  const rates = await settings.rates();
  const { results } = await ml.checkReadings(period, view.rows.map(r => ({ stall_id: r.stall_id, cur_water: r.cur_water, cur_elec: r.cur_elec })), ai);
  const chk = Object.fromEntries(results.map(r => [r.stall_id, r]));
  const rowsById = Object.fromEntries(view.rows.map(r => [r.stall_id, r]));
  const unresolved = results.filter(r => r.anomaly && (r.kind === 'misread' || !rowsById[r.stall_id].ack));
  if (unresolved.length) throw new HttpError(422, `มีค่ามิเตอร์ผิดปกติที่ยังไม่ได้ตรวจ ${unresolved.length} แผง`, { stalls: unresolved.map(r => r.stall_id) });

  const drafts = Object.fromEntries((await db.q('SELECT * FROM meter_drafts WHERE period = $1', [period])).map(d => [d.stall_id, d]));
  const rents = Object.fromEntries((await db.q('SELECT code, monthly_rent FROM stall_types')).map(t => [t.code, t.monthly_rent]));
  const due = D.addDays(today, rates.pay_within_days - 1);

  const created = await tx(async t => {
    const out = [];
    for (const row of view.rows) {
      const r = chk[row.stall_id], dr = drafts[row.stall_id] || {};
      const flagged = !!dr.ever_flagged || r.anomaly;
      await t.q(`INSERT INTO meter_readings (stall_id, period, prev_water, cur_water, prev_elec, cur_elec, use_water, use_elec, recorded_on, recorded_by, flagged)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [row.stall_id, period, r.prev_water, row.cur_water, r.prev_elec, row.cur_elec, r.use_water, r.use_elec, today, userId, flagged]);
      if (flagged) {
        await t.q(`INSERT INTO anomaly_logs (stall_id, period, detected_on, reason, resolution, if_score, method) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [row.stall_id, period, today, dr.flag_reason || r.reasons.join(' '), r.anomaly ? 'ยืนยันค่าที่จด (ตรวจหน้างานแล้ว)' : 'แก้ไขค่าแล้ว', r.if_score, ai.anomaly_method]);
      }
      const v = await t.one('SELECT id, credit FROM vendors WHERE id = $1 FOR UPDATE', [row.vendor_id]);
      const rent = rents[row.type_code];
      const creditUsed = Math.min(v.credit, rent);
      if (creditUsed) await t.q('UPDATE vendors SET credit = credit - $1 WHERE id = $2', [creditUsed, v.id]);
      const waterAmt = r.use_water * rates.water_rate, elecAmt = r.use_elec * rates.elec_rate;
      const bill = await t.one(`INSERT INTO bills (bill_no, kind, vendor_id, stall_id, period, rent, credit_used, use_water, use_elec,
          water_rate, elec_rate, water_amount, elec_amount, total, issue_date, due_date, status)
        VALUES ($1,'monthly',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'unpaid') RETURNING *`,
        [`INV-${period.replace('-', '')}-${row.stall_id}`, v.id, row.stall_id, period, rent, creditUsed, r.use_water, r.use_elec,
          rates.water_rate, rates.elec_rate, waterAmt, elecAmt, rent - creditUsed + waterAmt + elecAmt, today, due]);
      await notify(`vendor:${v.id}`, 'bill', `บิล${D.periodLabel(period)} ออกแล้ว ยอด ${D.baht(bill.total)} บาท ครบกำหนด ${D.thDate(due)}`, today, t);
      out.push(bill);
    }
    await t.q('DELETE FROM meter_drafts WHERE period = $1', [period]);
    return out;
  });

  let high = 0, aiError = null;
  try {
    await billing.rescoreOpenBills();
    const ids = created.map(b => b.id);
    const scored = await db.q(`SELECT b.*, v.sim_discipline FROM bills b JOIN vendors v ON v.id = b.vendor_id WHERE b.id = ANY($1)`, [ids]);
    high = scored.filter(b => b.risk_score >= ai.risk_high).length;
    if (config.demoMode) {
      for (const b of scored) {
        if (!b.risk_features) continue;
        await db.q('UPDATE bills SET sim_pay_date = $1 WHERE id = $2',
          [billing.simPayDate(b, { id: b.vendor_id, sim_discipline: b.sim_discipline }, b.risk_features, rates.pay_within_days), b.id]);
      }
    }
  } catch (e) {
    aiError = e.message;
  }
  const flaggedCount = Object.values(drafts).filter(d => d.ever_flagged).length;
  const summary = `ออกบิล${D.periodLabel(period)} ${created.length} รายการ พบค่ามิเตอร์ผิดปกติ ${flaggedCount} แผง ความเสี่ยงค้างชำระสูง ${high} ราย`;
  await db.q('INSERT INTO job_logs (run_date, job, summary) VALUES ($1,$2,$3)', [today, 'issue_bills', summary]);
  await notify('owner', 'bill', summary, today);
  return { period, count: created.length, flagged: flaggedCount, high, summary, ai_error: aiError };
}

module.exports = { currentPeriod, draftView, check, fillSample, issueBills };
