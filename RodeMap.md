# ข้อมูลจำลองหลายชุดและตารางวัดผลโมเดล — แผนและ Prompt สำหรับ Claude Code

ใช้คู่กับ `docs/ai-behind-the-scenes-roadmap.md` เอกสารนี้เพิ่มสองอย่างให้ระบบ AI ของตลาดบัญญัติทรัพย์

1. **ตัวสร้างข้อมูลจำลอง (synthetic data generator)** ที่สร้างได้หลายสถานการณ์ ทำซ้ำได้ด้วย seed และติดป้ายว่าเป็นข้อมูลจำลองเสมอ
2. **ตารางวัดผลโมเดล (model evaluation)** ที่เก็บตัวชี้วัดของโมเดลแต่ละตัว แยกตามชุดข้อมูลที่ใช้เทรนและชุดที่ใช้ทดสอบ

---

## 1. หลักการที่ต้องรักษา

1. **ข้อมูลจำลองแยกจากข้อมูลจริงเสมอ:** เก็บใน schema `sim` ไม่ปนกับตารางธุรกิจใน `public` หน้าเว็บของผู้ใช้จริงต้องไม่เห็นบิลหรือแม่ค้าจำลอง
2. **ทำซ้ำได้:** ทุกชุดข้อมูลมี `seed`, พารามิเตอร์ทั้งหมด และเวอร์ชันของตัวสร้าง สร้างซ้ำด้วยค่าเดิมต้องได้ข้อมูลเหมือนเดิมทุกแถว
3. **ตัวชี้วัดมาจากการรันจริงเท่านั้น:** ตาราง evaluation ถูกเขียนโดยโค้ดวัดผลอย่างเดียว ห้ามกรอกหรือแก้ตัวเลขด้วยมือ ห้ามปรับค่าให้ดูดีขึ้น
4. **ป้ายข้อมูลจำลองตามไปทุกที่:** ทุกผลวัดรู้ว่ามาจากชุดข้อมูลไหน และหน้าเว็บแสดงป้าย "ข้อมูลจำลอง" ทุกครั้ง
5. **คะแนนสูงบนข้อมูลจำลองไม่ใช่หลักฐานว่าใช้ได้จริง:** โมเดลอาจแค่เรียนรู้กฎที่เราเขียนไว้ในตัวสร้าง ต้องมี noise, baseline และการทดสอบข้ามสถานการณ์ (หัวข้อ 6) และต้องเขียนข้อจำกัดนี้ในบัตรโมเดล

---

## 2. ชุดข้อมูลจำลองที่เสนอ (scenario)

อิงโครงสร้างตลาดจากเอกสารออกแบบ: 3 โซน (ของสด · อาหารและเครื่องดื่ม · แฟชั่นและสินค้าทั่วไป), มิเตอร์น้ำและไฟแยกทุกร้าน, ผู้ค้าขาประจำมีสัญญาและมัดจำ, ขาจรใช้พื้นที่หน้าตลาด, ค้างเกิน 3 วันตัดน้ำไฟ

| ชื่อ | จุดประสงค์ | ตั้งค่าหลัก (ค่าเริ่มต้น ปรับได้) |
|---|---|---|
| `baseline` | สถานการณ์ปกติ ใช้เป็นชุดหลัก | 120 แผง, 12 เดือน, จ่ายช้า ~10% ของบิล, มิเตอร์ผิดปกติ ~1% |
| `high_late` | เศรษฐกิจฝืด แม่ค้าจ่ายช้ามาก | จ่ายช้า ~30%, ค้างเกิน 3 วันบ่อยขึ้น |
| `seasonal` | ช่วงเทศกาลและหน้าร้อน | การใช้ไฟและยอดขายขึ้นเป็นช่วง ทดสอบว่า anomaly ไม่ทักผิดตามฤดูกาล |
| `meter_errors` | เจ้าหน้าที่จดเลขผิดบ่อย | มิเตอร์ผิดปกติ ~5% ครบทุกชนิดในหัวข้อ 3.3 |
| `small_market` | ตลาดเล็กหรือเพิ่งเริ่มใช้ระบบ | 40 แผง, 3 เดือน ทดสอบว่าโมเดลทำงานได้ไหมเมื่อข้อมูลน้อย |
| `drift` | พฤติกรรมเปลี่ยนกลางปี | 6 เดือนแรกเหมือน `baseline` 6 เดือนหลังเหมือน `high_late` ทดสอบการเสื่อมของโมเดล |
| `label_noise` | ป้ายคำตอบไม่สมบูรณ์ | `baseline` + สลับป้าย 5% ทดสอบความทนทาน |

