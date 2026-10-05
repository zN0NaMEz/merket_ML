# แนวทางพัฒนาหน้า "เบื้องหลัง AI" ระบบบริหารตลาดบัญญัติทรัพย์

เอกสารนี้ใช้เป็นแผนงานและบริบทสำหรับ Claude Code ในการพัฒนาส่วนแสดงผลเบื้องหลังของ AI ให้คนในตลาดเข้าใจว่าโมเดลคิดอะไร ทำไมให้คะแนนแบบนั้น และเชื่อถือได้แค่ไหน

> สมมติฐาน: "การแสดงผลเบื้องหลัง" หมายถึงหน้าจอที่เปิดให้เห็นการทำงานของ AI (สถานะ เหตุผลของคะแนน คุณภาพโมเดล และข้อมูลที่ใช้เทรน) ไม่ใช่การรื้อสถาปัตยกรรม backend

---

## 1. สภาพปัจจุบัน (อ้างอิงจากโค้ดใน repo)

| ส่วน | สิ่งที่มีอยู่แล้ว |
|---|---|
| ML service (FastAPI, Render) | `POST /risk/train`, `GET /risk/metrics`, `POST /risk/score`, `POST /anomaly/train`, `GET /anomaly/info`, `POST /anomaly/check`, `GET /health` ใน `ml/app/main.py` |
| โมเดล Risk | Logistic Regression หรือ Random Forest, แบ่ง 75/25 + 5-fold CV, วัด AUC/precision/recall (`ml/app/risk.py`) |
| โมเดล Anomaly | z-score ร่วมกับ Isolation Forest |
| ฐานข้อมูล (Neon) | `model_runs` (ผลวัด), `model_blobs` (ตัวโมเดล), บิลมี `risk_score` และ `risk_features` |
| API (Express, Vercel) | เรียก ML ผ่าน `api/src/services/ml.js`, ตอบ 503 เมื่อ ML ไม่พร้อม, `rescoreOpenBills` หลังเทรน |
| หน้าเว็บ | หน้า AI มีปุ่มเทรนโมเดลใหม่ และกล่องแจ้งเมื่อ ML ล่ม |

ข้อจำกัดที่ต้องออกแบบรอบ: Render แพลนฟรีหลับเมื่อไม่มีคนเรียกเกิน 15 นาทีและหน่วยความจำจำกัด ดังนั้น **หน้าเบื้องหลังต้องอ่านจากฐานข้อมูลเป็นหลัก ไม่เรียก ML ทุกครั้งที่เปิดหน้า** เหมือนหลักการเดิมของระบบ

---

## 2. หลักการออกแบบ (คอนเซปต์ที่ใช้อ้างอิง)

1. **อธิบายสองระดับ** (local vs global explanation): ระดับรายการ ตอบว่า "ทำไมบิลนี้เสี่ยง" ระดับโมเดล ตอบว่า "โดยรวมโมเดลดูอะไรเป็นหลักและแม่นแค่ไหน" [R1][R2][R3]
2. **พูดภาษาผู้ใช้ ไม่ใช่ภาษาโมเดล**: แสดง "เคยจ่ายช้าเฉลี่ย 2.5 วัน" แทน `avg_days_late=2.5` และให้ผู้ใช้แต่ละกลุ่มเห็นรายละเอียดต่างกัน เจ้าหน้าที่เห็นเหตุผล เจ้าของเห็นภาพรวม กรรมการหรือทีมเห็นตัวชี้วัดเต็ม [R8][R9]
3. **บอกความไม่แน่นอนตรง ๆ**: แสดงคะแนนเป็นระดับ (ต่ำ/กลาง/สูง) คู่กับความน่าจะเป็นที่ผ่านการปรับเทียบ (calibration) และบอกเมื่อโมเดลไม่มั่นใจ [R5][R6]
4. **คนตัดสินใจสุดท้าย** (human-in-the-loop): AI ทักและให้เหตุผล คนกดยืนยันหรือแก้ แล้วเก็บผลไว้เป็น feedback [R9]
5. **ซื่อตรงเรื่องข้อมูล**: ทุกโมเดลมี "บัตรโมเดล" บอกว่าเทรนจากข้อมูลอะไร ช่วงเวลาไหน เป็นข้อมูลจริงหรือข้อมูลจำลอง และข้อจำกัดคืออะไร [R7][R10]
6. **ล้มอย่างสุภาพ** (fail-soft): ML หลับหรือล่ม หน้าเบื้องหลังยังแสดงข้อมูลล่าสุดที่บันทึกไว้ พร้อมบอกเวลาที่อัปเดตล่าสุด

