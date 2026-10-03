/**
 * สถานะของ ML service สำหรับแถบสถานะในหน้าเบื้องหลัง AI (RodeMap.md 3.1, 4.4)
 *
 *   ready   /health ตอบ 200 ภายในเวลาที่กำหนด
 *   asleep  รอแล้วไม่ตอบภายในเวลาที่กำหนด: บน Render แพลนฟรีคือกำลังตื่น (คำขอนี้ปลุกให้แล้ว ราว 1 นาที)
 *   down    ต่อไม่ได้เลย ตอบ error หรือไม่ได้ตั้ง ML_URL
 *
 * ไม่โยน error ออกไป หน้าเว็บต้องเปิดได้เสมอแม้ ML จะหลับหรือล่ม
 */
const HEALTH_TIMEOUT_MS = 3000;

async function pingHealth(url, { timeoutMs = HEALTH_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  if (!url) return { state: 'down', ms: 0, detail: 'ยังไม่ได้ตั้ง ML_URL' };
  const t0 = Date.now();
  try {
    const res = await fetchImpl(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    const ms = Date.now() - t0;
    return res.ok ? { state: 'ready', ms } : { state: 'down', ms, detail: `HTTP ${res.status}` };
  } catch (e) {
    const ms = Date.now() - t0;
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return timedOut ? { state: 'asleep', ms, detail: `ไม่ตอบใน ${timeoutMs / 1000} วินาที` } : { state: 'down', ms, detail: e?.cause?.code || e?.message || 'ต่อไม่ได้' };
  }
}

/** header สำหรับ CDN ของ Vercel: คำขอซ้ำภายใน 15 วินาทีได้คำตอบจาก CDN โดยไม่เรียกฟังก์ชันและไม่ปลุก Render ซ้ำ */
const STATUS_CACHE = 'public, s-maxage=15, stale-while-revalidate=30';

module.exports = { pingHealth, HEALTH_TIMEOUT_MS, STATUS_CACHE };