ทุกตัวเลขในตารางเป็นสมมติฐานของทีม ไม่ใช่สถิติของตลาดจริง ถ้าได้ข้อมูลจริงจากตลาด (เช่น จำนวนแผงจริง หรือสัดส่วนบิลค้างจริง) ให้ปรับ `baseline` ตาม และบันทึกแหล่งที่มาใน `params`

---

## 3. การออกแบบตัวสร้างข้อมูล

ตำแหน่ง: `ml/app/synth/` (Python, ใช้ `numpy.random.default_rng(seed)` ตัวเดียวทั้งชุด)

### 3.1 ไฟล์ตั้งค่าต่อ scenario
`ml/app/synth/scenarios/<name>.yaml` ตัวอย่าง

```yaml
name: baseline
generator_version: 1
seed: 20261004
period: { start: 2025-10-01, months: 12 }
zones:
  fresh:   { stalls: 50, base_kwh_per_day: [4, 9],  base_water_m3_per_day: [0.3, 0.8] }
  food:    { stalls: 40, base_kwh_per_day: [6, 14], base_water_m3_per_day: [0.5, 1.5] }
  fashion: { stalls: 30, base_kwh_per_day: [2, 5],  base_water_m3_per_day: [0.0, 0.1] }
walkin_front_zone: { slots: 15, daily_occupancy: [0.3, 0.9] }
billing: { cycle: monthly, due_days: 5, cutoff_after_days: 3 }
merchant_archetypes:          # สัดส่วนรวมต้องเท่ากับ 1
  punctual:    { share: 0.70, p_late: 0.03, late_days: [1, 2] }
  sometimes:   { share: 0.20, p_late: 0.25, late_days: [1, 4] }
  chronic:     { share: 0.10, p_late: 0.60, late_days: [2, 10] }
anomaly_injection:
  rate: 0.01
  types: { spike: 0.35, zero: 0.20, rollback: 0.20, digit_swap: 0.15, decimal_shift: 0.10 }
noise: { usage_sd_ratio: 0.15, label_flip_rate: 0.0 }
```

### 3.2 พฤติกรรมที่ต้องจำลอง
- **การใช้น้ำไฟ:** ค่าพื้นฐานต่อร้านตามโซน + วันในสัปดาห์ + ฤดูกาล (ถ้าเปิด) + noise ค่ามิเตอร์สะสมต้องเพิ่มขึ้นเสมอ ยกเว้นจุดที่ฉีดความผิดปกติ
- **การจ่ายเงิน:** แม่ค้าแต่ละคนสุ่ม archetype ครั้งเดียว แล้วใช้ตลอด ความน่าจะเป็นที่จ่ายช้าขึ้นกับ archetype, ยอดบิลเทียบกับปกติของร้าน และประวัติเดือนก่อน (ให้มีความสัมพันธ์จริงที่โมเดลเรียนรู้ได้ แต่ไม่ใช่กฎตายตัว)
- **การตัดน้ำไฟ:** ถ้าค้างเกิน `cutoff_after_days` สร้างแถวใน `utility_cuts` และคืนเมื่อจ่ายครบ
- **การจ่ายล่วงหน้า:** แม่ค้าบางส่วนจ่ายค่าแผงล่วงหน้ารายสัปดาห์หรือรายเดือน

### 3.3 ชนิดความผิดปกติของมิเตอร์ที่ฉีด
| ชนิด | ลักษณะ | สถานการณ์จริงที่เลียนแบบ |
|---|---|---|
| `spike` | ค่าพุ่ง 3–10 เท่าของปกติ | จดผิดหลัก หรือรั่วจริง |
| `zero` | การใช้เป็น 0 ในวันที่ร้านเปิด | ลืมจด หรือมิเตอร์เสีย |
| `rollback` | ค่าสะสมลดลง | จดสลับวัน |
| `digit_swap` | สลับตัวเลขสองหลัก | พิมพ์ผิด |
| `decimal_shift` | ค่าคูณหรือหารด้วย 10 | วางจุดทศนิยมผิด |

