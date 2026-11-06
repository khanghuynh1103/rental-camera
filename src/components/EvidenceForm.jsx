import { Input } from 'antd';
import { useState } from 'react';
import UiButton from './UiButton';
import { compressImage } from '../imageTools';
import { conditionLabels, money } from '../labels';

const MAX_IMAGES = 6;

/** Khởi tạo checklist: mặc định mọi phụ kiện có mặt và thiết bị bình thường. */
const initialChecklist = items => Object.fromEntries(items.map(item => [item.id, { missing: [], condition: 'GOOD' }]));

/**
 * Form bằng chứng dùng chung cho bàn giao (mode="handover") và thu hồi (mode="return"):
 * chụp nhiều ảnh (tự nén), checklist phụ kiện từng thiết bị, tình trạng khi thu hồi và ghi chú.
 */
export default function EvidenceForm({ mode, items, collectAmount = 0, submitLabel, onSubmit }) {
  const [images, setImages] = useState([]), [checklist, setChecklist] = useState(() => initialChecklist(items));
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [processing, setProcessing] = useState(false), [error, setError] = useState('');
  const onError = setError;
  const returning = mode === 'return';
  const hasIssue = Object.values(checklist).some(entry => entry.missing.length || entry.condition !== 'GOOD');

  const addImages = async event => {
    const files = [...(event.target.files || [])].slice(0, MAX_IMAGES - images.length);
    event.target.value = '';
    if (!files.length) return;
    setProcessing(true);
    try {
      const compressed = [];
      for (const file of files) compressed.push(await compressImage(file));
      setImages(current => [...current, ...compressed].slice(0, MAX_IMAGES));
    } catch (error) { onError(error.message); } finally { setProcessing(false); }
  };

  const toggleItem = (itemId, name) => setChecklist(current => {
    const entry = current[itemId];
    const missing = entry.missing.includes(name) ? entry.missing.filter(value => value !== name) : [...entry.missing, name];
    return { ...current, [itemId]: { ...entry, missing } };
  });
  const setCondition = (itemId, condition) => setChecklist(current => ({ ...current, [itemId]: { ...current[itemId], condition } }));

  const submit = async () => {
    if (!images.length) { onError('Vui lòng chụp ít nhất một ảnh bằng chứng.'); return; }
    if (!returning && hasIssue) { onError('Bộ thiết bị phải đủ phụ kiện trước khi bàn giao.'); return; }
    if (returning && hasIssue && !note.trim()) { onError('Vui lòng mô tả tình trạng hư hỏng hoặc phụ kiện bị thiếu.'); return; }
    setBusy(true); setError('');
    try {
      await onSubmit({ images, note, items: items.map(item => ({ rentalItemId: item.id, ...checklist[item.id] })) });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return <section className="evidence-form">
    {collectAmount > 0 && <p className="collect-note">Cần thu của khách khi bàn giao: <b>{money(collectAmount)}</b> (tiền thuê chưa thanh toán và tiền cọc).</p>}
    <h3>{returning ? 'Kiểm tra từng thiết bị khi thu hồi' : 'Kiểm tra bộ thiết bị trước khi bàn giao'}</h3>
    {items.map(item => <article className="checklist-item" key={item.id}>
      <header><b>{item.productName}</b><small>{item.equipmentCode || 'Chưa gán mã'}</small></header>
      <div className="checklist-options">
        {(item.included || []).map(name => {
          const present = !checklist[item.id].missing.includes(name);
          return <label key={name} className={present ? 'present' : 'missing'}>
            <input type="checkbox" checked={present} onChange={() => toggleItem(item.id, name)} />{name}
          </label>;
        })}
      </div>
      {returning && <div className="condition-options">{Object.entries(conditionLabels).map(([value, label]) =>
        <label key={value} className={checklist[item.id].condition === value ? 'selected' : ''}>
          <input type="radio" name={`condition-${item.id}`} checked={checklist[item.id].condition === value} onChange={() => setCondition(item.id, value)} />{label}
        </label>)}</div>}
    </article>)}

    <div className="evidence-photos">
      <span>Ảnh bằng chứng * <small>({images.length}/{MAX_IMAGES} · tự động nén)</small></span>
      <div>
        {images.map((src, index) => <figure key={index}><img src={src} alt={`Ảnh bằng chứng ${index + 1}`} />
          <button type="button" aria-label="Xóa ảnh" onClick={() => setImages(images.filter((_, i) => i !== index))}>×</button></figure>)}
        {images.length < MAX_IMAGES && <label className="add-photo">{processing ? 'Đang nén…' : '+ Chụp / chọn ảnh'}
          <input type="file" accept="image/*" capture="environment" multiple onChange={addImages} disabled={processing} /></label>}
      </div>
    </div>
    <label className="delivery-note">Ghi chú {returning && hasIssue ? '*' : ''}
      <Input.TextArea value={note} onChange={event => setNote(event.target.value)}
        placeholder={returning ? 'Mô tả vết trầy, hư hỏng hoặc phụ kiện bị thiếu' : 'Ghi chú khi bàn giao (không bắt buộc)'} />
    </label>
    {returning && hasIssue && <p className="issue-note">Thiết bị có bất thường sẽ được chuyển sang trạng thái kiểm tra và tạo biên bản sự cố cho quản trị viên.</p>}
    {error && <p className="role-error">{error}</p>}
    <UiButton className="admin-primary delivery-action" disabled={busy || processing} onClick={submit}>{busy ? 'Đang gửi…' : submitLabel}</UiButton>
  </section>;
}
