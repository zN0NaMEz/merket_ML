import { cloneElement, isValidElement } from 'react';
import { useInView } from './motion';

/**
 * ห่อเนื้อหาให้ค่อย ๆ ปรากฏเมื่อเลื่อนถึง
 * as    - แท็กที่ต้องการ (div เป็นค่าเริ่มต้น)
 * delay - หน่วงเป็นมิลลิวินาที สำหรับไล่ลำดับในกลุ่มเดียวกัน
 * mode  - up | fade | mask (mask ใช้กับหัวข้อใหญ่ ให้ตัวอักษรเลื่อนขึ้นจากเส้นบรรทัด)
 */
export default function Reveal({ as: Tag = 'div', mode = 'up', delay = 0, className = '', children, ...rest }) {
  const [ref, inView] = useInView();
  return (
    <Tag
      ref={ref}
      className={`mk-rv mk-rv--${mode} ${inView ? 'is-in' : ''} ${className}`.trim()}
      style={delay ? { '--mk-delay': `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** หัวข้อใหญ่แบบหน้านิตยสาร: แยกทีละบรรทัดแล้วให้เลื่อนขึ้นไล่กัน */
export function RevealLines({ as: Tag = 'h2', lines, className = '', delay = 0, ...rest }) {
  const [ref, inView] = useInView();
  return (
    <Tag ref={ref} className={`mk-lines ${inView ? 'is-in' : ''} ${className}`.trim()} {...rest}>
      {lines.map((line, i) => (
        <span className="mk-lines__line" key={i}>
          <span className="mk-lines__inner" style={{ transitionDelay: `${delay + i * 90}ms` }}>
            {isValidElement(line) ? cloneElement(line) : line}
          </span>
        </span>
      ))}
    </Tag>
  );
}
