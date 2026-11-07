import { useState } from 'react';
import { Button, Input, Typography } from 'antd';
import { CloseOutlined, MessageOutlined, SendOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import '../styles/chatWidget.css';

const money = value => new Intl.NumberFormat('vi-VN').format(value) + 'đ/ngày';
const suggestions = [
  'Cuối tuần này đi Đà Lạt, cần máy ảnh nhẹ dưới 600k/ngày',
  'Quay vlog dưới 500k/ngày',
  'Ống kính chụp chân dung'
];
// AI có thể trả lời với **chữ đậm** kiểu Markdown: hiển thị thành <strong>, phần còn lại giữ nguyên văn bản.
const renderText = text =>
  String(text || '')
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) =>
      /^\*\*[^*]+\*\*$/.test(part) ? <strong key={index}>{part.slice(2, -2)}</strong> : part.replace(/^\* /gm, '• ')
    );
const TOOL_LABELS = {
  tim_thiet_bi: 'tìm trong kho',
  kiem_tra_lich_va_gia: 'kiểm tra lịch trống và giá',
  thiet_bi_thue_kem: 'xem thiết bị thường thuê kèm'
};
const stepsLabel = steps => {
  const names = [...new Set((steps || []).map(step => TOOL_LABELS[step.tool]).filter(Boolean))];
  return names.length ? `AI đã ${names.join(', ')}` : null;
};

export default function ChatWidget() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Chào bạn! Hãy nói mình biết bạn muốn chụp hoặc quay gì và ngân sách mỗi ngày nhé.' }
  ]);
  if (/^\/(login|signup|admin|delivery|booking)(\/|$)/.test(location.pathname)) return null;

  const send = async suggested => {
    const text = String(suggested || draft).trim();
    if (!text || busy) return;
    const history = messages.slice(1).map(item => ({ role: item.role, text: item.text }));
    setMessages(current => [...current, { role: 'user', text }]);
    setDraft('');
    setBusy(true);
    try {
      const result = await api.recommend(text, history);
      setMessages(current => [
        ...current,
        {
          role: 'assistant',
          text: result.answer,
          recommendations: result.recommendations,
          notice: result.aiNotice,
          steps: stepsLabel(result.steps)
        }
      ]);
    } catch (error) {
      setMessages(current => [
        ...current,
        { role: 'assistant', text: error.message || 'Có lỗi xảy ra. Vui lòng thử lại.' }
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-widget">
      {open && (
        <section className="chat-panel" aria-label="Trợ lý tìm thiết bị">
          <header>
            <div>
              <strong>Trợ lý tìm thiết bị</strong>
              <small>AI tra cứu kho, lịch trống và giá thật</small>
            </div>
            <Button type="text" icon={<CloseOutlined />} aria-label="Đóng hộp chat" onClick={() => setOpen(false)} />
          </header>
          <div className="chat-messages" role="log" aria-live="polite">
            {messages.map((item, index) => (
              <div className={`chat-message ${item.role}`} key={index}>
                <Typography.Paragraph style={{ whiteSpace: 'pre-line' }}>{renderText(item.text)}</Typography.Paragraph>
                {item.steps && <Typography.Text className="chat-steps">{item.steps}</Typography.Text>}
                {item.notice && <Typography.Text className="chat-service-notice">{item.notice}</Typography.Text>}
                {item.recommendations?.map(product => (
                  <Link
                    className="chat-product"
                    key={product.id}
                    to={`/products/${product.id}`}
                    onClick={() => setOpen(false)}
                  >
                    <img src={product.image} alt="" />
                    <span>
                      <strong>{product.name}</strong>
                      <small>{money(product.price)}</small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            ))}
            {busy && (
              <div className="chat-message assistant">
                <Typography.Text>Đang tra cứu kho và lịch trống…</Typography.Text>
              </div>
            )}
          </div>
          {messages.length === 1 && (
            <div className="chat-suggestions">
              {suggestions.map(item => (
                <Button key={item} size="small" onClick={() => send(item)}>
                  {item}
                </Button>
              ))}
            </div>
          )}
          <form
            className="chat-compose"
            onSubmit={event => {
              event.preventDefault();
              send();
            }}
          >
            <Input
              value={draft}
              onChange={event => setDraft(event.target.value)}
              maxLength={500}
              placeholder="Mô tả nhu cầu của bạn..."
              aria-label="Nhập nhu cầu tìm thiết bị"
            />
            <Button
              type="primary"
              htmlType="submit"
              icon={<SendOutlined />}
              disabled={!draft.trim()}
              loading={busy}
              aria-label="Gửi tin nhắn"
            />
          </form>
        </section>
      )}
      <Button
        type="primary"
        className="chat-launcher"
        icon={<MessageOutlined />}
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-label={open ? 'Đóng trợ lý tìm thiết bị' : 'Mở trợ lý tìm thiết bị'}
      >
        {open ? 'Đóng' : 'Tìm máy nhanh'}
      </Button>
    </div>
  );
}
