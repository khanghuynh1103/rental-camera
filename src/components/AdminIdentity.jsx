import { Input } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import UiButton from './UiButton';
import { api } from '../api';
import { formatDateTime } from '../labels';
import '../styles/workflow.css';

const tabs = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' };
const sides = [
  ['front', 'Mặt trước'],
  ['back', 'Mặt sau'],
  ['selfie', 'Chân dung']
];

export default function AdminIdentity() {
  const [status, setStatus] = useState('PENDING'),
    [items, setItems] = useState([]),
    [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api
        .adminIdentity({ status })
        .then(result => setItems(result.verifications))
        .catch(e => setMessage(e.message)),
    [status]
  );
  useEffect(() => {
    load();
  }, [load]);
  const decide = async (id, decision, note) => {
    const result = await api.reviewIdentity(id, { status: decision, note });
    setMessage(result.message);
    await load();
  };
  return (
    <section className="role-card admin-section">
      <div className="section-head">
        <div>
          <h2>Xác minh CCCD</h2>
          <p>Mỗi lần xem ảnh đều được ghi nhật ký. Ảnh bị xóa ngay sau khi duyệt hoặc từ chối.</p>
        </div>
      </div>
      {message && <p className="admin-message">{message}</p>}
      <div className="row-actions identity-tabs">
        {Object.entries(tabs).map(([value, label]) => (
          <UiButton
            key={value}
            className={status === value ? 'admin-primary' : 'secondary'}
            onClick={() => setStatus(value)}
          >
            {label}
          </UiButton>
        ))}
      </div>
      <div className="incident-grid">
        {items.map(item => (
          <IdentityCard key={item.id} item={item} decide={decide} />
        ))}
      </div>
      {!items.length && <p className="empty-row">Không có hồ sơ nào.</p>}
    </section>
  );
}

function IdentityCard({ item, decide }) {
  const [showImages, setShowImages] = useState(false),
    [note, setNote] = useState(''),
    [error, setError] = useState('');
  const run = async decision => {
    setError('');
    try {
      await decide(item.id, decision, note);
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <article className="incident-card">
      <h3>{item.fullName}</h3>
      <p>
        CCCD •••• {item.idLast4} · Tài khoản {item.accountName} · {item.email}
        {item.phone ? ` · ${item.phone}` : ''}
      </p>
      <small>
        Gửi lúc {formatDateTime(item.createdAt)}
        {item.reviewedBy ? ` · Xử lý bởi ${item.reviewedBy} lúc ${formatDateTime(item.reviewedAt)}` : ''}
      </small>
      {item.reviewNote && <p>Ghi chú: {item.reviewNote}</p>}
      {item.status === 'PENDING' && (
        <>
          {showImages ? (
            <div className="log-images identity-images">
              {sides.map(([side, label]) => (
                <a
                  key={side}
                  href={`/api/admin/identity/${item.id}/images/${side}`}
                  target="_blank"
                  rel="noreferrer"
                  title={label}
                >
                  <img src={`/api/admin/identity/${item.id}/images/${side}`} alt={label} />
                </a>
              ))}
            </div>
          ) : (
            <UiButton className="secondary" onClick={() => setShowImages(true)}>
              Xem ảnh hồ sơ
            </UiButton>
          )}
          <label className="delivery-note">
            Lý do từ chối
            <Input.TextArea
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder="Bắt buộc khi từ chối"
            />
          </label>
          {error && <p className="role-error">{error}</p>}
          <div className="row-actions detail-actions">
            <UiButton className="admin-primary" onClick={() => run('APPROVED')}>
              Duyệt
            </UiButton>
            <UiButton className="danger" onClick={() => run('REJECTED')}>
              Từ chối
            </UiButton>
          </div>
        </>
      )}
    </article>
  );
}
