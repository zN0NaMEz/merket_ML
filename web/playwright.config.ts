import { defineConfig } from '@playwright/test';

/*
 * ตรวจ UI บนมือถือตาม RodeMap.md หัวข้อ 6 ที่ viewport 390 × 844
 * ต้องมีเว็บ + API ที่รันอยู่ (ค่าเริ่มต้น http://localhost:5173) และใช้ Chrome ที่ติดตั้งในเครื่อง
 *   UI_BASE_URL=http://localhost:5173 npm run test:ui
 */
export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.UI_BASE_URL || 'http://localhost:5173',
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'th-TH',
  },
});