ทุกจุดที่ฉีดบันทึกใน `sim.ground_truth_anomalies` เพื่อใช้เป็นคำตอบตอนวัดผล ตารางนี้ **ห้าม** ถูกอ่านตอนเทรนหรือตอนให้คะแนน

### 3.4 การใช้งาน
```bash
python -m app.synth.generate --scenario baseline           # สร้างหนึ่งชุด
python -m app.synth.generate --scenario baseline --seed 7   # seed ใหม่ = ชุดใหม่ สถานการณ์เดิม
python -m app.synth.generate --all                          # สร้างทุก scenario
```

---

## 4. Schema ฐานข้อมูล

### 4.1 ทะเบียนชุดข้อมูล
```sql
CREATE SCHEMA IF NOT EXISTS sim;

CREATE TABLE IF NOT EXISTS sim.datasets (
  dataset_id         bigserial PRIMARY KEY,
  name               text NOT NULL,              -- เช่น 'baseline-s20261004'
  scenario           text NOT NULL,              -- 'baseline' | 'high_late' | ...
  seed               bigint NOT NULL,
  generator_version  int  NOT NULL,
  params             jsonb NOT NULL,             -- ค่าทั้งหมดจาก yaml หลังรวมค่าเริ่มต้น
  period_start       date NOT NULL,
  period_end         date NOT NULL,
  n_merchants        int, n_bills int, n_readings int,
  late_rate          numeric,                    -- สัดส่วนบิลจ่ายช้าที่เกิดขึ้นจริงในชุดนี้
  anomaly_rate       numeric,
  is_synthetic       boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenario, seed, generator_version)
);
```

### 4.2 ตารางข้อมูลจำลอง
สร้างใน schema `sim` ให้โครงสร้างเหมือนตารางจริงตาม ER Diagram (`zones`, `stalls`, `merchants`, `contracts`, `meters`, `meter_readings`, `invoices`, `invoice_items`, `payments`, `utility_cuts`, `walkin_bookings`) โดยเพิ่มคอลัมน์ `dataset_id bigint NOT NULL REFERENCES sim.datasets` และ index ที่ `dataset_id` ทุกตาราง

```sql
CREATE TABLE IF NOT EXISTS sim.ground_truth_anomalies (
  dataset_id    bigint NOT NULL REFERENCES sim.datasets ON DELETE CASCADE,
  reading_id    bigint NOT NULL,
  anomaly_type  text   NOT NULL,     -- spike | zero | rollback | digit_swap | decimal_shift
  true_value    numeric,             -- ค่าก่อนฉีด
  PRIMARY KEY (dataset_id, reading_id)
);
```

### 4.3 ตารางวัดผลโมเดล

ใช้ตารางหัว (header) หนึ่งแถวต่อการวัดหนึ่งครั้ง และตารางตัวชี้วัดแบบแถวยาว เพื่อเพิ่มตัวชี้วัดใหม่ได้โดยไม่ต้องแก้ schema

