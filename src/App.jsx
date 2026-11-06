import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { AuthProvider, useAuth } from './context/AuthContext';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Account from './pages/Account';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Booking from './pages/Booking';
import AdminDashboard from './pages/AdminDashboard';
import DeliveryDashboard from './pages/DeliveryDashboard';
import About from './pages/About';
import HowToRent from './pages/HowToRent';
import ChatWidget from './components/ChatWidget';
import { roleHome } from './roleHome';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="page-loader">
        <Spin tip="Đang tải">
          <div style={{ width: 80, height: 80 }} />
        </Spin>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return !roles || roles.includes(user.role) ? children : <Navigate to={roleHome(user.role)} replace />;
}

function CatalogDetailRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="page-loader">
        <Spin tip="Đang tải">
          <div style={{ width: 80, height: 80 }} />
        </Spin>
      </div>
    );
  if (!user) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}&notice=login_required`} replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/about" element={<About />} />
        <Route path="/how-to-rent" element={<HowToRent />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route
          path="/booking"
          element={
            <CatalogDetailRoute>
              <Booking />
            </CatalogDetailRoute>
          }
        />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/signup" element={<Auth mode="register" />} />
        <Route
          path="/account"
          element={
            <ProtectedRoute roles={['CUSTOMER']}>
              <Account />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/delivery"
          element={
            <ProtectedRoute roles={['DELIVERY_STAFF']}>
              <DeliveryDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ChatWidget />
    </AuthProvider>
  );
}
