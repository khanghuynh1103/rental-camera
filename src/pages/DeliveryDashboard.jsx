import { Input } from 'antd';
import UiButton from '../components/UiButton';
import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import EvidenceForm from '../components/EvidenceForm';
import EvidenceLog from '../components/EvidenceLog';
import { api } from '../api';
import { formatDate, statusClass } from '../labels';
import '../styles/roleDashboard.css';
import '../styles/workflow.css';

const labels = { CONFIRMED: 'Cần giao', DELIVERING: 'Đang giao', RENTING: 'Khách đang thuê', RETURNING: 'Đang thu hồi' };
const actionLabels = { DELIVERING: 'Đã nhận thiết bị · Bắt đầu giao', RENTING: 'Xác nhận đã bàn giao cho khách', RETURNING: 'Bắt đầu đi thu hồi', RETURNED: 'Xác nhận đã thu hồi & kiểm tra' };

export default function DeliveryDashboard() {
  const [tasks, setTasks] = useState([]), [summary, setSummary] = useState(null), [status, setStatus] = useState(''), [filterDate, setFilterDate] = useState('');
  const [page, setPage] = useState(1), [pages, setPages] = useState(1), [selected, setSelected] = useState(null), [message, setMessage] = useState(''), [loading, setLoading] = useState(true);

  const load = useCallback(() => api.deliveryTasks({ status, date: filterDate, page })
    .then(result => { setTasks(result.tasks); setPages(result.totalPages); setSummary(result.summary); })
    .catch(e => setMessage(e.message))
    .finally(() => setLoading(false)), [status, filterDate, page]);
  useEffect(() => { load(); }, [load]);

  const open = async id => { try { setSelected((await api.deliveryTask(id)).task); } catch (e) { setMessage(e.message); } };
  // Lỗi được ném lại để form trong modal hiển thị ngay cạnh nút thao tác.
  const advance = async values => {
    const result = await api.updateDeliveryTask(selected.id, { status: selected.nextStatus, ...values });
    setMessage(result.message); setSelected(null); await load();
  };

  return <><Header /><main className="role-page container">
    <p className="eyebrow">Nhân viên giao nhận</p><h1>Lịch giao và thu hồi thiết bị</h1>
    <section className="delivery-summary">
      <article><b>{summary?.deliverToday ?? 0}</b><span>Cần giao hôm nay</span></article>
      <article><b>{summary?.collectToday ?? 0}</b><span>Cần thu hồi (đến hạn/quá hạn)</span></article>
      <article><b>{summary?.inProgress ?? 0}</b><span>Đang trên đường</span></article>
    </section>
    {message && <p className="admin-message">{message}</p>}
    <section className="delivery-toolbar">
      <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
        <option value="">Mọi công việc</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <label>Ngày thực hiện <Input type="date" value={filterDate} onChange={e => { setFilterDate(e.target.value); setPage(1); }} /></label>
      {filterDate && <UiButton onClick={() => setFilterDate('')}>Xóa ngày lọc</UiButton>}
    </section>
    {loading ? <div className="page-loader compact">Đang tải…</div> : tasks.length ? <section className="delivery-list">{tasks.map(task =>
      <article className="role-card delivery-task" key={task.id}>
        <div className="delivery-task-top"><span className={statusClass(task.status)}>{labels[task.status]}</span>{task.isOverdue && <span className="status overdue">Quá hạn</span>}<strong>{task.code}</strong></div>
        <div className="delivery-task-body">
          <div><p className="eyebrow">Thiết bị</p><h2>{task.productName}</h2><small>{task.equipmentCode}</small></div>
          <div><p><b>{task.customerName}</b> · <a href={`tel:${task.phone}`}>{task.phone}</a></p><p>{task.address}</p>
            <p>Giao {formatDate(task.startDate)} {task.deliveryTime && `· ${task.deliveryTime}`} → Thu {formatDate(task.endDate)} {task.returnTime && `· ${task.returnTime}`}</p></div>
          <UiButton className="admin-primary" onClick={() => open(task.id)}>Xử lý →</UiButton>
        </div>
      </article>)}</section>
      : <section className="role-card empty"><h2>Chưa có công việc được phân công</h2><p>Quản trị viên cần phân công đơn giao tận nơi cho tài khoản của bạn.</p></section>}
    <div className="admin-pagination"><UiButton disabled={page === 1} onClick={() => setPage(page - 1)}>←</UiButton><span>Trang {page}/{pages}</span><UiButton disabled={page === pages} onClick={() => setPage(page + 1)}>→</UiButton></div>
    {selected && <TaskDetail task={selected} close={() => setSelected(null)} advance={advance} />}
  </main><Footer /></>;
}

function TaskDetail({ task, close, advance }) {
  const [note, setNote] = useState(''), [error, setError] = useState('');
  const simpleAdvance = async () => { setError(''); try { await advance({ note }); } catch (e) { setError(e.message); } };
  const needsEvidence = ['RENTING', 'RETURNED'].includes(task.nextStatus);
  return <div className="admin-modal" onMouseDown={e => e.target === e.currentTarget && close()}><article className="admin-form delivery-detail">
    <div className="section-head"><div><p className="eyebrow">{task.code}</p><h2>{labels[task.status]}{task.isOverdue ? ' · Quá hạn' : ''}</h2></div><UiButton className="close" onClick={close}>×</UiButton></div>
    <section className="delivery-contact">
      <div><small>Khách hàng</small><b>{task.customerName}</b><span><a href={`tel:${task.phone}`}>{task.phone}</a> · {task.email}</span></div>
      <div><small>Địa chỉ</small><b>{task.address}</b><span>Giao {formatDate(task.startDate)} · {task.deliveryTime || 'Chưa chọn giờ'}</span><span>Thu {formatDate(task.endDate)} · {task.returnTime || 'Chưa chọn giờ'}</span></div>
    </section>
    <section className="detail-products"><h3>Danh sách thiết bị</h3>{task.items.map(item => <div key={item.id}>
      <span><b>{item.productName}</b><small>{item.equipmentCode} · {(item.included || []).join(', ')}</small></span></div>)}</section>
    {task.note && <p className="customer-note"><b>Ghi chú của khách:</b> {task.note}</p>}
    {needsEvidence
      ? <EvidenceForm key={task.nextStatus} mode={task.nextStatus === 'RETURNED' ? 'return' : 'handover'} items={task.items}
        collectAmount={task.nextStatus === 'RENTING' ? task.collectOnHandover : 0} submitLabel={`${actionLabels[task.nextStatus]} →`} onSubmit={advance} />
      : <><label className="delivery-note">Ghi chú xử lý<Input.TextArea value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú (không bắt buộc)" /></label>
        {error && <p className="role-error">{error}</p>}
        <UiButton className="admin-primary delivery-action" onClick={simpleAdvance}>{actionLabels[task.nextStatus]} →</UiButton></>}
    <EvidenceLog logs={task.logs} title="Lịch sử giao nhận" />
  </article></div>;
}
