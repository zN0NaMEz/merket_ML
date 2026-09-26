import { useState } from 'react';
import { thDate } from '../../format';
import { PICKUP, price } from '../../data/market';
import { pickupStops } from './pickup';
import { IconArrow, IconCheck } from './icons';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** พิมพ์ / บันทึก PDF เฉพาะใบนัดรับ (ไม่พิมพ์ทั้งหน้าร้าน) */
function printSlip(slip, stops) {
  const root = document.createElement('div');
  root.id = 'mk-print';
  root.innerHTML = `
    <h1>ใบนัดรับ · ตลาดบัญญัติทรัพย์</h1>
    <p class="mk-print__code">${esc(slip.code)}</p>
    <p>รับได้ถึง ${esc(thDate(slip.until))} · ตลาดเปิด ${esc(PICKUP.marketHours)} · จ่ายกับผู้ค้าตอนรับของ</p>
    ${stops.map((g, i) => `
      <h2>${i + 1}. ${esc(g.plate)} ${esc(g.name)} <small>${esc(g.where)} · เปิด ${esc(g.hours)}</small></h2>
      <table>${g.items.map(x => `<tr><td>${esc(x.name)} × ${x.qty}</td><td>${esc(price(x.price * x.qty))}</td></tr>`).join('')}
        <tr class="sub"><td>จ่ายที่จุดนี้</td><td>${esc(price(g.subtotal))}</td></tr></table>`).join('')}
    <p class="mk-print__total">รวมทั้งหมด ${esc(price(slip.total))}</p>`;
  document.body.append(root);
  document.body.classList.add('mk-print-mode');
  const cleanup = () => {
    root.remove();
    document.body.classList.remove('mk-print-mode');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 1000);
}

/**
 * ใบนัดรับหลังกด "ออกใบนัดรับ": รหัสสำหรับบอกผู้ค้า ขั้นต่อไป จุดรับของเรียงตามทางเดิน และการยกเลิก
 * fresh = เพิ่งออก (แสดงข้อความยืนยัน)
 */
export default function PickupSlip({ slip, fresh, onDone, onMap, onCancel }) {
  const [confirming, setConfirming] = useState(false);
  const stops = pickupStops(slip.lines);
  const early = stops.filter(g => Number(g.hours.split('–')[1]?.slice(0, 2)) <= 11);

  return (
    <div className="mk-slip">
      {fresh && (
        <p className="mk-slip__ok" role="status"><IconCheck aria-hidden="true" />ออกใบนัดรับแล้ว ของในตะกร้าย้ายมาอยู่ในใบนี้</p>
      )}

      <div className="mk-slip__code">
        <small>รหัสนัดรับ บอกที่แผงตอนรับของ</small>
        <strong>{slip.code}</strong>
        <span>รับได้ถึง <b>{thDate(slip.until)}</b> · ตลาดเปิด {PICKUP.marketHours}</span>
      </div>

      <section aria-labelledby={`next-${slip.code}`}>
        <h3 className="mk-slip__h" id={`next-${slip.code}`}>ขั้นต่อไป</h3>
        <ol className="mk-slip__steps">
          <li><b>เก็บใบนัดรับนี้ไว้</b> พิมพ์หรือบันทึกเป็น PDF จากปุ่มด้านล่าง หรือเปิดดูอีกครั้งได้จากไอคอนตะกร้าบนเครื่องนี้</li>
          <li><b>มาที่ตลาดภายใน {thDate(slip.until)}</b> แต่ละแผงเปิดไม่เท่ากัน{early.length > 0 ? ` ${early.map(g => g.name).join(' และ ')} ปิดก่อนเที่ยง ควรไปจุดนั้นก่อน` : ' ดูเวลาของแต่ละจุดด้านล่าง'}</li>
          <li><b>บอกรหัส {slip.code} ที่แต่ละจุด</b> ผู้ค้าหยิบของตามรายการให้ ตรวจของก่อนจ่าย</li>
          <li><b>จ่ายกับผู้ค้าตอนรับของ</b> เงินสดหรือสแกนจ่ายของร้าน รวมทั้งหมด {price(slip.total)}</li>
        </ol>
      </section>

      <section aria-labelledby={`stops-${slip.code}`}>
        <h3 className="mk-slip__h" id={`stops-${slip.code}`}>
          ไปรับ {stops.length} จุด <small>เรียงตามทางเดินจากประตูหน้า</small>
        </h3>
        <ol className="mk-slip__stops">
          {stops.map(g => (
            <li key={g.key}>
              <div className="mk-slip__stop">
                <span className={`mk-plate ${g.desk ? 'mk-plate--ghost' : ''}`}>{g.plate}</span>
                <span>
                  <strong>{g.name}</strong>
                  <small>{g.where} · เปิด {g.hours}</small>
                  {g.desk && <small>ฝากของจาก {[...g.makers].join(', ')}</small>}
                </span>
              </div>
              <ul className="mk-cart__slip">
                {g.items.map(x => (
                  <li key={x.id}><span>{x.name} × {x.qty}</span><span>{price(x.price * x.qty)}</span></li>
                ))}
                <li className="is-sub"><span>จ่ายที่จุดนี้</span><span>{price(g.subtotal)}</span></li>
              </ul>
            </li>
          ))}
        </ol>
        <p className="mk-slip__total"><span>รวมทั้งหมด</span><strong>{price(slip.total)}</strong></p>
      </section>

      <div className="mk-slip__acts">
        <button type="button" className="mk-btn mk-btn--dark" onClick={() => onMap(stops.find(g => !g.desk)?.zone)}>
          ดูจุดรับในผังตลาด<IconArrow className="mk-btn__arrow" />
        </button>
        <button type="button" className="mk-btn mk-btn--ghost" onClick={() => printSlip(slip, stops)}>พิมพ์ / บันทึก PDF</button>
        <button type="button" className="mk-btn mk-btn--ghost" onClick={onDone}>เสร็จสิ้น</button>
      </div>

      <div className="mk-slip__cancel">
        {confirming ? (
          <div role="alertdialog" aria-label="ยืนยันยกเลิกนัดรับ">
            <p>ยกเลิกนัดรับ {slip.code}? ผู้ค้าจะนำของกลับไปขายต่อ</p>
            <div className="mk-slip__acts">
              <button type="button" className="mk-btn mk-btn--ghost mk-btn--sm" onClick={() => onCancel(slip)}>ยืนยันยกเลิก</button>
              <button type="button" className="mk-btn mk-btn--ghost mk-btn--sm" onClick={() => setConfirming(false)}>ไม่ยกเลิก</button>
            </div>
          </div>
        ) : (
          <button type="button" className="mk-slip__link" onClick={() => setConfirming(true)}>ไปรับไม่ได้แล้ว? ยกเลิกนัดรับ</button>
        )}
      </div>
    </div>
  );
}
