import { Input } from 'antd';
import UiButton from './UiButton';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatDate as date, incidentLabels, money, rentalStatusLabels } from '../labels';
import '../styles/workflow.css';

export default function AdminAftercare({ mode }) {
  return mode === 'extensions' ? <Extensions /> : <Incidents />;
}

function Extensions() {
  const [items, setItems] = useState([]),
    [message, setMessage] = useState('');
  const load = () =>
    api
      .adminExtensions()
      .then(x => setItems(x.extensions))
      .catch(e => setMessage(e.message));
  useEffect(() => {
    let live = true;
    api
      .adminExtensions()
      .then(x => live && setItems(x.extensions))
      .catch(e => live && setMessage(e.message));
    return () => {
      live = false;
    };
  }, []);
  const review = async (id, status) => {
    try {
      const result = await api.reviewExtension(id, status);
      setMessage(result.message + (result.extraAmount ? ` Phí thêm: ${money(result.extraAmount)}.` : ''));
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  };
  return (
    <section className="role-card admin-section">
      <div className="section-head">
        <div>
          <h2>Yêu cầu gia hạn</h2>
          <p>
            Hệ thống kiểm tra lại lịch kế tiếp của từng thiết bị (kể cả ngày đệm) trước khi duyệt và tự tính phí gia
            hạn.
          </p>
        </div>
      </div>
      {message && <p className="admin-message">{message}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Đơn thuê</th>
              <th>Khách hàng</th>
              <th>Sản phẩm</th>
              <th>Ngày trả cũ</th>
              <th>Ngày yêu cầu</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>
                  <b>{item.code}</b>
                  <small>{item.reason || 'Không có ghi chú'}</small>
                </td>
                <td>
                  {item.customerName}
                  <small>{rentalStatusLabels[item.rentalStatus]}</small>
                </td>
                <td>{item.productName}</td>
                <td>{date(item.oldEndDate)}</td>
                <td>{date(item.requestedEndDate)}</td>
                <td>
                  <span className={`status ${item.status === 'REJECTED' ? 'rental-cancelled' : ''}`}>
                    {item.status === 'PENDING'
                      ? 'Chờ duyệt'
                      : item.status === 'APPROVED'
                        ? `Đã duyệt · ${money(item.extraAmount)}`
                        : 'Đã từ chối'}
                  </span>
                </td>
                <td>
                  {item.status === 'PENDING' && (
                    <div className="row-actions">
                      <UiButton onClick={() => review(item.id, 'APPROVED')}>Duyệt</UiButton>
                      <UiButton onClick={() => review(item.id, 'REJECTED')}>Từ chối</UiButton>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length && <p className="empty-row">Chưa có yêu cầu gia hạn.</p>}
    </section>
  );
}

function Incidents() {
  const [items, setItems] = useState([]),
    [selected, setSelected] = useState(null),
    [message, setMessage] = useState('');
  const load = () =>
    api
      .adminIncidents()
      .then(x => setItems(x.incidents))
      .catch(e => setMessage(e.message));
  useEffect(() => {
    let live = true;
    api
      .adminIncidents()
      .then(x => live && setItems(x.incidents))
      .catch(e => live && setMessage(e.message));
    return () => {
      live = false;
    };
  }, []);
  const resolve = async e => {
    e.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(e.currentTarget));
      const result = await api.resolveIncident(selected.id, { ...values, feeAmount: Number(values.feeAmount) });
      setMessage(result.message);
      setSelected(null);
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };
  return (
    <section className="role-card admin-section">
      <div className="section-head">
        <div>
          <h2>Sự cố và phí phát sinh</h2>
          <p>
            Xử lý thiết bị bất thường sau khi thu hồi. Khi mọi biên bản của đơn được xử lý, phí phát sinh được trừ vào
            tiền cọc và đơn tự hoàn tất.
          </p>
        </div>
      </div>
      {message && <p className="admin-message">{message}</p>}
      <div className="incident-grid">
        {items.map(item => (
          <article key={item.id} className="incident-card">
            <div>
              <span className={`status ${item.status === 'RESOLVED' ? 'rental-completed' : 'rental-cancelled'}`}>
                {item.status === 'RESOLVED' ? 'Đã xử lý' : 'Chờ xử lý'}
              </span>
              <b>{item.code}</b>
            </div>
            <h3>{item.productName}</h3>
            <p>
              {item.equipmentCode} · {incidentLabels[item.incidentType] || item.incidentType} · Báo bởi{' '}
              {item.reportedBy || '—'} · {date(item.createdAt)}
            </p>
            {item.missingItems?.length > 0 && <p className="missing-items">Thiếu: {item.missingItems.join(', ')}</p>}
            <p>{item.description}</p>
            {item.images?.length > 0 && (
              <div className="log-images">
                {item.images.map(src => (
                  <a key={src} href={src} target="_blank" rel="noreferrer">
                    <img src={src} alt="Ảnh thu hồi" loading="lazy" />
                  </a>
                ))}
              </div>
            )}
            {item.status === 'RESOLVED' ? (
              <small>
                {item.resolution} · Phí {money(item.feeAmount)}
              </small>
            ) : (
              <UiButton className="admin-primary" onClick={() => setSelected(item)}>
                Xử lý sự cố
              </UiButton>
            )}
          </article>
        ))}
      </div>
      {!items.length && <p className="empty-row">Chưa có sự cố nào.</p>}
      {selected && (
        <div className="admin-modal" onMouseDown={e => e.target === e.currentTarget && setSelected(null)}>
          <form className="admin-form small" onSubmit={resolve}>
            <div className="section-head">
              <div>
                <p className="eyebrow">{selected.code}</p>
                <h2>{incidentLabels[selected.incidentType]}</h2>
              </div>
              <UiButton type="button" className="close" onClick={() => setSelected(null)}>
                ×
              </UiButton>
            </div>
            <p>
              <b>{selected.productName}</b> · {selected.equipmentCode}
            </p>
            {selected.missingItems?.length > 0 && (
              <p className="missing-items">Thiếu: {selected.missingItems.join(', ')}</p>
            )}
            <p>{selected.description}</p>
            <p className="hint">
              Tiền cọc của đơn: {money(selected.deposit)}. Phí phát sinh sẽ được khấu trừ vào cọc khi quyết toán.
            </p>
            <label>
              Kết quả xử lý
              <Input.TextArea name="resolution" required placeholder="Mô tả việc sửa chữa, thay thế phụ kiện…" />
            </label>
            <label>
              Phí phát sinh
              <Input name="feeAmount" type="number" min="0" step="1000" defaultValue="0" required />
            </label>
            <label>
              Trạng thái thiết bị
              <select name="equipmentOutcome" required>
                <option value="AVAILABLE">Trả lại kho</option>
                <option value="MAINTENANCE">Tiếp tục bảo trì</option>
                <option value="DAMAGED">Đánh dấu hư hỏng</option>
                <option value="RETIRED">Ngừng sử dụng</option>
              </select>
            </label>
            <UiButton className="admin-primary">Hoàn tất xử lý</UiButton>
          </form>
        </div>
      )}
    </section>
  );
}
