const config = require('../config');
const { HttpError } = require('../lib/http');

async function call(path, body, method = body ? 'POST' : 'GET') {
  let res;
  try {
    res = await fetch(config.mlUrl + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
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
  trainRisk: () => call('/risk/train', {}),
  riskMetrics: () => call('/risk/metrics'),
  scoreBills: (billIds, model) => call('/risk/score', { bill_ids: billIds, model }),
  trainAnomaly: () => call('/anomaly/train', {}),
  anomalyInfo: () => call('/anomaly/info'),
  checkReadings: (period, readings, ai) => call('/anomaly/check', {
    period, readings, method: ai.anomaly_method, z_threshold: Number(ai.z_threshold), if_threshold: Number(ai.if_threshold),
  }),
};