---

## 3. โครงสร้างหน้าจอที่เสนอ

หน้า `/ai/behind` มีแถบสถานะอยู่บนสุด และเนื้อหาหลักแบ่งเป็นแท็บ เรียงจากสิ่งที่ผู้ใช้ถามบ่อยไปหารายละเอียดเชิงเทคนิค

```
┌──────────────────────────────────────────────────────────────┐
│ ● AI พร้อมใช้  ·  Risk (LR) เทรน 2 ต.ค. 14:20  ·  [ข้อมูลจำลอง] │  ← 3.1 แถบสถานะ
├──────────────────────────────────────────────────────────────┤
│ [ บิลเสี่ยง ] [ มิเตอร์ที่ถูกทัก ] [ คุณภาพโมเดล ] [ บัตรโมเดล ] │  ← แท็บตามบทบาท
├──────────────────────────────────────────────────────────────┤
│  เนื้อหาของแท็บ (3.2 / 3.3 / 3.4 / 3.5)                         │
│  ▸ รายละเอียดเชิงเทคนิค (accordion ปิดไว้ตั้งต้น)                 │
└──────────────────────────────────────────────────────────────┘
```

แท็บที่แต่ละบทบาทเห็น (ซ่อนที่หน้าเว็บ และ **ตรวจสิทธิ์ที่ API ด้วย** การซ่อนแท็บอย่างเดียวไม่ใช่การป้องกัน)

| บทบาท | แท็บที่เห็น | แท็บเริ่มต้น |
|---|---|---|
| เจ้าหน้าที่ (staff) | บิลเสี่ยง, มิเตอร์ที่ถูกทัก | มิเตอร์ที่ถูกทัก |
| เจ้าของ (owner) | บิลเสี่ยง, มิเตอร์ที่ถูกทัก, คุณภาพโมเดล (สรุป) | บิลเสี่ยง |
| ทีม/กรรมการ (admin) | ทุกแท็บ รวม accordion เทคนิค | คุณภาพโมเดล |

### 3.1 แถบสถานะ AI (บนสุดของหน้า)
แถบบรรทัดเดียว ไม่ใช่ section ใหญ่ เพื่อให้ผู้ใช้ไปถึงเหตุผลของบิลและมิเตอร์ได้เร็ว
- จุดสถานะ ML service: พร้อมใช้ / กำลังเปิด / ไม่ตอบ (จาก `GET /api/ai/status` พร้อม timeout สั้น)
- โมเดลที่ใช้อยู่และเวลาเทรนล่าสุด
- ป้าย "ข้อมูลจำลอง" เมื่อ `is_synthetic = true`
- กดแถบเพื่อเปิดรายละเอียด: เวอร์ชันโมเดล, จำนวนข้อมูลที่ใช้เทรน, รุ่น scikit-learn, เวลาที่ให้คะแนนล่าสุด, จำนวนบิลค้างที่ยังไม่มีคะแนน

### 3.2 ทำไมบิลนี้ได้คะแนนนี้ (Risk, ระดับรายการ)
- กราฟแท่งแนวนอนแสดงปัจจัย 3–5 อันดับแรกที่ดันคะแนนขึ้นหรือลง (สีต่างกันสองทิศ)
- ข้อความสรุปหนึ่งประโยคภาษาไทย เช่น "เสี่ยงสูง เพราะ 3 เดือนล่าสุดจ่ายเลยกำหนด 2 ครั้ง และยอดเดือนนี้สูงกว่าปกติ"
- บิลระดับเสี่ยงสูง: แสดงประโยคสรุปในกล่องเน้นสีแดง พร้อมไอคอนและคำว่า "ความเสี่ยงสูง" นำหน้า ใช้สี + ไอคอน + ข้อความพร้อมกัน ไม่ให้สีเป็นสิ่งเดียวที่บอกความหมาย (คนตาบอดสีและจอมือถือกลางแดดต้องอ่านได้) ระดับกลางใช้กล่องสีอ่อนกว่า ระดับต่ำไม่ต้องเน้น
- กล่องนี้เป็นมุมมองของเจ้าหน้าที่และเจ้าของเท่านั้น ห้ามแสดงคำว่า "เสี่ยงสูง" ในหน้าที่แม่ค้าเห็น
- วิธีคำนวณ:
  - Logistic Regression: contribution = coef × ค่าฟีเจอร์ที่ standardize แล้ว (คำนวณได้ทันที เบา)
  - Random Forest: SHAP TreeExplainer [R1] ถ้าหน่วยความจำบน Render ไม่พอ ให้ใช้ permutation importance ระดับโมเดล [R2] แทน และบอกบนหน้าจอว่าเป็นปัจจัยหลักของโมเดลโดยรวม ไม่ใช่ของบิลนี้
