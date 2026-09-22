# ML Service — ระบบบริหารตลาดบัญญัติทรัพย์

บริการภายในที่ Backend (Node.js) เรียกใช้ ไม่ได้ออกแบบมาให้ผู้ใช้ทั่วไปเปิดตรง ๆ

| โมเดล | งาน | อัลกอริทึม |
|---|---|---|
| Risk | ทำนายความเสี่ยงค้างชำระของบิล | Logistic Regression / Random Forest |
| Anomaly | ตรวจค่ามิเตอร์น้ำ–ไฟผิดปกติก่อนออกบิล | z-score + Isolation Forest |

## ตัวแปรที่ต้องตั้ง

| ชื่อ | ประเภท | คำอธิบาย |
|---|---|---|
| `DATABASE_URL` | Secret | connection string ของ PostgreSQL ที่ใช้เป็นข้อมูลเทรน |
| `ML_API_KEY` | Secret | กุญแจร่วมกับ Backend ถ้าเว้นว่างจะเปิดให้เรียกได้โดยไม่ตรวจสิทธิ์ |

ทุก endpoint ยกเว้น `/health` ต้องส่ง header `x-ml-key` ให้ตรงกับ `ML_API_KEY`

## Endpoint

`GET /health` · `POST /risk/train` · `GET /risk/metrics` · `POST /risk/score` · `POST /anomaly/train` · `GET /anomaly/info` · `POST /anomaly/check`
