import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Dropdown, Space } from 'antd';
import { MenuOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => {
    await logout();
    navigate('/login');
  };
  const accountLink = user?.role === 'ADMIN' ? '/admin' : user?.role === 'DELIVERY_STAFF' ? '/delivery' : '/account';
  const accountLabel =
    user?.role === 'ADMIN'
      ? 'Trang quản trị'
      : user?.role === 'DELIVERY_STAFF'
        ? 'Công việc giao nhận'
        : 'Tài khoản của tôi';
  return (
    <>
      <div className="announcement">
        Miễn phí giao nhận trong bán kính 5 km cho đơn từ <strong>1.000.000đ</strong>
      </div>
      <header className="site-header">
        <div className="container nav-wrap">
          <Link className="brand" to="/">
            <img src="/logo.png" alt="Trạm Máy Ảnh" />
          </Link>
          <Button
            className="menu-toggle"
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Mở menu"
          />
          <nav className={menuOpen ? 'main-nav open' : 'main-nav'} onClick={() => setMenuOpen(false)}>
            <Link to="/">Trang chủ</Link>
            <Link to="/products">Xem thiết bị</Link>
            <Link to="/how-to-rent">Cách thuê</Link>
            <Link to="/about">Về chúng tôi</Link>
          </nav>
          <div className="nav-actions">
            <a className="button outline nav-cta" href="/#tim-thiet-bi">
              Kiểm tra lịch
            </a>
            {user ? (
              <Dropdown
                menu={{
                  items: [
                    { key: 'account', label: <Link to={accountLink}>{accountLabel}</Link> },
                    { key: 'logout', label: 'Đăng xuất', onClick: signOut }
                  ]
                }}
                trigger={['click']}
              >
                <Button className="avatar" aria-label="Mở tài khoản">
                  {user.fullName[0]}
                </Button>
              </Dropdown>
            ) : (
              <Space size="small">
                <Link className="auth-nav-link" to="/login">
                  Đăng nhập
                </Link>
                <Button
                  type="primary"
                  className="signup-nav-link"
                  icon={<UserOutlined />}
                  onClick={() => navigate('/signup')}
                >
                  Đăng ký
                </Button>
              </Space>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
