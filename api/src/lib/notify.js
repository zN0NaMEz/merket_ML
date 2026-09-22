const { db } = require('../db');
/**
 * บันทึกการแจ้งเตือน (D7)
 * recipient: 'staff' | 'owner' | 'vendor:<id>' | 'walkin:<phone>'
 * kind: bill | overdue | ai | utility | payment | system
 */
async function notify(recipient, kind, message, date, runner = db) {
  await runner.q('INSERT INTO notifications (recipient, kind, message, created_on) VALUES ($1,$2,$3,$4)', [recipient, kind, message, date]);
}
module.exports = { notify };