```sql
-- เชื่อมรอบเทรนกับชุดข้อมูล
ALTER TABLE model_runs
  ADD COLUMN IF NOT EXISTS train_dataset_id bigint REFERENCES sim.datasets,  -- NULL = ข้อมูลจริง
  ADD COLUMN IF NOT EXISTS model_name       text;  -- risk_lr | risk_rf | anomaly_z | anomaly_iforest | anomaly_combined

CREATE TABLE IF NOT EXISTS model_evaluations (
  evaluation_id     bigserial PRIMARY KEY,
  run_id            bigint NOT NULL REFERENCES model_runs ON DELETE CASCADE,
  model_name        text   NOT NULL,
  train_dataset_id  bigint REFERENCES sim.datasets,   -- NULL = ข้อมูลจริง
  eval_dataset_id   bigint REFERENCES sim.datasets,   -- NULL = ข้อมูลจริง
  split             text   NOT NULL CHECK (split IN ('cv_fold','cv_mean','holdout','time_holdout','cross_dataset')),
  fold              int,                               -- ใช้เมื่อ split = 'cv_fold'
  n_samples         int    NOT NULL,
  n_positive        int    NOT NULL,                   -- บิลจ่ายช้า หรือมิเตอร์ผิดปกติ
  threshold         numeric,                           -- จุดตัดที่ใช้คำนวณ precision/recall
  is_baseline       boolean NOT NULL DEFAULT false,    -- true = โมเดลเปรียบเทียบ (หัวข้อ 6.3)
  curves            jsonb,                             -- roc, pr, calibration, confusion
  code_version      text,                              -- git commit
  sklearn_version   text,
  evaluated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_eval_metrics (
  evaluation_id  bigint NOT NULL REFERENCES model_evaluations ON DELETE CASCADE,
  metric         text   NOT NULL,      -- ดูรายชื่อในหัวข้อ 5
  value          numeric NOT NULL,
  std            numeric,              -- ใช้กับ split = 'cv_mean'
  PRIMARY KEY (evaluation_id, metric)
);

-- view สำหรับหน้าเว็บ: หนึ่งแถวต่อการวัด ตัวชี้วัดหลักเป็นคอลัมน์
CREATE VIEW model_evaluation_summary AS
SELECT e.evaluation_id, e.model_name, e.split, e.is_baseline,
       td.name AS train_dataset, ed.name AS eval_dataset,
       COALESCE(ed.is_synthetic, false) AS eval_is_synthetic,
       e.n_samples, e.n_positive, e.evaluated_at,
       MAX(m.value) FILTER (WHERE m.metric = 'precision') AS precision,
       MAX(m.value) FILTER (WHERE m.metric = 'recall')    AS recall,
       MAX(m.value) FILTER (WHERE m.metric = 'f1')        AS f1,
       MAX(m.value) FILTER (WHERE m.metric = 'roc_auc')   AS roc_auc,
       MAX(m.value) FILTER (WHERE m.metric = 'pr_auc')    AS pr_auc
FROM model_evaluations e
LEFT JOIN sim.datasets td ON td.dataset_id = e.train_dataset_id
LEFT JOIN sim.datasets ed ON ed.dataset_id = e.eval_dataset_id
LEFT JOIN model_eval_metrics m ON m.evaluation_id = e.evaluation_id
GROUP BY e.evaluation_id, td.name, ed.name, ed.is_synthetic;
```

---

## 5. ตัวชี้วัดของโมเดลแต่ละตัว

### 5.1 Risk (ทำนายบิลจ่ายช้า): `risk_lr`, `risk_rf`
| metric | ความหมาย | หมายเหตุ |
|---|---|---|
| `accuracy` | สัดส่วนที่ทำนายถูกทั้งหมด | ดูคู่กับ baseline เสมอ เพราะข้อมูลไม่สมดุล |
| `balanced_accuracy` | ค่าเฉลี่ย recall ของสองกลุ่ม | |
| `precision` | ในบิลที่ทำนายว่าจะช้า ช้าจริงกี่ % | ที่ `threshold` |
| `recall` | บิลที่ช้าจริง จับได้กี่ % | ที่ `threshold` |
| `specificity` | บิลที่จ่ายตรงเวลา ทำนายถูกกี่ % | |
| `f1` | ค่ากลางของ precision และ recall | |
| `roc_auc` | ความสามารถจัดอันดับโดยรวม | |
| `pr_auc` | average precision | เหมาะกับข้อมูลไม่สมดุลกว่า ROC-AUC [E3] |
| `brier` | ความคลาดเคลื่อนของความน่าจะเป็น | ยิ่งต่ำยิ่งดี |
| `log_loss` | | ยิ่งต่ำยิ่งดี |
| `ece` | expected calibration error (10 bins) | ใช้คู่กับ calibration curve ใน `curves` |
| `positive_rate` | สัดส่วนบิลช้าในชุดที่วัด | ใช้ตีความทุกตัวชี้วัดข้างบน |

### 5.2 Anomaly (ทักเลขมิเตอร์): `anomaly_z`, `anomaly_iforest`, `anomaly_combined`
วัดเทียบกับ `sim.ground_truth_anomalies`
| metric | ความหมาย |
|---|---|
| `precision`, `recall`, `f1` | ที่เกณฑ์ที่ใช้งานจริง |
| `roc_auc`, `pr_auc` | จากคะแนนความผิดปกติ |
| `false_alarms_per_100` | จำนวนทักผิดต่อการจดมิเตอร์ 100 ครั้ง (ภาษาที่เจ้าหน้าที่เข้าใจ) |
| `precision_at_k` | ในรายการที่คะแนนสูงสุด k รายการ (ค่าเริ่มต้น k = 20) ผิดปกติจริงกี่รายการ |
| `recall_spike`, `recall_zero`, `recall_rollback`, `recall_digit_swap`, `recall_decimal_shift` | อัตราการจับได้แยกตามชนิดความผิดปกติ |

