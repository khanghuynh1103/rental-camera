import { Input } from 'antd';
import UiButton from '../components/UiButton';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import EvidenceLog from '../components/EvidenceLog';
import IdentityPanel from '../components/IdentityPanel';
import RentalFinance from '../components/RentalFinance';
import { chargeTypeLabels, formatDate, formatDateTime, incidentLabels, money, paymentStatusLabels, rentalStatusLabels, statusClass } from '../labels';
import '../styles/account.css';
import '../styles/roleDashboard.css';
import '../styles/workflow.css';

const extensionLabels = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' };
const progress = { delivery: ['PENDING', 'CONFIRMED', 'DELIVERING', 'RENTING', 'RETURNING', 'COMPLETED'], store: ['PENDING', 'CONFIRMED', 'RENTING', 'COMPLETED'] };

export default function Account() {
  const { user, logout, updateProfile } = useAuth(); const navigate = useNavigate();
  const [tab, setTab] = useState('rentals'), [data, setData] = useState({ rentals: [], extensions: [], charges: [], unreadNotifications: 0 });
  const [detailId, setDetailId] = useState(null), [extending, setExtending] = useState(null), [message, setMessage] = useState('');

  const load = useCallback(() => api.accountRentals().then(setData).catch(e => setMessage(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const save = async e => { e.preventDefault(); try { setMessage((await updateProfile(Object.fromEntries(new FormData(e.currentTarget)))).message); } catch (error) { setMessage(error.message); } };
  const act = async (action, after) => { try { const result = await action(); setMessage(result.message); await load(); after?.(); } catch (error) { setMessage(error.message); } };
  const pay = id => act(() => api.payExtraCharge(id));
  const signOut = async () => { await logout(); navigate('/login'); };
  const tabs = [['rentals', '▣ Đơn thuê'], ['notifications', `◔ Thông báo${data.unreadNotifications ? ` (${data.unreadNotifications})` : ''}`], ['extensions', '↗ Gia hạn'], ['charges', '$ Phí phát sinh'], ['identity', '✓ Xác minh CCCD'], ['profile', '◎ Hồ sơ']];

  return <><header className="account-header"><Link to="/"><img src="/logo.png" alt="Trạm Máy Ảnh" /></Link><nav><Link to="/">Trang chủ</Link><UiButton onClick={signOut}>Đăng xuất</UiButton></nav></header>
    <main className="account-page">
      <section><p className="eyebrow">Cổng thành viên</p><h1>Chào, {user.fullName.split(' ').at(-1)}.</h1><p>Theo dõi đơn thuê, yêu cầu gia hạn, thông báo và các khoản thanh toán của bạn.</p></section>
      {message && <p className="account-message">{message}</p>}
      <div className="dashboard"><aside>{tabs.map(([value, label]) => <UiButton className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{label}</UiButton>)}</aside>
        <section className="profile">
          {tab === 'rentals' && <RentalList rentals={data.rentals} open={setDetailId} extend={setExtending} />}
          {tab === 'notifications' && <Notifications onRead={load} open={setDetailId} />}
          {tab === 'extensions' && <ExtensionList items={data.extensions} />}
          {tab === 'charges' && <ChargeList items={data.charges} pay={pay} />}
          {tab === 'identity' && <IdentityPanel user={user} />}
          {tab === 'profile' && <Profile user={user} save={save} />}
        </section></div>
      {detailId && <RentalDetail id={detailId} close={() => setDetailId(null)} onChanged={load} setMessage={setMessage} extend={rental => { setDetailId(null); setExtending(rental); }} goIdentity={() => { setDetailId(null); setTab('identity'); }} />}
      {extending && <ExtensionForm rental={extending} close={() => setExtending(null)} done={async text => { setMessage(text); setExtending(null); await load(); setTab('extensions'); }} />}
    </main></>;
}

function RentalList({ rentals, open, extend }) {
  return <><div className="profile-title"><div><p className="eyebrow">Lịch sử thuê</p><h2>Đơn thuê của tôi</h2></div><span>{rentals.length} đơn</span></div>
    <div className="customer-list">{rentals.map(r => <article key={r.id}>
      <div><b>{r.code}</b><span className={statusClass(r.status)}>{rentalStatusLabels[r.status]}</span>{r.isOverdue && <span className="status overdue">Quá hạn</span>}</div>
      <h3>{r.productName}</h3>
      <p>{formatDate(r.startDate)} – {formatDate(r.endDate)} · {r.deliveryMethod === 'delivery' ? 'Giao tận nơi' : 'Nhận tại cửa hàng'}</p>
      <strong>{money(r.total)}</strong>
      {r.canPay && <p className="hint warn">Cần thanh toán online trước {formatDateTime(r.expiresAt)} để giữ lịch.</p>}
      <div className="row-actions">
        <UiButton onClick={() => open(r.id)}>Xem chi tiết</UiButton>
        {r.canExtend && <UiButton onClick={() => extend(r)}>Yêu cầu gia hạn</UiButton>}
      </div>
      {['CONFIRMED', 'DELIVERING', 'RENTING'].includes(r.status) && !r.canExtend && <small>Chỉ có thể yêu cầu gia hạn trước hạn trả ít nhất 3 ngày.</small>}
    </article>)}</div>
    {!rentals.length && <Empty text="Bạn chưa có đơn thuê nào." />}</>;
}

function RentalDetail({ id, close, onChanged, setMessage, extend, goIdentity }) {
  const [rental, setRental] = useState(null), [error, setError] = useState(''), [reason, setReason] = useState(''), [cancelling, setCancelling] = useState(false);
  const reload = useCallback(() => api.accountRental(id).then(result => setRental(result.rental)).catch(e => setError(e.message)), [id]);
  useEffect(() => { reload(); }, [reload]);
  const run = async action => {
    setError('');
    try { const result = await action(); setMessage(result.message); await Promise.all([reload(), onChanged()]); setCancelling(false); } catch (e) { setError(e.message); }
  };
  if (!rental) return <div className="admin-modal"><article className="admin-form">{error || 'Đang tải đơn thuê…'}</article></div>;
  const steps = progress[rental.deliveryMethod] || progress.delivery;
  const reached = rental.status === 'INSPECTING' ? steps.indexOf('COMPLETED') - 0.5 : steps.indexOf(rental.status);

  return <div className="admin-modal" onMouseDown={e => e.target === e.currentTarget && close()}><article className="admin-form rental-detail">
    <div className="section-head"><div><p className="eyebrow">{rental.code}</p><h2>Chi tiết đơn thuê</h2></div><UiButton className="close" onClick={close}>×</UiButton></div>
    {rental.status === 'CANCELLED' ? <p className="role-error">Đơn đã hủy. {rental.cancelReason}</p>
      : <ol className="order-progress">{steps.map((step, index) => <li key={step} className={index <= reached ? 'done' : ''}>{rentalStatusLabels[step]}</li>)}</ol>}
    {rental.status === 'PENDING' && rental.identity.required && rental.identity.status !== 'APPROVED' && <p className="hint warn">Đơn này cần xác minh CCCD trước khi cửa hàng duyệt{rental.identity.status === 'PENDING' ? ' (hồ sơ đang chờ duyệt).' : '. '}{rental.identity.status !== 'PENDING' && <button type="button" className="link-button" onClick={goIdentity}>Gửi hồ sơ ngay →</button>}</p>}
    {rental.status === 'INSPECTING' && <p className="hint warn">Cửa hàng đang kiểm tra tình trạng thiết bị sau thu hồi. Bạn sẽ nhận thông báo khi có kết quả và quyết toán tiền cọc.</p>}
    {rental.isOverdue && <p className="role-error">Đơn đã quá hạn trả. Phí trả muộn được tính cho mỗi ngày trễ.</p>}
    <div className="detail-grid">
      <section><h3>Thời gian thuê</h3><p>{formatDate(rental.startDate)} – {formatDate(rental.endDate)} ({rental.days} ngày)</p>{rental.returnedOn && <p>Đã trả ngày {formatDate(rental.returnedOn)}</p>}</section>
      <section><h3>Giao nhận</h3><p>{rental.deliveryMethod === 'delivery' ? `Giao tận nơi · ${rental.address}` : 'Nhận và trả tại cửa hàng'}</p>
        {rental.assignedStaffName && <p>Nhân viên: {rental.assignedStaffName}{rental.assignedStaffPhone ? ` · ${rental.assignedStaffPhone}` : ''}</p>}</section>
    </div>
    <section className="detail-products"><h3>Thiết bị</h3>{rental.items.map(item => <div key={item.id}>
      <span><b>{item.productName}</b><small>{(item.included || []).join(', ')}</small></span><strong>{money(item.pricePerDay)}/ngày</strong></div>)}</section>
    <RentalFinance rental={rental} onPayCharge={chargeId => run(() => api.payExtraCharge(chargeId))} />
    {rental.incidents.length > 0 && <section className="detail-products"><h3>Kết quả kiểm tra thiết bị</h3>{rental.incidents.map(incident => <div key={incident.id}>
      <span><b>{incidentLabels[incident.incidentType]}</b><small>{incident.description}</small></span>
      <strong>{incident.status === 'RESOLVED' ? `${incident.resolution} · ${money(incident.feeAmount)}` : 'Đang xử lý'}</strong></div>)}</section>}
    {error && <p className="role-error">{error}</p>}
    <div className="row-actions detail-actions">
      {rental.canPay && <UiButton className="admin-primary" onClick={() => run(() => api.completePayment(rental.id))}>Thanh toán online mô phỏng {money(rental.payment.amount)}</UiButton>}
      {rental.canExtend && <UiButton onClick={() => extend(rental)}>Yêu cầu gia hạn</UiButton>}
      {rental.canCancel && !cancelling && <UiButton className="danger" onClick={() => setCancelling(true)}>Hủy đơn</UiButton>}
    </div>
    {cancelling && <section className="status-actions"><label>Lý do hủy (không bắt buộc)<Input.TextArea value={reason} onChange={e => setReason(e.target.value)} /></label>
      <p className="hint">{rental.payment.status === 'PAID_SIMULATED' ? `Tiền thuê ${money(rental.payment.amount)} sẽ được hoàn (mô phỏng).` : 'Đơn chưa thanh toán nên không phát sinh hoàn tiền.'}</p>
      <div><UiButton className="secondary" onClick={() => setCancelling(false)}>Giữ đơn</UiButton><UiButton className="danger" onClick={() => run(() => api.cancelRental(rental.id, reason))}>Xác nhận hủy</UiButton></div></section>}
    <EvidenceLog logs={rental.logs} title="Bằng chứng bàn giao & thu hồi" />
    <section className="history"><h3>Tiến trình</h3>{rental.history.map(item => <div key={item.id}><i></i><p>
      <b>{rentalStatusLabels[item.toStatus] || item.toStatus}</b><span>{formatDateTime(item.changedAt)}</span>{item.note && <small>{item.note}</small>}</p></div>)}</section>
  </article></div>;
}

function ExtensionForm({ rental, close, done }) {
  const [options, setOptions] = useState(null), [error, setError] = useState('');
  useEffect(() => { api.extensionOptions(rental.id).then(setOptions).catch(e => setError(e.message)); }, [rental.id]);
  const submit = async e => {
    e.preventDefault(); setError('');
    try { done((await api.requestExtension(rental.id, Object.fromEntries(new FormData(e.currentTarget)))).message); } catch (error) { setError(error.message); }
  };
  return <div className="admin-modal" onMouseDown={e => e.target === e.currentTarget && close()}><form className="admin-form small" onSubmit={submit}>
    <div className="section-head"><div><p className="eyebrow">{rental.code}</p><h2>Yêu cầu gia hạn</h2></div><UiButton type="button" className="close" onClick={close}>×</UiButton></div>
    <p>Ngày trả hiện tại: <b>{formatDate(rental.endDate)}</b></p>
    {!options ? <p>{error || 'Đang kiểm tra lịch thiết bị…'}</p> : !options.canRequest ? <p className="role-error">{options.reason}</p> : <>
      <p className="hint">Có thể gia hạn đến <b>{formatDate(options.maxEndDate)}</b>{options.nextBookingStart ? ` (thiết bị đã có lịch thuê từ ${formatDate(options.nextBookingStart)})` : ''}.</p>
      <label>Ngày trả mới<Input name="requestedEndDate" type="date" min={options.minEndDate} max={options.maxEndDate} required /></label>
      <label>Lý do gia hạn<Input.TextArea name="reason" placeholder="Mô tả lý do cần thuê thêm…" /></label>
      {error && <p className="role-error">{error}</p>}
      <UiButton className="admin-primary">Gửi yêu cầu</UiButton></>}
  </form></div>;
}

function Notifications({ onRead, open }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let live = true;
    api.notifications().then(result => {
      if (!live) return;
      setItems(result.notifications);
      if (result.unread) api.markNotificationsRead().then(onRead).catch(() => {});
    }).catch(() => live && setItems([]));
    return () => { live = false; };
  }, [onRead]);
  if (!items) return <p>Đang tải thông báo…</p>;
  return <><div className="profile-title"><div><p className="eyebrow">Cập nhật</p><h2>Thông báo</h2></div></div>
    <div className="notification-list">{items.map(item => <article key={item.id} className={item.readAt ? '' : 'unread'}>
      <b>{item.title}</b><p>{item.body}</p><small>{formatDateTime(item.createdAt)}</small>
      {item.rentalId && <button type="button" onClick={() => open(item.rentalId)}>Xem đơn →</button>}
    </article>)}</div>
    {!items.length && <Empty text="Chưa có thông báo nào." />}</>;
}

function ExtensionList({ items }) {
  return <><div className="profile-title"><div><p className="eyebrow">Thời gian thuê</p><h2>Yêu cầu gia hạn</h2></div></div>
    <div className="customer-list">{items.map(x => <article key={x.id}><div><b>{x.code}</b><span className={`status ${x.status === 'REJECTED' ? 'rental-cancelled' : ''}`}>{extensionLabels[x.status]}</span></div>
      <p>{formatDate(x.oldEndDate)} → <b>{formatDate(x.requestedEndDate)}</b></p><p>{x.reason || 'Không có ghi chú'}</p>
      {x.status === 'APPROVED' && <strong>Phí gia hạn: {money(x.extraAmount)}</strong>}</article>)}</div>
    {!items.length && <Empty text="Bạn chưa gửi yêu cầu gia hạn." />}</>;
}

function ChargeList({ items, pay }) {
  return <><div className="profile-title"><div><p className="eyebrow">Thanh toán</p><h2>Phí phát sinh</h2></div></div>
    <p className="hint">Các khoản chưa thanh toán sẽ được trừ vào tiền cọc khi cửa hàng quyết toán đơn.</p>
    <div className="customer-list">{items.map(x => <article key={x.id}>
      <div><b>{x.code}</b><span className={`status ${x.paymentStatus === 'PENDING' ? 'rental-pending' : 'rental-completed'}`}>{paymentStatusLabels[x.paymentStatus] || x.paymentStatus}</span></div>
      <h3>{chargeTypeLabels[x.chargeType] || x.chargeType}</h3><p>{x.description}</p><strong>{money(x.amount)}</strong>
      {x.paymentStatus === 'PENDING' && <UiButton onClick={() => pay(x.id)}>Thanh toán mô phỏng</UiButton>}</article>)}</div>
    {!items.length && <Empty text="Bạn không có khoản phí phát sinh." />}</>;
}

function Profile({ user, save }) {
  return <><div className="profile-title"><div><p className="eyebrow">Thông tin tài khoản</p><h2>Hồ sơ cá nhân</h2></div><span>Khách hàng</span></div>
    <form onSubmit={save}><label>Họ và tên<Input name="fullName" defaultValue={user.fullName} required /></label><label>Email<Input value={user.email} disabled readOnly /></label>
      <label>Số điện thoại<Input name="phone" defaultValue={user.phone} /></label><UiButton>Lưu thay đổi</UiButton></form><NotificationPreferences /></>;
}

function NotificationPreferences() {
  const [prefs, setPrefs] = useState(null), [message, setMessage] = useState('');
  useEffect(() => { api.notificationPreferences().then(setPrefs).catch(e => setMessage(e.message)); }, []);
  const toggle = async key => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try { setMessage((await api.updateNotificationPreferences(next)).message); } catch (e) { setPrefs(prefs); setMessage(e.message); }
  };
  if (!prefs) return null;
  return <section className="notification-prefs"><h3>Nhận thông báo</h3>
    <label><input type="checkbox" checked={prefs.email} onChange={() => toggle('email')} /> Email cho mọi cập nhật của đơn thuê</label>
    <label><input type="checkbox" checked={prefs.sms} onChange={() => toggle('sms')} /> SMS cho mốc quan trọng (xác nhận, giao, thu hồi, sắp đến hạn, quá hạn, hủy đơn)</label>
    {message && <p className="hint">{message}</p>}</section>;
}

function Empty({ text }) { return <div className="empty"><b>▣</b><h3>{text}</h3><Link to="/products">Khám phá thiết bị →</Link></div>; }
