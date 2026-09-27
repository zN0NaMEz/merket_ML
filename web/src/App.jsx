import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './ui';
import Layout, { PublicLayout } from './components/Layout';
import OwnerLayout from './components/OwnerLayout';
import Login from './pages/Login';
import Home from './pages/market/Home';
import Bills from './pages/vendor/Bills';
import Advance from './pages/vendor/Advance';
import Statement from './pages/vendor/Statement';
import Book from './pages/walkin/Book';
import MyBookings from './pages/walkin/MyBookings';
import FollowUp from './pages/staff/FollowUp';
import Meters from './pages/staff/Meters';
import Vendors from './pages/staff/Vendors';
import WalkinAdmin from './pages/staff/WalkinAdmin';
import Today from './pages/owner/Today';
import Unpaid from './pages/owner/Unpaid';
import Stalls from './pages/owner/Stalls';
import More from './pages/owner/More';
import Messages from './pages/owner/Messages';
import Rates from './pages/owner/Rates';
import AI from './pages/shared/AI';
import Notifications from './pages/shared/Notifications';

function RequireRole({ role, children }) {
  const { user } = useApp();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  return children;
}

/** คู่มือผู้ค้าเป็นหน้า static แยก (public/guide) โหลดเต็มหน้า */
function GuideRedirect() {
  useEffect(() => { window.location.replace(`/guide/index.html${window.location.hash}`); }, []);
  return null;
}

export default function App() {
  const { user } = useApp();
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={user ? <Navigate to={`/${user.role}`} replace /> : <Login />} />
      <Route element={<PublicLayout />}>
        <Route path="/walkin" element={<Book />} />
        <Route path="/walkin/my" element={<MyBookings />} />
      </Route>
      <Route path="/vendor" element={<RequireRole role="vendor"><Layout /></RequireRole>}>
        <Route index element={<Bills />} />
        <Route path="advance" element={<Advance />} />
        <Route path="statement" element={<Statement />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>
      <Route path="/staff" element={<RequireRole role="staff"><Layout /></RequireRole>}>
        <Route index element={<FollowUp />} />
        <Route path="meters" element={<Meters />} />
        <Route path="vendors" element={<Vendors />} />
        <Route path="walkin" element={<WalkinAdmin />} />
        <Route path="ai" element={<AI />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>
      {/* เจ้าของตลาด: หน้าแบบแอปมือถือ เมนูล่าง 4 อัน · หน้าวิเคราะห์ AI เชิงเทคนิคอยู่ฝั่งเจ้าหน้าที่ */}
      <Route path="/owner" element={<RequireRole role="owner"><OwnerLayout /></RequireRole>}>
        <Route index element={<Today />} />
        <Route path="unpaid" element={<Unpaid />} />
        <Route path="stalls" element={<Stalls />} />
        <Route path="more" element={<More />} />
        <Route path="rates" element={<Rates />} />
        <Route path="notifications" element={<Messages />} />
        <Route path="outstanding" element={<Navigate to="/owner/unpaid" replace />} />
        <Route path="*" element={<Navigate to="/owner" replace />} />
      </Route>
      <Route path="/guide" element={<GuideRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
