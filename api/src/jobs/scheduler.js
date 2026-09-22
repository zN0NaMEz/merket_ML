const cron = require('node-cron');
const config = require('../config');
const settings = require('../lib/settings');
const { runDaily } = require('./daily');

/** ระบบตั้งเวลา: รันทุกวันเวลา 00:05 (เวลาไทย) เมื่อใช้งานจริง ในโหมดสาธิตให้กดเลื่อนวันที่จากหน้าเว็บแทน */
function start() {
  if (config.demoMode) {
    console.log('[scheduler] โหมดสาธิต: ปิด cron อัตโนมัติ ใช้ปุ่มเลื่อนวันที่จำลองแทน');
    return;
  }
  cron.schedule(config.dailyCron, async () => {
    try {
      const r = await runDaily(await settings.today());
      console.log('[scheduler]', r.summary);
    } catch (e) {
      console.error('[scheduler] ล้มเหลว', e);
    }
  }, { timezone: 'Asia/Bangkok' });
  console.log(`[scheduler] ตั้งเวลา daily job: ${config.dailyCron} (Asia/Bangkok)`);
}
module.exports = { start };
