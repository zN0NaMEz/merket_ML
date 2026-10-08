import { useState } from 'react';
import { Chip, useApp } from '../../ui';
import { ResetDialog } from '../../components/DemoReset';

/*
 * ชุดข้อมูลที่ AI เรียน (หน้า AI วิเคราะห์ของเจ้าหน้าที่ · โหมดสาธิตเท่านั้น)
 * บอกว่าตัวเลขความแม่นในหน้านี้มาจากข้อมูลแบบไหน และสลับชุดข้อมูลสาธิตได้จากหน้านี้
 * ใช้หน้าต่างรีเซ็ตเดียวกับหน้าเจ้าของตลาด (ต้องใส่รหัสรีเซ็ตและกด "ลบและสร้างใหม่" เสมอ)
 * profile = metrics.sim_profile ของรอบเทรนล่าสุด: realistic | clear · null = ข้อมูลจริงหรือรอบเทรนรุ่นก่อน → ไม่แสดง
 * (ข้อมูลจริงต้องไม่มีปุ่มล้างข้อมูลให้กดพลาด)
 */
/** คำกำกับที่วางติดกับตัวเลขความแม่นทุกจุดเมื่อใช้ข้อมูลแบบความบังเอิญต่ำ (ใช้ข้อความเดียวกันทุกที่) */
export const CLEAR_NOTE = 'ตัวเลขชุดนี้มาจากข้อมูลจำลองแบบความบังเอิญต่ำ (สำหรับสาธิต) จึงสูงกว่าที่ตลาดจริงจะทำได้';

const TEXT = {
  clear: {
    chip: 'ข้อมูลจำลอง · ความบังเอิญต่ำ', tone: 'warn',
    say: 'ผลจ่ายช้าในข้อมูลชุดนี้ขึ้นกับประวัติการจ่ายชัดเจน ตัวเลขความแม่นในหน้านี้จึงสูงกว่าที่ตลาดจริงจะทำได้ '
      + 'ใช้สาธิตว่าระบบทำได้แค่ไหนเมื่อข้อมูลชัด ห้ามอ้างว่าเป็นความแม่นกับตลาดจริง',
    next: 'realistic', action: 'กลับเป็นข้อมูลเหมือนตลาดจริง…',
  },
  realistic: {
    chip: 'ข้อมูลจำลอง · เหมือนตลาดจริง', tone: '',
    say: 'การจ่ายช้ามีโชคเข้ามาเกี่ยวเท่าที่คาดในตลาดจริง ต่อให้ AI รู้นิสัยผู้ค้าทุกคนก็ยังทายพลาดได้บ้าง '
      + 'ตัวเลขความแม่นจึงใกล้เคียงกับที่ใช้งานจริงน่าจะได้ ถ้าต้องการสาธิตตัวเลขสูง เลือกข้อมูลแบบความบังเอิญต่ำได้',
    next: 'clear', action: 'สร้างข้อมูลแบบความบังเอิญต่ำ…',
  },
};

export default function DataProfile({ profile }) {
  const { info } = useApp();
  const [open, setOpen] = useState(null);           // โปรไฟล์ที่เลือกไว้ล่วงหน้าในหน้าต่างรีเซ็ต
  const t = TEXT[profile];
  if (!info?.demo_mode || !t) return null;
  return (
    <section className={`panel ai-data ${profile === 'clear' ? 'is-clear' : ''}`} aria-labelledby="ai-data-title">
      <div className="ai-data__body">
        <h2 id="ai-data-title" className="ai-data__title">ชุดข้อมูลที่ AI เรียน <Chip tone={t.tone}>{t.chip}</Chip></h2>
        <p className="ai-data__say">{t.say}</p>
      </div>
      <div className="ai-data__act">
        <button type="button" className="btn" onClick={() => setOpen(t.next)}>{t.action}</button>
        <small>ล้างข้อมูลสาธิตแล้วสร้างใหม่ทั้งหมด ต้องใช้รหัสรีเซ็ต</small>
      </div>
      {open && <ResetDialog initialProfile={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