- **คำนวณตอนให้คะแนน แล้วเก็บลง `risk_features`** ไม่คำนวณตอนเปิดหน้า

### 3.3 ทำไมเลขมิเตอร์นี้ถูกทัก (Anomaly, ระดับรายการ)
- กราฟเส้นค่ามิเตอร์ย้อนหลังของร้านนั้น พร้อมแถบช่วงปกติ (ค่าเฉลี่ย ± k × SD) และจุดที่ถูกทัก
- จุดที่ถูกทักแสดงรายละเอียดเมื่อชี้เมาส์ (desktop) **หรือแตะ** (มือถือไม่มี hover): วันที่, ค่าที่อ่านได้, ค่าที่ระบบคาดไว้ (ค่าเฉลี่ย) และช่วงปกติ เช่น "อ่านได้ 412 หน่วย · คาดไว้ราว 95 หน่วย (ปกติ 70–120)" จุดที่ถูกทักใช้ทั้งสีและรูปทรงต่างจากจุดปกติ
- แสดง z-score เป็นภาษาคน เช่น "สูงกว่าปกติของร้านนี้ราว 4 เท่าของความแปรปรวน"
- แสดงผล Isolation Forest เป็นระดับ (ปกติ/น่าสงสัย/ผิดปกติ) [R4]
- ปุ่ม "ยืนยันค่าถูก" / "แก้ค่า" และบันทึกว่าใครยืนยัน

### 3.4 คุณภาพโมเดล (ระดับโมเดล)
- ตัวชี้วัดจากรอบเทรนล่าสุด: AUC, precision, recall พร้อมค่าเฉลี่ย ± SD จาก 5-fold CV
- Confusion matrix ของชุดทดสอบ 25%
- Calibration curve (reliability diagram) [R5][R6]
- ความสำคัญของฟีเจอร์ระดับโมเดล [R2]
- กราฟประวัติ: AUC ของแต่ละรอบเทรน เพื่อดูว่าโมเดลดีขึ้นหรือแย่ลง

### 3.5 บัตรโมเดลและประวัติการทำงาน
- บัตรโมเดล [R7]: วัตถุประสงค์, นิยามป้าย (เช่น "จ่ายช้า" = จ่ายหลังวันครบกำหนด), แหล่งข้อมูล, ช่วงเวลา, จำนวนแถว, **ข้อมูลจริงหรือจำลอง**, ข้อจำกัด, ผู้รับผิดชอบ
- Audit log: รอบเทรน, การให้คะแนนใหม่ (`rescoreOpenBills`), การยืนยันหรือแก้ค่ามิเตอร์

---

## 4. งานฝั่ง backend

### 4.1 ขยายตาราง `model_runs` (migration)

```sql
ALTER TABLE model_runs
  ADD COLUMN IF NOT EXISTS model_type        text,      -- 'risk_lr' | 'risk_rf' | 'anomaly'
  ADD COLUMN IF NOT EXISTS sklearn_version   text,
  ADD COLUMN IF NOT EXISTS n_train           int,
  ADD COLUMN IF NOT EXISTS n_test            int,
  ADD COLUMN IF NOT EXISTS data_from         date,
  ADD COLUMN IF NOT EXISTS data_to           date,
  ADD COLUMN IF NOT EXISTS is_synthetic      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cv_scores         jsonb,     -- {"auc":[...5 folds], ...}
  ADD COLUMN IF NOT EXISTS confusion         jsonb,     -- {"tn":..,"fp":..,"fn":..,"tp":..}
  ADD COLUMN IF NOT EXISTS calibration       jsonb,     -- {"prob_pred":[...],"prob_true":[...]}
  ADD COLUMN IF NOT EXISTS global_importance jsonb,     -- [{"feature":"..","value":..}, ...]
  ADD COLUMN IF NOT EXISTS triggered_by      text;
```

### 4.2 ตารางใหม่สำหรับ feedback ของมิเตอร์

