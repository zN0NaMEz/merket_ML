/*
 * ตรรกะของแท็บ "ทดสอบหลายชุดข้อมูล" (model evaluation) ไม่ผูกกับ React
 * ชื่อโมเดล · ข้อสังเกตอัตโนมัติจากผลวัด · ไฟล์ CSV สำหรับรายงาน
 * ข้อสังเกตทุกข้อคิดจากตัวเลขที่ ML บันทึกไว้ ไม่มีข้อความตายตัวที่อ้างตัวเลขเอง
 */

export const MODEL_LABEL = {
  lr: 'Logistic Regression',
  rf: 'Random Forest',
  baseline: 'เกณฑ์อ้างอิง (เดาตามสัดส่วน)',
  z: 'z-score',
  if: 'Isolation Forest',
  both: 'ใช้ทั้งสองวิธี',
};
export const TASK_LABEL = { risk: 'ความเสี่ยงจ่ายช้า', anomaly: 'ตรวจค่ามิเตอร์ผิดปกติ' };

const f3 = v => (v == null ? '–' : Number(v).toFixed(3));
const titleOf = (datasets, task, key) => datasets.find(d => d.task === task && d.key === key)?.title || key;

/** สัดส่วน → "38%" */
export const pct = v => (v == null ? '–' : `${Math.round(Number(v) * 100)}%`);

/**
 * ข้อสังเกตจากผลวัด (เรียงตามชุดข้อมูล)
 * 1) แยกได้แต่ไม่เตือน: AUC ≥ 0.65 แต่ recall = 0 ที่เกณฑ์ 0.5
 * 2) ใกล้การเดาสุ่ม: ทุกโมเดลของชุดนั้น AUC < 0.6
 * 3) accuracy หลอกตา: เกณฑ์อ้างอิงได้ accuracy เท่ากับหรือดีกว่าโมเดลที่ดีที่สุด
 * 4) ทักผิดบ่อย: วิธีตรวจมิเตอร์ทักผิดตั้งแต่ 4 ครั้งต่อ 100 ค่า
 */
export function insights(rows, datasets = []) {
  const out = [];
  const byDs = {};
  for (const r of rows) (byDs[`${r.task}/${r.dataset}`] ||= []).push(r);
  for (const [key, rs] of Object.entries(byDs)) {
    const [task, ds] = key.split('/');
    const title = titleOf(datasets, task, ds);
    const models = rs.filter(r => r.model !== 'baseline');
    if (task === 'risk') {
      // หนึ่งบรรทัดต่อชุดต่อกฎ: รวมทุกโมเดลที่เข้าเงื่อนไขเดียวกัน
      const silent = models.filter(r => r.auc != null && r.auc >= 0.65 && r.recall === 0);
      if (silent.length) {
        out.push({ tone: 'warn', dataset: ds, text: `${title}: ${silent.map(r => MODEL_LABEL[r.model]).join(' และ ')} แยกบิลได้ `
          + `(AUC ${silent.map(r => f3(r.auc)).join(', ')}) แต่ที่เกณฑ์ 0.5 ไม่เตือนสักใบ ข้อมูลแบบนี้ควรใช้เกณฑ์ต่ำกว่า 0.5 และดู PR-AUC ประกอบ` });
      }
      if (models.length && models.every(r => r.auc != null && r.auc < 0.6)) {
        out.push({ tone: 'bad', dataset: ds, text: `${title}: ทุกโมเดลใกล้การเดาสุ่ม (AUC สูงสุด ${f3(Math.max(...models.map(r => r.auc)))}) ปัจจัยที่มีอยู่อธิบายการจ่ายช้าแบบนี้ไม่ได้` });
      }
      const base = rs.find(r => r.model === 'baseline');
      const bestAcc = Math.max(...models.map(r => r.accuracy ?? -1));
      if (base?.accuracy != null && bestAcc >= 0 && base.accuracy >= bestAcc - 0.005) {
        out.push({ tone: 'idle', dataset: ds, text: `${title}: การเดาว่า "จ่ายตรงเวลาทุกบิล" ได้ accuracy ${pct(base.accuracy)} เท่ากับโมเดล accuracy จึงหลอกตา ให้ดู AUC, PR-AUC และ recall แทน` });
      }
    } else {
      const noisy = models.filter(r => r.extra?.false_alarms_per_100 != null && r.extra.false_alarms_per_100 >= 4);
      if (noisy.length) {
        const fas = [...new Set(noisy.map(r => r.extra.false_alarms_per_100))];
        out.push({ tone: 'warn', dataset: ds, text: `${title}: ${noisy.map(r => MODEL_LABEL[r.model]).join(' และ ')} ทักผิด `
          + `${fas.join(', ')} ครั้งต่อ 100 ค่า เจ้าหน้าที่ต้องเดินตรวจเปล่าบ่อย` });
      }
    }
  }
  return out;
}

