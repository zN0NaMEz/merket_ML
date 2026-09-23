import { useEffect } from 'react';
import Ambient from '../../components/Ambient';
import { scrollToId } from '../../components/market/motion';
import { MarketProvider, useMarket } from '../../components/market/store';
import MarketNav from '../../components/market/MarketNav';
import Hero from '../../components/market/Hero';
import Manifesto from '../../components/market/Manifesto';
import Categories from '../../components/market/Categories';
import FeaturedProducts from '../../components/market/FeaturedProducts';
import SellerShowcase from '../../components/market/SellerShowcase';
import StorySection from '../../components/market/StorySection';
import Collections from '../../components/market/Collections';
import MarketMap from '../../components/market/MarketMap';
import Newsletter from '../../components/market/Newsletter';
import MarketFooter from '../../components/market/MarketFooter';
import SearchOverlay from '../../components/market/SearchOverlay';
import CartDrawer from '../../components/market/CartDrawer';
import SavedPanel from '../../components/market/SavedPanel';
import DetailPanel from '../../components/market/DetailPanel';
import '../../styles/market.css';

function Shell() {
  const { note } = useMarket();
  return (
    <div className="mk">
      <Ambient tone="cream" placement="fixed" />
      <MarketNav />
      <main id="mk-main">
        <Hero onExplore={() => scrollToId('market')} onMeet={() => scrollToId('sellers')} />
        <Manifesto />
        <Categories />
        <FeaturedProducts />
        <SellerShowcase />
        <StorySection onAction={() => scrollToId('sellers')} />
        <Collections />
        <MarketMap />
        <Newsletter />
      </main>
      <MarketFooter />

      <SearchOverlay />
      <CartDrawer />
      <SavedPanel />
      <DetailPanel />

      <div className="mk-note" aria-live="polite">
        {note && <p className="mk-note__box">{note}</p>}
      </div>
    </div>
  );
}

/** หน้าแรกสาธารณะของตลาด ประกอบจากส่วนย่อยทั้งหมดในโฟลเดอร์ components/market */
export default function Home() {
  /* ระบายพื้นหลังของเอกสารให้เข้ากับหน้าร้าน ไม่ให้เห็นสีของระบบหลังบ้านตอนดึงหน้าเกินขอบ */
  useEffect(() => {
    document.documentElement.setAttribute('data-market', '');
    return () => document.documentElement.removeAttribute('data-market');
  }, []);

  return (
    <MarketProvider>
      <Shell />
    </MarketProvider>
  );
}
