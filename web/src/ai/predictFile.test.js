import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNS, MAX_ROWS, checkRow, decodeBytes, fileProblem, parseCsv, readTable, resultsCsv, sampleCsv, summarize, toMonth, toNumber,
} from './predictFile.js';

const HEAD = COLUMNS.map(c => c.th).join(',');
const good = { ref: 'ก', stall_type: 'ของชำ', due_month: '7', tenure_years: '2', n_prior: '6', late_count: '1', days_late_total: '3', bill_total: '3000', prev_avg: '2900' };

test('ไฟล์ตัวอย่างอ่านกลับได้ครบทุกแถวโดยไม่มีแถวผิด', () => {
  const csv = sampleCsv();
  assert.ok(csv.startsWith('﻿'), 'ต้องมี BOM ให้ Excel เปิดภาษาไทยได้');
  const t = readTable(csv);
  assert.equal(t.fatal, undefined);
  assert.equal(t.invalid.length, 0, JSON.stringify(t.invalid));
  assert.equal(t.rows.length, t.total);
  assert.ok(t.rows.length >= 6);
  assert.equal(t.rows[0].line, 2, 'เลขบรรทัดนับหัวตารางเป็นบรรทัด 1 เหมือน Excel');
});

test('parseCsv: ช่องในเครื่องหมายคำพูด, "" และขึ้นบรรทัดในช่อง', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","he said ""hi"""\n"line1\nline2",3\n\n'),
    [['a', 'b'], ['x, y', 'he said "hi"'], ['line1\nline2', '3']]);
});

test('parseCsv: เดาตัวคั่น ; และแท็บจากหัวตาราง', () => {
  assert.deepEqual(parseCsv('a;b\n1,5;2'), [['a', 'b'], ['1,5', '2']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('decodeBytes: UTF-8 และไฟล์ ANSI ภาษาไทย (windows-874) ที่ Excel บันทึก', () => {
  assert.equal(decodeBytes(new TextEncoder().encode('ของชำ')), 'ของชำ');
  assert.equal(decodeBytes(Uint8Array.from([0xA1, 0xD2, 0xC3])), 'การ');
});

test('toNumber / toMonth', () => {
  assert.equal(toNumber('3,200 บาท'), 3200);
  assert.equal(toNumber(' 0.5 '), 0.5);
  assert.equal(toNumber(''), null);
  assert.ok(Number.isNaN(toNumber('สาม')));
  assert.equal(toMonth('5'), 5);
  assert.equal(toMonth('2026-05'), 5);
  assert.equal(toMonth('2026-12-01'), 12);
  assert.equal(toMonth('10/4/2026'), 4);
  assert.equal(toMonth('13'), null);
  assert.equal(toMonth('พ.ค.'), null);
});

test('checkRow: แถวถูกต้องได้ค่าที่แปลงแล้ว ประเภทแผงรับทั้งชื่อไทยและรหัส', () => {
  const r = checkRow(good);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value, { ref: 'ก', stall_type: 'dry', due_month: 7, tenure_years: 2, n_prior: 6, late_count: 1, days_late_total: 3, bill_total: 3000, prev_avg: 2900,
    early_days_avg: null, seen_count: null, app_count: null });
  assert.equal(checkRow({ ...good, stall_type: 'Clothes' }).value.stall_type, 'clothes');
  assert.equal(checkRow({ ...good, prev_avg: '' }).value.prev_avg, 0, 'ยอดก่อนหน้าเว้นว่างได้');
});

test('checkRow: ปัจจัยพฤติกรรมไม่บังคับ แต่ถ้ากรอกต้องอยู่ในช่วงและไม่เกินจำนวนบิลที่นับ', () => {
  assert.deepEqual(['early_days_avg', 'seen_count', 'app_count'].map(k => checkRow({ ...good, early_days_avg: '4.5', seen_count: '5', app_count: '6' }).value[k]), [4.5, 5, 6]);
  const e = f => checkRow({ ...good, ...f }).errors.join(' | ');
  assert.match(e({ seen_count: '7' }), /ระหว่าง 0 ถึง 6/);
  assert.match(e({ n_prior: '3', seen_count: '4' }), /เปิดดูบิลในแอป 4 บิล มากกว่าจำนวนบิลที่นับ \(3\)/);
  assert.match(e({ app_count: '1.5' }), /จำนวนเต็ม/);
  assert.match(e({ early_days_avg: '31' }), /ระหว่าง 0 ถึง 30/);
});

test('checkRow: ข้อความผิดบอกสิ่งที่ต้องแก้', () => {
  const e = f => checkRow({ ...good, ...f }).errors.join(' | ');
  assert.match(e({ stall_type: 'ผัก' }), /ไม่รู้จักประเภทแผง "ผัก" ใช้ได้: .*ผักผลไม้/);
  assert.match(e({ due_month: '13' }), /1–12/);
  assert.match(e({ late_count: '4', n_prior: '3', days_late_total: '9' }), /มากกว่าจำนวนบิลที่นับ/);
  assert.match(e({ late_count: '0', days_late_total: '5' }), /รวมวันที่ช้าไม่เป็น 0/);
  assert.match(e({ late_count: '3', days_late_total: '2' }), /อย่างน้อย 3 วัน/);
  assert.match(e({ n_prior: '2.5' }), /จำนวนเต็ม/);
  assert.match(e({ n_prior: '7' }), /ระหว่าง 0 ถึง 6/);
  assert.match(e({ bill_total: '0' }), /ยอดบิลนี้/);
  assert.match(e({ tenure_years: 'นาน' }), /ไม่ใช่ตัวเลข/);
  assert.match(e({ bill_total: '' }), /ยังไม่ได้ใส่ยอดบิลนี้/);
});

test('readTable: หัวตารางเป็นชื่ออังกฤษได้ แยกแถวผิดพร้อมเลขบรรทัด', () => {
  const keys = COLUMNS.map(c => c.key).join(',');
  const t = readTable(`${keys}\nA,dry,7,2,6,1,3,3000,2900\nB,ผัก,7,2,6,1,3,3000,2900\n`);
  assert.equal(t.rows.length, 1);
  assert.equal(t.invalid.length, 1);
  assert.equal(t.invalid[0].line, 3);
  assert.equal(t.invalid[0].ref, 'B');
});

test('readTable: ปัญหาทั้งไฟล์', () => {
  assert.match(readTable('').fatal, /ไฟล์ว่าง/);
  assert.match(readTable('ชื่อ,ยอด\nก,1').fatal, /ไม่พบคอลัมน์ "ประเภทแผง"/);
  assert.match(readTable(HEAD + '\n').fatal, /มีแต่หัวตาราง/);
  const many = HEAD + '\n' + Array.from({ length: MAX_ROWS + 1 }, () => 'ก,ของชำ,7,2,6,1,3,3000,2900').join('\n');
  assert.match(readTable(many).fatal, /ไม่เกิน 500 แถว/);
});

test('fileProblem: บอกให้บันทึก Excel เป็น CSV', () => {
  assert.match(fileProblem({ name: 'data.xlsx', size: 10 }), /CSV UTF-8/);
  assert.match(fileProblem({ name: 'data.pdf', size: 10 }), /\.csv/);
  assert.match(fileProblem({ name: 'big.csv', size: 2 * 1024 * 1024 }), /1 MB/);
  assert.equal(fileProblem({ name: 'ok.CSV', size: 10 }), null);
});

test('summarize และ resultsCsv ใช้เกณฑ์เดียวกับหน้า AI', () => {
  const results = [
    { input: checkRow(good).value, scores: { lr: 0.81, rf: 0.5 }, reasons: ['จ่ายช้า 1 ครั้งใน 6 บิลล่าสุด'] },
    { input: checkRow(good).value, scores: { lr: 0.45, rf: 0.2 }, reasons: [] },
    { input: checkRow(good).value, scores: { lr: 0.1, rf: 0.75 }, reasons: [] },
  ];
  assert.deepEqual(summarize(results, 'lr', 0.7, 0.4), { high: 1, mid: 1, low: 1, n: 3 });
  assert.deepEqual(summarize(results, 'rf', 0.7, 0.4), { high: 1, mid: 1, low: 1, n: 3 });
  const csv = resultsCsv(results, { models: ['lr', 'rf'], model: 'lr', names: { lr: 'LR', rf: 'RF' }, high: 0.7, mid: 0.4,
    levelWord: { high: 'สูง', mid: 'กลาง', low: 'ต่ำ' } });
  const t = parseCsv(csv);
  assert.equal(t.length, 4);
  assert.deepEqual(t[0].slice(-4), ['คะแนน LR (%)', 'คะแนน RF (%)', 'ระดับ (LR)', 'เหตุผล']);
  assert.deepEqual(t[1].slice(-4), ['81', '50', 'สูง', 'จ่ายช้า 1 ครั้งใน 6 บิลล่าสุด']);
  assert.equal(t[1][1], 'ของชำ', 'ประเภทแผงในไฟล์ผลเป็นภาษาไทย');
});
