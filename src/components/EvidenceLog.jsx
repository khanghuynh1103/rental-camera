import { conditionLabels, formatDateTime, incidentLabels, logActionLabels } from '../labels';

/** Nhật ký giao nhận: thời gian, người thực hiện, checklist phụ kiện và ảnh bằng chứng (mở ảnh gốc ở tab mới). */
export default function EvidenceLog({ logs = [], title = 'Nhật ký giao nhận & bằng chứng' }) {
  if (!logs.length) return null;
  return <section className="history evidence-log"><h3>{title}</h3>
    {logs.map(log => <div key={log.id}><i></i><div>
      <p><b>{logActionLabels[log.action] || log.action}</b><span>{log.createdBy || 'Hệ thống'} · {formatDateTime(log.createdAt)}</span></p>
      {log.inspectionResult && <small className="log-inspection">Kết quả kiểm tra: {incidentLabels[log.inspectionResult] || log.inspectionResult}</small>}
      {log.note && <small>{log.note}</small>}
      {Array.isArray(log.checklist) && <ul className="log-checklist">{log.checklist.map(entry => <li key={entry.rentalItemId}>
        <b>{entry.productName}</b> {entry.equipmentCode && <span>· {entry.equipmentCode}</span>}
        {log.action === 'RETURNED' && <span> · {conditionLabels[entry.condition] || entry.condition}</span>}
        <span className={entry.missing?.length ? 'missing' : 'ok'}>{entry.missing?.length ? ` · Thiếu: ${entry.missing.join(', ')}` : ' · Đủ phụ kiện'}</span>
      </li>)}</ul>}
      {log.images?.length > 0 && <div className="log-images">{log.images.map(src =>
        <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="Ảnh bằng chứng" loading="lazy" /></a>)}</div>}
    </div></div>)}
  </section>;
}
