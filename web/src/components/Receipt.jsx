import { baht, thDate } from '../format';

export default function Receipt({ p }) {
  return (
    <div className="receipt" aria-label="ใบเสร็จรับเงิน">
      <div className="rc-head"><strong>ใบเสร็จรับเงิน</strong><span>เลขที่ {p.receipt_no}</span></div>
      <dl className="rc-meta">
        <dt>ตลาด</dt><dd>ตลาดบัญญัติทรัพย์</dd>
        <dt>ผู้ชำระ</dt><dd>{p.payer_name}{p.stall_id ? ` (${p.stall_id})` : ''}</dd>
        <dt>วันที่ชำระ</dt><dd>{thDate(p.paid_date)}</dd>
        <dt>ช่องทาง</dt><dd>{p.method}</dd>
        <dt>เลขอ้างอิง</dt><dd>{p.ref_no}</dd>
      </dl>
      <table className="rc-lines"><tbody>
        {p.items.map((it, i) => <tr key={i}><td>{it.label}</td><td>{baht(it.amount)}</td></tr>)}
      </tbody></table>
      <div className="rc-total"><span>รวมทั้งสิ้น</span><strong>฿{baht(p.amount)}</strong></div>
      <div className="rc-stamp">ใบเสร็จอิเล็กทรอนิกส์ออกโดยระบบ ใช้เป็นหลักฐานการชำระได้</div>
    </div>
  );
}
