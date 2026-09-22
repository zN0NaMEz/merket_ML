FROM python:3.12-slim

# ไม่รันเป็น root และเตรียมสิทธิ์เขียนโฟลเดอร์โมเดลไว้ล่วงหน้า
# ภาพเดียวกันนี้ใช้ได้ทั้ง docker compose ในเครื่องและโฮสต์ภายนอกที่บังคับ uid 1000
RUN useradd --create-home --uid 1000 app

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
ENV MODEL_DIR=/app/models
RUN mkdir -p /app/models && chown -R app:app /app

USER app

# Render และโฮสต์อื่นกำหนดพอร์ตมาทางตัวแปร PORT ส่วน docker compose ใช้ค่าเริ่มต้น 8000 ตามเดิม
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
