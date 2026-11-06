import { useState } from 'react';
import { Alert, Button, Col, Form, Input, Row, Typography } from 'antd';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleHome } from '../roleHome';
import '../styles/auth.css';

export default function Auth({ mode }) {
  const registerMode = mode === 'register';
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const loginNotice = params.get('notice') === 'login_required';
  const requestedNext = params.get('next');
  const next = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : null;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next || roleHome(user.role)} replace />;

  const submit = async values => {
    setError('');
    setBusy(true);
    try {
      const credentials = { ...values };
      delete credentials.confirmPassword;
      const signedInUser = await (registerMode ? register(credentials) : login(credentials));
      navigate(next || roleHome(signedInUser.role), { replace: true });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <Link to="/" className="auth-logo">
          <img src="/logo.png" alt="Trạm Máy Ảnh" />
        </Link>
        <div className="auth-camera">
          <i />
        </div>
        <div>
          <Typography.Text className="eyebrow">
            {registerMode ? 'Bắt đầu tại đây' : 'Chuyến thuê của bạn'}
          </Typography.Text>
          <Typography.Title level={2}>
            {registerMode ? 'Một tài khoản, mọi chuyến đi.' : 'Quay lại trạm, tiếp tục hành trình.'}
          </Typography.Title>
          <Typography.Paragraph>
            Mọi lịch thuê, trạng thái giao nhận và yêu cầu gia hạn đều được theo dõi trong cùng một tài khoản.
          </Typography.Paragraph>
        </div>
      </section>
      <section className="auth-panel">
        <div>
          <Link className="back" to="/">
            ← Trở về trang chủ
          </Link>
          <Typography.Text className="eyebrow">{registerMode ? 'Thành viên mới' : 'Chào mừng trở lại'}</Typography.Text>
          <Typography.Title level={1}>
            {registerMode ? 'Đăng ký' : 'Đăng nhập'}
            <br />
            tại trạm.
          </Typography.Title>
          <Typography.Paragraph>Nhập thông tin tài khoản để quản lý các đơn thuê của bạn.</Typography.Paragraph>
          {loginNotice && (
            <Alert
              type="warning"
              showIcon
              message="Vui lòng đăng nhập để tiếp tục đặt thuê thiết bị."
              className="auth-error"
            />
          )}
          <Form layout="vertical" onFinish={submit} requiredMark={false} autoComplete="on">
            {registerMode && (
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="Họ và tên"
                    name="fullName"
                    rules={[
                      { required: true, message: 'Vui lòng nhập họ tên.' },
                      { min: 2, message: 'Họ tên cần ít nhất 2 ký tự.' }
                    ]}
                  >
                    <Input autoComplete="name" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Số điện thoại" name="phone">
                    <Input autoComplete="tel" />
                  </Form.Item>
                </Col>
              </Row>
            )}
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Vui lòng nhập email.' },
                { type: 'email', message: 'Email không hợp lệ.' }
              ]}
            >
              <Input autoComplete="email" />
            </Form.Item>
            <Form.Item
              label="Mật khẩu"
              name="password"
              rules={[
                { required: true, message: 'Vui lòng nhập mật khẩu.' },
                ...(registerMode
                  ? [
                      { min: 8, message: 'Mật khẩu cần ít nhất 8 ký tự.' },
                      { pattern: /[A-Z]/, message: 'Cần ít nhất một chữ hoa.' },
                      { pattern: /[0-9]/, message: 'Cần ít nhất một chữ số.' }
                    ]
                  : [])
              ]}
            >
              <Input.Password autoComplete={registerMode ? 'new-password' : 'current-password'} />
            </Form.Item>
            {registerMode && (
              <>
                <Typography.Text type="secondary" className="password-hint">
                  Ít nhất 8 ký tự, gồm một chữ hoa và một chữ số.
                </Typography.Text>
                <Form.Item
                  label="Xác nhận mật khẩu"
                  name="confirmPassword"
                  dependencies={['password']}
                  rules={[
                    { required: true, message: 'Vui lòng xác nhận mật khẩu.' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        return !value || getFieldValue('password') === value
                          ? Promise.resolve()
                          : Promise.reject(new Error('Hai mật khẩu chưa khớp.'));
                      }
                    })
                  ]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
              </>
            )}
            {error && <Alert type="error" message={error} showIcon role="alert" className="auth-error" />}
            <Button type="primary" htmlType="submit" loading={busy} block>
              {registerMode ? 'Tạo tài khoản →' : 'Vào Trạm Máy Ảnh →'}
            </Button>
          </Form>
          <Typography.Paragraph className="switch">
            {registerMode ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
            <Link to={`${registerMode ? '/login' : '/signup'}${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
              {registerMode ? 'Đăng nhập' : 'Đăng ký tại trạm'}
            </Link>
          </Typography.Paragraph>
          {!registerMode && (
            <Typography.Text className="demo">Tài khoản thử: khachhang@example.com / Khachhang@123</Typography.Text>
          )}
        </div>
      </section>
    </main>
  );
}
