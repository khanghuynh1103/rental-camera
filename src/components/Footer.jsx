export default function Footer() {
  return (
    <footer>
      <div className="container footer-grid">
        <div className="footer-brand">
          <img src="/logo.png" alt="Trạm Máy Ảnh" />
          <p>Thuê thiết bị quay chụp minh bạch, thuận tiện và được hỗ trợ từ lúc chọn máy đến khi hoàn trả.</p>
        </div>
        <div>
          <strong>Thiết bị</strong>
          <a href="/products">Máy ảnh</a>
          <a href="/products">Ống kính</a>
          <a href="/products">Gimbal</a>
        </div>
        <div>
          <strong>Hỗ trợ</strong>
          <a href="/about">Về chúng tôi</a>
          <a href="/how-to-rent">Cách thuê</a>
          <a href="/">Chính sách cọc</a>
          <a href="/">Gia hạn</a>
        </div>
        <div>
          <strong>Liên hệ</strong>
          <a href="tel:0900000000">0900 000 000</a>
          <a href="mailto:hello@trammayanh.vn">hello@trammayanh.vn</a>
          <span>TP. Hồ Chí Minh</span>
        </div>
      </div>
      <div className="container copyright">
        <span>© 2026 Trạm Máy Ảnh</span>
        <span>Thiết bị tốt · Hành trình đẹp</span>
      </div>
    </footer>
  );
}
