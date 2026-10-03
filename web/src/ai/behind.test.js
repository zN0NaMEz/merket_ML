// รัน: cd web && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { BEHIND_ROLES, POLL_MS, riskPct, defaultTab, lastUpdated, mlNotice, noModelYet, pickTab, shouldPoll, tabsFor, thDateTime, thTime } from './behind.js';

test('แท็บและแท็บเริ่มต้นตามบทบาท (RodeMap หัวข้อ 3)', () => {
  assert.deepEqual(tabsFor('staff'), ['bills', 'meters']);
  assert.equal(defaultTab('staff'), 'meters');
  assert.deepEqual(tabsFor('owner'), ['bills', 'meters', 'quality']);
  assert.equal(defaultTab('owner'), 'bills');
  assert.deepEqual(tabsFor('admin'), ['bills', 'meters', 'quality', 'card']);
  assert.equal(defaultTab('admin'), 'quality');
  assert.deepEqual(tabsFor('vendor'), []);              // ผู้ค้าไม่เห็นหน้านี้เลย
  assert.ok(!BEHIND_ROLES.includes('vendor'));
});

test('แท็บจาก URL ที่บทบาทนั้นไม่มีสิทธิ์ ถูกเปลี่ยนเป็นแท็บเริ่มต้น', () => {
  assert.equal(pickTab('staff', 'card'), 'meters');
  assert.equal(pickTab('staff', 'quality'), 'meters');
  assert.equal(pickTab('owner', 'quality'), 'quality');
  assert.equal(pickTab('admin', 'card'), 'card');
  assert.equal(pickTab('admin', undefined), 'quality');
});

test('ถามสถานะไม่ถี่กว่า 30 วินาที และหยุดเมื่อซ่อนแท็บ (4.5)', () => {
  assert.ok(POLL_MS >= 30000);
  assert.equal(shouldPoll('visible'), true);
  assert.equal(shouldPoll('hidden'), false);
});

test('เวลาแสดงตามเวลาไทยเสมอ ไม่ขึ้นกับเครื่องผู้ใช้', () => {
  assert.equal(thTime('2026-10-02T07:20:00Z'), '14:20');
  assert.match(thDateTime('2026-10-02T07:20:00Z'), /^2 ต\.ค\. 69 14:20$/);
  assert.equal(thTime(null), null);
  assert.equal(thDateTime('ไม่ใช่วันที่'), null);
});

const STATUS = state => ({
  ml: { state },
  models: { risk: { trained_at: '2026-10-02T07:20:00Z' }, anomaly: { trained_at: '2026-10-01T03:00:00Z' } },
  scoring: { last_scored_at: '2026-10-02T06:00:00Z' },
});

test('ข้อมูลล่าสุดคือเวลาล่าสุดของการเทรนหรือการให้คะแนน', () => {
  assert.equal(lastUpdated(STATUS('ready')), '2026-10-02T07:20:00.000Z');
  assert.equal(lastUpdated({ models: {}, scoring: {} }), null);
});

test('ข้อความเมื่อ ML หลับบอกเวลาข้อมูลล่าสุด และไม่ใช่ error', () => {
  const n = mlNotice(STATUS('asleep'));
  assert.equal(n.tone, 'warn');
  assert.equal(n.text, 'กำลังเปิดระบบ AI ใช้เวลาประมาณ 1 นาที ระหว่างนี้แสดงข้อมูลล่าสุดเมื่อ 14:20');
});

test('ข้อความเมื่อ ML ไม่ตอบ บอกว่างานหลักยังใช้ได้', () => {
  const n = mlNotice(STATUS('down'));
  assert.equal(n.tone, 'bad');
  assert.match(n.text, /^ระบบ AI ไม่ตอบ การจ่ายเงินและดูบิลยังใช้ได้ตามปกติ/);
  assert.equal(mlNotice(STATUS('ready')), null);
  assert.equal(mlNotice(null), null);
});

test('ยังไม่เคยเทรนโมเดลใดเลย = สถานะว่าง', () => {
  assert.equal(noModelYet({ models: { risk: null, anomaly: null } }), true);
  assert.equal(noModelYet(STATUS('ready')), false);
  assert.equal(noModelYet(null), false);                 // ยังโหลดไม่เสร็จ ไม่ใช่สถานะว่าง
});

test('เปอร์เซ็นต์ความเสี่ยงไม่ขัดกับเกณฑ์ (ปัดลง)', () => {
  assert.equal(riskPct(0.3996), '39%');                  // ยังเป็น "ต่ำ" ถ้าเกณฑ์ปานกลางคือ 0.40
  assert.equal(riskPct(0.4), '40%');
  assert.equal(riskPct(0.7), '70%');                     // 0.7*100 = 70.00000000000001 ในทศนิยมลอยตัว
  assert.equal(riskPct(0.29), '29%');                    // 0.29*100 = 28.999999999999996
  assert.equal(riskPct(null), '–');
});
