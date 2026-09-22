// รัน daily job ด้วยมือ: npm run daily
const settings = require('../lib/settings');
const { runDaily } = require('./daily');
const { pool } = require('../db');
(async () => {
  const r = await runDaily(await settings.today());
  console.log(r.summary);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
