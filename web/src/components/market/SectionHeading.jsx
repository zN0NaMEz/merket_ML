import Reveal, { RevealLines } from './Reveal';

/**
 * หัวข้อประจำแต่ละส่วน: เลขลำดับ + ป้ายภาษาอังกฤษ + หัวข้อไทยตัวใหญ่
 * align="wide" จะดันคำอธิบายไปอยู่คอลัมน์ขวาแบบหน้านิตยสาร
 */
export default function SectionHeading({ index, en, lines, note, id, tone = '', action }) {
  return (
    <header className={`mk-head ${tone ? `mk-head--${tone}` : ''}`}>
      <Reveal as="p" className="mk-eyebrow" mode="fade">
        {index && <em className="mk-head__num">{index}</em>}
        <span>{en}</span>
      </Reveal>
      <div className="mk-head__body">
        <RevealLines as="h2" id={id} className="mk-head__title" lines={lines} />
        {(note || action) && (
          <Reveal className="mk-head__side" mode="up" delay={120}>
            {note && <p>{note}</p>}
            {action}
          </Reveal>
        )}
      </div>
    </header>
  );
}
