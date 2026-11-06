import { useCallback, useEffect, useState } from 'react';
import UiButton from './UiButton';
import { api } from '../api';
import { formatDateTime } from '../labels';
import '../styles/workflow.css';

const labels = { PENDING: 'Chờ gửi', SENDING: 'Đang gửi', SENT: 'Đã gửi', SIMULATED: 'Mô phỏng', FAILED: 'Thất bại' };

export default function AdminDeliveries() {
  const [data, setData] = useState(null), [status, setStatus] = useState(''), [page, setPage] = useState(1), [message, setMessage] = useState('');
  const load = useCallback(() => api.adminDeliveries({ status, page }).then(setData).catch(e => setMessage(e.message)), [status, page]);
  useEffect(() => { load(); }, [load]);
  const retry = async id => { try { setMessage((await api.retryDelivery(id)).message); await load(); } catch (e) { setMessage(e.message); } };
  if (!data) return <div className="page-loader compact">{message || 'Đang tải…'}</div>;
  const simulated = data.providers.email === 'log' || data.providers.sms === 'log';
  return <section className="role-card admin-section">
    <div className="section-head"><div><h2>Email và SMS</h2><p>Nhật ký gửi thông báo cho khách. Lỗi tạm thời được thử lại tự động tối đa 5 lần.</p></div></div>
    {simulated && <p className="hint warn">Đang ở chế độ mô phỏng (email: {data.providers.email}, SMS: {data.providers.sms}): thông báo được ghi nhận nhưng không gửi thật.</p>}
    {message && <p className="admin-message">{message}</p>}
    <div className="ops-badges">{Object.entries(labels).map(([value, label]) => <span key={value} className={value === 'FAILED' && data.summary[value] ? 'warn' : ''}>{label}: {data.summary[value] || 0}</span>)}</div>
    <div className="admin-filters"><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Mọi trạng thái</option>
      {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <div className="table-scroll"><table><thead><tr><th>Kênh</th><th>Người nhận</th><th>Nội dung</th><th>Thời gian</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>{data.deliveries.map(item => <tr key={item.id}><td>{item.channel}</td><td>{item.recipient}</td><td>{item.subject}{item.lastError && <small>{item.lastError}</small>}</td>
        <td>{formatDateTime(item.sentAt || item.createdAt)}</td><td>{labels[item.status]}<small>{item.attempts} lần thử</small></td>
        <td>{item.status === 'FAILED' && <UiButton className="table-link" onClick={() => retry(item.id)}>Gửi lại</UiButton>}</td></tr>)}</tbody></table></div>
    {!data.deliveries.length && <p className="empty-row">Chưa có thông báo nào.</p>}
    <div className="admin-pagination"><UiButton disabled={page === 1} onClick={() => setPage(page - 1)}>←</UiButton><span>Trang {page}/{data.totalPages}</span><UiButton disabled={page === data.totalPages} onClick={() => setPage(page + 1)}>→</UiButton></div>
  </section>;
}
