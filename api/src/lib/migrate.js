/**
 * การปรับโครงสร้างฐานข้อมูลหลังเวอร์ชันแรก (01_schema.sql)
 *
 * API บน Vercel มองไม่เห็นโฟลเดอร์ db/init จึงเก็บคำสั่งไว้ที่นี่ และให้ API รันเองครั้งเดียว
 * (บันทึกเลขเวอร์ชันไว้ใน settings.schema_version) ทุกคำสั่งรันซ้ำได้โดยไม่เสียหาย
 * ใช้ได้ทั้งฐานข้อมูลในเครื่อง (docker) และ Neon โดยไม่ต้องมีใครสั่งรันเอง
 *
 * v2  หน้า "เบื้องหลัง AI" (RodeMap.md หัวข้อ 4.1, 4.2)
 *     - model_runs เก็บรายละเอียดของการเทรนแต่ละรอบ (ข้อมูลที่ใช้ ผลวัด calibration ความสำคัญของปัจจัย)
 *     - anomaly_reviews เก็บการยืนยัน/แก้ค่ามิเตอร์ที่ AI ทัก พร้อมการเลิกทำ (ไม่ลบแถว)
 *     - เก็บผลตรวจของ AI ไว้กับค่ามิเตอร์ หน้าอธิบายจึงไม่ต้องเรียก ML ซ้ำ
 *     - บทบาท admin (ทีมพัฒนา/กรรมการ)
 * v3  เก็บผลตรวจของ AI ณ ตอนที่คนยืนยัน/แก้ค่าไว้กับรายการตรวจ (ใช้สรุปเพื่อปรับเกณฑ์ รอบ 5)
 *     เพราะหลังออกบิล ผลตรวจบนเลขมิเตอร์เป็นของค่าที่แก้แล้ว ไม่ใช่ค่าที่ถูกทัก
 *     และแก้ is_synthetic ของรอบเทรนก่อน v2: คอลัมน์ใหม่ได้ค่าตั้งต้น false ทำให้รอบเทรนจากข้อมูลจำลองขึ้นป้าย "ข้อมูลจริง"
 *     แถวรุ่นก่อนดูได้จาก sklearn_version ที่ว่าง (ตัวเขียนรุ่นใหม่ใส่เสมอ) จึงตั้งตามข้อมูลในระบบตอนนี้
 * v4  ผลวัดโมเดลกับข้อมูลจำลองหลายชุด (model evaluation): evaluation_batches + model_evaluations
 *     ML เขียนผล (ml/app/benchmark.py) หน้าเว็บอ่านอย่างเดียว · ไม่ผูกกับข้อมูลของตลาด จึงไม่ถูกล้างตอนรีเซ็ตข้อมูลสาธิต
 */
const bcrypt = require('bcryptjs');
const config = require('../config');
const { pool } = require('../db');

const VERSION = 4;

const SQL_V2 = `
ALTER TABLE model_runs
  ADD COLUMN IF NOT EXISTS sklearn_version   text,
  ADD COLUMN IF NOT EXISTS n_train           int,
  ADD COLUMN IF NOT EXISTS n_test            int,
  ADD COLUMN IF NOT EXISTS data_from         date,
  ADD COLUMN IF NOT EXISTS data_to           date,
  ADD COLUMN IF NOT EXISTS is_synthetic      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cv_scores         jsonb,
  ADD COLUMN IF NOT EXISTS confusion         jsonb,
  ADD COLUMN IF NOT EXISTS calibration       jsonb,
  ADD COLUMN IF NOT EXISTS global_importance jsonb,
  ADD COLUMN IF NOT EXISTS triggered_by      text;
CREATE INDEX IF NOT EXISTS model_runs_type_idx ON model_runs (model_type, trained_at DESC);

-- เวลาที่ให้คะแนนความเสี่ยงล่าสุดของบิล (แถบสถานะใช้บอกว่า "ให้คะแนนล่าสุดเมื่อไร")
ALTER TABLE bills ADD COLUMN IF NOT EXISTS risk_scored_at timestamptz;

-- ผลตรวจของ AI ณ ตอนตรวจ (ค่าเฉลี่ย ความแกว่ง z คะแนนความแปลก ช่วงข้อมูลที่ใช้)
ALTER TABLE meter_drafts   ADD COLUMN IF NOT EXISTS ai_check jsonb;
ALTER TABLE meter_readings ADD COLUMN IF NOT EXISTS ai_check jsonb;

-- การยืนยัน/แก้ค่ามิเตอร์ที่ถูกทัก ค่าที่ถูกทักยังเป็นร่างอยู่ (ยังไม่มี id ของ meter_readings)
-- จึงอ้างด้วย แผง + รอบ + น้ำ/ไฟ และเติม reading_id ให้ตอนออกบิล
CREATE TABLE IF NOT EXISTS anomaly_reviews (
  id           bigserial PRIMARY KEY,
  stall_id     text    NOT NULL REFERENCES stalls(id),
  period       char(7) NOT NULL,
  utility      text    NOT NULL CHECK (utility IN ('water','elec')),
  decision     text    NOT NULL CHECK (decision IN ('confirmed','corrected')),
  old_value    numeric,
  new_value    numeric,
  prev_ack     boolean NOT NULL DEFAULT false,      -- สถานะ "ตรวจแล้ว" ก่อนบันทึก ใช้คืนค่าตอนเลิกทำ
  reading_id   integer REFERENCES meter_readings(id),
  source       text    NOT NULL DEFAULT 'behind',  -- behind = หน้าเบื้องหลัง AI · meters = หน้าจดมิเตอร์
  client_ref   text UNIQUE,                         -- กันบันทึกซ้ำเมื่อเน็ตหลุดแล้วกดใหม่
  reviewed_by  integer REFERENCES users(id),
  reviewed_at  timestamptz NOT NULL DEFAULT now(),
  undone_at    timestamptz                          -- ไม่ว่าง = ถูกเลิกทำ (ไม่ลบแถว)
);
CREATE INDEX IF NOT EXISTS anomaly_reviews_draft_idx ON anomaly_reviews (stall_id, period, reviewed_at DESC);
CREATE OR REPLACE VIEW anomaly_reviews_effective AS
  SELECT * FROM anomaly_reviews WHERE undone_at IS NULL;

-- รายงานการเปลี่ยนแปลงของข้อมูล (data drift) รายเดือน
CREATE TABLE IF NOT EXISTS drift_reports (
  id          serial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  model_type  text NOT NULL,
  as_of       date NOT NULL,
  report      jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS drift_reports_idx ON drift_reports (model_type, created_at DESC);

-- บทบาททีมพัฒนา/กรรมการ
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('staff','owner','vendor','admin'));
`;