```sql
CREATE TABLE IF NOT EXISTS anomaly_reviews (
  id           bigserial PRIMARY KEY,
  reading_id   bigint NOT NULL,
  decision     text   NOT NULL CHECK (decision IN ('confirmed','corrected')),
  old_value    numeric,
  new_value    numeric,
  reviewed_by  bigint,
  reviewed_at  timestamptz NOT NULL DEFAULT now()
);
```

### 4.3 ML service (`ml/app/`)
- ตอนเทรน: เก็บ `cv_scores`, `confusion`, `calibration` (ใช้ `sklearn.calibration.calibration_curve`) และ `global_importance` (ใช้ `sklearn.inspection.permutation_importance`) ลง `model_runs`
- ตอนให้คะแนน: คืน `contributions` (ปัจจัยหลักพร้อมทิศทาง) ใน response ของ `/risk/score` เพื่อให้ API เก็บลง `risk_features`
- `/anomaly/check` คืน `mean`, `std`, `z`, `iforest_score`, `window` (ช่วงข้อมูลย้อนหลังที่ใช้) เพื่อวาดกราฟช่วงปกติได้โดยไม่ต้องเรียกซ้ำ

### 4.4 API (`api/src/`)
เพิ่ม route กลุ่ม `/api/ai/*` ที่ **อ่านจาก Postgres เป็นหลัก**

| Route | อ่านจาก | หมายเหตุ |
|---|---|---|
| `GET /api/ai/status` | `/health` (timeout 3 วินาที) + `model_runs` ล่าสุด | ถ้า ML ไม่ตอบ ให้คืนสถานะ `asleep` ไม่ใช่ 503 |
| `GET /api/ai/bills/:id/explain` | `bills.risk_features` | ไม่เรียก ML |
| `GET /api/ai/readings/:id/explain` | ผลที่เก็บตอน `/anomaly/check` + ค่าย้อนหลัง | ไม่เรียก ML |
| `GET /api/ai/runs?model_type=` | `model_runs` | สำหรับกราฟประวัติ |
| `POST /api/ai/readings/:id/review` | เขียน `anomaly_reviews` | ต้องเป็นเจ้าหน้าที่ |

---

## 5. งานฝั่งหน้าเว็บ (Vite)

- **ไลบรารีกราฟ:** ตรวจก่อนว่าหน้าเว็บใช้ React หรือไม่ ถ้าใช้ React เลือก Recharts ถ้าไม่ใช้ เลือก Chart.js ใช้ตัวเดียวทั้งหน้า
- **ชื่อฟีเจอร์:** ไฟล์ mapping เป็นภาษาไทย เช่น `web/src/ai/featureLabels.js` ห้ามแสดงชื่อคอลัมน์ดิบ
- **มุมมองตามบทบาท:** ใช้แท็บตามตารางในหัวข้อ 3 และซ่อนรายละเอียดเทคนิค (ค่า SHAP ดิบ, CV ราย fold, รุ่นไลบรารี) ไว้ใน accordion ที่ปิดไว้ตั้งต้น หน้าจอเจ้าหน้าที่ต้องทำงานได้เร็วโดยไม่มีตัวชี้วัดเกะกะ
- **ป้าย "ข้อมูลจำลอง":** ใช้สีส้มหรือเหลืองอำพันที่ต่างจากสีสถานะ (เขียว = ปกติ, แดง = เสี่ยง/ผิดปกติ) ใช้ข้อความในป้ายเสมอ ไม่ใช้สีอย่างเดียว และแสดงซ้ำบนทุกแท็บที่มีตัวเลขจากโมเดล
- **สถานะพิเศษทุกส่วน:** เขียนให้บอกว่าเกิดอะไรขึ้นและผู้ใช้ทำอะไรต่อได้ น้ำเสียงเป็นมิตรแต่ไม่คลุมเครือ
  - กำลังโหลด: skeleton ของกราฟ
  - ML กำลังเปิด: "กำลังเปิดระบบ AI ใช้เวลาประมาณ 1 นาที ระหว่างนี้แสดงข้อมูลล่าสุดเมื่อ 14:20" พร้อมไอคอนเรียบ ๆ และไม่ล็อกหน้าจอ
  - ไม่มีข้อมูล: "ยังไม่มีโมเดลที่เทรนแล้ว กด 'เทรนโมเดลใหม่' ในหน้า AI เพื่อเริ่ม" พร้อมปุ่มพาไป
  - ML ไม่ตอบ: "ระบบ AI ไม่ตอบ การจ่ายเงินและดูบิลยังใช้ได้ตามปกติ"
