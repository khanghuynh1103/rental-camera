import { Input } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import UiButton from './UiButton';
import { api } from '../api';
import { compressImage } from '../imageTools';
import { formatDateTime, money } from '../labels';

const slots = [['front', 'Mặt trước CCCD'], ['back', 'Mặt sau CCCD'], ['selfie', 'Ảnh chân dung cầm CCCD']];
const statusText = { PENDING: 'Đang chờ duyệt', APPROVED: 'Đã xác minh', REJECTED: 'Chưa được chấp nhận' };

export default function IdentityPanel({ user }) {
  const [state, setState] = useState(null), [images, setImages] = useState({}), [consent, setConsent] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(() => api.identityStatus().then(setState).catch(e => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const pick = async (side, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { const data = await compressImage(file); setImages(current => ({ ...current, [side]: data })); } catch (e) { setError(e.message); }
  };
  const submit = async event => {
    event.preventDefault(); setError('');
    if (slots.some(([side]) => !images[side])) { setError('Vui lòng tải đủ 3 ảnh.'); return; }
    setBusy(true);
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const result = await api.submitIdentity({ fullName: values.fullName, idNumber: values.idNumber, consent, ...images });
      setMessage(result.message); setImages({}); setConsent(false); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const withdraw = async () => {
    setError('');
    try { setMessage((await api.withdrawIdentity()).message); await load(); } catch (e) { setError(e.message); }
  };

  if (!state) return <p>{error || 'Đang tải…'}</p>;
  const current = state.verification;
  const canSubmit = !current || current.status === 'REJECTED';
  return <>
    <div className="profile-title"><div><p className="eyebrow">Bảo đảm thiết bị</p><h2>Xác minh CCCD</h2></div></div>
    <p className="hint">Đơn có tổng tiền cọc từ {money(state.depositThreshold)} cần xác minh CCCD trước khi cửa hàng duyệt. Chỉ cần làm một lần.</p>
    {message && <p className="admin-message">{message}</p>}
    {current && <section className={`identity-status ${current.status.toLowerCase()}`}>
      <b>{statusText[current.status]}</b>
      <p>{current.fullName} · CCCD •••• {current.idLast4} · Gửi lúc {formatDateTime(current.createdAt)}</p>
      {current.reviewNote && <p>Lý do: {current.reviewNote}</p>}
      {current.status === 'PENDING' && <UiButton className="secondary" onClick={withdraw}>Rút hồ sơ và xóa ảnh</UiButton>}
    </section>}
    {canSubmit && <form className="identity-form" onSubmit={submit}>
      <p className="hint warn">Đây là bản demo. Vui lòng không tải CCCD thật lên website công khai; hãy dùng ảnh mẫu khi thử nghiệm.</p>
      <label>Họ tên đúng như trên CCCD<Input name="fullName" defaultValue={user.fullName} required /></label>
      <label>Số CCCD (12 chữ số)<Input name="idNumber" inputMode="numeric" maxLength={12} pattern="\d{12}" autoComplete="off" required /></label>
      <div className="identity-slots">{slots.map(([side, label]) => <label key={side} className="identity-slot">
        {images[side] ? <img src={images[side]} alt={label} /> : <span>+ {label}</span>}
        <input type="file" accept="image/*" onChange={event => pick(side, event)} />
        {images[side] && <small>{label}</small>}
      </label>)}</div>
      <label className="consent-row"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
        <span>Tôi đồng ý để Trạm Máy Ảnh xử lý số CCCD và ảnh trên nhằm xác minh danh tính khi thuê thiết bị. Ảnh được mã hóa, chỉ quản trị viên xem được và bị xóa ngay sau khi duyệt; hệ thống chỉ giữ 4 số cuối và kết quả xác minh.</span></label>
      {error && <p className="role-error">{error}</p>}
      <UiButton className="admin-primary" disabled={busy || !consent}>{busy ? 'Đang gửi…' : 'Gửi hồ sơ xác minh'}</UiButton>
    </form>}
    {!canSubmit && error && <p className="role-error">{error}</p>}
  </>;
}
