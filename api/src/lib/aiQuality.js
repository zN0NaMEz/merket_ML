/**
 * จัดรูปคุณภาพโมเดลจากแถว model_runs (RodeMap 3.4) · ฟังก์ชันล้วน ทดสอบได้โดยไม่ต้องมีฐานข้อมูล
 * ทุกตัวเลขมาจากผลการเทรนที่บันทึกไว้ ไม่มีค่าตั้งต้นหรือค่าจำลอง ถ้าไม่มีให้เป็น null
 */

const round = (v, d = 4) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10 ** d) / 10 ** d);

/** ค่าเฉลี่ยและ SD แบบตัวอย่าง (n−1) เหมือน numpy.std(ddof=1) */
function meanSd(xs) {
  const v = (xs || []).map(Number).filter(Number.isFinite);
  if (!v.length) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) : 0;
  return { mean: round(m), sd: round(sd), folds: v.map(x => round(x)) };
}

const METRICS = ['auc', 'precision', 'recall', 'accuracy'];
function cvSummary(cv) {
  if (!cv) return null;
  const out = {};
  for (const k of METRICS) if (cv[k]) out[k] = meanSd(cv[k]);
  return Object.keys(out).length ? out : null;
}

/** ความห่างเฉลี่ยของ calibration (ถ่วงตามจำนวนบิลในแต่ละช่อง) 0 = ตรงพอดี */
function calibrationGap(cal) {
  if (!cal?.prob_pred?.length || !cal?.prob_true?.length) return null;
  const counts = cal.counts?.length === cal.prob_pred.length ? cal.counts : cal.prob_pred.map(() => 1);
  let num = 0, den = 0;
  cal.prob_pred.forEach((p, i) => { num += Math.abs(p - cal.prob_true[i]) * counts[i]; den += counts[i]; });
  return den ? round(num / den) : null;
}

/** ระดับคำพูดของ AUC สำหรับคนทั่วไป */
function aucWord(auc) {
  if (auc == null) return null;
  if (auc >= 0.8) return 'ดี';
  if (auc >= 0.7) return 'พอใช้';
  if (auc >= 0.6) return 'อ่อน';
  return 'ใช้ไม่ได้';
}

/** แนวโน้มเทียบรอบก่อน (ต่างกันไม่ถึง 0.01 = ใกล้เคียงเดิม) */
function trend(cur, prev) {
  if (cur == null || prev == null) return null;
  const d = cur - prev;
  return { delta: round(d), word: Math.abs(d) < 0.01 ? 'same' : d > 0 ? 'better' : 'worse' };
}

/**
 * แถว model_runs รุ่นก่อน (model_type = 'risk' เก็บผลทั้ง LR และ RF ไว้ใน metrics.models)
 * แปลงให้หน้าตาเหมือนแถวใหม่ของโมเดลที่ขอ เพื่อให้ระบบที่อัปเกรดแล้วแต่ยังไม่ได้เทรนใหม่ยังแสดงผลได้
 */
function normalizeRun(row, modelType) {
  if (!row || row.model_type !== 'risk') return row;
  const key = String(modelType || '').replace(/^risk_/, '') || 'lr';
  const m = row.metrics?.models?.[key] || row.metrics?.models?.lr || {};
  return {
    ...row, legacy: true,
    metrics: { ...row.metrics, ...m },
    n_train: row.n_train ?? m.n_train ?? row.metrics?.n_train ?? null,
    n_test: row.n_test ?? m.n_test ?? row.metrics?.n_test ?? null,
    confusion: row.confusion ?? m.confusion ?? null,
  };
}

/** รายละเอียดเต็มสำหรับทีม/กรรมการ */
function fullView(run) {
  if (!run) return null;
  const m = run.metrics || {};
  const conf = run.confusion || m.confusion || null;
  return {
    run_id: run.id, model_type: run.model_type, trained_at: run.trained_at, sklearn_version: run.sklearn_version ?? null,
    n_train: run.n_train ?? m.n_train ?? null, n_test: run.n_test ?? m.n_test ?? null,
    data_from: run.data_from ?? null, data_to: run.data_to ?? null, is_synthetic: Boolean(run.is_synthetic), triggered_by: run.triggered_by ?? null,
    late_rate: round(m.late_rate),
    test: { auc: round(m.auc), precision: round(m.precision), recall: round(m.recall), accuracy: round(m.accuracy), f1: round(m.f1) },
    cv: cvSummary(run.cv_scores) || (m.cv_auc_mean != null ? { auc: { mean: round(m.cv_auc_mean), sd: round(m.cv_auc_std), folds: [] } } : null),
    confusion: conf && ['tn', 'fp', 'fn', 'tp'].every(k => Number.isFinite(conf[k])) ? conf : null,
    calibration: run.calibration?.prob_pred ? { ...run.calibration, gap: calibrationGap(run.calibration) } : null,
    importance: Array.isArray(run.global_importance)
      ? [...run.global_importance].sort((a, b) => b.value - a.value).map(g => ({ feature: g.feature, value: round(g.value), std: round(g.std) }))
      : null,
  };
}

/**
 * สรุปภาษาง่ายสำหรับเจ้าของตลาด: ไม่มีชื่อโมเดล CV รายพับ หรือศัพท์เทคนิค
 * recall → "บิลที่จ่ายช้าจริง 10 ใบ ระบบเตือนถูกราว X ใบ" · precision → "ที่ระบบเตือน 10 ใบ จ่ายช้าจริงราว X ใบ"
 */
function ownerView(run, prev) {
  if (!run) return null;
  const f = fullView(run);
  const of10 = v => (v == null ? null : Math.round(v * 10));
  return {
    trained_at: f.trained_at, n_train: f.n_train, n_test: f.n_test, data_from: f.data_from, data_to: f.data_to,
    is_synthetic: f.is_synthetic, late_rate: f.late_rate,
    auc: f.test.auc, auc_word: aucWord(f.test.auc),
    caught_of10: of10(f.test.recall), right_of10: of10(f.test.precision), accuracy: f.test.accuracy,
    steady: f.cv?.auc ? f.cv.auc.sd <= 0.05 : null,
    calibration_gap: f.calibration?.gap ?? null,
    trend: trend(f.test.auc, prev?.metrics?.auc ?? null),
  };
}

module.exports = { meanSd, cvSummary, calibrationGap, aucWord, trend, fullView, ownerView, normalizeRun };
