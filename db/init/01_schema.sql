-- ระบบบริหารตลาดบัญญัติทรัพย์ : โครงสร้างฐานข้อมูล (PostgreSQL)
-- การจับคู่กับ DFD
--   D1 ผู้ค้า           -> vendors (+ users สำหรับเข้าสู่ระบบ)
--   D2 แผง/โซน         -> stall_types, stalls, walkin_bookings
--   D3 สัญญาเช่า        -> contracts
--   D4 เลขมิเตอร์       -> meter_readings (+ meter_drafts ระหว่างจด, anomaly_logs ผล AI)
--   D5 บิล             -> bills
--   D6 การชำระเงิน      -> payments, payment_bills
--   D7 การแจ้งเตือน     -> notifications

CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS stall_types (
  code         text PRIMARY KEY,
  name         text NOT NULL,
  zone         text NOT NULL,
  monthly_rent integer NOT NULL CHECK (monthly_rent >= 0)
);

CREATE TABLE IF NOT EXISTS stalls (
  id              text PRIMARY KEY,               -- เช่น A-01
  type_code       text NOT NULL REFERENCES stall_types(code),
  utility_status  text NOT NULL DEFAULT 'on' CHECK (utility_status IN ('on','cut')),
  cut_date        date,
  restore_pending boolean NOT NULL DEFAULT false,
  init_water      integer NOT NULL DEFAULT 0,     -- เลขมิเตอร์ตั้งต้นของแผง
  init_elec       integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vendors (
  id            serial PRIMARY KEY,
  code          text UNIQUE NOT NULL,             -- รหัสผู้ค้า เช่น V01
  full_name     text NOT NULL,
  phone         text NOT NULL,
  stall_id      text UNIQUE REFERENCES stalls(id),
  since         date NOT NULL,                    -- วันที่เริ่มเช่า
  credit        integer NOT NULL DEFAULT 0,       -- ยอดชำระล่วงหน้าคงเหลือ
  active        boolean NOT NULL DEFAULT true,
  -- คอลัมน์ sim_* ใช้เฉพาะโหมดสาธิต เพื่อจำลองพฤติกรรมผู้ค้าคนอื่น ไม่ถูกส่งไปให้โมเดล ML
  sim_discipline real,
  sim_scale_w    real,
  sim_scale_e    real,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            serial PRIMARY KEY,
  username      text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('staff','owner','vendor')),
  vendor_id     integer REFERENCES vendors(id),
  display_name  text NOT NULL
);

CREATE TABLE IF NOT EXISTS contracts (
  id         serial PRIMARY KEY,
  vendor_id  integer NOT NULL REFERENCES vendors(id),
  stall_id   text NOT NULL REFERENCES stalls(id),
  start_date date NOT NULL,
  end_date   date NOT NULL,
  deposit    integer NOT NULL DEFAULT 0,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended'))
);

CREATE TABLE IF NOT EXISTS meter_readings (
  id          serial PRIMARY KEY,
  stall_id    text NOT NULL REFERENCES stalls(id),
  period      char(7) NOT NULL,                   -- YYYY-MM รอบการใช้งาน
  prev_water  integer NOT NULL,
  cur_water   integer NOT NULL,
  prev_elec   integer NOT NULL,
  cur_elec    integer NOT NULL,
  use_water   integer NOT NULL,
  use_elec    integer NOT NULL,
  recorded_on date NOT NULL,
  recorded_by integer REFERENCES users(id),
  flagged     boolean NOT NULL DEFAULT false,
  UNIQUE (stall_id, period)
);

CREATE TABLE IF NOT EXISTS meter_drafts (
  stall_id     text NOT NULL REFERENCES stalls(id),
  period       char(7) NOT NULL,
  cur_water    integer,
  cur_elec     integer,
  ack          boolean NOT NULL DEFAULT false,    -- เจ้าหน้าที่ยืนยันว่าค่าที่ AI เตือนถูกต้อง
  ever_flagged boolean NOT NULL DEFAULT false,
  flag_reason  text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stall_id, period)
);

CREATE TABLE IF NOT EXISTS anomaly_logs (
  id          serial PRIMARY KEY,
  stall_id    text NOT NULL REFERENCES stalls(id),
  period      char(7) NOT NULL,
  detected_on date NOT NULL,
  reason      text NOT NULL,
  resolution  text NOT NULL,
  if_score    real,
  method      text
);

