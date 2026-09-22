require('dotenv').config();

const secret = process.env.OMISE_SECRET_KEY || '';
const provider = process.env.PAYMENT_PROVIDER || (secret ? 'omise' : 'mock');

module.exports = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://market:market@localhost:5432/market',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  mlUrl: process.env.ML_URL || 'http://localhost:8000',
  paymentProvider: provider,                        // 'omise' | 'mock'
  omise: { publicKey: process.env.OMISE_PUBLIC_KEY || '', secretKey: secret },
  // โหมดทดสอบ: ใช้ปุ่มจำลองผลการชำระได้ (Omise test key หรือ mock)
  paymentTestMode: provider === 'mock' || secret.startsWith('skey_test_'),
  demoMode: (process.env.DEMO_MODE ?? 'true') === 'true',
  dailyCron: process.env.DAILY_JOB_CRON || '5 0 * * *',
};
