# ปรับ UI ให้ใช้งานง่ายบนมือถือ (คงสีเดิม) — แผนและ Prompt สำหรับ Claude Code

ที่มา: ผลตรวจ UI ของระบบบริหารตลาดบัญญัติทรัพย์ (หน้าจดมิเตอร์ ติดตามค้างชำระ ผู้ค้า และหน้า AI) ที่หน้าจอกว้าง 390 px
เป้าหมาย: เจ้าหน้าที่ทำงานหลักบนมือถือกลางตลาดได้เร็ว อ่านง่ายกลางแดด และกดพลาดน้อยลง โดย **ไม่เปลี่ยนสไตล์และชุดสีเดิม **

ทุกข้อกำหนดในเอกสารนี้มีรหัสแหล่งอ้างอิง [S#] ซึ่งอยู่ในหัวข้อ 9

---

## 1. ข้อจำกัดด้านภาพลักษณ์ (ห้ามละเมิด)

1. **ใช้ชุดสีเดิมเท่านั้น:** อ่านค่าสีจาก CSS variables หรือ theme ที่มีอยู่ ห้ามเพิ่มสีใหม่ ใช้ได้เฉพาะเฉดอ่อนหรือเข้มที่ได้จากสีเดิม และต้องประกาศเป็น token ก่อนใช้
2. **ตรวจความต่างของสีทุกคู่ที่ใช้กับตัวหนังสือ:** ตัวหนังสือปกติต้องได้อย่างน้อย 4.5:1 ตัวหนังสือใหญ่ (24 px ขึ้นไป หรือ 18.66 px ตัวหนา) อย่างน้อย 3:1 ขอบปุ่มและไอคอนที่สื่อความหมายอย่างน้อย 3:1 [S1][S2] ถ้าบรอนซ์บนครีมไม่ผ่านกับตัวหนังสือขนาดเล็ก ให้ใช้บรอนซ์เฉพาะกับพื้นหลัง ขอบ หรือตัวหนังสือใหญ่ แล้วใช้หมึกกับตัวหนังสือเล็ก
3. **สีไม่ใช่สิ่งเดียวที่บอกความหมาย:** สถานะ "AI ทัก" "ค้างชำระ" "ถูกตัดน้ำไฟ" ต้องมีข้อความหรือไอคอนกำกับเสมอ [S3]
4. **ไม่เปลี่ยนฟอนต์ ไม่เปลี่ยนรัศมีมุมและเงาที่ใช้อยู่** ปรับได้เฉพาะขนาด ระยะห่าง และการจัดวาง

---

## 2. หลักการออกแบบที่ใช้ตัดสินใจ

| หลักการ | ใช้ทำอะไรในงานนี้ | อ้างอิง |
|---|---|---|
| เป้าการแตะใหญ่พอสำหรับนิ้ว | ปุ่มและช่องกรอกอย่างน้อย 44 × 44 px งานหลักใช้ 48 px | [S4][S5][S6] |
| ไม่ต้องเลื่อนสองทิศ | ที่ความกว้าง 320–390 px อ่านได้ครบโดยไม่เลื่อนแนวนอน | [S7] |
| ตารางบนจอแคบเปลี่ยนเป็นการ์ด | หน้าค้างชำระ ผู้ค้า และจดมิเตอร์ | [S8][S9] |
| ใช้ภาษาของผู้ใช้ ไม่ใช่ภาษาระบบ | เลิกแสดงรหัส 5.0, 3.0, D7, XAI | [S10] (ข้อ 2) |
| บอกสถานะของระบบเสมอ | แถบ "งานวันนี้" และหน้าสรุปหลังออกบิล | [S10] (ข้อ 1) |
| ผู้ใช้ควบคุมและย้อนกลับได้ | เลิกทำหลังยืนยันค่าและหลังบันทึกตัดน้ำไฟ | [S10] (ข้อ 3), [S11] |
| ป้องกันความผิดพลาดในการกระทำที่มีผลแรง | หน้าต่างยืนยันก่อนตัดน้ำไฟ | [S10] (ข้อ 5), [S11], [S12] |
| เปิดเผยรายละเอียดทีละขั้น | ซ่อนตัวเลขเทคนิคของแผงปกติ พับบันทึกระบบ | [S13], [S10] (ข้อ 8) |
| แสดงเฉพาะสิ่งที่ต้องทำ | ปุ่มต่อสัญญาเฉพาะรายที่ใกล้หมด | [S10] (ข้อ 8) |
| ตัวหนังสืออ่านง่ายบนมือถือ | ตัวหลัก 16 px รองไม่ต่ำกว่า 13–14 px | [S14][S15] |
| วางปุ่มหลักในระยะนิ้วโป้ง | ปุ่มบันทึกและถัดไปอยู่ล่างจอ แต่ไม่บังช่องที่กำลังกรอก | [S16][S17] |

---

## 3. งานแต่ละข้อ (ข้อกำหนด + เกณฑ์ตรวจรับ)

### ข้อ 1 · หน้าจดมิเตอร์บนมือถือ (ผลมากที่สุด)
ปัญหา: ที่ 390 px เห็นแค่คอลัมน์น้ำ, 64 จุดกดเล็กกว่า 44 px, แถบ "กรอกแล้ว 32/32" กินจอราว 1 ใน 6

ข้อกำหนด
- จอแคบกว่า 700 px แสดงเป็น **การ์ดแผงละใบ** หัวการ์ดคือเลขแผงและชื่อร้าน ตามด้วยช่องน้ำและไฟเรียงลง [S8][S9]
- ช่องกรอกสูงอย่างน้อย 48 px ตัวหนังสือในช่อง 16 px ขึ้นไป (ต่ำกว่านี้ Safari บน iPhone จะซูมหน้าจอเมื่อแตะช่อง) [S5][S6][S15]
- ใช้ `<input type="text" inputmode="decimal" autocomplete="off">` แทน `type="number"` เพื่อเปิดแป้นตัวเลข และเลี่ยงปัญหาของ `type="number"` เช่น ค่าเปลี่ยนเมื่อเลื่อนนิ้ว [S18][S19]
- ใส่ `enterkeyhint="next"` และเมื่อกด "ถัดไป" ให้ย้ายไปช่องถัดไปเอง (น้ำ → ไฟ → แผงถัดไป) ช่องสุดท้ายใช้ `enterkeyhint="done"` [S20]
- แสดงเลขรอบก่อนเป็น placeholder หรือข้อความใต้ช่อง เช่น "รอบก่อน 10,482" และเมื่อพิมพ์ ให้แสดงหน่วยที่ใช้ทันที เช่น "ใช้ไป 37 หน่วย" (ลดการต้องจำ) [S10] (ข้อ 6)
- แถบกรองบนสุด: **ยังไม่กรอก / AI ทัก / ทั้งหมด** แสดงจำนวนในแต่ละปุ่ม แผงที่ AI ทักเรียงขึ้นก่อน [S10] (ข้อ 1, 6)
- แถบความคืบหน้าด้านล่างย่อเหลือสูงไม่เกิน 56 px รวมปุ่มหลัก และต้องไม่บังช่องที่กำลังโฟกัส (เลื่อนช่องขึ้นเหนือแถบเมื่อโฟกัส) [S17][S21]
- แผงที่ AI ทักมีป้ายข้อความ "AI ทัก" และปุ่ม "ดูเหตุผล" (ดูข้อ 5) แผงปกติไม่แสดงตัวเลขเทคนิค (ดูข้อ 8)

เกณฑ์ตรวจรับ
- ที่ viewport 390 × 844 ไม่มีการเลื่อนแนวนอน (`scrollWidth <= clientWidth`)
- ทุกจุดกดและช่องกรอกในหน้านี้ ≥ 44 × 44 px ตัวหลัก ≥ 48 px สูง
- กรอกครบ 1 แผงด้วยแป้นตัวเลขอย่างเดียวโดยไม่ต้องแตะจอเพื่อย้ายช่อง
- เปิดแป้นพิมพ์แล้ว ช่องที่โฟกัสอยู่ไม่ถูกแถบล่างบัง

### ข้อ 2 · ตารางแตกบนมือถือ (ติดตามค้างชำระ, ผู้ค้า)
ปัญหา: เบอร์โทรตัดเป็น 3 บรรทัด ชื่อผู้ค้าตัดแทบทุกพยางค์ คอลัมน์ท้ายหลุดจอ

ข้อกำหนด
- จอแคบกว่า 700 px เปลี่ยนเป็นการ์ด ในการ์ดให้ชื่อผู้ค้าเต็มบรรทัด ยอดเงินและสถานะอยู่แถวที่สอง [S7][S8]
- เบอร์โทรและยอดเงินใช้ `white-space: nowrap` และตัวเลขความกว้างเท่ากัน (`font-variant-numeric: tabular-nums`) [S22][S23]
- เบอร์โทรเป็นลิงก์ `tel:` พร้อมปุ่ม "โทร" ขนาดอย่างน้อย 44 × 44 px เพราะเจ้าหน้าที่ต้องโทรตามผู้ค้า [S4][S24]
- ชื่อภาษาไทยตัดบรรทัดตามคำ ไม่ใช่ทีละพยางค์ ให้คอลัมน์ชื่อกว้างพอ (การ์ดแก้ได้เอง) ห้ามใช้ `word-break: break-all` กับข้อความไทย [S25]

เกณฑ์ตรวจรับ
- ที่ 390 px ไม่มีเบอร์โทรหรือยอดเงินที่ตัดบรรทัด ไม่มีคอลัมน์หลุดจอ
- แตะ "โทร" แล้วเปิดแอปโทรศัพท์พร้อมเบอร์

### ข้อ 3 · แถบ "งานวันนี้"
ข้อกำหนด
- บนสุดของหน้าแรกเจ้าหน้าที่: **ตัดน้ำไฟ n · คืนน้ำไฟ n · มิเตอร์รอตรวจ n · สัญญาใกล้หมด n** แต่ละตัวกดแล้วไปหน้านั้นพร้อมตัวกรองที่ตรงกัน [S10] (ข้อ 1, 6)
- ใช้ส่วนประกอบเดียวกับหน้า "วันนี้" ของเจ้าของ
- ตัวที่เป็น 0 แสดงเป็นสีจาง ไม่ซ่อน เพื่อยืนยันว่าไม่มีงานค้าง
- บนมือถือถ้ายาวเกินหนึ่งแถว ให้เลื่อนแนวนอนได้เฉพาะแถบนี้ หรือจัดเป็น 2 × 2

เกณฑ์ตรวจรับ: ตัวเลขตรงกับจำนวนในหน้าปลายทางหลังกรอง

### ข้อ 4 · เลิกแสดงรหัสในเมนู
ข้อกำหนด
- เอารหัส "5.0, 3.0, ML, XAI, D7" ออกจากเมนูและหัวหน้า แทนด้วยจำนวนงานค้าง เช่น "ติดตามค้างชำระ 4" "จดมิเตอร์ · รอตรวจ 4" [S10] (ข้อ 2)
- ถ้ายังต้องใช้ตอนนำเสนอ ให้มี **โหมดนำเสนอ** เปิดด้วยการตั้งค่า (เช่น query `?present=1` เก็บใน localStorage) แสดงรหัสเป็นป้ายเล็ก ค่าเริ่มต้นปิด

### ข้อ 5 · รวม AI ให้อยู่ที่เดียวและยืนยันแบบเดียว
ข้อกำหนด
- แยกส่วนประกอบ `AnomalyReview` (กราฟช่วงปกติ + ปุ่มยืนยัน/แก้ค่า + toast เลิกทำ) จากหน้าเบื้องหลัง AI ให้ใช้ซ้ำได้
- หน้าจดมิเตอร์: แผงที่ AI ทักมีปุ่ม "ดูเหตุผล" เปิด `AnomalyReview` ใน bottom sheet แทนการติ๊ก "ตรวจหน้างานแล้ว" ให้มีวิธียืนยันเพียงแบบเดียวทั้งระบบ [S10] (ข้อ 4)
- รวมเมนู "AI วิเคราะห์" กับ "เบื้องหลัง AI" เป็นเมนูเดียวมีแท็บ ย้ายการปรับเกณฑ์ไปไว้ในส่วนพับ [S13]
- การยืนยันมี toast "ยืนยันค่าแล้ว" พร้อม "เลิกทำ" ตามที่กำหนดใน roadmap หัวข้อ 3.3 และประกาศผ่าน `aria-live` [S11][S26]

### ข้อ 6 · ขนาดตัวหนังสือ
ข้อกำหนด
- บนมือถือ: ตัวหลัก 16 px, รายละเอียดรอง 14 px, ต่ำสุด 13 px เฉพาะป้ายสั้น ห้ามต่ำกว่า 13 px [S14][S15]
- ตั้งเป็น token (`--font-body`, `--font-secondary`, `--font-caption`) แล้วไล่แทนค่าที่กำหนดตรง ๆ ในหน้าจดมิเตอร์และหน้า AI
- ตัวเลขในตารางและการ์ดใช้ `tabular-nums` [S23]
- ระยะบรรทัดของข้อความไทยอย่างน้อย 1.5 เท่าของขนาดตัวอักษร เพื่อไม่ให้สระบนล่างชนกัน [S27]

เกณฑ์ตรวจรับ: ไม่มีข้อความใดต่ำกว่า 13 px ที่ 390 px (ตรวจด้วยสคริปต์ในหัวข้อ 6)

### ข้อ 7 · หน้าผู้ค้า: ปุ่มต่อสัญญาซ้ำ 32 ปุ่ม
ข้อกำหนด
- แสดงปุ่ม "ต่อสัญญา 1 ปี" เฉพาะสัญญาที่หมดแล้วหรือเหลือไม่ถึง 90 วัน รายอื่นแสดงวันหมดสัญญาเป็นข้อความ [S10] (ข้อ 8)
- เพิ่มช่องค้นหาชื่อหรือเลขแผง และปุ่มกรอง: **ค้างชำระ / ใกล้หมดสัญญา / ถูกตัดน้ำไฟ** พร้อมจำนวน

### ข้อ 8 · ซ่อนตัวเลขเทคนิคของแผงปกติ
ข้อกำหนด
- แผงปกติแสดงแค่ "ปกติ" ตัวเลขอย่าง "IF 0.455 · z น้ำ −1.17" อยู่ในส่วน "รายละเอียดเชิงเทคนิค" ที่พับไว้ [S13]
- แผงที่ AI ทักแสดงเหตุผลเป็นภาษาคนก่อน เช่น "น้ำสูงกว่าปกติของร้านนี้มาก" และตัวเลขเทคนิคอยู่ในส่วนพับเช่นกัน

### ขัดเกลา
- **บันทึกระบบ:** แสดง 3 บรรทัดล่าสุด รวมบรรทัดที่ซ้ำติดกันเป็นบรรทัดเดียวพร้อม "×n" และมีปุ่ม "ดูทั้งหมด" [S13]
- **บันทึกตัดน้ำไฟ:** หน้าต่างยืนยันที่บอกผลชัด เช่น "ตัดน้ำและไฟของแผง A-12 (สมใจ ผักสด) ค้าง 4 วัน ยอด 1,250 บาท" ปุ่มยืนยันเขียนเป็นกริยา "ตัดน้ำไฟ" ไม่ใช่ "ตกลง" และหลังบันทึกมี toast เลิกทำแบบเดียวกับหน้ามิเตอร์ [S11][S12]
- **หลังกด "ออกบิล":** หน้าสรุป ออกบิลไปกี่ใบ AI ทักกี่แผง (กดไปดูได้) และขั้นต่อไปคืออะไร [S10] (ข้อ 1)

---

## 4. ลำดับการทำ

| รอบ | งาน | เวลาโดยประมาณ |
|---|---|---|
| 1 · แก้เร็ว | ข้อ 4, ข้อ 8, เบอร์โทรไม่ตัดบรรทัด + ปุ่มโทร, ข้อ 7 ส่วนปุ่มต่อสัญญา, พับบันทึกระบบ | ครึ่งวัน |
| 2 · จดมิเตอร์บนมือถือ | ข้อ 1 + แยก `AnomalyReview` (ส่วนแรกของข้อ 5) + token ตัวหนังสือ (ข้อ 6) เฉพาะหน้านี้ | 1–2 วัน |
| 3 · งานวันนี้และรวม AI | ข้อ 3 + ข้อ 5 ส่วนที่เหลือ | 1 วัน |
| 4 · ตารางเป็นการ์ดและขัดเกลา | ข้อ 2 ทุกหน้าที่เหลือ, ข้อ 6 ทั้งระบบ, ข้อ 7 ส่วนค้นหาและกรอง, หน้าต่างยืนยันตัดน้ำไฟ, หน้าสรุปหลังออกบิล | 1–2 วัน |

---

## 5. เพิ่มใน `CLAUDE.md`

```markdown
## UI rules (mobile-first, keep the existing look)
- Read docs/ui-mobile-usability-prompts.md before UI work.
- Keep the existing palette (cream, ink, bronze) and fonts. Do not add new hues. New tints/shades must be derived from existing colors and declared as tokens first.
- Every text/background pair must meet WCAG contrast: 4.5:1 for normal text, 3:1 for large text and meaningful UI borders/icons. Report the ratio for any new pair.
- Never use color alone to convey status; always pair with text or an icon.
- Touch targets >= 44x44 px; primary inputs and buttons >= 48 px tall.
- At 390 px width there must be no horizontal page scroll. Below 700 px, data tables become cards.
- Mobile text: body 16 px, secondary 14 px, never below 13 px. Numbers use tabular-nums. Phone numbers and amounts never wrap.
- Numeric inputs: type="text" inputmode="decimal" with enterkeyhint; never type="number".
- Do not show internal codes (5.0, D7, XAI) outside presentation mode.
- Destructive actions (utility cut) need a confirmation dialog that states the consequence, plus undo via toast.
- Every design decision in a PR description cites its source ID from docs/ui-mobile-usability-prompts.md section 9.
- Definition of done per round: Playwright + axe checks in section 6 pass at 390x844, and you attach before/after screenshots at 390 px and 1280 px.
```

---

## 6. วิธีตรวจอัตโนมัติ (ใช้ทุกรอบ)

ให้ Claude Code สร้าง `web/tests/ui-mobile.spec.ts` ด้วย Playwright + `@axe-core/playwright` [S28] ตรวจทุกหน้าที่แก้ในรอบนั้นที่ viewport 390 × 844

```ts
// แนวคิดของการตรวจ (ให้ Claude Code เขียนให้สมบูรณ์)
// 1) ไม่มีการเลื่อนแนวนอน
expect(await page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

// 2) จุดกดทุกจุดอย่างน้อย 44x44
const small = await page.$$eval('a,button,input,select,[role=button]', els =>
  els.filter(e => { const r = e.getBoundingClientRect();
    return r.width > 0 && (r.width < 44 || r.height < 44); }).length);
expect(small).toBe(0);

// 3) ไม่มีตัวหนังสือเล็กกว่า 13 px
const tiny = await page.$$eval('body *', els => els.filter(e =>
  e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) &&
  parseFloat(getComputedStyle(e).fontSize) < 13).length);
expect(tiny).toBe(0);

// 4) axe: ไม่มี violation ระดับ serious/critical (รวม color-contrast)
```

ตรวจด้วยมือเพิ่ม: เปิดบนมือถือจริงกลางแจ้งหรือเปิดความสว่างจอสูงสุด แล้วลองกรอกมิเตอร์ 5 แผงด้วยมือเดียว

---

## 7. Prompt แยกตามรอบ

### รอบ 1 · แก้เร็ว
```text
อ่าน docs/ui-mobile-usability-prompts.md หัวข้อ 1, 2 และ 3 (ข้อ 4, 7, 8, ขัดเกลาเรื่องบันทึกระบบ) ก่อน
แล้วอ่านไฟล์ theme/CSS variables ของโปรเจกต์ สรุปชุดสีและฟอนต์ที่มีอยู่ให้ผมดูก่อนแก้
งานรอบนี้:
1) ลบรหัส 5.0, 3.0, ML, XAI, D7 จากเมนูและหัวหน้า แทนด้วยจำนวนงานค้าง เพิ่มโหมดนำเสนอ (ค่าเริ่มต้นปิด)
2) แผงปกติในหน้าจดมิเตอร์และหน้า AI แสดง "ปกติ" ย้ายตัวเลขเทคนิคไปส่วนพับ
3) เบอร์โทรและยอดเงิน nowrap + tabular-nums, เบอร์โทรเป็น tel: พร้อมปุ่ม "โทร" 44x44
4) ปุ่มต่อสัญญาแสดงเฉพาะสัญญาที่หมดหรือเหลือไม่ถึง 90 วัน
5) บันทึกระบบแสดง 3 บรรทัดล่าสุด รวมบรรทัดซ้ำเป็น ×n และมีปุ่มดูทั้งหมด
ห้ามเพิ่มสีใหม่ สร้าง web/tests/ui-mobile.spec.ts ตามหัวข้อ 6 ให้ผ่านสำหรับหน้าที่แก้
ส่งภาพก่อน/หลังที่ 390 px และ 1280 px และระบุรหัสแหล่งอ้างอิง [S#] ของแต่ละการเปลี่ยนแปลง
```

### รอบ 2 · จดมิเตอร์บนมือถือ
```text
ทำข้อ 1 ทั้งหมด และส่วนแรกของข้อ 5 กับข้อ 6 ตาม docs/ui-mobile-usability-prompts.md
ก่อนเขียนโค้ดจริง ทำหน้าตัวอย่างการ์ดจดมิเตอร์เป็น HTML ไฟล์เดียวด้วยสีและฟอนต์ของโปรเจกต์ ให้ผมลองบนมือถือก่อน
หลังผมยืนยัน:
1) การ์ดแผงละใบเมื่อจอ < 700 px, ช่องน้ำ/ไฟสูง ≥ 48 px, font 16 px, inputmode="decimal", enterkeyhint next/done และย้ายโฟกัสอัตโนมัติ
2) แสดงเลขรอบก่อนและหน่วยที่ใช้ทันทีระหว่างพิมพ์
3) แถบกรอง ยังไม่กรอก / AI ทัก / ทั้งหมด พร้อมจำนวน และแผงที่ AI ทักขึ้นก่อน
4) แถบล่างสูง ≤ 56 px และไม่บังช่องที่โฟกัส
5) แยก AnomalyReview จากหน้าเบื้องหลัง AI แล้วเปิดใน bottom sheet จากปุ่ม "ดูเหตุผล" แทนการติ๊ก "ตรวจหน้างานแล้ว"
6) token ตัวหนังสือ --font-body/--font-secondary/--font-caption ใช้ในหน้านี้
ทดสอบตามหัวข้อ 6 และทดสอบการกรอก 1 แผงด้วยแป้นตัวเลขอย่างเดียว รายงานผลพร้อมภาพ
```

### รอบ 3 · งานวันนี้และรวม AI
```text
ทำข้อ 3 และข้อ 5 ส่วนที่เหลือ:
1) แถบงานวันนี้ใช้ส่วนประกอบเดียวกับหน้า "วันนี้" ของเจ้าของ ตัวเลขดึงจาก API เดียวกับหน้าปลายทาง กดแล้วไปหน้าพร้อมตัวกรอง
2) รวมเมนู "AI วิเคราะห์" และ "เบื้องหลัง AI" เป็นเมนูเดียวมีแท็บ ย้ายการปรับเกณฑ์ไปส่วนพับ เก็บ URL เดิมไว้ redirect
3) การยืนยันค่ามิเตอร์ทั้งระบบใช้ AnomalyReview ตัวเดียว
เขียน test ว่าตัวเลขในแถบงานวันนี้ตรงกับจำนวนหลังกรองในหน้าปลายทาง
```

### รอบ 4 · ตารางเป็นการ์ดและขัดเกลา
```text
ทำข้อ 2 ทุกหน้าที่เหลือ, ข้อ 6 ทั้งระบบ, ข้อ 7 ส่วนค้นหาและกรอง และหัวข้อ "ขัดเกลา" ที่เหลือ:
1) ส่วนประกอบ ResponsiveTable ที่เป็นตารางเมื่อ ≥ 700 px และเป็นการ์ดเมื่อ < 700 px ใช้ในหน้าค้างชำระและผู้ค้า
2) ไล่แทนขนาดตัวหนังสือที่ต่ำกว่า 13 px ทั้งระบบด้วย token
3) หน้าต่างยืนยันตัดน้ำไฟที่บอกแผง ชื่อร้าน จำนวนวันที่ค้าง และยอด ปุ่มเขียนว่า "ตัดน้ำไฟ" และ toast เลิกทำหลังบันทึก
4) หน้าสรุปหลังออกบิล
รัน test หัวข้อ 6 กับทุกหน้า และรายงานคู่สีใหม่ทุกคู่พร้อมอัตราส่วนความต่าง
```

---

## 8. สิ่งที่ห้ามทำ

- เพิ่มสีหรือฟอนต์ใหม่ หรือเปลี่ยนสไตล์ทั้งหน้าเพื่อ "ให้ดูทันสมัย"
- ใช้ `type="number"` กับช่องมิเตอร์
- ใช้ `word-break: break-all` กับข้อความภาษาไทย
- ซ่อนข้อมูลสำคัญ (ยอดค้าง สถานะตัดน้ำไฟ) ไว้ในส่วนพับ ส่วนพับใช้กับรายละเอียดเชิงเทคนิคเท่านั้น
- ใช้หน้าต่างยืนยันกับการกระทำที่ทำบ่อยและย้อนกลับได้ (เช่น ยืนยันค่ามิเตอร์) ให้ใช้เลิกทำแทน เพื่อไม่ให้ผู้ใช้กดยืนยันจนเคยชิน [S12]

---

## 9. แหล่งอ้างอิง

| รหัส | แหล่ง | ใช้รองรับ |
|---|---|---|
| S1 | W3C. *WCAG 2.2* SC 1.4.3 Contrast (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html | ความต่างของสีตัวหนังสือ 4.5:1 / 3:1 |
| S2 | W3C. *WCAG 2.2* SC 1.4.11 Non-text Contrast. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html | ขอบปุ่มและไอคอน 3:1 |
| S3 | W3C. *WCAG 2.2* SC 1.4.1 Use of Color. https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html | สีไม่ใช่สิ่งเดียวที่บอกสถานะ |
| S4 | W3C. *WCAG 2.2* SC 2.5.5 Target Size (Enhanced) (44 × 44 CSS px) และ SC 2.5.8 Target Size (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html | ขนาดจุดกด 44 px |
| S5 | Apple. *Human Interface Guidelines — Accessibility* (เป้าการแตะอย่างน้อย 44 × 44 pt). https://developer.apple.com/design/human-interface-guidelines/accessibility | ขนาดจุดกด |
| S6 | web.dev. *Accessible tap targets* (แนะนำราว 48 px). https://web.dev/articles/accessible-tap-targets | ช่องกรอกและปุ่มหลัก 48 px |
| S7 | W3C. *WCAG 2.2* SC 1.4.10 Reflow. https://www.w3.org/WAI/WCAG22/Understanding/reflow.html | ไม่เลื่อนแนวนอนที่จอแคบ |
| S8 | Nielsen Norman Group. *Mobile Tables: Comparisons and Other Data Tables*. https://www.nngroup.com/articles/mobile-tables/ | เปลี่ยนตารางเป็นการ์ดบนมือถือ |
| S9 | Nielsen Norman Group. *Cards: UI-Component Definition*. https://www.nngroup.com/articles/cards-component/ | การ์ดแผงละใบ |
| S10 | Nielsen, J. *10 Usability Heuristics for User Interface Design*. Nielsen Norman Group. https://www.nngroup.com/articles/ten-usability-heuristics/ | ข้อ 1 สถานะระบบ, 2 ภาษาผู้ใช้, 3 ย้อนกลับได้, 4 ความสม่ำเสมอ, 5 ป้องกันความผิดพลาด, 6 จำได้โดยไม่ต้องนึก, 8 เรียบและเฉพาะที่จำเป็น |
| S11 | W3C. *WCAG 2.2* SC 3.3.4 Error Prevention (Legal, Financial, Data). https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html | ย้อนกลับได้หรือยืนยันก่อนสำหรับการกระทำที่มีผลทางการเงินหรือข้อมูล |
| S12 | Nielsen Norman Group. *Confirmation Dialogs Can Prevent User Errors (If Not Overused)*. https://www.nngroup.com/articles/confirmation-dialog/ | ยืนยันเฉพาะการกระทำแรง เขียนผลที่จะเกิดและใช้ปุ่มเป็นกริยา |
| S13 | Nielsen, J. *Progressive Disclosure*. Nielsen Norman Group. https://www.nngroup.com/articles/progressive-disclosure/ | ซ่อนรายละเอียดเทคนิค พับบันทึกระบบ |
| S14 | Butterick, M. *Practical Typography — Point size*. https://practicaltypography.com/point-size.html | ขนาดตัวหนังสือหลักบนเว็บ |
| S15 | CSS-Tricks. *16px or Larger Text Prevents iOS Form Zoom*. https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/ | ช่องกรอก 16 px |
| S16 | Hoober, S. (2013). *How Do Users Really Hold Mobile Devices?* UXmatters. https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php | วางปุ่มหลักในระยะนิ้วโป้ง |
| S17 | Fitts, P. M. (1954). The information capacity of the human motor system in controlling the amplitude of movement. *Journal of Experimental Psychology*, 47(6), 381–391. | จุดกดใหญ่และใกล้ กดได้เร็วและพลาดน้อย |
| S18 | GOV.UK Design System. *Text input* (หัวข้อ Numbers). https://design-system.service.gov.uk/components/text-input/ | ใช้ inputmode แทน type="number" |
| S19 | GOV.UK Technology Blog (2020). *Why the GOV.UK Design System team changed the input type for numbers*. https://technology.blog.gov.uk/2020/02/24/why-the-gov-uk-design-system-team-changed-the-input-type-for-numbers/ | ปัญหาของ type="number" |
| S20 | MDN. *enterkeyhint* และ *inputmode*. https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/enterkeyhint · https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inputmode | ปุ่ม "ถัดไป" บนแป้น และแป้นตัวเลข |
| S21 | W3C. *WCAG 2.2* SC 2.4.11 Focus Not Obscured (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html | แถบล่างต้องไม่บังช่องที่โฟกัส |
| S22 | MDN. *white-space*. https://developer.mozilla.org/en-US/docs/Web/CSS/white-space | เบอร์โทรและยอดเงินไม่ตัดบรรทัด |
| S23 | MDN. *font-variant-numeric*. https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric | ตัวเลขความกว้างเท่ากัน |
| S24 | MDN. *The Anchor element — Linking to telephone numbers*. https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a | ลิงก์ tel: |
| S25 | W3C. *Thai Gap Analysis* (การตัดคำและบรรทัดภาษาไทย). https://www.w3.org/TR/thai-gap/ | การตัดบรรทัดข้อความไทย |
| S26 | W3C. *WCAG 2.2* SC 4.1.3 Status Messages. https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html | toast ประกาศผ่าน aria-live |
| S27 | W3C. *WCAG 2.2* SC 1.4.12 Text Spacing. https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html | ระยะบรรทัดอย่างน้อย 1.5 เท่า |
| S28 | Deque. *axe-core* และ *@axe-core/playwright*. https://github.com/dequelabs/axe-core | ตรวจการเข้าถึงอัตโนมัติ |

> ตรวจลิงก์อีกครั้งก่อนอ้างในรายงาน เพราะเอกสารออนไลน์อาจย้ายที่