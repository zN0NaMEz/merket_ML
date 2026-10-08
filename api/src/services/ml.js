const config = require('../config');
const { HttpError } = require('../lib/http');

// การเทรนบนโฮสต์แพลนฟรีใช้ราว 40 วินาที จึงให้รอนานกว่าการเรียกทั่วไป
const TRAIN_TIMEOUT = 110000;
const PREDICT_TIMEOUT = 100000;

async function call(path, body, method = body ? 'POST' : 'GET', timeout = 60000) {
  let res;
  try {
    res = await fetch(config.mlUrl + path, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(config.mlApiKey ? { 'x-ml-key': config.mlApiKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new HttpError(503, 'ML service ไม่พร้อมใช้งาน ตรวจว่า ML service ทำงานอยู่ที่ ' + config.mlUrl);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status === 409 ? 409 : 502, `ML service: ${data.detail || res.status}`);
  return data;
}

module.exports = {
  health: () => call('/health'),
  // triggeredBy = ใครหรืออะไรสั่งเทรน บันทึกลง model_runs.triggered_by
  trainRisk: triggeredBy => call('/risk/train', { triggered_by: triggeredBy || null }, 'POST', TRAIN_TIMEOUT),
  riskMetrics: () => call('/risk/metrics'),
  scoreBills: (billIds, model) => call('/risk/score', { bill_ids: billIds, model }),
  // ทำนายจากไฟล์ที่เจ้าหน้าที่อัปโหลด รอนานกว่าปกติเผื่อบริการต้องตื่นจากการพัก (แพลนฟรีพักหลังว่าง 15 นาที)
  predictRows: rows => call('/risk/predict', { rows }, 'POST', PREDICT_TIMEOUT),
  trainAnomaly: triggeredBy => call('/anomaly/train', { triggered_by: triggeredBy || null }, 'POST', TRAIN_TIMEOUT),
  // รายงาน drift รายเดือน (RodeMap รอบ 5) ML คำนวณแล้วบันทึกลง drift_reports เอง
  // วัดผลโมเดลกับข้อมูลจำลองหลายชุด ML ตอบทันทีพร้อมเลขชุด แล้วรันต่อเบื้องหลัง
  runBenchmark: triggeredBy => call('/benchmark/run', { triggered_by: triggeredBy || null }, 'POST'),
  runDrift: triggeredBy => call('/drift/run', { triggered_by: triggeredBy || null }, 'POST', TRAIN_TIMEOUT),
  anomalyInfo: () => call('/anomaly/info'),
  checkReadings: (period, readings, ai) => call('/anomaly/check', {
    period, readings, method: ai.anomaly_method, z_threshold: Number(ai.z_threshold), if_threshold: Number(ai.if_threshold),
  }),
};
