import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Form, Input, Rate, Select, Typography } from 'antd';
import { api } from '../api';
import '../styles/reviews.css';

export default function ProductReviews({ productId, onSummary }) {
  const [data, setData] = useState({ reviews: [], count: 0, average: null, eligibleRentals: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sending, setSending] = useState(false);
  const [form] = Form.useForm();

  const refresh = useCallback(async () => {
    try {
      const result = await api.productReviews(productId);
      setData(result);
      onSummary?.({ count: result.count, average: result.average });
      setError('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [productId, onSummary]);

  useEffect(() => {
    let active = true;
    api
      .productReviews(productId)
      .then(result => {
        if (!active) return;
        setData(result);
        onSummary?.({ count: result.count, average: result.average });
      })
      .catch(cause => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId, onSummary]);

  const submit = async values => {
    setSending(true);
    setError('');
    setSuccess('');
    try {
      await api.createReview(productId, values);
      form.resetFields();
      setSuccess('Cảm ơn bạn! Đánh giá đã được đăng.');
      await refresh();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="reviews-section" id="danh-gia">
      <div className="container">
        <Typography.Text className="eyebrow">Trải nghiệm thực tế</Typography.Text>
        <Typography.Title level={2}>Đánh giá từ khách đã thuê</Typography.Title>
        <Typography.Paragraph className="reviews-intro">
          Mỗi đánh giá được gửi sau khi đơn thuê thiết bị hoàn tất.
        </Typography.Paragraph>
        {data.count > 0 && (
          <div className="reviews-summary">
            <strong>{data.average}/5</strong>
            <Rate disabled allowHalf value={data.average} />
            <span>{data.count} đánh giá</span>
          </div>
        )}
        {error && <Alert type="error" showIcon message={error} className="reviews-alert" />}
        {success && <Alert type="success" showIcon message={success} className="reviews-alert" />}
        {data.eligibleRentals.length > 0 && (
          <Card className="review-form-card" title="Chia sẻ trải nghiệm của bạn">
            <Typography.Paragraph>
              Điều gì làm bạn hài lòng và điều gì cần cải thiện? Nhận xét của bạn sẽ giúp khách thuê sau chọn máy.
            </Typography.Paragraph>
            <Form form={form} layout="vertical" onFinish={submit} initialValues={{ rating: 5 }}>
              <Form.Item
                name="rentalId"
                label="Đơn thuê đã hoàn tất"
                rules={[{ required: true, message: 'Vui lòng chọn đơn thuê.' }]}
              >
                <Select
                  options={data.eligibleRentals.map(item => ({ value: item.id, label: item.code }))}
                  placeholder="Chọn đơn thuê"
                />
              </Form.Item>
              <Form.Item
                name="rating"
                label="Số sao"
                rules={[{ required: true, message: 'Vui lòng đánh giá số sao.' }]}
              >
                <Rate />
              </Form.Item>
              <Form.Item name="liked" label="Điều bạn hài lòng">
                <Input.TextArea
                  rows={3}
                  maxLength={1000}
                  showCount
                  placeholder="Ví dụ: máy dễ sử dụng, ảnh đẹp, giao nhận đúng giờ..."
                />
              </Form.Item>
              <Form.Item name="disliked" label="Điều bạn chưa hài lòng">
                <Input.TextArea
                  rows={3}
                  maxLength={1000}
                  showCount
                  placeholder="Chia sẻ điều Trạm có thể cải thiện..."
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={sending}>
                Đăng đánh giá
              </Button>
            </Form>
          </Card>
        )}
        {!loading && data.reviews.length === 0 && (
          <Empty description="Sản phẩm này chưa có đánh giá. Hãy là người đầu tiên chia sẻ sau khi thuê!" />
        )}
        <div className="review-list">
          {data.reviews.map(review => (
            <Card key={review.id} className="review-card">
              <div className="review-card-head">
                <div>
                  <strong>{review.author}</strong>
                  <small>{new Date(review.createdAt).toLocaleDateString('vi-VN')}</small>
                </div>
                <Rate disabled value={review.rating} />
              </div>
              {review.liked && (
                <Typography.Paragraph>
                  <strong>Hài lòng: </strong>
                  {review.liked}
                </Typography.Paragraph>
              )}
              {review.disliked && (
                <Typography.Paragraph>
                  <strong>Cần cải thiện: </strong>
                  {review.disliked}
                </Typography.Paragraph>
              )}
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
