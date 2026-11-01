import { useState } from 'react';
import { Button, Input, Typography } from 'antd';
import { CloseOutlined, MessageOutlined, SendOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import '../styles/chatWidget.css';

const money = value => new Intl.NumberFormat('vi-VN').format(value) + 'đ/ngày';
const suggestions = ['Máy ảnh đi du lịch', 'Quay vlog dưới 500k/ngày', 'Ống kính chụp chân dung'];

export default function ChatWidget() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', text: 'Chào bạn! Hãy nói mình biết bạn muốn chụp hoặc quay gì và ngân sách mỗi ngày nhé.' }]);
  if (/^\/(login|signup|admin|delivery|booking)(\/|$)/.test(location.pathname)) return null;

  const send = async (suggested) => {
    const text = String(suggested || draft).trim();
    if (!text || busy) return;
    setMessages(current => [...current, { role: 'user', text }]);
    setDraft('');
    setBusy(true);
    try {
      const result = await api.recommend(text);
      setMessages(current => [...current, { role: 'assistant', text: result.answer, recommendations: result.recommendations, notice: result.aiNotice }]);
    } catch (error) {
      setMessages(current => [...current, { role: 'assistant', text: error.message || 'Có lỗi xảy ra. Vui lòng thử lại.' }]);
    } finally {
      setBusy(false);
    }
  };

  return <div className="chat-widget">
    {open && <section className="chat-panel" aria-label="Trợ lý tìm thiết bị">
      <header><div><strong>Trợ lý tìm thiết bị</strong><small>Gợi ý theo sản phẩm tại Trạm</small></div><Button type="text" icon={<CloseOutlined />} aria-label="Đóng hộp chat" onClick={() => setOpen(false)} /></header>
      <div className="chat-messages" role="log" aria-live="polite">{messages.map((item, index) => <div className={`chat-message ${item.role}`} key={index}>
        <Typography.Paragraph>{item.text}</Typography.Paragraph>
        {item.notice && <Typography.Text className="chat-service-notice">{item.notice}</Typography.Text>}
        {item.recommendations?.map(product => <Link className="chat-product" key={product.id} to={`/products/${product.id}`} onClick={() => setOpen(false)}><img src={product.image} alt="" /><span><strong>{product.name}</strong><small>{money(product.price)}</small></span><span aria-hidden="true">→</span></Link>)}
      </div>)}{busy && <div className="chat-message assistant"><Typography.Text>Đang tìm thiết bị phù hợp…</Typography.Text></div>}</div>
      {messages.length === 1 && <div className="chat-suggestions">{suggestions.map(item => <Button key={item} size="small" onClick={() => send(item)}>{item}</Button>)}</div>}
      <form className="chat-compose" onSubmit={event => { event.preventDefault(); send(); }}><Input value={draft} onChange={event => setDraft(event.target.value)} maxLength={500} placeholder="Mô tả nhu cầu của bạn..." aria-label="Nhập nhu cầu tìm thiết bị" /><Button type="primary" htmlType="submit" icon={<SendOutlined />} disabled={!draft.trim()} loading={busy} aria-label="Gửi tin nhắn" /></form>
    </section>}
    <Button type="primary" className="chat-launcher" icon={<MessageOutlined />} onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={open ? 'Đóng trợ lý tìm thiết bị' : 'Mở trợ lý tìm thiết bị'}>{open ? 'Đóng' : 'Tìm máy nhanh'}</Button>
  </div>;
}
