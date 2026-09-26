import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { scrollToId } from './motion';
import { useMarket } from './store';
import { NAV_LINKS } from '../../data/market';
import { IconBag, IconClose, IconHeart, IconSearch, IconUser } from './icons';

/** แถบบนสุด: โปร่งใสทับภาพเปิด แล้วเปลี่ยนเป็นพื้นทึบเมื่อเลื่อนลง */
export default function MarketNav() {
  const { count, saved, pickups, setOverlay, overlay } = useMarket();
  const [solid, setSolid] = useState(false);
  const menuOpen = overlay === 'menu';

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; setSolid(window.scrollY > window.innerHeight * 0.72); });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const go = hash => { setOverlay(null); scrollToId(hash); };

  return (
    <>
      <header className={`mk-nav ${solid ? 'is-solid' : ''} ${menuOpen ? 'is-menu' : ''}`}>
        <a className="mk-nav__skip" href="#mk-main">ข้ามไปยังเนื้อหาหลัก</a>

        <a
          className="mk-nav__brand"
          href="#mk-top"
          onClick={e => { e.preventDefault(); setOverlay(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        >
          <span className="mk-nav__mark" aria-hidden="true">บ</span>
          <span className="mk-nav__word">
            <strong>บัญญัติทรัพย์</strong>
            <small>BANYATSAP MARKET</small>
          </span>
        </a>

        <nav className="mk-nav__links" aria-label="เมนูหลัก">
          {NAV_LINKS.map(l => (
            <a key={l.hash} href={`#${l.hash}`} onClick={e => { e.preventDefault(); go(l.hash); }}>
              <span className="mk-nav__en">{l.en}</span>
              <span className="mk-nav__th">{l.th}</span>
            </a>
          ))}
        </nav>

        <div className="mk-nav__tools">
          <button type="button" className="mk-icon" onClick={() => setOverlay('search')} aria-label="ค้นหาในตลาด">
            <IconSearch />
          </button>
          <button type="button" className="mk-icon" onClick={() => setOverlay('saved')} aria-label={`รายการที่บันทึกไว้ ${saved.length} รายการ`}>
            <IconHeart filled={saved.length > 0} />
            {saved.length > 0 && <i className="mk-icon__dot" aria-hidden="true" />}
          </button>
          <button type="button" className="mk-icon" onClick={() => setOverlay('cart')} aria-label={`ตะกร้า ${count} ชิ้น${pickups.length ? ` · มีใบนัดรับ ${pickups.length} ใบ` : ''}`}>
            <IconBag />
            {count > 0 && <i className="mk-icon__count" aria-hidden="true">{count > 9 ? '9+' : count}</i>}
            {count === 0 && pickups.length > 0 && <i className="mk-icon__count mk-icon__count--dot" aria-hidden="true" />}
          </button>
          <Link className="mk-icon mk-icon--account" to="/login" aria-label="เข้าสู่ระบบผู้ค้าและเจ้าหน้าที่">
            <IconUser />
          </Link>
          <button
            type="button"
            className="mk-burger"
            onClick={() => setOverlay(menuOpen ? null : 'menu')}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
          >
            {menuOpen ? <IconClose /> : <span className="mk-burger__bars" aria-hidden="true"><i /><i /></span>}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="mk-menu" role="dialog" aria-modal="true" aria-label="เมนู">
          <ul className="mk-menu__list">
            {NAV_LINKS.map((l, i) => (
              <li key={l.hash} style={{ '--mk-delay': `${60 + i * 55}ms` }}>
                <a href={`#${l.hash}`} onClick={e => { e.preventDefault(); go(l.hash); }}>
                  <em>{String(i + 1).padStart(2, '0')}</em>
                  <span>{l.th}</span>
                  <small>{l.en}</small>
                </a>
              </li>
            ))}
          </ul>
          <div className="mk-menu__foot">
            <Link to="/walkin" onClick={() => setOverlay(null)}>จองแผงขายของ</Link>
            <Link to="/login" onClick={() => setOverlay(null)}>เข้าสู่ระบบผู้ค้า</Link>
            <a href="/guide/">คู่มือผู้ค้า</a>
          </div>
        </div>
      )}
    </>
  );
}
