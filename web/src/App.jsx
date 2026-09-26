import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './ui';
import Layout, { PublicLayout } from './components/Layout';
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
import Dashboard from './pages/owner/Dashboard';
import Outstanding from './pages/owner/Outstanding';
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
      <Route path="/owner" element={<RequireRole role="owner"><Layout /></RequireRole>}>
        <Route index element={<Dashboard />} />
        <Route path="outstanding" element={<Outstanding />} />
        <Route path="rates" element={<Rates />} />
        <Route path="ai" element={<AI />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>
      <Route path="/guide" element={<GuideRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