---

## 6. วิธีวัดผล (evaluation protocol)

### 6.1 การแบ่งข้อมูล
- `cv_fold` / `cv_mean`: stratified 5-fold บนชุดเทรน เก็บทุก fold และค่าเฉลี่ย ± SD
- `holdout`: 25% ที่แยกไว้ ไม่ใช้ตอนเลือกพารามิเตอร์
- `time_holdout`: เทรน 9 เดือนแรก ทดสอบ 3 เดือนสุดท้าย **เป็นตัวที่ใกล้การใช้งานจริงที่สุด** เพราะระบบจริงทำนายอนาคตจากอดีตเสมอ [E2]
- `cross_dataset`: เทรนบน scenario หนึ่ง ทดสอบบนอีก scenario หนึ่ง

### 6.2 ตารางข้ามสถานการณ์
รันทุกคู่ (เทรน × ทดสอบ) ของ `baseline`, `high_late`, `seasonal`, `drift` แล้วแสดงเป็น heatmap ของ `pr_auc` ทแยงมุมคือสถานการณ์เดียวกัน นอกทแยงบอกว่าโมเดลทนต่อการเปลี่ยนสถานการณ์แค่ไหน

### 6.3 Baseline ที่ต้องเทียบทุกครั้ง (`is_baseline = true`)
| โมเดล | baseline |
|---|---|
| Risk | `dummy_majority` (ทำนายว่าจ่ายตรงเวลาทุกใบ) และ `rule_last_month` (เดือนก่อนช้า → เดือนนี้ช้า) |
| Anomaly | `rule_fixed_band` (ทักเมื่อการใช้ต่างจากค่าเฉลี่ยร้านเกิน 50%) |

ถ้าโมเดล ML ไม่ชนะ baseline อย่างชัดเจน ให้รายงานตามจริง เป็นข้อมูลสำคัญสำหรับการตัดสินใจว่าควรใช้ ML หรือกฎธรรมดา

### 6.4 กัน data leakage [E4]
- ฟีเจอร์ของบิลต้องคำนวณจากข้อมูลที่รู้ก่อนวันครบกำหนดเท่านั้น
- `sim.ground_truth_anomalies`, `archetype` ของแม่ค้า และพารามิเตอร์ของตัวสร้าง ห้ามเป็นฟีเจอร์
- เขียน test ที่ล้มเมื่อมีคอลัมน์ต้องห้ามอยู่ในรายการฟีเจอร์

---

## 7. การแสดงผล (เชื่อมกับหน้า "เบื้องหลัง AI")

แท็บ "คุณภาพโมเดล" เพิ่ม
- ตัวกรอง: โมเดล, ชุดข้อมูลเทรน, ชุดข้อมูลทดสอบ, ประเภท split
- ตารางจาก `model_evaluation_summary` แถว baseline แสดงเป็นสีเทาไว้ใต้แถวโมเดลที่เทียบกัน
- heatmap ข้ามสถานการณ์ (6.2)
- ป้าย "ข้อมูลจำลอง · <ชื่อ scenario>" บนทุกแถวที่ `eval_is_synthetic = true`
- ถ้ายังไม่มีผลวัด แสดงสถานะว่างพร้อมคำสั่งที่ต้องรัน ห้ามแสดงตัวเลขตัวอย่าง

---

## 8. Prompt สำหรับ Claude Code

### 8.1 เพิ่มใน `CLAUDE.md`
```markdown
## Synthetic data and model evaluation
- Read docs/synthetic-data-and-evaluation-prompts.md before touching ml/app/synth or evaluation code.
- Synthetic data lives only in the `sim` schema. Never write synthetic rows into `public` business tables.
- Every generated dataset must be reproducible from (scenario, seed, generator_version).
- model_evaluations and model_eval_metrics are written only by evaluation code from real runs. Never hardcode, edit, smooth or simulate metric values.
- sim.ground_truth_anomalies, merchant archetypes and generator params must never be used as model features.
- Any UI showing metrics from synthetic datasets must show the "ข้อมูลจำลอง" badge with the scenario name.
- Definition of done per round: tests pass, the round's commands run end-to-end on a clean database, and you report what was created with row counts.
```

