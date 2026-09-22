FROM node:20-alpine
WORKDIR /app
ENV TZ=Asia/Bangkok
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 4000
# สร้างข้อมูลตัวอย่างครั้งแรก (ถ้าฐานข้อมูลว่าง) แล้วเริ่ม API
CMD ["sh", "-c", "node src/seed/seed.js --if-empty && node src/index.js"]
