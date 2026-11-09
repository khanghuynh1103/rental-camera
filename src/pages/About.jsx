import { Button, Card, Col, Row, Steps, Typography } from 'antd';
import { CameraOutlined, CheckCircleOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/about.css';

const values = [
  {
    icon: <CameraOutlined />,
    title: 'Thiết bị phù hợp',
    text: 'Tìm máy ảnh, ống kính và phụ kiện theo nhu cầu của từng buổi chụp.'
  },
  {
    icon: <CheckCircleOutlined />,
    title: 'Lịch thuê rõ ràng',
    text: 'Kiểm tra khoảng ngày còn thiết bị trước khi gửi yêu cầu thuê.'
  },
  {
    icon: <SafetyCertificateOutlined />,
    title: 'Bàn giao minh bạch',
    text: 'Theo dõi trạng thái đơn và thông tin giao nhận trong tài khoản.'
  },
  {
    icon: <TeamOutlined />,
    title: 'Đồng hành trong chuyến thuê',
    text: 'Gửi yêu cầu gia hạn hoặc trao đổi về thiết bị khi cần hỗ trợ.'
  }
];

export default function About() {
  return (
    <>
      <Header />
      <main className="about-page">
        <section className="about-hero">
          <div className="container about-hero-inner">
            <div>
              <Typography.Text className="eyebrow">Về Trạm Máy Ảnh</Typography.Text>
              <Typography.Title level={1}>Mỗi câu chuyện đẹp bắt đầu từ đúng thiết bị.</Typography.Title>
              <Typography.Paragraph>
                Trạm Máy Ảnh giúp bạn tìm và thuê thiết bị quay chụp cho chuyến đi, buổi chụp hay dự án tiếp theo. Từ
                chọn máy, kiểm tra lịch đến bàn giao và hoàn trả, mọi bước đều có thể theo dõi tại một nơi.
              </Typography.Paragraph>
              <Link to="/products">
                <Button type="primary" size="large">
                  Khám phá thiết bị →
                </Button>
              </Link>
            </div>
            <div className="about-visual" aria-hidden="true">
              <div className="about-lens">
                <CameraOutlined />
              </div>
              <span>THIẾT BỊ TỐT · HÀNH TRÌNH ĐẸP</span>
            </div>
          </div>
        </section>

        <section className="about-section container">
          <Typography.Text className="eyebrow">Điều chúng tôi hướng tới</Typography.Text>
          <Typography.Title level={2}>Thuê máy dễ hiểu, yên tâm sử dụng.</Typography.Title>
          <Row gutter={[18, 18]}>
            {values.map(item => (
              <Col xs={24} sm={12} lg={6} key={item.title}>
                <Card className="about-value-card">
                  <div className="about-value-icon">{item.icon}</div>
                  <Typography.Title level={4}>{item.title}</Typography.Title>
                  <Typography.Paragraph>{item.text}</Typography.Paragraph>
                </Card>
              </Col>
            ))}
          </Row>
        </section>

        <section className="about-process">
          <div className="container about-process-inner">
            <div>
              <Typography.Text className="eyebrow">Cách Trạm hoạt động</Typography.Text>
              <Typography.Title level={2}>Từ lựa chọn đến hoàn trả.</Typography.Title>
              <Typography.Paragraph>
                Quy trình thuê được chia thành những bước rõ ràng để bạn chủ động theo dõi đơn của mình.
              </Typography.Paragraph>
            </div>
            <Steps
              direction="vertical"
              items={[
                {
                  title: 'Chọn thiết bị và ngày thuê',
                  description: 'Duyệt danh sách thiết bị, xem chi tiết và kiểm tra lịch trống.'
                },
                {
                  title: 'Gửi yêu cầu thuê',
                  description: 'Điền thông tin giao nhận và xác nhận phương thức thanh toán.'
                },
                {
                  title: 'Theo dõi đơn và nhận máy',
                  description: 'Xem trạng thái duyệt đơn, bàn giao và hóa đơn trong tài khoản.'
                },
                {
                  title: 'Hoàn trả hoặc yêu cầu gia hạn',
                  description: 'Theo dõi quá trình thu hồi và gửi yêu cầu gia hạn khi cần.'
                }
              ]}
            />
          </div>
        </section>

        <section className="about-cta container">
          <Typography.Text className="eyebrow">Bắt đầu chuyến thuê</Typography.Text>
          <Typography.Title level={2}>Tìm thiết bị cho khung hình tiếp theo của bạn.</Typography.Title>
          <Link to="/products">
            <Button type="primary" size="large">
              Xem thiết bị →
            </Button>
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