### 8.2 รอบ A — ตัวสร้างข้อมูล
```text
อ่าน docs/synthetic-data-and-evaluation-prompts.md หัวข้อ 1–3 และ ER ของตารางจริงใน repo ก่อน
สร้าง ml/app/synth/ ตามหัวข้อ 3:
1) ตัวโหลด scenario yaml พร้อมตรวจความถูกต้อง (สัดส่วน archetype รวมเท่ากับ 1, ค่าไม่ติดลบ)
2) ตัวสร้างข้อมูลทุกตารางตามหัวข้อ 3.2 ใช้ numpy default_rng(seed) ตัวเดียว
3) การฉีดความผิดปกติ 5 ชนิดตามหัวข้อ 3.3 และบันทึกคำตอบแยก
4) ไฟล์ scenario ทั้ง 7 ชุดในหัวข้อ 2
5) CLI ตามหัวข้อ 3.4 ที่เขียนผลเป็นไฟล์ parquet ใน ml/data/synth/<name>/ ก่อน (ยังไม่แตะฐานข้อมูล)
เขียน test: (ก) seed เดียวกันได้ผลเหมือนกันทุกแถว (ข) ค่ามิเตอร์สะสมไม่ลดลงยกเว้นจุดที่ฉีด rollback
(ค) late_rate และ anomaly_rate ที่ได้อยู่ใกล้ค่าที่ตั้ง (ง) แม่ค้าคนเดียวมี archetype เดียวตลอด
สรุปจำนวนแถวของแต่ละตารางในแต่ละ scenario
```

### 8.3 รอบ B — เก็บลงฐานข้อมูล
```text
ทำหัวข้อ 4.1 และ 4.2:
1) migration สร้าง schema sim, sim.datasets, ตารางจำลองที่โครงสร้างเหมือนตารางจริง + dataset_id, sim.ground_truth_anomalies
2) คำสั่ง python -m app.synth.load --scenario <name> [--seed N] ที่โหลด parquet เข้า sim และลงทะเบียนใน sim.datasets
   ถ้า (scenario, seed, generator_version) มีอยู่แล้ว ให้ข้าม ไม่สร้างซ้ำ
3) คำสั่งลบชุดข้อมูลตาม dataset_id (ON DELETE CASCADE)
ตรวจว่าไม่มีแถวใดถูกเขียนลง schema public และรายงานจำนวนแถวที่โหลด
```

### 8.4 รอบ C — เทรนจากชุดข้อมูลที่เลือก
```text
แก้ ml/app/risk.py และโค้ด anomaly ให้รับ dataset_id (None = ข้อมูลจริงใน public)
- POST /risk/train และ /anomaly/train รับ { "dataset_id": ... } แบบไม่บังคับ
- บันทึก train_dataset_id และ model_name ลง model_runs
- โมเดลที่เทรนจากข้อมูลจำลองต้องไม่ถูกตั้งเป็นโมเดลที่ใช้ให้คะแนนบิลจริงโดยอัตโนมัติ
  (ต้องมีขั้นยืนยันแยก และบันทึกว่าใครยืนยัน)
เพิ่ม test กัน leakage ตามหัวข้อ 6.4
```

### 8.5 รอบ D — ตารางวัดผลและสคริปต์วัดผล
```text
ทำหัวข้อ 4.3, 5 และ 6.1, 6.3:
1) migration สร้าง model_evaluations, model_eval_metrics และ view model_evaluation_summary
2) ml/app/evaluate.py ที่คำนวณตัวชี้วัดทุกตัวในหัวข้อ 5 ด้วย sklearn.metrics
   และเก็บ curves (roc, pr, calibration, confusion) เป็น jsonb
3) รัน split ครบ: cv_fold ทั้ง 5 fold, cv_mean, holdout, time_holdout
4) รัน baseline ตามหัวข้อ 6.3 ทุกครั้งที่วัดผล และติด is_baseline = true
5) CLI: python -m app.evaluate --run-id <id> --eval-dataset <id|real>
เขียน test เทียบตัวชี้วัดกับค่าที่คำนวณมือจากชุดข้อมูลเล็ก ๆ ที่รู้คำตอบ
ห้ามปัดหรือปรับค่าก่อนบันทึก
```

