import { Input } from 'antd';
import UiButton from '../components/UiButton';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { daysBetween, formatDate as dateText, formatDateTime, money } from '../labels';
import '../styles/booking.css';
import '../styles/workflow.css';

const MAX_ITEMS = 5;

export default function Booking() {
  const [params] = useSearchParams(), navigate = useNavigate(), { user } = useAuth();
  const productId = params.get('product'), startDate = params.get('start') || '', endDate = params.get('end') || '';
  const savedDraft = useMemo(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem('bookingDraft') || 'null');
      return value?.productId === productId && value?.startDate === startDate && value?.endDate === endDate ? value : null;
    } catch { return null; }
  }, [productId, startDate, endDate]);
  const [product, setProduct] = useState(null), [step, setStep] = useState(savedDraft ? 3 : 1);
  const [deliveryMethod, setDeliveryMethod] = useState(savedDraft?.deliveryMethod || 'delivery'), [paymentMethod, setPaymentMethod] = useState(savedDraft?.paymentMethod || 'online');
  const [extras, setExtras] = useState(savedDraft?.extras || []), [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(''), [sending, setSending] = useState(false), [order, setOrder] = useState(null), [identity, setIdentity] = useState(null);
  const [form, setForm] = useState(savedDraft?.form || { fullName: '', phone: '', email: '', address: '', deliveryTime: '', returnTime: '', note: '' });

  useEffect(() => { if (productId) api.product(productId).then(({ product }) => setProduct(product)).catch(() => setProduct(false)); }, [productId]);
  useEffect(() => {
    if (!productId || !startDate || !endDate) return;
    // Gợi ý thiết bị đi kèm còn trống đúng khoảng ngày đã chọn.
    api.products({ startDate, endDate, limit: 24 }).then(result => setSuggestions(result.products.filter(item => item.id !== productId))).catch(() => setSuggestions([]));
  }, [productId, startDate, endDate]);
  useEffect(() => { if (user?.role === 'CUSTOMER') api.identityStatus().then(setIdentity).catch(() => setIdentity(null)); }, [user]);
  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(current => ({ ...current, fullName: current.fullName || user.fullName, email: current.email || user.email, phone: current.phone || user.phone || '' }));
    }
  }, [user]);

  const days = startDate && endDate ? daysBetween(startDate, endDate) + 1 : 0;
  if (!productId || !startDate || !endDate || days < 1) return <div className="booking-missing"><h1>Thiếu thông tin đặt thuê</h1><Link to="/products">Chọn thiết bị và ngày thuê</Link></div>;
  if (product === null) return <div className="page-loader">Đang chuẩn bị đơn thuê…</div>;
  if (product === false) return <div className="booking-missing"><h1>Không tìm thấy thiết bị</h1><Link to="/products">Quay lại danh sách</Link></div>;

  const items = [product, ...extras];
  const dailyTotal = items.reduce((sum, item) => sum + item.price, 0);
  const rentalFee = dailyTotal * days, deposit = items.reduce((sum, item) => sum + item.deposit, 0);
  const amountDue = paymentMethod === 'online' ? rentalFee : rentalFee + deposit;
  const needsIdentity = identity && deposit >= identity.depositThreshold && identity.verification?.status !== 'APPROVED';
  const update = e => setForm({ ...form, [e.target.name]: e.target.value });
  const go = n => { setStep(n); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const toggleExtra = item => setExtras(current => current.some(entry => entry.id === item.id)
    ? current.filter(entry => entry.id !== item.id)
    : current.length + 1 >= MAX_ITEMS ? current : [...current, item]);
  const submitInfo = e => {
    e.preventDefault();
    const valid = form.fullName.trim() && form.phone.trim() && /^\S+@\S+\.\S+$/.test(form.email) && (deliveryMethod === 'store' || (form.address.trim() && form.deliveryTime && form.returnTime));
    if (!valid) { setError('Vui lòng điền đầy đủ các thông tin bắt buộc.'); return; }
    go(3);
  };
  const createOrder = async () => {
    if (!user) {
      sessionStorage.setItem('bookingDraft', JSON.stringify({ productId, startDate, endDate, form, deliveryMethod, paymentMethod, extras }));
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return;
    }
    setSending(true); setError('');
    try {
      const result = await api.createRental({ productIds: items.map(item => item.id), startDate, endDate, ...form, deliveryMethod, paymentMethod });
      sessionStorage.removeItem('bookingDraft'); setOrder(result.rental); go(paymentMethod === 'online' ? 4 : 5);
    } catch (e) { setError(e.message); } finally { setSending(false); }
  };
  const completePayment = async () => {
    setSending(true); setError('');
    try { setOrder((await api.completePayment(order.id)).rental); go(5); } catch (e) { setError(e.message); } finally { setSending(false); }
  };

  const summary = <aside className="booking-summary">
    {items.map(item => <div className="booking-product" key={item.id}><img src={item.images[0]} alt={item.name} /><div><small>{item.brandLabel}</small><h3>{item.name}</h3><span>{money(item.price)}/ngày · cọc {money(item.deposit)}</span></div></div>)}
    <div className="booking-prices">
      <p><span>{money(dailyTotal)} × {days} ngày</span><strong>{money(rentalFee)}</strong></p>
      <p><span>Phí giao nhận</span><strong>Miễn phí</strong></p>
      <p><span>Tiền cọc (hoàn sau khi kiểm tra)</span><strong>{money(deposit)}</strong></p>
      <p className="total"><span>{paymentMethod === 'online' ? 'Thanh toán online' : 'Thanh toán khi nhận'}</span><strong>{money(amountDue)}</strong></p>
    </div>
    <div className="deposit-note">{paymentMethod === 'online' ? 'Tiền cọc thu khi nhận máy. ' : ''}Tiền cọc được hoàn sau khi thu hồi và kiểm tra; phí phát sinh (nếu có) được khấu trừ vào cọc.</div>
    {needsIdentity && <p className="hint warn">Tiền cọc từ {money(identity.depositThreshold)}: bạn cần xác minh CCCD trong trang Tài khoản để cửa hàng duyệt đơn.</p>}
  </aside>;
  const steps = ['Chọn thiết bị', 'Thông tin nhận máy', 'Kiểm tra đơn', 'Thanh toán', paymentMethod === 'online' ? 'Hóa đơn' : 'Hoàn tất'];

  return <main className="booking-page"><div className="booking-top"><Link to="/"><strong>TRẠM MÁY ẢNH</strong></Link><Link to={`/products/${product.id}`}>← Trở về sản phẩm</Link></div>
    <div className="booking-progress">{steps.map((label, i) => <div key={label} className={step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}><b>{step > i + 1 ? '✓' : i + 1}</b><span>{label}</span></div>)}</div>

    {step === 1 && <Stage eyebrow="BƯỚC 1 · LỊCH KHẢ DỤNG" title="Kiểm tra thời gian thuê." text="Thiết bị đang còn trống trong khoảng ngày bạn đã chọn. Bạn có thể thuê thêm thiết bị đi kèm trong cùng một đơn." summary={summary}>
      <div className="booking-panel"><h2>Lịch thuê đã chọn</h2>
        <div className="selected-dates"><div><span>Ngày nhận</span><strong>{dateText(startDate)}</strong></div><div><span>Ngày trả</span><strong>{dateText(endDate)}</strong></div><div><span>Thời lượng</span><strong>{days} ngày</strong></div></div>
        <div className="available-box">✓ {product.name} đang có thể thuê trong thời gian này.</div>
        {suggestions.length > 0 && <section className="addon-section"><h2>Thêm thiết bị đi kèm</h2><p>Chỉ hiển thị thiết bị còn trống từ {dateText(startDate)} đến {dateText(endDate)}. Tối đa {MAX_ITEMS} thiết bị/đơn.</p>
          <div className="addon-grid">{suggestions.map(item => {
            const chosen = extras.some(entry => entry.id === item.id);
            return <button type="button" key={item.id} className={chosen ? 'active' : ''} disabled={!chosen && items.length >= MAX_ITEMS} onClick={() => toggleExtra(item)}>
              <img src={item.images[0]} alt="" /><span><b>{item.name}</b><small>{money(item.price)}/ngày</small></span><i>{chosen ? '✓' : '+'}</i></button>;
          })}</div></section>}
        <Actions back={<Link to={`/products/${product.id}`}>Chọn lại ngày</Link>} next={<UiButton onClick={() => go(2)}>Tiếp tục nhập thông tin →</UiButton>} />
      </div></Stage>}

    {step === 2 && <Stage eyebrow="BƯỚC 2 · GIAO NHẬN" title="Thông tin người thuê." text="Điền thông tin liên hệ và cách bạn muốn nhận thiết bị." summary={summary}>
      <form className="booking-panel booking-form" onSubmit={submitInfo}><h2>Thông tin liên hệ</h2>
        <div className="form-grid"><Field label="Họ và tên *" name="fullName" value={form.fullName} update={update} /><Field label="Số điện thoại *" name="phone" value={form.phone} update={update} /><Field wide label="Email *" name="email" type="email" value={form.email} update={update} /></div>
        <h2>Hình thức nhận thiết bị</h2>
        <div className="method-grid"><Choice active={deliveryMethod === 'delivery'} onClick={() => setDeliveryMethod('delivery')} title="Giao tận nơi" text="Nhân viên giao và thu hồi tại địa chỉ của bạn, chụp ảnh bàn giao" /><Choice active={deliveryMethod === 'store'} onClick={() => setDeliveryMethod('store')} title="Nhận tại cửa hàng" text="Kiểm tra trực tiếp trước khi nhận" /></div>
        {deliveryMethod === 'delivery' && <div className="form-grid delivery-fields"><Field wide label="Địa chỉ giao và thu hồi *" name="address" value={form.address} update={update} />
          <label>Khung giờ nhận *<select name="deliveryTime" value={form.deliveryTime} onChange={update}><option value="">Chọn khung giờ</option><option>08:00 – 11:00</option><option>13:00 – 16:00</option><option>17:00 – 20:00</option></select></label>
          <label>Khung giờ thu hồi *<select name="returnTime" value={form.returnTime} onChange={update}><option value="">Chọn khung giờ</option><option>08:00 – 11:00</option><option>13:00 – 16:00</option><option>17:00 – 20:00</option></select></label></div>}
        <label className="note-field">Ghi chú<Input.TextArea name="note" rows="3" value={form.note} onChange={update} /></label>
        <p className="booking-error">{error}</p>
        <Actions back={<UiButton type="button" className="secondary" onClick={() => go(1)}>← Quay lại</UiButton>} next={<UiButton>Kiểm tra đơn thuê →</UiButton>} />
      </form></Stage>}

    {step === 3 && <Stage eyebrow="BƯỚC 3 · XÁC NHẬN & THANH TOÁN" title="Kiểm tra và chọn thanh toán." text="Các giao dịch trên website hiện là mô phỏng và không phát sinh tiền thật." summary={summary}>
      <div className="booking-panel review"><h2>Thông tin đơn thuê</h2>
        <Review label="Thiết bị" value={items.map(item => item.name).join(', ')} />
        <Review label="Thời gian" value={`${dateText(startDate)} – ${dateText(endDate)} (${days} ngày)`} />
        <Review label="Khách hàng" value={`${form.fullName} · ${form.phone}`} />
        <Review label="Giao nhận" value={deliveryMethod === 'delivery' ? `${form.address} · ${form.deliveryTime} / ${form.returnTime}` : 'Nhận và trả tại cửa hàng'} />
        <div className="payment-section"><h2>Phương thức thanh toán</h2><p>Không nhập thông tin thẻ hoặc tài khoản ngân hàng thật.</p>
          <div className="payment-grid">
            <PaymentChoice active={paymentMethod === 'online'} icon="QR" title="Thanh toán online mô phỏng" text="Thanh toán tiền thuê ngay để giữ lịch (trong 30 phút)" onClick={() => setPaymentMethod('online')} />
            <PaymentChoice active={paymentMethod === 'handover'} icon="₫" title="Thanh toán khi nhận máy" text="Trả tiền thuê và cọc lúc bàn giao" onClick={() => setPaymentMethod('handover')} />
          </div>
          <div className="payment-detail"><strong>{paymentMethod === 'online' ? 'Kênh thanh toán mô phỏng' : 'Thanh toán trực tiếp khi bàn giao'}</strong>
            {paymentMethod === 'online' && <div className="payment-channels"><span>VNPAY QR</span><span>ATM / NAPAS</span><span>Visa / Mastercard</span></div>}
            <div className="payment-breakdown"><p><span>Tiền thuê</span><strong>{money(rentalFee)}</strong></p><p><span>Tiền cọc</span><strong>{money(deposit)}</strong></p>
              <p className="due"><span>{paymentMethod === 'online' ? 'Thanh toán ngay' : 'Thanh toán khi nhận máy'}</span><strong>{money(amountDue)}</strong></p></div></div></div>
        {!user && <p className="login-note">Bạn sẽ được chuyển sang đăng nhập trước khi tiếp tục.</p>}
        <p className="booking-error">{error}</p>
        <Actions back={<UiButton className="secondary" onClick={() => go(2)}>← Chỉnh sửa</UiButton>} next={<UiButton disabled={sending} onClick={createOrder}>{sending ? 'Đang tạo đơn…' : paymentMethod === 'online' ? 'Xác nhận & thanh toán' : 'Gửi yêu cầu thuê'}</UiButton>} />
      </div></Stage>}

    {step === 4 && <Stage eyebrow="BƯỚC 4 · THANH TOÁN MÔ PHỎNG" title="Xác nhận thanh toán." text="Hoàn tất bước mô phỏng để giữ lịch và nhận hóa đơn." summary={summary}>
      <div className="booking-panel"><div className="simulation-banner"><strong>Đây là giao dịch mô phỏng</strong><span>Không kết nối VNPAY thật và không phát sinh tiền thật.</span></div>
        <div className="payment-gateway"><div><small>TRẠM MÁY ẢNH · THANH TOÁN THỬ NGHIỆM</small><h2>VNPAY mô phỏng</h2><span>Mã đơn: {order.code}</span>{order.expiresAt && <span>Giữ lịch đến {formatDateTime(order.expiresAt)}</span>}</div>
          <div className="gateway-amount"><span>Số tiền cần thanh toán</span><strong>{money(rentalFee)}</strong></div>
          <div className="demo-card"><small>PHƯƠNG THỨC ĐÃ CHỌN</small><strong>VNPAY QR / Thẻ ngân hàng</strong><span>Không cần nhập thông tin thanh toán thật</span></div>
          <UiButton className="gateway-button" disabled={sending} onClick={completePayment}>{sending ? 'Đang xử lý…' : 'Mô phỏng thanh toán thành công'}</UiButton></div>
        <p className="booking-error">{error}</p>
        <p className="hint">Bạn cũng có thể thanh toán sau trong trang Tài khoản trước khi hết thời gian giữ lịch.</p>
      </div></Stage>}

    {step === 5 && <section className="receipt"><header><div><small>TRẠM MÁY ẢNH</small>
      <h1>{order.invoiceCode ? 'Hóa đơn thanh toán' : 'Đã gửi yêu cầu thuê'}</h1><p>{order.invoiceCode ? `Mã hóa đơn: ${order.invoiceCode}` : `Mã đơn: ${order.code}`}</p></div><b>{order.invoiceCode ? <>HÓA ĐƠN<br />MÔ PHỎNG</> : <>CHỜ<br />XÁC NHẬN</>}</b></header>
      <div className="receipt-body">
        <div className="receipt-status">✓ <span><strong>{order.invoiceCode ? 'Thanh toán thành công' : 'Cửa hàng sẽ xác nhận đơn trong vòng 24 giờ'}</strong><small>{order.paidAt ? formatDateTime(order.paidAt) : 'Bạn thanh toán tiền thuê và tiền cọc khi nhận máy.'}</small></span></div>
        {order.identityRequired && <p className="hint warn">Đơn cần xác minh CCCD trước khi được duyệt. <Link to="/account">Gửi hồ sơ trong trang Tài khoản →</Link></p>}
        <div className="receipt-meta"><Review label="Mã đơn" value={order.code} /><Review label="Khách hàng" value={form.fullName} /><Review label="Thời gian thuê" value={`${dateText(startDate)} – ${dateText(endDate)}`} />
          <Review label="Hình thức thanh toán" value={paymentMethod === 'online' ? 'VNPAY mô phỏng' : 'Thanh toán khi nhận máy (mô phỏng)'} /></div>
        {items.map(item => <div className="receipt-product" key={item.id}><img src={item.images[0]} alt={item.name} /><div><h2>{item.name}</h2><p>{money(item.price)}/ngày · {item.brandLabel}</p></div></div>)}
        <div className="invoice-lines"><Review label="Số ngày thuê" value={`${days} ngày`} /><Review label="Tiền thuê thiết bị" value={money(rentalFee)} />
          <Review label="Tiền cọc" value={`${money(deposit)} · Thu khi nhận máy`} />
          <div className="invoice-total"><span>{order.invoiceCode ? 'Tổng đã thanh toán' : 'Cần thanh toán khi nhận'}</span><strong>{money(order.invoiceCode ? order.paidAmount : rentalFee + deposit)}</strong></div></div>
      </div>
      <footer><Link to="/account">Theo dõi đơn thuê</Link><UiButton onClick={() => window.print()}>In</UiButton><Link className="primary" to="/">Về trang chủ</Link></footer></section>}
  </main>;
}

function Stage({ eyebrow, title, text, children, summary }) { return <section className="booking-container"><header><small>{eyebrow}</small><h1>{title}</h1><p>{text}</p></header><div className="booking-grid">{children}{summary}</div></section>; }
function Actions({ back, next }) { return <div className="booking-actions">{back}{next}</div>; }
function Field({ label, name, value, update, type = 'text', wide = false }) { return <label className={wide ? 'wide' : ''}>{label}<Input name={name} type={type} value={value} onChange={update} /></label>; }
function Choice({ active, onClick, title, text }) { return <button type="button" className={active ? 'active' : ''} onClick={onClick}><strong>{title}</strong><span>{text}</span></button>; }
function PaymentChoice({ active, icon, title, text, onClick }) { return <button type="button" className={`payment-option ${active ? 'active' : ''}`} onClick={onClick}><i>{icon}</i><span><strong>{title}</strong><small>{text}</small></span><b></b></button>; }
function Review({ label, value }) { return <div className="review-row"><span>{label}</span><strong>{value}</strong></div>; }
