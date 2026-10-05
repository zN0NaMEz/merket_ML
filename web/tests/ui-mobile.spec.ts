/*
 * ตรวจหน้าที่แก้ในแต่ละรอบของ RodeMap.md ที่ 390 × 844 (หัวข้อ 6)
 *   1) ไม่มีการเลื่อนแนวนอน [S7]
 *   2) จุดกดอย่างน้อย 44 × 44 px [S4] (ช่องที่อยู่ใน <label> วัดจาก label เพราะแตะ label แล้วได้ผลเดียวกัน)
 *   3) ไม่มีตัวหนังสือเล็กกว่า 13 px [S14]
 *   4) axe: ไม่มี violation ระดับ serious/critical (รวม color-contrast) [S28]
 * และตรวจผลของงานแต่ละข้อในรอบนั้น
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PW: Record<string, string> = { staff: 'staff1234', owner: 'owner1234', admin: 'admin1234' };

async function loginAs(page: Page, role: string) {
  const r = await page.request.post('/api/auth/login', { data: { username: role, password: PW[role] } });
  expect(r.ok(), `เข้าสู่ระบบ ${role} ไม่ได้`).toBeTruthy();
  const { token, user } = await r.json();
  await page.addInitScript(([t, u]) => {
    localStorage.setItem('bunyat.token', t);
    localStorage.setItem('bunyat.user', u);
  }, [token, JSON.stringify(user)]);   // แต่ละ test เริ่มด้วย storage ใหม่ โหมดนำเสนอจึงปิดอยู่ตั้งต้น
  return token as string;
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main h1')).toBeVisible();
}

async function noHorizontalScroll(page: Page) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(ok, 'หน้าเลื่อนแนวนอนได้').toBe(true);
}

async function smallTargets(page: Page): Promise<string[]> {
  return page.$$eval('a,button,input,select,[role=button]', els => els.flatMap(e => {
    const el = e as HTMLElement;
    if ((el as HTMLInputElement).type === 'hidden' || el.closest('[aria-hidden="true"], .visually-hidden')) return [];
    const target = (el.tagName === 'INPUT' && el.closest('label')) || el;
    const r = target.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return [];
    return r.width < 44 || r.height < 44 ? [`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`] : [];
  }));
}

async function tinyText(page: Page): Promise<string[]> {
  return page.$$eval('body *', els => els.flatMap(e => {
    const hasText = [...e.childNodes].some(n => n.nodeType === 3 && (n.textContent || '').trim());
    if (!hasText || !(e as HTMLElement).getBoundingClientRect().width) return [];
    const fs = parseFloat(getComputedStyle(e).fontSize);
    return fs < 13 ? [`${e.tagName.toLowerCase()}.${(e as HTMLElement).className} ${fs}px "${(e.textContent || '').trim().slice(0, 20)}"`] : [];
  }));
}

async function axeSerious(page: Page) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return res.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
}

async function fullChecks(page: Page) {
  await noHorizontalScroll(page);
  expect(await smallTargets(page), 'จุดกดเล็กกว่า 44 × 44 px').toEqual([]);
  expect(await tinyText(page), 'ตัวหนังสือเล็กกว่า 13 px').toEqual([]);
  expect(await axeSerious(page), 'axe serious/critical').toEqual([]);
}

/* ---------------- รอบ 1 · แก้เร็ว ---------------- */
test.describe('รอบ 1 · แก้เร็ว', () => {
  let token = '';
  test.beforeEach(async ({ page }) => { token = await loginAs(page, 'staff'); });

  test('ติดตามค้างชำระ: ผ่านเกณฑ์ทั้ง 4 ข้อ', async ({ page }) => {
    await open(page, '/staff');
    await fullChecks(page);
  });

  test('ผู้ค้า: ผ่านเกณฑ์ทั้ง 4 ข้อ', async ({ page }) => {
    await open(page, '/staff/vendors');
    await fullChecks(page);
  });

  test('ข้อ 4: ไม่แสดงรหัสกระบวนการ แสดงจำนวนงานค้างที่ตรงกับ API', async ({ page }) => {
    await open(page, '/staff');
    const nav = page.locator('nav.nav');
    for (const code of ['5.0', '3.0', '1.0', '2.0', 'ML', 'XAI', 'D7']) {
      await expect(nav.getByText(code, { exact: true }), `เมนูยังแสดงรหัส ${code}`).toHaveCount(0);
    }
    await expect(page.locator('.ptag')).toHaveCount(0);
    const counts = await (await page.request.get('/api/staff/today', { headers: { authorization: `Bearer ${token}` } })).json();
    const badge = (href: string) => nav.locator(`a[href="${href}"] .nav-badge`);
    if (counts.overdue) await expect(badge('/staff')).toHaveText(String(counts.overdue));
    if (counts.meter_pending) await expect(badge('/staff/meters')).toHaveText(`รอตรวจ ${counts.meter_pending}`);
    if (counts.contracts_expiring) await expect(badge('/staff/vendors')).toHaveText(`ใกล้หมด ${counts.contracts_expiring}`);
    // ตัวเลขในเมนูตรงกับจำนวนในหน้าปลายทาง
    await expect(page.locator('h2', { hasText: `บิลค้างชำระ (${counts.overdue})` })).toBeVisible();
  });

  test('ข้อ 4: โหมดนำเสนอแสดงรหัส และจำไว้จนกว่าจะปิด', async ({ page }) => {
    await open(page, '/staff?present=1');
    await expect(page.locator('.ptag')).toHaveText('5.0 ติดตามค้างชำระ');
    await open(page, '/staff/vendors');
    await expect(page.locator('.ptag')).toHaveCount(1);
    await open(page, '/staff?present=0');
    await expect(page.locator('.ptag')).toHaveCount(0);
  });

  test('เบอร์โทร: ลิงก์ tel: พร้อมปุ่มโทร และไม่ตัดบรรทัด', async ({ page }) => {
    await open(page, '/staff/vendors');
    const call = page.locator('a.tel__call').first();
    await expect(call).toHaveAttribute('href', /^tel:0\d{8,9}$/);
    const lines = await page.locator('.tel__num').evaluateAll(els => els.map(e => {
      const r = e.getBoundingClientRect(); return Math.round(r.height / parseFloat(getComputedStyle(e).lineHeight));
    }));
    expect(lines.every(n => n <= 1), 'เบอร์โทรตัดบรรทัด').toBe(true);
  });

  test('ข้อ 7: ปุ่มต่อสัญญาเท่ากับจำนวนสัญญาที่ใกล้หมด', async ({ page }) => {
    await open(page, '/staff/vendors');
    const counts = await (await page.request.get('/api/staff/today', { headers: { authorization: `Bearer ${token}` } })).json();
    await expect(page.getByRole('button', { name: 'ต่อสัญญา 1 ปี' })).toHaveCount(counts.contracts_expiring);
  });

  test('ขัดเกลา: บันทึกระบบแสดงไม่เกิน 3 บรรทัด และกดดูทั้งหมดได้', async ({ page }) => {
    await open(page, '/staff');
    const log = page.locator('section', { has: page.locator('h2', { hasText: 'บันทึกระบบตั้งเวลา' }) });
    const rows = log.locator('.notis li');
    expect(await rows.count()).toBeLessThanOrEqual(3);
    const more = log.getByRole('button', { name: /ดูทั้งหมด/ });
    if (await more.count()) {
      await more.click();
      expect(await rows.count()).toBeGreaterThan(3);
      await expect(log.getByRole('button', { name: 'ย่อ' })).toBeVisible();
    }
  });

  test('ข้อ 8: แผงปกติในหน้าจดมิเตอร์ไม่แสดงตัวเลขเทคนิคจนกว่าจะเปิดสวิตช์', async ({ page }) => {
    await open(page, '/staff/meters');
    await noHorizontalScroll(page);
    await expect(page.locator('.scores')).toHaveCount(0);
    await page.getByLabel('แสดงตัวเลขเทคนิคของ AI (IF, z-score)').check();
    expect(await page.locator('.scores').count()).toBeGreaterThan(0);
  });

  test.fixme('จดมิเตอร์: จุดกดและขนาดตัวหนังสือ (ทำในรอบ 2 ซึ่งเปลี่ยนเป็นการ์ด)', async ({ page }) => {
    await open(page, '/staff/meters');
    await fullChecks(page);
  });
});
