/** ระดับความเสี่ยงจากคะแนนและเกณฑ์ที่ตั้งไว้ (ไม่มีคะแนน = null) */
const riskLevel = (score, ai) => (score == null ? null : score >= ai.risk_high ? 'high' : score >= ai.risk_mid ? 'mid' : 'low');
module.exports = { riskLevel };