### 8.6 รอบ E — ข้ามสถานการณ์และหน้าเว็บ
```text
ทำหัวข้อ 6.2 และ 7:
1) python -m app.evaluate --cross baseline,high_late,seasonal,drift เทรนและวัดทุกคู่ บันทึก split = cross_dataset
2) API GET /api/ai/evaluations (ตัวกรองตามหัวข้อ 7) อ่านจาก model_evaluation_summary
3) แท็บ "คุณภาพโมเดล": ตาราง, แถว baseline, heatmap pr_auc, ป้ายข้อมูลจำลอง, สถานะว่าง/โหลด/error
ก่อนจบรอบ: รายงานตารางสถานะของหน้าเว็บที่ทำแล้วพร้อมวิธีตรวจ
```

---

## 9. ข้อควรระวัง

- **อย่าปรับตัวสร้างเพื่อให้คะแนนโมเดลสูง:** ถ้าเปลี่ยนพารามิเตอร์ ให้เพิ่ม `generator_version` และวัดผลใหม่ทั้งชุด ผลเก่ายังเก็บไว้เทียบได้
- **รายงานผลพร้อมชื่อชุดข้อมูลเสมอ:** เช่น "PR-AUC 0.81 บน `baseline` (ข้อมูลจำลอง), time_holdout" ไม่ใช่ "PR-AUC 0.81"
- **ขนาดข้อมูลบนแพลนฟรี:** 120 แผง × 2 มิเตอร์ × 365 วัน ≈ 87,600 แถวต่อชุด 7 ชุดยังอยู่ในโควตาฟรีของ Neon ได้ แต่ควรตรวจพื้นที่ก่อนสร้างหลาย seed และลบชุดที่ไม่ใช้
- **การเทรนบน Render ใช้เวลาจำกัด:** การวัดข้ามสถานการณ์หลายคู่ควรรันบนเครื่องตัวเองหรือ GitHub Actions แล้วเขียนผลเข้าฐานข้อมูล ไม่รันผ่าน endpoint ที่มี timeout 110 วินาที

---

## 10. แหล่งอ้างอิง

| รหัส | แหล่ง | ใช้กับ |
|---|---|---|
| E1 | scikit-learn: Metrics and scoring. https://scikit-learn.org/stable/modules/model_evaluation.html | ตัวชี้วัดทั้งหมดในหัวข้อ 5 |
| E2 | scikit-learn: Cross-validation (รวม TimeSeriesSplit). https://scikit-learn.org/stable/modules/cross_validation.html | การแบ่งข้อมูลในหัวข้อ 6.1 |
| E3 | Saito, T., & Rehmsmeier, M. (2015). *The Precision-Recall Plot Is More Informative than the ROC Plot When Evaluating Binary Classifiers on Imbalanced Datasets*. PLOS ONE. https://doi.org/10.1371/journal.pone.0118432 | เหตุผลที่ใช้ PR-AUC |
| E4 | Kapoor, S., & Narayanan, A. (2023). *Leakage and the reproducibility crisis in machine-learning-based science*. Patterns. https://doi.org/10.1016/j.patter.2023.100804 | การกัน data leakage |
| E5 | Jordon, J. et al. (2022). *Synthetic Data — what, why and how?* https://arxiv.org/abs/2205.03257 | ข้อดีและข้อจำกัดของข้อมูลจำลอง |
| E6 | Mitchell, M. et al. (2019). *Model Cards for Model Reporting*. https://arxiv.org/abs/1810.03993 | เขียนข้อจำกัดของผลบนข้อมูลจำลองในบัตรโมเดล |
| E7 | Liu, F. T., Ting, K. M., & Zhou, Z.-H. (2008). *Isolation Forest*. IEEE ICDM. https://doi.org/10.1109/ICDM.2008.17 | โมเดล anomaly |

> ตรวจลิงก์และรุ่นไลบรารีอีกครั้งก่อนอ้างในรายงาน