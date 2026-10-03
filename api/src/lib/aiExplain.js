/**
 * จัดรูปคำอธิบายรายบิลจาก bills.risk_features สำหรับหน้าเบื้องหลัง AI (RodeMap 3.2)
 * ไม่เรียก ML: contributions ถูกคำนวณตอนให้คะแนนแล้วเก็บไว้ในฐานข้อมูล
 * แยกเป็นฟังก์ชันล้วนเพื่อทดสอบได้โดยไม่ต้องมีฐานข้อมูล
 */
const { riskLevel } = require('./risk');

/** ฟีเจอร์ที่โมเดลใช้จริง ค่าอื่นใน risk_features (เช่น ข้อมูลภายใน) ไม่ถูกส่งออก */
const FEATURE_KEYS = ['late_count', 'avg_days_late', 'bill_ratio', 'tenure_years', 'stall_type', 'season', 'n_prior'];

const pickFeatures = rf => Object.fromEntries(FEATURE_KEYS.filter(k => rf?.[k] !== undefined).map(k => [k, rf[k]]));

/** ปัจจัยที่ใช้ได้: มีชื่อฟีเจอร์ และทิศทางถูกต้อง ไม่เกิน 5 ตัว */
function cleanContributions(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(c => c && typeof c.feature === 'string' && ['up', 'down', 'none'].includes(c.direction))
    .slice(0, 5)
    .map(c => ({ feature: c.feature, value: c.value ?? null, direction: c.direction, contribution: Number(c.contribution) || 0 }));
}

/**
 * bill = แถวจาก bills (+ full_name ของผู้ค้า) · ai = settings.ai() · run = รอบเทรนล่าสุดของโมเดลที่ให้คะแนนบิลนี้
 * คืนข้อมูลที่หน้าเว็บต้องใช้ทั้งหมด และไม่มีเบอร์โทรหรือเลขบัตรของผู้ค้า
 */
function explainView(bill, ai, run) {
  const rf = bill.risk_features || null;
  const scored = bill.risk_score != null;
  const contributions = cleanContributions(rf?.contributions);
  const explain = rf?.explain || null;
  const scope = !contributions.length ? 'none' : explain?.scope === 'global' ? 'global' : 'local';
  const scoredAt = bill.risk_scored_at ? new Date(bill.risk_scored_at) : null;
  const trainedAt = run?.trained_at ? new Date(run.trained_at) : null;
  return {
    bill: {
      id: bill.id, bill_no: bill.bill_no, stall_id: bill.stall_id, vendor_name: bill.full_name ?? null,
      period: bill.period, total: bill.total, due_date: bill.due_date, status: bill.status,
    },
    scored,
    score: scored ? Number(bill.risk_score) : null,
    level: riskLevel(bill.risk_score, ai),
    thresholds: { high: ai.risk_high, mid: ai.risk_mid },
    model: bill.risk_model || null,
    scored_at: bill.risk_scored_at || null,
    features: pickFeatures(rf),
    contributions,
    explain: explain && { method: explain.method || null, scope: explain.scope || null, unit: explain.unit || null, base: explain.base ?? null },
    scope,
    // บิลที่ให้คะแนนด้วยรุ่นก่อนเพิ่มคำอธิบาย มีแต่เหตุผลแบบข้อความ ใช้แสดงแทนได้
    legacy_reasons: !contributions.length && Array.isArray(rf?.reasons) ? rf.reasons.slice(0, 5) : [],
    // ให้คะแนนก่อนรอบเทรนล่าสุด = คำอธิบายนี้มาจากโมเดลรุ่นก่อน
    stale: Boolean(scoredAt && trainedAt && scoredAt < trainedAt),
    is_synthetic: run?.is_synthetic ?? null,
    run: run ? { run_id: run.id, model_type: run.model_type, trained_at: run.trained_at } : null,
  };
}

/** แถวสั้นสำหรับรายการบิล: ปัจจัยแรกพอให้เห็นภาพ ไม่ต้องโหลดคำอธิบายเต็มทุกใบ */
function listRow(bill, ai) {
  const contributions = cleanContributions(bill.risk_features?.contributions);
  const lead = bill.risk_score != null && bill.risk_score >= ai.risk_mid
    ? contributions.find(c => c.direction === 'up') : contributions.find(c => c.direction === 'down');
  return {
    id: bill.id, stall_id: bill.stall_id, vendor_name: bill.full_name ?? null, period: bill.period, total: bill.total,
    due_date: bill.due_date, status: bill.status,
    score: bill.risk_score != null ? Number(bill.risk_score) : null,
    level: riskLevel(bill.risk_score, ai),
    scope: !contributions.length ? 'none' : bill.risk_features?.explain?.scope === 'global' ? 'global' : 'local',
    lead: lead || contributions[0] || null,
    n_prior: bill.risk_features?.n_prior ?? null,
  };
}

module.exports = { explainView, listRow, cleanContributions, FEATURE_KEYS };
