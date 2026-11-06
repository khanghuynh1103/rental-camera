import { Button, Card, Col, Row, Typography } from 'antd';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/howToRent.css';

const steps = [
  {
    number: '01',
    title: 'Chọn sản phẩm phù hợp',
    text: 'Vào Xem thiết bị, lọc theo nhóm máy ảnh, ống kính hoặc phụ kiện. Bạn có thể tìm theo tên và sắp xếp theo giá thuê mỗi ngày.',
    image: '/how-to-rent/01-chon-thiet-bi.png',
    action: 'Mở danh sách thiết bị',
    to: '/products'
  },
  {
    number: '02',
    title: 'Xem thông tin sản phẩm',
    text: 'Nhấn Xem máy để đọc thông số, bộ phụ kiện đi kèm, giá thuê và tiền cọc. Lịch trống hiển thị ngay trên trang; bạn chỉ cần đăng nhập khi bắt đầu đặt thuê.',
    image: '/how-to-rent/02-xem-chi-tiet.png',
    action: 'Xem các sản phẩm',
    to: '/products'
  },
  {
    number: '03',
    title: 'Chọn ngày và kiểm tra lịch',
    text: 'Ở trang chi tiết, chọn ngày nhận và ngày trả. Hệ thống kiểm tra thiết bị còn trống trong đúng khoảng thời gian đó rồi dẫn bạn sang đơn thuê.',
    image: '/how-to-rent/03-kiem-tra-lich.png',
    action: 'Bắt đầu chọn máy',
    to: '/products'
  },
  {
    number: '04',
    title: 'Điền thông tin và xác nhận',
    text: 'Chọn giao tận nơi hoặc nhận tại cửa hàng, nhập thông tin liên hệ rồi kiểm tra lại tổng tiền. Bạn có thể chọn thanh toán online hoặc khi nhận máy; phần thanh toán trên website hiện là mô phỏng.',
    image: '/how-to-rent/04-nhap-thong-tin.png',
    action: 'Xem thiết bị',
    to: '/products'
  },
  {
    number: '05',
    title: 'Theo dõi đơn và hóa đơn',
    text: 'Sau khi tạo đơn, xem trạng thái duyệt, giao nhận và hóa đơn trong tài khoản. Nếu cần thuê lâu hơn, bạn có thể gửi yêu cầu gia hạn từ đó.',
    image: '/how-to-rent/05-theo-doi-don.png',
    action: 'Đến tài khoản',
    to: '/account'
  }
];

export default function HowToRent() {
  return (
    <>
      <Header />
      <main className="how-page">
        <section className="how-hero container">
          <Typography.Text className="eyebrow">Hướng dẫn thuê thiết bị</Typography.Text>
          <Typography.Title level={1}>Từ chọn máy đến nhận thiết bị, từng bước thật rõ ràng.</Typography.Title>
          <Typography.Paragraph>
            Làm theo hướng dẫn dưới đây để tìm đúng thiết bị, kiểm tra lịch và hoàn tất yêu cầu thuê tại Trạm Máy Ảnh.
          </Typography.Paragraph>
          <Link to="/products">
            <Button type="primary" size="large">
              Bắt đầu xem thiết bị →
            </Button>
          </Link>
        </section>
        <section className="container how-steps" aria-label="Các bước thuê thiết bị">
          {steps.map((step, index) => (
            <Card key={step.number} className="how-step">
              <Row gutter={[32, 24]} align="middle" className={index % 2 ? 'reverse' : ''}>
                <Col xs={24} md={11} className="how-step-art">
                  <div className="how-picture">
                    <a
                      href={step.image}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Xem ảnh chụp bước ${step.number} cỡ lớn`}
                    >
                      <img
                        src={step.image}
                        alt={`Ảnh chụp màn hình bước ${step.number}: ${step.title}`}
                        loading="lazy"
                      />
                    </a>
                    <span>{step.number} / 05</span>
                    <small className="how-picture-zoom">Nhấn ảnh để phóng to ↗</small>
                  </div>
                </Col>
                <Col xs={24} md={13} className="how-step-copy">
                  <Typography.Text className="eyebrow">Bước {step.number}</Typography.Text>
                  <Typography.Title level={2}>{step.title}</Typography.Title>
                  <Typography.Paragraph>{step.text}</Typography.Paragraph>
                  <Link to={step.to}>
                    <Button>{step.action} →</Button>
                  </Link>
                </Col>
              </Row>
            </Card>
          ))}
        </section>
        <section className="how-end container">
          <Typography.Title level={2}>Sẵn sàng cho buổi chụp tiếp theo?</Typography.Title>
          <Typography.Paragraph>Chọn thiết bị và ngày thuê để bắt đầu.</Typography.Paragraph>
          <Link to="/products">
            <Button type="primary" size="large">
              Tìm thiết bị →
            </Button>
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
