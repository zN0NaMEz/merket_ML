import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNS, EVAL_THRESHOLD, MAX_ROWS, aucOf, bestModels, evaluateFile, isCorrect, payloadOf, toActual, checkRow, decodeBytes, fileProblem, parseCsv, readTable, resultsCsv, sampleCsv, summarize, toMonth, toNumber,
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
    early_days_avg: null, seen_count: null, app_count: null, actual: null });
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


test('ผลจริง: อ่านได้หลายรูปแบบ ผิดแล้วบอกค่าที่ใช้ได้ และไม่ถูกส่งไปให้ AI', () => {
  for (const v of ['จ่ายช้า', 'ช้า', '1', 'Late', 'YES']) assert.equal(toActual(v), 1, v);
  for (const v of ['ตรงเวลา', 'จ่ายตรงเวลา', '0', 'on time', 'no']) assert.equal(toActual(v), 0, v);
  assert.equal(toActual(''), null);
  assert.ok(Number.isNaN(toActual('เกือบช้า')));
  assert.equal(checkRow({ ...good, actual: 'จ่ายช้า' }).value.actual, 1);
  assert.match(checkRow({ ...good, actual: 'เกือบช้า' }).errors.join(), /ผลจริง "เกือบช้า" ใช้ได้: จ่ายช้า, ตรงเวลา, 1, 0/);
  const v = checkRow({ ...good, actual: '0' }).value;
  assert.equal('actual' in payloadOf(v), false);
  assert.equal(payloadOf(v).stall_type, 'dry');
});

test('aucOf: นับคู่ คะแนนเท่ากันนับครึ่ง และคิดไม่ได้ถ้ามีกลุ่มเดียว', () => {
  assert.equal(aucOf([0.9, 0.8, 0.3, 0.1], [1, 1, 0, 0]), 1);
  assert.equal(aucOf([0.1, 0.3, 0.8, 0.9], [1, 1, 0, 0]), 0);
  assert.equal(aucOf([0.5, 0.5], [1, 0]), 0.5);
  assert.equal(aucOf([0.9, 0.4, 0.6, 0.2], [1, 1, 0, 0]), 0.75);   // คู่ (0.4, 0.6) กลับทาง 1 ใน 4 คู่
  assert.equal(aucOf([0.9, 0.8], [1, 1]), null);
});

test('evaluateFile: confusion matrix ที่เกณฑ์ 0.5 และตัวชี้วัดตามนิยาม', () => {
  const row = (y, lr, rf) => ({ input: { actual: y }, scores: { lr, rf } });
  const results = [row(1, 0.9, 0.4), row(1, 0.6, 0.7), row(1, 0.3, 0.2), row(0, 0.7, 0.1), row(0, 0.2, 0.3), row(0, 0.1, 0.6),
    { input: { actual: null }, scores: { lr: 0.99, rf: 0.99 } }];               // ไม่มีผลจริง ไม่นับ
  const e = evaluateFile(results, 'lr');
  assert.equal(EVAL_THRESHOLD, 0.5);
  assert.deepEqual([e.n, e.pos, e.neg, e.tp, e.fp, e.fn, e.tn], [6, 3, 3, 2, 1, 1, 2]);
  assert.equal(e.accuracy, 4 / 6);
  assert.equal(e.precision, 2 / 3);
  assert.equal(e.recall, 2 / 3);
  assert.ok(Math.abs(e.f1 - 2 / 3) < 1e-12);
  assert.equal(e.auc, 7 / 9);                                  // 0.9 ชนะ 3 คู่, 0.6 ชนะ 2, 0.3 ชนะ 2
  assert.ok(Math.abs(e.brier - (0.01 + 0.16 + 0.49 + 0.49 + 0.04 + 0.01) / 6) < 1e-12);
  const r = evaluateFile(results, 'rf');
  assert.deepEqual([r.tp, r.fp, r.fn, r.tn], [1, 1, 2, 2]);
  // ดีที่สุดต่อตัวชี้วัด (Brier ยิ่งต่ำยิ่งดี)
  const evals = { lr: e, rf: r };
  assert.deepEqual([...bestModels(evals, 'auc')], ['lr']);
  assert.deepEqual([...bestModels(evals, 'brier', true)], [e.brier < r.brier ? 'lr' : 'rf']);
  assert.deepEqual([...bestModels({ lr: e }, 'auc')], [], 'มีโมเดลเดียวไม่ต้องบอกว่าดีสุด');
  assert.equal(isCorrect(results[0], 'lr'), true);
  assert.equal(isCorrect(results[0], 'rf'), false);
  assert.equal(isCorrect(results[6], 'lr'), null);
});

test('evaluateFile: ไม่มีผลจริง หรือมีกลุ่มเดียว ไม่ล้มและไม่แต่งตัวเลข', () => {
  const none = evaluateFile([{ input: { actual: null }, scores: { lr: 0.4 } }], 'lr');
  assert.deepEqual([none.n, none.accuracy, none.auc, none.f1], [0, null, null, null]);
  const allLate = evaluateFile([{ input: { actual: 1 }, scores: { lr: 0.8 } }, { input: { actual: 1 }, scores: { lr: 0.3 } }], 'lr');
  assert.equal(allLate.auc, null);
  assert.equal(allLate.recall, 0.5);
  assert.equal(allLate.precision, 1);
});

test('resultsCsv: มีผลจริงแล้วเพิ่มคอลัมน์ทายถูก', () => {
  const v = checkRow({ ...good, actual: 'จ่ายช้า' }).value;
  const csv = resultsCsv([{ input: v, scores: { lr: 0.8 }, reasons: [] }], { models: ['lr'], model: 'lr', names: { lr: 'LR' }, high: 0.7, mid: 0.4,
    levelWord: { high: 'สูง', mid: 'กลาง', low: 'ต่ำ' } });
  const [head, line] = parseCsv(csv);
  assert.equal(head.at(-1), 'ทายถูก (LR เกณฑ์ 50%)');
  assert.equal(line.at(-1), 'ถูก');
  assert.equal(line[head.indexOf('ผลจริง (ถ้ารู้)')], 'จ่ายช้า');
});
