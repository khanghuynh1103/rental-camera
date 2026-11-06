import { Input } from 'antd';
import UiButton from './UiButton';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import EvidenceForm from './EvidenceForm';
import EvidenceLog from './EvidenceLog';
import RentalFinance from './RentalFinance';
import {
  formatDate,
  formatDateTime,
  incidentLabels,
  money,
  paymentStatusLabels,
  rentalStatusLabels,
  statusClass
} from '../labels';
import '../styles/workflow.css';

const actionLabels = {
  CONFIRMED: 'Duyệt đơn',
  CANCELLED: 'Từ chối / hủy',
  HANDOVER: 'Bàn giao tại cửa hàng',
  RETURN: 'Nhận lại thiết bị'
};

export default function AdminRentals({ initialFilter }) {
  const [rentals, setRentals] = useState([]),
    [staff, setStaff] = useState([]),
    [query, setQuery] = useState(''),
    [filterQuery, setFilterQuery] = useState('');
  const [status, setStatus] = useState(initialFilter?.status || ''),
    [overdue, setOverdue] = useState(Boolean(initialFilter?.overdue)),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const [page, setPage] = useState(1),
    [pages, setPages] = useState(1),
    [selected, setSelected] = useState(null),
    [message, setMessage] = useState('');

  const load = useCallback(
    () =>
      api
        .adminRentals({ q: filterQuery, status, from, to, page, overdue: overdue ? 'true' : '' })
        .then(result => {
          setRentals(result.rentals);
          setPages(result.totalPages);
        })
        .catch(e => setMessage(e.message)),
    [filterQuery, status, from, to, page, overdue]
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    api
      .deliveryStaff()
      .then(result => setStaff(result.staff))
      .catch(e => setMessage(e.message));
  }, []);

  const search = e => {
    e.preventDefault();
    setPage(1);
    setFilterQuery(query);
  };
  const open = async id => {
    try {
      setSelected((await api.adminRental(id)).rental);
    } catch (e) {
      setMessage(e.message);
    }
  };
  const refresh = async text => {
    if (text) setMessage(text);
    setSelected((await api.adminRental(selected.id)).rental);
    await load();
  };

  return (
    <section className="role-card admin-section">
      <div className="section-head">
        <div>
          <h2>Quản lý đơn thuê</h2>
          <p>Duyệt đơn, phân công giao nhận, bàn giao tại cửa hàng và theo dõi quyết toán.</p>
        </div>
      </div>
      {message && <p className="admin-message">{message}</p>}
      <form className="rental-filters" onSubmit={search}>
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Mã đơn, khách hàng, SĐT hoặc sản phẩm"
        />
        <select
          value={status}
          onChange={e => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Mọi trạng thái</option>
          {Object.entries(rentalStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Input
          type="date"
          value={from}
          onChange={e => {
            setFrom(e.target.value);
            setPage(1);
          }}
          aria-label="Từ ngày"
        />
        <Input
          type="date"
          value={to}
          onChange={e => {
            setTo(e.target.value);
            setPage(1);
          }}
          aria-label="Đến ngày"
        />
        <label className="filter-check">
          <input
            type="checkbox"
            checked={overdue}
            onChange={e => {
              setOverdue(e.target.checked);
              setPage(1);
            }}
          />{' '}
          Chỉ đơn quá hạn
        </label>
        <UiButton>Tìm kiếm</UiButton>
      </form>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Khách hàng</th>
              <th>Thiết bị</th>
              <th>Thời gian</th>
              <th>Thanh toán</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rentals.map(r => (
              <tr key={r.id}>
                <td>
                  <b>{r.code}</b>
                  <small>
                    {r.deliveryMethod === 'delivery'
                      ? `Giao tận nơi${r.staffName ? ` · ${r.staffName}` : ' · chưa phân công'}`
                      : 'Tại cửa hàng'}
                  </small>
                </td>
                <td>
                  {r.customerName}
                  <small>{r.phone}</small>
                </td>
                <td>{r.productName}</td>
                <td>
                  {formatDate(r.startDate)} – {formatDate(r.endDate)}
                </td>
                <td>
                  {paymentStatusLabels[r.paymentStatus] || r.paymentStatus}
                  <small>{r.paymentMethod === 'online' ? 'Online' : 'Khi bàn giao'}</small>
                </td>
                <td>
                  <span className={statusClass(r.status)}>{rentalStatusLabels[r.status]}</span>
                  {r.isOverdue && <span className="status overdue">Quá hạn</span>}
                </td>
                <td>
                  <UiButton className="table-link" onClick={() => open(r.id)}>
                    Chi tiết →
                  </UiButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rentals.length && <p className="empty-row">Không tìm thấy đơn thuê phù hợp.</p>}
      <div className="admin-pagination">
        <UiButton disabled={page === 1} onClick={() => setPage(page - 1)}>
          ←
        </UiButton>
        <span>
          Trang {page}/{pages}
        </span>
        <UiButton disabled={page === pages} onClick={() => setPage(page + 1)}>
          →
        </UiButton>
      </div>
      {selected && <RentalDetail rental={selected} staff={staff} close={() => setSelected(null)} refresh={refresh} />}
    </section>
  );
}

function RentalDetail({ rental, staff, close, refresh }) {
  const [note, setNote] = useState(''),
    [error, setError] = useState(''),
    [evidenceMode, setEvidenceMode] = useState(null);
  const run = async action => {
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e.message);
    }
  };
  const changeStatus = next =>
    run(async () => {
      const result = await api.updateRentalStatus(rental.id, { status: next, note });
      setNote('');
      await refresh(result.message);
    });
  const assign = staffId =>
    run(async () => {
      const result = await api.assignDeliveryStaff(rental.id, staffId);
      await refresh(result.message);
    });
  const remind = () =>
    run(async () => {
      const result = await api.remindCustomer(rental.id, note);
      setNote('');
      await refresh(result.message);
    });
  const submitEvidence = async values => {
    const result =
      evidenceMode === 'handover'
        ? await api.storeHandover(rental.id, values)
        : await api.storeReturn(rental.id, values);
    setEvidenceMode(null);
    await refresh(result.message);
  };
  const simpleActions = rental.allowedActions.filter(action => ['CONFIRMED', 'CANCELLED'].includes(action));
  const canAssign =
    rental.deliveryMethod === 'delivery' &&
    ['PENDING', 'CONFIRMED', 'DELIVERING', 'RENTING', 'RETURNING'].includes(rental.status);

  return (
    <div className="admin-modal" onMouseDown={e => e.target === e.currentTarget && close()}>
      <article className="admin-form rental-detail">
        <div className="section-head">
          <div>
            <p className="eyebrow">{rental.code}</p>
            <h2>Chi tiết đơn thuê</h2>
          </div>
          <UiButton className="close" onClick={close}>
            ×
          </UiButton>
        </div>
        <div className="detail-status">
          <span className={statusClass(rental.status)}>{rentalStatusLabels[rental.status]}</span>
          {rental.isOverdue && <span className="status overdue">Quá hạn</span>}
          <span>Tạo lúc {formatDateTime(rental.createdAt)}</span>
          {rental.status === 'PENDING' && rental.expiresAt && (
            <span>Giữ lịch đến {formatDateTime(rental.expiresAt)}</span>
          )}
        </div>
        {rental.cancelReason && <p className="role-error">{rental.cancelReason}</p>}
        {rental.status === 'PENDING' && rental.identity.required && rental.identity.status !== 'APPROVED' && (
          <p className="hint warn">
            Đơn cần khách xác minh CCCD trước khi duyệt (
            {rental.identity.status === 'PENDING'
              ? 'hồ sơ đang chờ tại mục Xác minh CCCD'
              : 'khách chưa có hồ sơ hợp lệ'}
            ).
          </p>
        )}
        <div className="detail-grid">
          <section>
            <h3>Khách hàng</h3>
            <p>
              <b>{rental.fullName}</b>
            </p>
            <p>
              {rental.phone} · {rental.email}
            </p>
          </section>
          <section>
            <h3>Thời gian thuê</h3>
            <p>
              {formatDate(rental.startDate)} – {formatDate(rental.endDate)} ({rental.days} ngày)
            </p>
            <p>
              {rental.deliveryTime || 'Chưa chọn giờ giao'} / {rental.returnTime || 'Chưa chọn giờ trả'}
            </p>
            {rental.returnedOn && <p>Đã trả ngày {formatDate(rental.returnedOn)}</p>}
          </section>
          <section>
            <h3>Giao nhận</h3>
            <p>{rental.deliveryMethod === 'delivery' ? 'Giao tận nơi' : 'Nhận tại cửa hàng'}</p>
            <p>{rental.address || 'Trạm Máy Ảnh'}</p>
            {canAssign && (
              <label>
                Nhân viên phụ trách
                <select value={rental.assignedDeliveryStaffId || ''} onChange={e => assign(e.target.value)}>
                  <option value="">Chưa phân công</option>
                  {staff.map(item => (
                    <option value={item.id} key={item.id}>
                      {item.fullName} · {item.openTasks} việc đang mở
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!canAssign && rental.assignedStaffName && <p>Nhân viên: {rental.assignedStaffName}</p>}
          </section>
          <section>
            <h3>Ghi chú khách</h3>
            <p>{rental.note || 'Không có ghi chú'}</p>
          </section>
        </div>
        <section className="detail-products">
          <h3>Thiết bị thuê</h3>
          {rental.items.map(item => (
            <div key={item.id}>
              <span>
                <b>{item.productName}</b>
                <small>
                  {item.equipmentCode || 'Chưa gán thiết bị'} · {(item.included || []).join(', ')}
                </small>
              </span>
              <strong>{money(item.pricePerDay)}/ngày</strong>
            </div>
          ))}
        </section>
        <RentalFinance rental={rental} />
        {rental.incidents.length > 0 && (
          <section className="detail-products">
            <h3>Biên bản sự cố</h3>
            {rental.incidents.map(incident => (
              <div key={incident.id}>
                <span>
                  <b>
                    {incidentLabels[incident.incidentType]} · {incident.equipmentCode}
                  </b>
                  <small>{incident.description}</small>
                </span>
                <strong>
                  {incident.status === 'RESOLVED'
                    ? `Đã xử lý · ${money(incident.feeAmount)}`
                    : 'Chờ xử lý tại mục Sự cố'}
                </strong>
              </div>
            ))}
          </section>
        )}

        {evidenceMode ? (
          <section className="status-actions">
            <div className="section-head">
              <h3>{evidenceMode === 'handover' ? 'Bàn giao tại cửa hàng' : 'Nhận lại thiết bị tại cửa hàng'}</h3>
              <UiButton className="secondary" onClick={() => setEvidenceMode(null)}>
                Hủy
              </UiButton>
            </div>
            <EvidenceForm
              mode={evidenceMode}
              items={rental.items}
              collectAmount={
                evidenceMode === 'handover'
                  ? (rental.payment.status === 'PENDING' && rental.payment.method === 'handover'
                      ? rental.payment.amount
                      : 0) + rental.deposit.amount
                  : 0
              }
              submitLabel={evidenceMode === 'handover' ? 'Xác nhận đã bàn giao' : 'Xác nhận đã nhận lại'}
              onSubmit={submitEvidence}
            />
          </section>
        ) : (
          <section className="status-actions">
            <label>
              Ghi chú xử lý / nội dung nhắc khách
              <Input.TextArea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Bắt buộc khi từ chối hoặc hủy đơn"
              />
            </label>
            {error && <p className="role-error">{error}</p>}
            <div>
              {rental.allowedActions.includes('HANDOVER') && (
                <UiButton className="admin-primary" onClick={() => setEvidenceMode('handover')}>
                  {actionLabels.HANDOVER}
                </UiButton>
              )}
              {rental.allowedActions.includes('RETURN') && (
                <UiButton className="admin-primary" onClick={() => setEvidenceMode('return')}>
                  {actionLabels.RETURN}
                </UiButton>
              )}
              {simpleActions.map(next => (
                <UiButton
                  key={next}
                  className={next === 'CANCELLED' ? 'danger' : 'admin-primary'}
                  onClick={() => changeStatus(next)}
                >
                  {actionLabels[next]}
                </UiButton>
              ))}
              {['CONFIRMED', 'DELIVERING', 'RENTING', 'RETURNING'].includes(rental.status) && (
                <UiButton className="secondary" onClick={remind}>
                  Gửi nhắc nhở
                </UiButton>
              )}
            </div>
            {rental.deliveryMethod === 'delivery' &&
              ['CONFIRMED', 'DELIVERING', 'RENTING', 'RETURNING'].includes(rental.status) && (
                <p className="hint">
                  Các bước giao, bàn giao và thu hồi do nhân viên được phân công thực hiện kèm ảnh bằng chứng.
                </p>
              )}
            {rental.status === 'INSPECTING' && (
              <p className="hint">Đơn hoàn tất và tự quyết toán cọc khi mọi biên bản sự cố được xử lý.</p>
            )}
          </section>
        )}
        <EvidenceLog logs={rental.logs} />
        <section className="history">
          <h3>Lịch sử trạng thái</h3>
          {rental.history.map(item => (
            <div key={item.id}>
              <i></i>
              <p>
                <b>{rentalStatusLabels[item.toStatus] || item.toStatus}</b>
                <span>
                  {item.changedBy || 'Hệ thống'} · {formatDateTime(item.changedAt)}
                </span>
                {item.note && <small>{item.note}</small>}
              </p>
            </div>
          ))}
        </section>
      </article>
    </div>
  );
}