- **ปริมาณจุดบนกราฟ:** มิเตอร์รายวันหนึ่งปีมีราว 365 จุดต่อร้าน Recharts รับได้สบาย ถ้าเกินราว 1,500 จุด (เช่น ดูหลายปี หรือข้อมูลรายชั่วโมง) ให้ API รวมข้อมูลเป็นรายสัปดาห์ก่อนส่ง (downsample ที่ฝั่ง server ไม่ใช่ที่มือถือ) และคงจุดที่ถูกทักไว้ทุกจุด
- **มือถือ:** เจ้าหน้าที่ใช้ในตลาด ทดสอบที่ความกว้าง 360 px และเป้าหมายการแตะอย่างน้อย 44 × 44 px
- **ข้อความ:** เขียนจากมุมผู้ใช้ เช่น "ทำไมบิลนี้เสี่ยง" แทน "Feature attribution"

---

## 6. แผนพัฒนาเป็นรอบ (Incremental)

| รอบ | ขอบเขต | เกณฑ์ว่าเสร็จ |
|---|---|---|
| 1 | สถานะ AI + บัตรโมเดล (3.1, 3.5) + migration 4.1 | เปิดหน้าได้ตอน ML หลับโดยไม่ error, เห็นวันเวลาเทรนล่าสุดและป้ายข้อมูลจริง/จำลอง |
| 2 | เหตุผลรายบิล (3.2) | ทุกบิลที่มีคะแนนแสดงปัจจัยหลักเป็นภาษาไทย, เปิดหน้าไม่เรียก ML |
| 3 | เหตุผลรายมิเตอร์ + ปุ่มยืนยัน (3.3, 4.2) | กราฟช่วงปกติถูกต้อง, การยืนยันถูกบันทึกพร้อมผู้ยืนยัน |
| 4 | คุณภาพโมเดลและประวัติ (3.4) | แสดง CV mean ± SD, confusion matrix, calibration curve, กราฟ AUC ข้ามรอบ |
| 5 | (เสริม) ตรวจการเปลี่ยนแปลงของข้อมูล (data drift) [R11] และใช้ `anomaly_reviews` ปรับเกณฑ์ | มีรายงาน drift รายเดือน |

---

## 7. ข้อควรระวัง

- **ห้ามคำนวณ explanation ตอนเปิดหน้า**: ML อาจหลับ ทำให้หน้าค้างถึง 1 นาที
- **SHAP หนัก**: แพ็กเกจและการคำนวณใช้หน่วยความจำมาก ทดสอบบน Render ก่อน ถ้าไม่ไหวใช้ทางเลือกตามข้อ 3.2
- **ระวัง data leakage**: ฟีเจอร์ที่รู้หลังวันครบกำหนด (เช่น วันที่จ่ายจริง) ห้ามใช้ทำนาย และห้ามโผล่เป็นเหตุผล
- **ตัวเลขที่แสดงต้องมาจากผลรันจริงเท่านั้น**: ห้ามใส่ค่าตัวอย่างหรือค่าจำลองในหน้าที่แสดงคุณภาพโมเดล ถ้ายังไม่มีผล ให้แสดงสถานะว่าง
- **รุ่น scikit-learn**: แสดงบนหน้าสถานะ และคงการตรวจรุ่นตอนโหลดจาก `model_blobs` ไว้
- **ความเป็นส่วนตัว**: หน้าเหตุผลห้ามแสดงเลขบัตรประชาชนหรือเบอร์โทร และจำกัดสิทธิ์ตามบทบาท (staff/owner)

---

## 8. Prompt สำหรับ Claude Code

วางเนื้อหาส่วนนี้ใน `CLAUDE.md` ของ repo เพื่อเป็นบริบทถาวร

```markdown
## AI behind-the-scenes view
- Read docs/ai-behind-the-scenes-roadmap.md before working on /ai/behind.
- Pages under /ai/behind must read from Postgres via /api/ai/*. Never call the ML service on page load.
- Display Thai, user-facing labels for features (web/src/ai/featureLabels.js). Never show raw column names.
- Every metric shown must come from model_runs. Show an empty state if none exist. Never hardcode or simulate metrics.
- Show a "ข้อมูลจำลอง" badge whenever model_runs.is_synthetic is true.
```

Prompt แยกตามรอบ (ใช้ทีละรอบ)

