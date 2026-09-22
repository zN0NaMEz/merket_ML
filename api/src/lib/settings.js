const { db } = require('../db');
const config = require('../config');
const { bangkokToday } = require('./dates');
const { DEFAULT_RATES, DEFAULT_AI } = require('./constants');

async function get(key, runner = db) {
  const row = await runner.one('SELECT value FROM settings WHERE key = $1', [key]);
  return row ? row.value : null;
}
async function set(key, value, runner = db) {
  await runner.q(`INSERT INTO settings (key, value) VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, JSON.stringify(value)]);
}
async function rates(runner) { return { ...DEFAULT_RATES, ...(await get('rates', runner)) }; }
async function ai(runner) { return { ...DEFAULT_AI, ...(await get('ai', runner)) }; }

/** วันที่ของระบบ: โหมดสาธิตใช้วันที่จำลองที่เลื่อนได้ ไม่เช่นนั้นใช้วันที่จริง */
async function today(runner) {
  if (config.demoMode) {
    const c = await get('clock', runner);
    if (c && c.demo_date) return c.demo_date;
  }
  return bangkokToday();
}
module.exports = { get, set, rates, ai, today };