/* ---------- สมมติฐานของชุดที่ออกแบบให้โมเดลต่างกัน ---------- */

export const METRIC_LABEL = { cv_auc: 'CV AUC (สูงดี)', cv_brier: 'CV Brier (ต่ำดี)', f1: 'F1 (สูงดี)' };
export const VERDICT = {
  yes: { icon: '✓', word: 'เป็นไปตามคาด', tone: 'low' },
  no: { icon: '✗', word: 'ผลสวนทางกับที่คาด', tone: 'high' },
  unclear: { icon: '≈', word: 'ต่างกันน้อยเกินจะสรุป', tone: 'none' },
};

/** ชื่อโมเดลหลายตัว: "Isolation Forest หรือ ใช้ทั้งสองวิธี" */
export const modelList = ms => ms.map(m => MODEL_LABEL[m] || m).join(' หรือ ');

/**
 * คำอธิบายผลการตรวจสมมติฐานหนึ่งบรรทัด (มาจาก API: checkHypotheses)
 * เช่น "Random Forest ดีกว่า Logistic Regression ห่าง 0.205 · t = 12.3 (ต้องเกิน 2.78 จึงนับว่าไม่ใช่ความบังเอิญ)"
 */
export function hypothesisDetail(h) {
  if (!h.compared) return h.reason || 'ผลวัดไม่ครบ';
  const [a, b] = h.compared;
  const loser = h.winner === a ? b : a;
  const head = `${MODEL_LABEL[h.winner] || h.winner} ดีกว่า ${MODEL_LABEL[loser] || loser} ห่าง ${f3(h.diff)}`;
  if (h.t != null) return `${head} · t = ${Number.isFinite(h.t) ? h.t.toFixed(2) : '∞'} จากผลจับคู่ 5 พับ (ต้องเกิน 2.78 จึงนับว่าไม่ใช่ความบังเอิญ)`;
  return `${head} (ต้องห่างอย่างน้อย 0.050 จึงนับว่าต่างจริง)`;
}

const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV ของผลวัดทุกแถว (มี BOM ให้ Excel อ่านภาษาไทยถูก) */
export function toCsv(rows, datasets = []) {
  const head = ['งาน', 'ชุดข้อมูล', 'คีย์ชุดข้อมูล', 'โมเดล', 'จำนวนแถว (ชุดทดสอบ)', 'สัดส่วนกลุ่มบวก', 'AUC', 'PR-AUC', 'Precision', 'Recall',
    'F1', 'Accuracy', 'Brier', 'CV AUC เฉลี่ย', 'CV AUC SD', 'ทักผิดต่อ 100 ค่า'];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push([TASK_LABEL[r.task], titleOf(datasets, r.task, r.dataset), r.dataset, MODEL_LABEL[r.model] || r.model,
      r.extra?.n_test ?? r.n_rows, r.positive_rate, r.auc, r.pr_auc, r.precision, r.recall, r.f1, r.accuracy, r.brier,
      r.cv_auc_mean, r.cv_auc_std, r.extra?.false_alarms_per_100].map(csvCell).join(','));
  }
  return `﻿${lines.join('\n')}\n`;
}