**รอบ 1**
```text
อ่าน ml/app/risk.py, ml/app/db.py, ml/app/main.py และ api/src/services/ml.js ก่อน
แล้วทำรอบ 1 ตาม docs/ai-behind-the-scenes-roadmap.md:
1) เขียน migration ตามหัวข้อ 4.1
2) แก้ขั้นตอนเทรนให้บันทึก n_train, n_test, data_from, data_to, sklearn_version, is_synthetic
3) เพิ่ม GET /api/ai/status ที่คืน asleep เมื่อ /health ไม่ตอบใน 3 วินาที
4) สร้างหน้า /ai/behind ส่วนสถานะและบัตรโมเดล พร้อมสถานะโหลด/ว่าง/หลับ
สรุปไฟล์ที่แก้ และวิธีทดสอบตอน ML หลับ
```

**รอบ 2**
```text
ทำรอบ 2: ให้ /risk/score คืน contributions (top 5 พร้อมทิศทาง)
- ถ้าโมเดลเป็น Logistic Regression ใช้ coef × ค่าที่ standardize แล้ว
- ถ้าเป็น Random Forest ลอง SHAP TreeExplainer และวัดหน่วยความจำ ถ้าเกินให้ fallback เป็น permutation importance และติดธง scope="global"
เก็บผลลง bills.risk_features เพิ่ม GET /api/ai/bills/:id/explain และหน้าแสดงกราฟปัจจัยพร้อมประโยคสรุปภาษาไทย
เขียน unit test ของการคำนวณ contributions
```

**รอบ 3–4**: ใช้รูปแบบเดียวกัน อ้างหัวข้อ 3.3, 3.4, 4.2 และเกณฑ์ในหัวข้อ 6

---

## 9. แหล่งอ้างอิง

| รหัส | แหล่ง | ใช้กับ |
|---|---|---|
| R1 | Lundberg, S. M., & Lee, S.-I. (2017). *A Unified Approach to Interpreting Model Predictions*. NeurIPS. https://arxiv.org/abs/1705.07874 และเอกสารไลบรารี https://shap.readthedocs.io/ | เหตุผลรายบิล (SHAP) |
| R2 | scikit-learn: Permutation feature importance. https://scikit-learn.org/stable/modules/permutation_importance.html | ความสำคัญของฟีเจอร์ระดับโมเดล |
| R3 | Molnar, C. *Interpretable Machine Learning*. https://christophm.github.io/interpretable-ml-book/ | ภาพรวมการอธิบายโมเดล, Logistic Regression |
| R4 | Liu, F. T., Ting, K. M., & Zhou, Z.-H. (2008). *Isolation Forest*. IEEE ICDM. https://doi.org/10.1109/ICDM.2008.17 และ https://scikit-learn.org/stable/modules/outlier_detection.html | การทักค่ามิเตอร์ |
| R5 | scikit-learn: Probability calibration. https://scikit-learn.org/stable/modules/calibration.html | Calibration curve |
| R6 | Niculescu-Mizil, A., & Caruana, R. (2005). *Predicting Good Probabilities with Supervised Learning*. ICML. https://doi.org/10.1145/1102351.1102430 | เหตุผลที่ต้องปรับเทียบความน่าจะเป็น |
| R7 | Mitchell, M. et al. (2019). *Model Cards for Model Reporting*. FAT*. https://arxiv.org/abs/1810.03993 | บัตรโมเดล |
| R8 | Google PAIR. *People + AI Guidebook* (Explainability + Trust). https://pair.withgoogle.com/guidebook/ | การอธิบายให้ผู้ใช้ทั่วไป |
| R9 | Amershi, S. et al. (2019). *Guidelines for Human-AI Interaction*. CHI. https://doi.org/10.1145/3290605.3300233 | Human-in-the-loop, การแก้ผลของ AI |
| R10 | Gebru, T. et al. (2021). *Datasheets for Datasets*. Communications of the ACM. https://arxiv.org/abs/1803.09010 | การบรรยายข้อมูลที่ใช้เทรน |
| R11 | Evidently (open source). https://github.com/evidentlyai/evidently | Data drift (รอบ 5) |
| R12 | Phillips, P. J. et al. (2021). *Four Principles of Explainable AI* (NIST IR 8312). https://doi.org/10.6028/NIST.IR.8312 | หลักการอธิบาย AI สำหรับอ้างในรายงาน |

> ตรวจลิงก์และรุ่นไลบรารีอีกครั้งก่อนอ้างในรายงาน เพราะเอกสารออนไลน์อาจย้ายหรือเปลี่ยนเวอร์ชัน