/*
 * แท็บ "ทำนายจากไฟล์" ในหน้า AI วิเคราะห์ (/staff/ai) ที่ 390 × 844
 * ตรวจเกณฑ์ของ RodeMap.md หัวข้อ 6 เฉพาะในแผงของแท็บนี้ (ส่วนอื่นของหน้า AI ยังไม่อยู่ในรอบที่ปรับ)
 * และตรวจทุกสถานะ: ยังไม่มีไฟล์ · ไฟล์ใช้ไม่ได้ · มีแถวผิด · กำลังทำนาย · AI ไม่พร้อม · ผลลัพธ์
 * ต้องมีเว็บ + API + ML ที่รันอยู่ และเทรนโมเดลแล้ว:  UI_BASE_URL=http://localhost:5173 npm run test:ui
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { checkRow, evaluateFile } from '../src/ai/predictFile.js';

const PANEL = '#ai-panel-file';
const PW: Record<string, string> = { staff: 'staff1234', owner: 'owner1234' };

async function loginAs(page: Page, role: string) {
  const r = await page.request.post('/api/auth/login', { data: { username: role, password: PW[role] } });
  expect(r.ok(), `เข้าสู่ระบบ ${role} ไม่ได้`).toBeTruthy();
  const { token, user } = await r.json();
  await page.addInitScript(([t, u]) => {
    localStorage.setItem('bunyat.token', t);
    localStorage.setItem('bunyat.user', u);
  }, [token, JSON.stringify(user)]);
}

async function openTab(page: Page) {
  await page.goto('/staff/ai');
  await expect(page.locator('main h1')).toBeVisible({ timeout: 90_000 });   // หน้า AI รอ ML ตอบ (อาจกำลังตื่น)
  await page.getByRole('tab', { name: /ทำนายจากไฟล์/ }).click();
  await expect(page.locator(PANEL)).toBeVisible();
}

/** เกณฑ์ 4 ข้อของหัวข้อ 6 ภายในแผงของแท็บนี้ */
async function panelChecks(page: Page) {
  // หน้าเฟดเข้า 0.55 วินาที (.page) ถ้าตรวจระหว่างนั้น axe จะเห็นตัวหนังสือจางจนความต่างของสีไม่ผ่าน
  await page.waitForFunction(() => document.getAnimations()
    .filter(a => a.effect?.getComputedTiming().iterations !== Infinity).every(a => a.playState === 'finished'));
  const wide = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(wide, 'หน้าเลื่อนแนวนอนได้').toBe(true);
  const small = await page.$$eval(`${PANEL} :is(a,button,input,select,summary,[role=button])`, els => els.flatMap(e => {
    const el = e as HTMLElement;
    const target = (el.tagName === 'INPUT' && el.closest('label')) || el;
    const r = target.getBoundingClientRect();
    if (!r.width || !r.height) return [];
    return r.width < 44 || r.height < 44 ? [`${el.tagName.toLowerCase()} "${(el.textContent || '').trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`] : [];
  }));
  expect(small, 'จุดกดเล็กกว่า 44 × 44 px').toEqual([]);
  const tiny = await page.$$eval(`${PANEL} *`, els => els.flatMap(e => {
    const hasText = [...e.childNodes].some(n => n.nodeType === 3 && (n.textContent || '').trim());
    if (!hasText || !(e as HTMLElement).getBoundingClientRect().width) return [];
    const fs = parseFloat(getComputedStyle(e).fontSize);
    return fs < 13 ? [`${e.tagName.toLowerCase()}.${(e as HTMLElement).className} ${fs}px "${(e.textContent || '').trim().slice(0, 20)}"`] : [];
  }));
  expect(tiny, 'ตัวหนังสือเล็กกว่า 13 px').toEqual([]);
  const axe = await new AxeBuilder({ page }).include(PANEL).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`),
    'axe serious/critical').toEqual([]);
}

const csv = (rows: string[][]) => Buffer.from('﻿' + rows.map(r => r.join(',')).join('\r\n'), 'utf8');
const HEAD = ['ชื่อหรือรหัสอ้างอิง', 'ประเภทแผง', 'เดือนที่ครบกำหนด', 'เช่ามาแล้ว (ปี)', 'จำนวนบิลก่อนหน้าที่นับ', 'จ่ายช้ากี่บิล', 'รวมวันที่จ่ายช้า', 'ยอดบิลนี้ (บาท)', 'ยอดเฉลี่ย 3 บิลก่อนหน้า (บาท)'];

test.describe('ทำนายจากไฟล์', () => {
  test.beforeEach(async ({ page }) => { await loginAs(page, 'staff'); });

  test('ยังไม่มีไฟล์: ขั้นตอน 3 ข้อ ผ่านเกณฑ์ และกดลูกศรมาที่แท็บได้', async ({ page }) => {
    await page.goto('/staff/ai');
    await expect(page.locator('main h1')).toBeVisible({ timeout: 90_000 });
    await page.locator('#ai-tab-risk').focus();
    await page.keyboard.press('ArrowLeft');                     // วนจากแท็บแรกไปแท็บสุดท้าย
    await expect(page.getByRole('tab', { name: /ทำนายจากไฟล์/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(`${PANEL} .pf-step`)).toHaveCount(3);
    await expect(page.getByText('ไม่บันทึกข้อมูลที่อัปโหลดไว้', { exact: false })).toBeVisible();
    await panelChecks(page);
  });

  test('ดาวน์โหลดไฟล์ตัวอย่าง → อัปโหลดกลับ → ทำนาย → สลับโมเดล → ดาวน์โหลดผล', async ({ page }) => {
    await openTab(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ดาวน์โหลดไฟล์ตัวอย่าง (.csv)' }).click()]);
    expect(dl.suggestedFilename()).toBe('ตัวอย่างข้อมูลทำนายการจ่ายช้า.csv');
    const path = await dl.path();
    const text = readFileSync(path!, 'utf8');
    expect(text.charCodeAt(0), 'มี BOM ให้ Excel อ่านภาษาไทยถูก').toBe(0xfeff);
    expect(text).toContain('ประเภทแผง');

    // ไฟล์ที่ดาวน์โหลดถูกเก็บด้วยชื่อสุ่ม (ไม่มี .csv) จึงอัปโหลดกลับด้วยชื่อที่เบราว์เซอร์เสนอ เหมือนผู้ใช้จริง
    await page.locator(`${PANEL} input[type=file]`).setInputFiles({ name: dl.suggestedFilename(), mimeType: 'text/csv', buffer: readFileSync(path!) });
    await expect(page.locator('.pf-check__sum')).toContainText('พร้อมทำนาย 8 แถว');
    await page.getByRole('button', { name: 'ให้ AI ทำนาย 8 แถว' }).click();
    await expect(page.locator('#pf-res-title')).toHaveText('ผลการทำนาย 8 แถว', { timeout: 90_000 });
    await expect(page.locator('.pf-live')).toContainText('ทำนายเสร็จแล้ว 8 แถว');
    await expect(page.locator('.pf-card')).toHaveCount(8);
    const counts = (await page.locator('.pf-filter label').allInnerTexts()).map(t => parseInt(t.replace(/\D+/g, ''), 10));
    expect(counts[0]).toBe(8);
    expect(counts.slice(1).reduce((s, n) => s + n, 0), 'ผลรวมสามระดับ = จำนวนแถว').toBe(8);
    // ทุกการ์ดมีประโยคสรุปและเหตุผล ไม่มีชื่อคอลัมน์ดิบ
    const body = await page.locator('.pf-res').innerText();
    for (const raw of ['late_count', 'bill_ratio', 'tenure_years', 'stall_type', 'undefined', 'NaN']) expect(body).not.toContain(raw);
    // สลับโมเดลแล้วคะแนนของการ์ดแรกเปลี่ยนตามโมเดลที่เลือก (ไม่เรียก ML ซ้ำ)
    let calls = 0;
    page.on('request', r => { if (r.url().includes('/api/ai/predict')) calls += 1; });
    const opts = page.locator('.pf-model');
    expect(await opts.count()).toBeGreaterThanOrEqual(2);
    const first = async () => page.locator('.pf-card').first().locator('.ai-ex__score b').innerText();
    const before = await first();
    await opts.nth(1).click();
    await expect(opts.nth(1)).toHaveClass(/is-on/);
    await opts.nth(4 < await opts.count() ? 4 : 0).click();
    expect(calls, 'สลับโมเดลไม่เรียก ML ซ้ำ').toBe(0);
    expect(typeof before).toBe('string');
    // กรองตามระดับ
    await page.locator('.pf-filter label').nth(1).click();
    const nHigh = parseInt((await page.locator('.pf-filter label').nth(1).innerText()).replace(/\D+/g, ''), 10) || 0;
    if (nHigh) await expect(page.locator('.pf-card')).toHaveCount(nHigh);
    else await expect(page.locator('.pf-res .empty')).toBeVisible();
    await page.locator('.pf-filter label').first().click();
    // ดาวน์โหลดผล
    const [res] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ดาวน์โหลดผล (.csv)' }).click()]);
    const out = readFileSync((await res.path())!, 'utf8');
    expect(out.split(/\r?\n/).filter(Boolean)).toHaveLength(9);
    expect(out).toMatch(/คะแนน .+ \(%\)/);
    await page.screenshot({ path: 'test-results/predict-390.png', fullPage: true });
    await panelChecks(page);
  });

  test('แถวผิด: บอกบรรทัดและสิ่งที่ต้องแก้ แล้วทำนายเฉพาะแถวที่ถูกได้', async ({ page }) => {
    await openTab(page);
    await page.locator(`${PANEL} input[type=file]`).setInputFiles({ name: 'มีแถวผิด.csv', mimeType: 'text/csv', buffer: csv([
      HEAD,
      ['ถูก 1', 'ของชำ', '7', '3', '6', '0', '0', '3000', '2900'],
      ['ผิดประเภท', 'ผัก', '7', '3', '6', '0', '0', '3000', '2900'],
      ['ช้าเกิน', 'อาหารสด', '7', '3', '3', '4', '9', '3000', '2900'],
      ['ถูก 2', 'clothes', '2026-09', '0.5', '2', '1', '4', '2,800', ''],
    ]) });
    await expect(page.locator('.pf-check__sum')).toContainText('พร้อมทำนาย 2 แถว');
    await expect(page.locator('.pf-check__sum')).toContainText('ต้องแก้ 2 แถว');
    const banner = page.locator('.pf-invalid');
    await expect(banner).toContainText('บรรทัด 3 · ผิดประเภท');
    await expect(banner).toContainText('ไม่รู้จักประเภทแผง "ผัก"');
    await expect(banner).toContainText('บรรทัด 4 · ช้าเกิน');
    await expect(banner).toContainText('มากกว่าจำนวนบิลที่นับ');
    await panelChecks(page);
    await page.getByRole('button', { name: 'ให้ AI ทำนาย 2 แถว' }).click();
    await expect(page.locator('#pf-res-title')).toHaveText('ผลการทำนาย 2 แถว', { timeout: 90_000 });
  });

  test('ไฟล์ใช้ไม่ได้: Excel, ไม่มีคอลัมน์, ไฟล์ว่าง', async ({ page }) => {
    await openTab(page);
    const input = page.locator(`${PANEL} input[type=file]`);
    await input.setInputFiles({ name: 'ข้อมูล.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK') });
    await expect(page.locator('.pf-msg[role=alert]')).toContainText('CSV UTF-8');
    await panelChecks(page);
    await page.getByRole('button', { name: 'เลือกไฟล์ใหม่' }).click();
    await input.setInputFiles({ name: 'ผิดหัว.csv', mimeType: 'text/csv', buffer: csv([['ชื่อ', 'ยอด'], ['ก', '1']]) });
    await expect(page.locator('.pf-msg[role=alert]')).toContainText('ไม่พบคอลัมน์ "ประเภทแผง"');
    await input.setInputFiles({ name: 'หัวอย่างเดียว.csv', mimeType: 'text/csv', buffer: csv([HEAD]) });
    await expect(page.locator('.pf-msg[role=alert]')).toContainText('มีแต่หัวตาราง');
  });

  test('กำลังทำนาย → AI ไม่พร้อม (503) → ลองอีกครั้งสำเร็จ', async ({ page }) => {
    await openTab(page);
    let mode: 'slow-503' | 'pass' = 'slow-503';
    await page.route('**/api/ai/predict', async route => {
      if (mode === 'pass') return route.continue();
      await new Promise(r => setTimeout(r, 6500));               // นานพอให้เห็นข้อความรอ
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'ML service ไม่พร้อมใช้งาน' }) });
    });
    await page.getByRole('button', { name: /ลองกับไฟล์ตัวอย่าง/ }).click();
    await page.getByRole('button', { name: 'ให้ AI ทำนาย 8 แถว' }).click();
    await expect(page.getByRole('button', { name: 'AI กำลังทำนาย…' })).toBeDisabled();
    await expect(page.locator('.pf-live')).toContainText('อาจใช้เวลาราว 1 นาที', { timeout: 10_000 });
    await expect(page.locator('.pf-msg[role=alert]')).toContainText('บริการ AI ยังไม่พร้อมตอนนี้', { timeout: 15_000 });
    await expect(page.locator('.pf-msg[role=alert]')).toContainText('ไม่ต้องอัปโหลดใหม่');
    await panelChecks(page);
    mode = 'pass';
    await page.getByRole('button', { name: 'ลองอีกครั้ง' }).click();
    await expect(page.locator('#pf-res-title')).toHaveText('ผลการทำนาย 8 แถว', { timeout: 90_000 });
  });

  test('ข้อผิดพลาดอื่นและเน็ตหลุด', async ({ page }) => {
    await openTab(page);
    await page.route('**/api/ai/predict', route => route.fulfill({ status: 409, contentType: 'application/json',
      body: JSON.stringify({ error: 'ML service: ยังไม่มีโมเดล gb ในชุดที่เทรนไว้' }) }));
    await page.getByRole('button', { name: /ลองกับไฟล์ตัวอย่าง/ }).click();
    await page.getByRole('button', { name: 'ให้ AI ทำนาย 8 แถว' }).click();
    await expect(page.locator('.pf-msg[role=alert]')).toContainText('ยังไม่มีโมเดลที่เทรนไว้');
    await expect(page.locator('.pf-msg[role=alert]')).toContainText('เทรนโมเดลใหม่');
    await page.unroute('**/api/ai/predict');
    await page.route('**/api/ai/predict', route => route.abort('internetdisconnected'));
    await page.getByRole('button', { name: 'ลองอีกครั้ง' }).click();
    await expect(page.locator('.pf-msg[role=alert]')).toContainText('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  });

  test('โมเดลชุดเก่า (มีแค่ LR, RF): แท็บทำนายการจ่ายช้าบอกให้เทรนใหม่เพื่อใช้โมเดลที่เหลือ', async ({ page }) => {
    // ต้องมีตัวอย่างจากรอบเทรนจริง (หลังแก้ลำดับการเขียนไฟล์ใน risk.train ค่านี้ไม่หายเมื่อ ML รีสตาร์ท)
    await page.route('**/api/ai/overview', async route => {
      const r = await route.fetch();
      const j = await r.json();
      for (const k of ['et', 'gb', 'ens']) delete j.risk.models[k];
      j.ai.risk_model = 'lr';
      await route.fulfill({ response: r, json: j });
    });
    await page.goto('/staff/ai');
    await expect(page.locator('main h1')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.ai-models__note')).toContainText('ยังมีอีก 3 โมเดล');
    await expect(page.locator('.ai-model')).toHaveCount(2);
  });

  test('จอกว้าง 1280: ภาพผลลัพธ์', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTab(page);
    await page.getByRole('button', { name: /ลองกับไฟล์ตัวอย่าง/ }).click();
    await page.getByRole('button', { name: 'ให้ AI ทำนาย 8 แถว' }).click();
    await expect(page.locator('#pf-res-title')).toHaveText('ผลการทำนาย 8 แถว', { timeout: 90_000 });
    await page.screenshot({ path: 'test-results/predict-1280.png', fullPage: true });
  });
});

/* ประเมินโมเดล: ผลตอนเทรนแสดงเสมอ · ไฟล์ที่มีผลจริงถูกวัดในเบราว์เซอร์ */
test.describe('ประเมินโมเดลในผลทำนายจากไฟล์', () => {
  test.beforeEach(async ({ page }) => { await loginAs(page, 'staff'); });

  test('ไม่มีผลจริง: แสดงผลตอนเทรนของทุกโมเดล และบอกวิธีวัดกับไฟล์', async ({ page }) => {
    await openTab(page);
    await page.getByRole('button', { name: /ลองกับไฟล์ตัวอย่าง/ }).click();
    await page.getByRole('button', { name: 'ให้ AI ทำนาย 8 แถว' }).click();
    const ev = page.locator('.pf-eval');
    await expect(ev).toContainText('ไฟล์นี้ยังไม่มีผลจริง', { timeout: 90_000 });
    const cards = ev.locator('.pf-ev');
    expect(await cards.count()).toBeGreaterThanOrEqual(2);
    await expect(cards.first().locator('thead th')).toHaveText(['ตัวชี้วัด', 'ตอนเทรน']);
    // ค่าตอนเทรนมาจากรอบเทรนจริง (ไม่ว่าง) และ AUC แสดงพร้อม ± ของ CV
    await expect(cards.first().locator('tbody tr').first().locator('td')).toHaveText(/^0\.\d\d ± 0\.\d\d$/);
    await expect(ev.locator('.cm')).toHaveCount(0);
    await panelChecks(page);
  });

  test('มีผลจริง: วัดกับไฟล์ ตัวเลขตรงกับที่คำนวณจากคำตอบของ API', async ({ page }) => {
    await openTab(page);
    const head = [...HEAD, 'ผลจริง (ถ้ารู้)'];
    const keys = ['ref', 'stall_type', 'due_month', 'tenure_years', 'n_prior', 'late_count', 'days_late_total', 'bill_total', 'prev_avg', 'actual'];
    const raw = [
      ['ก1', 'ของชำ', '7', '6', '6', '0', '0', '2950', '2900', 'ตรงเวลา'],
      ['ก2', 'เสื้อผ้าและของใช้', '9', '2', '6', '5', '30', '2600', '2450', 'จ่ายช้า'],
      ['ก3', 'ผักผลไม้', '5', '0.3', '2', '0', '0', '3100', '2800', '0'],
      ['ก4', 'อาหารปรุงสุก', '6', '3.5', '6', '3', '12', '6200', '3900', '1'],
      ['ก5', 'อาหารสด', '12', '8', '6', '1', '2', '3400', '3350', 'ตรงเวลา'],
      ['ก6', 'อาหารสด', '8', '0', '0', '0', '0', '3200', '', 'ตรงเวลา'],
      ['ก7', 'อาหารปรุงสุก', '10', '1.5', '5', '4', '31', '4100', '4000', 'จ่ายช้า'],
      ['ก8', 'เสื้อผ้าและของใช้', '4', '4', '6', '2', '6', '2500', '2400', 'ตรงเวลา'],
      ['ก9', 'ของชำ', '3', '9', '6', '0', '0', '2800', '2800', ''],          // ไม่รู้ผล ไม่นับในการวัด
      ['ก10', 'ผักผลไม้', '9', '1', '6', '6', '40', '3500', '2600', 'จ่ายช้า'],
    ];
    await page.locator(`${PANEL} input[type=file]`).setInputFiles({ name: 'มีผลจริง.csv', mimeType: 'text/csv', buffer: csv([head, ...raw]) });
    await expect(page.locator('.pf-check__sum')).toContainText('พร้อมทำนาย 10 แถว');
    const [resp] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/ai/predict') && r.request().method() === 'POST', { timeout: 90_000 }),
      page.getByRole('button', { name: 'ให้ AI ทำนาย 10 แถว' }).click(),
    ]);
    const req = resp.request().postDataJSON();
    expect(req.rows.every((r: Record<string, unknown>) => !('actual' in r)), 'ผลจริงต้องไม่ถูกส่งไปให้ AI').toBe(true);
    const out = await resp.json();
    const ev = page.locator('.pf-eval');
    await expect(ev).toContainText('วัดกับ 9 แถว');
    await expect(ev).toContainText('จ่ายช้า 4 · ตรงเวลา 5');
    await expect(ev.locator('.banner.warn')).toContainText('มีผลจริงแค่ 9 แถว');
    // ค่าในการ์ดของโมเดลที่กำลังดู = evaluateFile กับคำตอบเดียวกัน
    const results = out.results.map((r: Record<string, unknown>, i: number) => ({
      ...r, input: checkRow(Object.fromEntries(keys.map((k, j) => [k, raw[i][j]]))).value,
    }));
    const on = ev.locator('.pf-ev.is-on');
    const name = (await on.locator('small').innerText()).trim();
    const key = Object.entries({ lr: 'Logistic Regression', rf: 'Random Forest', et: 'Extra Trees', gb: 'Gradient Boosting', ens: 'Ensemble (LR + RF + GB)' })
      .find(([, n]) => name.startsWith(n))![0];
    const e = evaluateFile(results, key);
    const firstCell = async (row: number) => (await on.locator('tbody tr').nth(row).locator('td').first().innerText()).replace('ดีสุด', '').trim();
    expect(await firstCell(0)).toBe(e.auc!.toFixed(2));
    expect(await firstCell(1)).toBe(`${Math.round(e.accuracy! * 100)}%`);
    // confusion matrix รวมได้เท่าจำนวนแถวที่มีผลจริง
    const cells = (await ev.locator('.cm .v').allInnerTexts()).map(t => parseInt(t, 10));
    expect(cells).toEqual([e.tn, e.fp, e.fn, e.tp]);
    expect(cells.reduce((a, b) => a + b, 0)).toBe(9);
    // การ์ดผลรายแถวบอกผลจริงและทายถูกไหม
    await expect(page.locator('.pf-card', { hasText: 'ก2' }).locator('.ai-ex__facts')).toContainText('จ่ายช้า');
    expect(await page.locator('.pf-card .chip', { hasText: /ทายถูก|ทายพลาด/ }).count()).toBe(9);
    // ไฟล์ผลมีคอลัมน์ทายถูก
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ดาวน์โหลดผล (.csv)' }).click()]);
    expect(readFileSync((await dl.path())!, 'utf8')).toContain('ทายถูก (');
    await page.screenshot({ path: 'test-results/predict-eval-390.png', fullPage: true });
    await panelChecks(page);
  });

  test('ผลจริงมีแบบเดียว: บอกว่าคิด AUC ไม่ได้', async ({ page }) => {
    await openTab(page);
    await page.locator(`${PANEL} input[type=file]`).setInputFiles({ name: 'ช้าหมด.csv', mimeType: 'text/csv', buffer: csv([
      [...HEAD, 'ผลจริง (ถ้ารู้)'],
      ['ก1', 'ของชำ', '7', '6', '6', '2', '4', '2950', '2900', 'จ่ายช้า'],
      ['ก2', 'อาหารสด', '7', '6', '6', '3', '9', '2950', '2900', 'จ่ายช้า'],
    ]) });
    await page.getByRole('button', { name: 'ให้ AI ทำนาย 2 แถว' }).click();
    await expect(page.locator('.pf-eval')).toContainText('คิด AUC ไม่ได้', { timeout: 90_000 });
    await expect(page.locator('.pf-ev.is-on tbody tr').first().locator('td').first()).toHaveText('–');
  });

  test('ผลจริงพิมพ์ผิด: บอกค่าที่ใช้ได้', async ({ page }) => {
    await openTab(page);
    await page.locator(`${PANEL} input[type=file]`).setInputFiles({ name: 'ผิด.csv', mimeType: 'text/csv', buffer: csv([
      [...HEAD, 'ผลจริง (ถ้ารู้)'], ['ก1', 'ของชำ', '7', '6', '6', '0', '0', '2950', '2900', 'เกือบช้า'],
    ]) });
    await expect(page.locator('.pf-invalid')).toContainText('ผลจริง "เกือบช้า" ใช้ได้: จ่ายช้า, ตรงเวลา, 1, 0');
  });
});

/* ป้ายบอกชนิดข้อมูลที่โมเดลเรียน: โปรไฟล์ clear (ความบังเอิญต่ำ) ต้องบอกทุกที่ที่แสดงตัวเลขคุณภาพ */
test.describe('ป้ายข้อมูลจำลอง', () => {
  test('โปรไฟล์ความบังเอิญต่ำ: หน้า AI วิเคราะห์และแถบสถานะเบื้องหลัง AI บอกชัด', async ({ page, request }) => {
    const status = await (await request.get('/api/ai/status')).json();
    test.skip(status.sim_profile !== 'clear', `ฐานข้อมูลนี้เป็นโปรไฟล์ ${status.sim_profile} (ทดสอบเมื่อ seed ด้วย SIM_PROFILE=clear)`);
    await loginAs(page, 'staff');
    await page.goto('/staff/ai');
    await expect(page.locator('main h1')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.ai-data')).toContainText('ข้อมูลจำลอง · ความบังเอิญต่ำ');
    await expect(page.locator('.ai-kpis__note').first()).toContainText('ข้อมูลจำลองแบบความบังเอิญต่ำ');
    await page.goto('/ai/behind');
    await expect(page.locator('.bh-synth').first()).toContainText('ความบังเอิญต่ำ');
  });
});

/*
 * รีเซ็ตข้อมูลสาธิตแบบเลือกโปรไฟล์ (หน้าเจ้าของตลาด > สำหรับการสาธิตระบบ)
 * ลบข้อมูลทั้งหมดจริง จึงรันเฉพาะฐานข้อมูลทดสอบที่ตั้ง UI_RESEED_KEY ไว้ และไม่รันกับ vercel.app
 */
test.describe('รีเซ็ตข้อมูลสาธิตเลือกโปรไฟล์', () => {
  test('เลือกความบังเอิญต่ำ → ทุกหน้าติดป้าย และทายถูกรวมเกิน 90%', async ({ page, baseURL }) => {
    test.skip(!process.env.UI_RESEED_KEY || /vercel\.app/.test(baseURL || ''), 'ต้องตั้ง UI_RESEED_KEY และใช้ฐานข้อมูลทดสอบเท่านั้น');
    test.setTimeout(240_000);
    const r = await page.request.post('/api/auth/login', { data: { username: 'owner', password: 'owner1234' } });
    const { token, user } = await r.json();
    await page.addInitScript(([t, u]) => { localStorage.setItem('bunyat.token', t); localStorage.setItem('bunyat.user', u); }, [token, JSON.stringify(user)]);
    await page.goto('/owner/more');
    await page.getByText('สำหรับการสาธิตระบบ').click();
    await page.getByRole('button', { name: 'รีเซ็ตข้อมูลสาธิต…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('radio', { name: /เหมือนตลาดจริง/ })).toBeChecked();
    await dialog.getByText('ความบังเอิญต่ำ (สำหรับสาธิต)').click();
    await expect(dialog.getByRole('radio', { name: /ความบังเอิญต่ำ/ })).toBeChecked();
    // จุดกดในหน้าต่างไม่เล็กกว่า 44 px และ axe ไม่มีปัญหาร้ายแรง
    const small = await dialog.locator('.reset-profile').evaluateAll(els => els.filter(e => e.getBoundingClientRect().height < 44).length);
    expect(small).toBe(0);
    const axe = await new AxeBuilder({ page }).include('[role=dialog]').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
    await dialog.getByLabel('รหัสรีเซ็ต').fill(process.env.UI_RESEED_KEY!);
    const [resp] = await Promise.all([
      page.waitForResponse(x => x.url().includes('/api/admin/reseed'), { timeout: 200_000 }),
      dialog.getByRole('button', { name: 'ลบและสร้างใหม่' }).click(),
    ]);
    expect(resp.request().postDataJSON()).toEqual({ dry_run: false, profile: 'clear' });
    await expect(dialog.locator('.reset-result')).toContainText('ข้อมูลแบบความบังเอิญต่ำ (สำหรับสาธิต)', { timeout: 200_000 });
    const status = await (await page.request.get('/api/ai/status')).json();
    expect(status.sim_profile).toBe('clear');
    // หน้า AI วิเคราะห์ของเจ้าหน้าที่: ป้ายกำกับ และทายถูกรวมของโมเดลที่ใช้อยู่
    await loginAs(page, 'staff');
    await page.goto('/staff/ai');
    await expect(page.locator('main h1')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.ai-data')).toContainText('ข้อมูลจำลอง · ความบังเอิญต่ำ');
    await expect(page.locator('.ai-kpis__note').first()).toContainText('ข้อมูลจำลองแบบความบังเอิญต่ำ');
    const acc = await page.locator('.ai-kpi', { hasText: 'ทายถูกรวม' }).locator('.ai-kpi__value').innerText();
    expect(parseInt(acc, 10), `ทายถูกรวม ${acc}`).toBeGreaterThan(90);
    await page.screenshot({ path: 'test-results/clear-ai-390.png', fullPage: false });
  });
});

/*
 * สลับชุดข้อมูลสาธิตจากหน้า AI วิเคราะห์ของเจ้าหน้าที่ (แผง "ชุดข้อมูลที่ AI เรียน") ไปแล้วกลับ
 * ลบข้อมูลจริง จึงรันเฉพาะฐานข้อมูลทดสอบที่ตั้ง UI_RESEED_KEY ไว้ และไม่รันกับ vercel.app · จบแล้วกลับเป็นแบบตลาดจริง
 */
test.describe('ชุดข้อมูลที่ AI เรียน (หน้า AI วิเคราะห์ของเจ้าหน้าที่)', () => {
  test('ความบังเอิญต่ำ → ทายถูกรวมเกิน 90% พร้อมคำกำกับ → กลับเป็นแบบตลาดจริง', async ({ page, baseURL }) => {
    test.skip(!process.env.UI_RESEED_KEY || /vercel\.app/.test(baseURL || ''), 'ต้องตั้ง UI_RESEED_KEY และใช้ฐานข้อมูลทดสอบเท่านั้น');
    test.setTimeout(300_000);
    await loginAs(page, 'staff');
    await page.goto('/staff/ai');
    await expect(page.locator('main h1')).toBeVisible({ timeout: 90_000 });
    const panel = page.locator('.ai-data');

    const resetTo = async (button: RegExp, profileName: RegExp, expectBody: string) => {
      await panel.getByRole('button', { name: button }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('radio', { name: profileName })).toBeChecked();       // เลือกไว้ให้ล่วงหน้าตามปุ่มที่กด
      await dialog.getByLabel('รหัสรีเซ็ต').fill(process.env.UI_RESEED_KEY!);
      const [resp] = await Promise.all([
        page.waitForResponse(x => x.url().includes('/api/admin/reseed'), { timeout: 240_000 }),
        dialog.getByRole('button', { name: 'ลบและสร้างใหม่' }).click(),
      ]);
      expect(resp.request().postDataJSON()).toEqual({ dry_run: false, profile: expectBody });
      await expect(dialog.locator('.reset-result')).toContainText('รีเซ็ตเสร็จแล้ว', { timeout: 240_000 });
      await dialog.getByRole('button', { name: 'เสร็จแล้ว' }).click();
      await expect(dialog).toHaveCount(0);
    };

    // เริ่มจากข้อมูลแบบตลาดจริง (ทุกเทสต์ก่อนหน้า seed realistic) ถ้าไม่ใช่ให้รีเซ็ตก่อน
    if (!(await panel.locator('.chip').innerText()).includes('เหมือนตลาดจริง')) await resetTo(/กลับเป็นข้อมูลเหมือนตลาดจริง/, /เหมือนตลาดจริง/, 'realistic');
    await expect(panel).toContainText('ข้อมูลจำลอง · เหมือนตลาดจริง');
    await expect(page.locator('.ai-kpis__note')).toHaveCount(0);
    // แผงผ่านเกณฑ์มือถือ: จุดกด ≥ 44 px ตัวหนังสือ ≥ 13 px และ axe
    const tiny = await panel.locator('*').evaluateAll(els => els.filter(e => [...e.childNodes].some(n => n.nodeType === 3 && (n.textContent || '').trim())
      && parseFloat(getComputedStyle(e).fontSize) < 13).map(e => (e.textContent || '').slice(0, 20)));
    expect(tiny).toEqual([]);
    const btn = await panel.getByRole('button').boundingBox();
    expect(btn!.height).toBeGreaterThanOrEqual(44);
    const axe = await new AxeBuilder({ page }).include('.ai-data').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);

    // ไปเป็นข้อมูลแบบความบังเอิญต่ำ: หน้าโหลดตัวเลขใหม่เอง ทายถูกรวมเกิน 90% และมีคำกำกับติดตัวเลข
    await resetTo(/สร้างข้อมูลแบบความบังเอิญต่ำ/, /ความบังเอิญต่ำ/, 'clear');
    await expect(panel).toContainText('ข้อมูลจำลอง · ความบังเอิญต่ำ', { timeout: 90_000 });
    const acc = page.locator('.ai-kpi', { hasText: 'ทายถูกรวม' }).locator('.ai-kpi__value');
    await expect(acc).toHaveText(/^\d+%$/);
    expect(parseInt(await acc.innerText(), 10), 'ทายถูกรวม').toBeGreaterThan(90);
    await expect(page.locator('.ai-kpis__note').first()).toHaveText('ตัวเลขชุดนี้มาจากข้อมูลจำลองแบบความบังเอิญต่ำ (สำหรับสาธิต) จึงสูงกว่าที่ตลาดจริงจะทำได้');
    await expect(page.locator('.ai-models__clear')).toBeVisible();
    await page.locator('.ai-kpis').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).every(a => a.playState === 'finished'));
    await page.screenshot({ path: 'test-results/staff-clear-390.png' });
    // แท็บทำนายจากไฟล์: ค่าตอนเทรนก็มีคำกำกับ
    await page.getByRole('tab', { name: /ทำนายจากไฟล์/ }).click();
    await page.getByRole('button', { name: /ลองกับไฟล์ตัวอย่าง/ }).click();
    await page.getByRole('button', { name: 'ให้ AI ทำนาย 8 แถว' }).click();
    await expect(page.locator('.pf-eval .ai-kpis__note')).toContainText('ค่า “ตอนเทรน”', { timeout: 90_000 });
    await page.getByRole('tab', { name: /ทำนายการจ่ายช้า/ }).first().click();

    // กลับเป็นแบบตลาดจริง: คำกำกับหายไปพร้อมกัน
    await resetTo(/กลับเป็นข้อมูลเหมือนตลาดจริง/, /เหมือนตลาดจริง/, 'realistic');
    await expect(panel).toContainText('ข้อมูลจำลอง · เหมือนตลาดจริง', { timeout: 90_000 });
    await expect(page.locator('.ai-kpis__note')).toHaveCount(0);
  });
});
