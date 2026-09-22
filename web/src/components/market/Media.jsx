import { useState } from 'react';

/* สร้าง URL รูปจากผู้ให้บริการภาพฟรี พร้อม srcset ให้โหลดขนาดพอดีจอ */
const WIDTHS = [480, 768, 1080, 1440, 1920];

function buildUrl(photo, w, ratio) {
  const h = Math.round(w / ratio);
  if (photo.p) return `https://images.pexels.com/photos/${photo.p}/pexels-photo-${photo.p}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=${w}&h=${h}`;
  return `https://images.unsplash.com/photo-${photo.u}?auto=format&fit=crop&crop=${photo.crop || 'entropy'}&w=${w}&h=${h}&q=78`;
}

/**
 * รูปที่คุมสัดส่วนไว้ล่วงหน้า (ไม่เกิด layout shift) และค่อย ๆ จางเข้ามาเมื่อโหลดเสร็จ
 * ratio  - อัตราส่วนกว้าง/สูง เช่น 3/4
 * sizes  - บอกเบราว์เซอร์ว่ารูปกว้างเท่าไรในแต่ละจอ
 * priority - รูปแรกที่เห็นทันที (hero) จะไม่ lazy และโหลดก่อน
 * fill   - ให้รูปเต็มกล่องแม่แทนการคุมสัดส่วนเอง ใช้กับฉากหลังเต็มจอ
 */
export default function Media({ photo, alt, ratio = 4 / 5, sizes = '100vw', priority = false, fill = false, className = '', children }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span
      className={`mk-media ${fill ? 'mk-media--fill' : ''} ${loaded ? 'is-loaded' : ''} ${className}`.trim()}
      style={fill ? undefined : { aspectRatio: ratio }}
    >
      <img
        className="mk-media__img"
        src={buildUrl(photo, 1080, ratio)}
        srcSet={WIDTHS.map(w => `${buildUrl(photo, w, ratio)} ${w}w`).join(', ')}
        sizes={sizes}
        alt={alt}
        width={1080}
        height={Math.round(1080 / ratio)}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchpriority={priority ? "high" : undefined}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        draggable="false"
      />
      {children}
    </span>
  );
}
