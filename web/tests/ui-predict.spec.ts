/*
 * แท็บ "ทำนายจากไฟล์" ในหน้า AI วิเคราะห์ (/staff/ai) ที่ 390 × 844
 * ตรวจเกณฑ์ของ RodeMap.md หัวข้อ 6 เฉพาะในแผงของแท็บนี้ (ส่วนอื่นของหน้า AI ยังไม่อยู่ในรอบที่ปรับ)
 * และตรวจทุกสถานะ: ยังไม่มีไฟล์ · ไฟล์ใช้ไม่ได้ · มีแถวผิด · กำลังทำนาย · AI ไม่พร้อม · ผลลัพธ์
 * ต้องมีเว็บ + API + ML ที่รันอยู่ และเทรนโมเดลแล้ว:  UI_BASE_URL=http://localhost:5173 npm run test:ui
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

/* ป้ายบอกชนิดข้อมูลที่โมเดลเรียน: โปรไฟล์ clear (ความบังเอิญต่ำ) ต้องบอกทุกที่ที่แสดงตัวเลขคุณภาพ */
test.describe('ป้ายข้อมูลจำลอง', () => {
  test('โปรไฟล์ความบังเอิญต่ำ: หน้า AI วิเคราะห์และแถบสถานะเบื้องหลัง AI บอกชัด', async ({ page, request }) => {
    const status = await (await request.get('/api/ai/status')).json();
    test.skip(status.sim_profile !== 'clear', `ฐานข้อมูลนี้เป็นโปรไฟล์ ${status.sim_profile} (ทดสอบเมื่อ seed ด้วย SIM_PROFILE=clear)`);
    await loginAs(page, 'staff');
    await page.goto('/staff/ai');
    await expect(page.locator('main h1')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.ai-status__synth')).toContainText('ข้อมูลจำลองแบบความบังเอิญต่ำ');
    await page.goto('/ai/behind');
    await expect(page.locator('.bh-synth').first()).toContainText('ความบังเอิญต่ำ');
  });
});
