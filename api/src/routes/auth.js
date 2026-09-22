const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { ah, HttpError } = require('../lib/http');
const { sign, auth } = require('../middleware/auth');

// Use Case: เข้าสู่ระบบ
router.post('/login', ah(async (req, res) => {
  const { username, password } = req.body || {};
  const u = await db.one('SELECT * FROM users WHERE lower(username) = lower($1)', [String(username || '').trim()]);
  if (!u || !(await bcrypt.compare(String(password || ''), u.password_hash))) throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  res.json({ token: sign(u), user: { id: u.id, role: u.role, vendor_id: u.vendor_id, name: u.display_name } });
}));
router.get('/me', auth, (req, res) => res.json({ user: { id: req.user.sub, role: req.user.role, vendor_id: req.user.vendor_id, name: req.user.name } }));
module.exports = router;