const SQL_V3 = `
ALTER TABLE anomaly_reviews ADD COLUMN IF NOT EXISTS ai_snapshot jsonb;
UPDATE model_runs SET is_synthetic = EXISTS (SELECT 1 FROM vendors WHERE sim_discipline IS NOT NULL)
  WHERE sklearn_version IS NULL;
CREATE OR REPLACE VIEW anomaly_reviews_effective AS
  SELECT * FROM anomaly_reviews WHERE undone_at IS NULL;
`;

// ตารางเดียวกับ TABLE_SQL ใน ml/app/benchmark.py (ML สร้างเองด้วยเผื่อทำงานก่อน API)
const SQL_V4 = `
CREATE TABLE IF NOT EXISTS evaluation_batches (
  id serial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed')),
  progress int NOT NULL DEFAULT 0, total int, triggered_by text, error text, settings jsonb
);
CREATE TABLE IF NOT EXISTS model_evaluations (
  id serial PRIMARY KEY, batch_id int NOT NULL REFERENCES evaluation_batches(id) ON DELETE CASCADE,
  task text NOT NULL CHECK (task IN ('risk','anomaly')), dataset text NOT NULL, model text NOT NULL,
  n_rows int, positive_rate real, auc real, pr_auc real, precision real, recall real, f1 real, accuracy real, brier real,
  cv_auc_mean real, cv_auc_std real, extra jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, task, dataset, model)
);
`;

const ADMIN = { username: 'admin', password: 'admin1234', name: 'ทีมพัฒนา / กรรมการ' };

/** เพิ่มบัญชี admin สำหรับสาธิต (เฉพาะโหมดสาธิต ระบบจริงต้องสร้างเองพร้อมรหัสผ่านที่ปลอดภัย) */
async function ensureDemoAdmin(runner) {
  if (!config.demoMode) return;
  const hash = await bcrypt.hash(ADMIN.password, 10);
  await runner.query(
    `INSERT INTO users (username, password_hash, role, display_name) VALUES ($1, $2, 'admin', $3)
     ON CONFLICT (username) DO NOTHING`, [ADMIN.username, hash, ADMIN.name]);
}

async function currentVersion(client) {
  const r = await client.query("SELECT value FROM settings WHERE key = 'schema_version'");
  return Number(r.rows[0]?.value?.v || 1);
}

/** รัน migration ที่ยังไม่ได้รัน ใช้ advisory lock กันสอง instance รันพร้อมกัน */
async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(424243)');
    const v = await currentVersion(client);
    // ขั้นตอนเรียงตามรุ่น รันเฉพาะที่ยังไม่เคยรัน ทุกขั้นเขียนแบบรันซ้ำได้ (IF NOT EXISTS)
    const steps = [
      [2, async () => { await client.query(SQL_V2); await ensureDemoAdmin(client); }],
      [3, () => client.query(SQL_V3)],
      [4, () => client.query(SQL_V4)],
    ];
    for (const [to, run] of steps) if (v < to) await run();
    if (v < VERSION) {
      await client.query(`INSERT INTO settings (key, value) VALUES ('schema_version', $1)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify({ v: VERSION })]);
    }
    await client.query('COMMIT');
    return { from: v, to: Math.max(v, VERSION) };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/* ต่อหนึ่ง instance รันแค่ครั้งเดียว ถ้าล้มให้ลองใหม่ในคำขอถัดไป */
let pending = null;
function ensureMigrated() {
  if (!pending) pending = migrate().catch(e => { pending = null; throw e; });
  return pending;
}

/** middleware: รอให้ migration เสร็จก่อนเข้าทุก route ของ API (หลังครั้งแรกไม่มีค่าใช้จ่าย) */
const migrated = (_req, _res, next) => ensureMigrated().then(() => next(), next);

module.exports = { migrate, ensureMigrated, migrated, ensureDemoAdmin, ADMIN, VERSION };
