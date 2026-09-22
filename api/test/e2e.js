// ทดสอบ flow หลักทั้งระบบผ่าน API (ต้องรัน API + ML service และ seed ใหม่ก่อน)
const BASE = process.env.API_URL || 'http://localhost:4000/api';
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
async function call(method, path, body, token) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
const login = async (u, p) => (await call('POST', '/auth/login', { username: u, password: p })).data.token;

(async () => {
  const info = (await call('GET', '/system/info')).data;
  ok(info.demo_mode === true, `system info: today=${info.today} provider=${info.payment_provider}`);
  const staff = await login('staff', 'staff1234');
  ok(!!staff, 'staff login');
  ok((await call('POST', '/auth/login', { username: 'staff', password: 'wrong' })).status === 401, 'wrong password rejected');
  ok((await call('GET', '/staff/followup')).status === 401, 'staff route requires auth');

  // ---- 5.0 follow-up ----
  let f = (await call('GET', '/staff/followup', null, staff)).data;
  ok(f.overdue.length === 4, `overdue bills = ${f.overdue.length}`);
  ok(f.to_cut.length === 2 && f.cut_now.length === 2, `to_cut=${f.to_cut.map(x => x.stall_id)} cut_now=${f.cut_now.map(x => x.stall_id)}`);

  // ---- 3.0 meters + anomaly detection ----
  let m = (await call('GET', '/staff/meters', null, staff)).data;
  ok(m.period === '2026-08' && m.can_record && m.rows.length === 32, `meter period ${m.period} rows ${m.rows.length}`);
  ok(!('_scale' in m.rows[0]), 'sim fields not leaked');
  m = (await call('POST', '/staff/meters/sample', null, staff)).data;
  const flagged = m.results.filter(r => r.anomaly);
  ok(flagged.map(r => r.stall_id).sort().join() === 'A-03,B-02,C-04,E-02', `AI flagged: ${flagged.map(r => `${r.stall_id}(${r.kind}, IF=${r.if_score})`).join(' ')}`);
  const maxNormal = Math.max(...m.results.filter(r => !r.anomaly && r.if_score != null).map(r => r.if_score));
  ok(maxNormal < 0.62, `max IF score of normal readings = ${maxNormal}`);
  let r = await call('POST', '/staff/meters/issue', null, staff);
  ok(r.status === 422, `issue blocked while unresolved: ${r.data.error}`);
  const c04 = m.rows.find(x => x.stall_id === 'C-04');
  const acks = flagged.filter(x => x.stall_id !== 'C-04').map(x => { const row = m.rows.find(y => y.stall_id === x.stall_id); return { stall_id: x.stall_id, cur_water: row.cur_water, cur_elec: row.cur_elec, ack: true }; });
  m = (await call('POST', '/staff/meters/check', { readings: [...acks, { stall_id: 'C-04', cur_water: c04.prev_water + 6, cur_elec: c04.cur_elec, ack: false }] }, staff)).data;
  ok(m.results.find(x => x.stall_id === 'C-04').anomaly === false, 'C-04 fixed -> normal');
  r = await call('POST', '/staff/meters/issue', null, staff);
  ok(r.status === 200 && r.data.count === 32, `issued: ${r.data.summary}`);

  f = (await call('GET', '/staff/followup', null, staff)).data;
  ok(f.upcoming.length === 32 && f.upcoming.every(b => b.risk_score != null), `upcoming scored: top3 ${f.upcoming.slice(0, 3).map(b => `${b.stall_id}:${b.risk_score.toFixed(2)}`).join(' ')}`);
  ok(f.upcoming[0].reasons.length > 0, `reasons: ${f.upcoming[0].reasons.join(', ')}`);

  // ---- scheduler (demo advance) ----
  r = await call('POST', '/system/advance', { days: 5 }, staff);
  ok(r.data.total.early > 0, `advance 5 days -> ${r.data.today}: early=${r.data.total.early} paid=${r.data.total.paid} overdue=${r.data.total.overdue}`);

  // ---- 4.0 vendor payment (A-04, utilities cut) ----
  const v = await login('a04', 'vendor1234');
  let ov = (await call('GET', '/vendor/overview', null, v)).data;
  ok(ov.vendor.utility_status === 'cut' && ov.open_bills.length >= 1, `A-04 open bills ${ov.open_bills.length}, utility ${ov.vendor.utility_status}`);
  ok(!('risk_score' in ov.open_bills[0]), 'vendor does not see risk score');
  ok((await call('GET', '/staff/followup', null, v)).status === 403, 'vendor blocked from staff routes');
  const ids = ov.open_bills.map(b => b.id);
  let p = (await call('POST', '/vendor/payments', { bill_ids: ids }, v)).data;
  ok(p.status === 'pending' && p.qr_path, `payment ${p.ref_no} ${p.amount} THB pending`);
  const qr = await fetch(BASE.replace('/api', '') + p.qr_path);
  ok(qr.ok && (qr.headers.get('content-type') || '').includes('svg'), 'QR image served');
  ok((await call('GET', `/payments/${p.id}?t=wrong`)).status === 404, 'payment token enforced');
  p = (await call('POST', `/payments/${p.id}/simulate?t=${p.token}`, { outcome: 'paid' })).data;
  ok(p.status === 'successful' && p.receipt_no && p.restore_pending, `paid: receipt ${p.receipt_no}, restore_pending=${p.restore_pending}`);
  r = await call('POST', '/vendor/payments', { bill_ids: ids }, v);
  ok(r.status === 409, 'cannot pay same bills twice');
  f = (await call('GET', '/staff/followup', null, staff)).data;
  ok(f.to_restore.some(x => x.stall_id === 'A-04'), 'staff sees A-04 to restore');
  ok((await call('POST', '/staff/stalls/A-04/restore', null, staff)).status === 200, 'staff restored A-04');

  // failed payment path + advance payment
  p = (await call('POST', '/vendor/advance', { plan: 'weekly' }, v)).data;
  p = (await call('POST', `/payments/${p.id}/simulate?t=${p.token}`, { outcome: 'failed' })).data;
  ok(p.status === 'failed', 'failed payment recorded');
  ov = (await call('GET', '/vendor/overview', null, v)).data;
  ok(!ov.open_bills.some(b => b.kind === 'advance'), 'failed advance bill cancelled');
  p = (await call('POST', '/vendor/advance', { plan: 'monthly' }, v)).data;
  p = (await call('POST', `/payments/${p.id}/simulate?t=${p.token}`, { outcome: 'paid' })).data;
  ov = (await call('GET', '/vendor/overview', null, v)).data;
  ok(ov.vendor.credit === 3000, `advance credit = ${ov.vendor.credit}`);
  const st = (await call('GET', '/vendor/statement?months=12', null, v)).data;
  ok(st.bills.length === 12, `statement 12 months, on-time ${(st.summary.on_time_rate * 100).toFixed(0)}%`);

  // ---- 2.0 walk-in ----
  const opt = (await call('GET', '/walkin/options')).data;
  const av = (await call('GET', `/walkin/availability?date=${opt.dates[0]}`)).data;
  const free = av.spots.find(s => !s.taken).spot;
  r = await call('POST', '/walkin/bookings', { full_name: 'ทดสอบ ขาจร', phone: '081-111-2222', product: opt.products[0], date: opt.dates[0], spot: free });
  ok(r.status === 200 && r.data.payment.amount === opt.fee, `walk-in booking ${r.data.booking?.booking_no} spot ${free}`);
  const r2 = await call('POST', '/walkin/bookings', { full_name: 'คนอื่น', phone: '0819998888', product: opt.products[0], date: opt.dates[0], spot: free });
  ok(r2.status === 409, 'double booking blocked');
  await call('POST', `/payments/${r.data.payment.id}/simulate?t=${r.data.payment.token}`, { outcome: 'paid' });
  const mine = (await call('GET', '/walkin/bookings?phone=0811112222')).data;
  ok(mine.bookings[0]?.status === 'paid', 'walk-in booking paid');
  r = await call('POST', '/staff/walkin/bookings', { full_name: 'เจ้าหน้าที่จองให้', phone: '0822223333', product: opt.products[1], date: opt.dates[1], spot: 'F-12', method: 'cash' }, staff);
  ok(r.data.payment?.status === 'successful', 'staff cash booking');

  // ---- 1.0 vendors ----
  const vac = (await call('GET', '/staff/stalls/vacant', null, staff)).data.stalls;
  r = await call('POST', '/staff/vendors', { full_name: 'ผู้ค้า ใหม่', phone: '0891234567', stall_id: vac[0].id, months: 12, username: 'newvendor', password: 'newpass123' }, staff);
  ok(r.status === 200, `new vendor ${r.data.code} on ${vac[0].id}`);
  ok(!!(await login('newvendor', 'newpass123')), 'new vendor can log in');

  // ---- owner ----
  const own = await login('owner', 'owner1234');
  const dash = (await call('GET', '/owner/dashboard', null, own)).data;
  ok(dash.revenue.length === 12 && dash.kpi.revenue_month > 0, `dashboard revenue this month ${dash.kpi.revenue_month}, risk levels ${JSON.stringify(dash.risk.levels)}`);
  r = await call('PUT', '/owner/rates', { rates: { water_rate: 20 } }, own);
  ok(r.data.rates?.water_rate === 20, 'rates updated');
  const ai = (await call('GET', '/ai/overview', null, own)).data;
  ok(ai.risk.models?.lr && ai.anomaly.n_train > 0, `AI overview: n=${ai.risk.n_samples} late=${(ai.risk.late_rate * 100).toFixed(1)}% LR auc=${ai.risk.models.lr.auc.toFixed(3)} cv=${ai.risk.models.lr.cv_auc_mean.toFixed(3)} RF auc=${ai.risk.models.rf.auc.toFixed(3)}`);
  r = await call('PUT', '/ai/settings', { risk_model: 'rf' }, own);
  ok(r.data.ai?.risk_model === 'rf', 'switched to RF (rescored)');
  r = await call('POST', '/ai/retrain', null, own);
  ok(r.status === 200 && r.data.rescored.count > 0, `retrained, rescored ${r.data.rescored.count}`);
  const n = (await call('GET', '/notifications', null, v)).data;
  ok(n.items.length > 0, `vendor notifications ${n.items.length} (unread ${n.unread})`);

  // overdue escalation after due date
  r = await call('POST', '/system/advance', { days: 9 }, staff);
  ok(r.data.total.escalated > 0, `advance to ${r.data.today}: escalated=${r.data.total.escalated} paid=${r.data.total.paid}`);
  f = (await call('GET', '/staff/followup', null, staff)).data;
  ok(f.to_cut.length > 0, `to_cut now: ${f.to_cut.map(x => x.stall_id).join(' ')}`);
  ok((await call('POST', `/staff/stalls/${f.to_cut[0].stall_id}/cut`, null, staff)).status === 200, `cut ${f.to_cut[0].stall_id}`);

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