CREATE TABLE IF NOT EXISTS bills (
  id                serial PRIMARY KEY,
  bill_no           text UNIQUE NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('monthly','advance')),
  vendor_id         integer NOT NULL REFERENCES vendors(id),
  stall_id          text NOT NULL REFERENCES stalls(id),
  period            char(7),
  label             text,
  rent              integer NOT NULL DEFAULT 0,
  credit_used       integer NOT NULL DEFAULT 0,
  use_water         integer NOT NULL DEFAULT 0,
  use_elec          integer NOT NULL DEFAULT 0,
  water_rate        integer NOT NULL DEFAULT 0,
  elec_rate         integer NOT NULL DEFAULT 0,
  water_amount      integer NOT NULL DEFAULT 0,
  elec_amount       integer NOT NULL DEFAULT 0,
  total             integer NOT NULL,
  issue_date        date NOT NULL,
  due_date          date NOT NULL,
  status            text NOT NULL CHECK (status IN ('unpaid','overdue','paid','cancelled')),
  paid_date         date,
  payment_id        integer,
  risk_score        real,
  risk_features     jsonb,
  risk_model        text,
  early_reminded_on date,
  escalated_on      date,
  sim_pay_date      date                           -- โหมดสาธิตเท่านั้น
);
CREATE INDEX IF NOT EXISTS bills_vendor_idx ON bills(vendor_id, period);
CREATE INDEX IF NOT EXISTS bills_status_idx ON bills(status);

CREATE TABLE IF NOT EXISTS walkin_bookings (
  id           serial PRIMARY KEY,
  booking_no   text UNIQUE NOT NULL,
  full_name    text NOT NULL,
  phone        text NOT NULL,
  product      text NOT NULL,
  booking_date date NOT NULL,
  spot         text NOT NULL,
  fee          integer NOT NULL,
  status       text NOT NULL CHECK (status IN ('pending','paid','cancelled')),
  created_by   text NOT NULL CHECK (created_by IN ('walkin','staff')),
  payment_id   integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS walkin_spot_uniq ON walkin_bookings(booking_date, spot) WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS payments (
  id                 serial PRIMARY KEY,
  ref_no             text UNIQUE NOT NULL,
  provider           text NOT NULL CHECK (provider IN ('omise','mock','cash','simulated','aggregate')),
  provider_charge_id text,
  access_token       text NOT NULL,
  amount             integer NOT NULL,
  status             text NOT NULL CHECK (status IN ('pending','successful','failed','expired','cancelled')),
  payer              text NOT NULL,              -- 'vendor:<id>' หรือ 'walkin:<phone>'
  vendor_id          integer REFERENCES vendors(id),
  booking_id         integer REFERENCES walkin_bookings(id),
  qr_url             text,
  failure_message    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  paid_date          date,
  receipt_no         text UNIQUE,
  raw                jsonb
);
CREATE INDEX IF NOT EXISTS payments_charge_idx ON payments(provider_charge_id);

CREATE TABLE IF NOT EXISTS payment_bills (
  payment_id integer NOT NULL REFERENCES payments(id),
  bill_id    integer NOT NULL REFERENCES bills(id),
  amount     integer NOT NULL,
  PRIMARY KEY (payment_id, bill_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         serial PRIMARY KEY,
  recipient  text NOT NULL,                       -- 'staff' | 'owner' | 'vendor:<id>' | 'walkin:<phone>'
  kind       text NOT NULL,                       -- bill | overdue | ai | utility | payment | system
  message    text NOT NULL,
  created_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient, created_on DESC);

CREATE TABLE IF NOT EXISTS job_logs (
  id         serial PRIMARY KEY,
  run_date   date NOT NULL,
  job        text NOT NULL,
  summary    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_runs (
  id         serial PRIMARY KEY,
  model_type text NOT NULL,                       -- risk | anomaly
  trained_at timestamptz NOT NULL DEFAULT now(),
  metrics    jsonb NOT NULL
);

-- โมเดลที่เทรนเสร็จแล้ว เก็บเป็นไบนารีไว้ในฐานข้อมูล
-- ใช้ตอน ML service ไปรันบนโฮสต์ที่ไม่มีดิสก์ถาวร จะได้โหลดมาใช้เลยแทนการเทรนใหม่ทุกครั้งที่รีสตาร์ท
CREATE TABLE IF NOT EXISTS model_blobs (
  model_type text PRIMARY KEY,                    -- risk | anomaly
  trained_at timestamptz NOT NULL DEFAULT now(),
  sklearn_ver text NOT NULL,
  payload    bytea NOT NULL,
  meta       jsonb NOT NULL
);
