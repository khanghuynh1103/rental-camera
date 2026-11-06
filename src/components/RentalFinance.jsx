import { chargeTypeLabels, depositStatusLabels, formatDateTime, invoiceTypeLabels, money, paymentStatusLabels } from '../labels';

/** Tóm tắt tài chính của đơn: tiền thuê, tiền cọc và quyết toán, phí phát sinh, hóa đơn. */
export default function RentalFinance({ rental, onPayCharge }) {
  const { payment, deposit } = rental;
  return <section className="finance-panel">
    <div className="finance-grid">
      <div><small>Tiền thuê</small><b>{money(rental.rentalFee)}</b>
        <span>{payment.method === 'online' ? 'Online mô phỏng' : 'Khi bàn giao'} · {paymentStatusLabels[payment.status] || payment.status}</span></div>
      <div><small>Tiền cọc</small><b>{money(deposit.amount)}</b><span>{depositStatusLabels[deposit.status] || deposit.status}</span></div>
      {deposit.settledAt && <div className="settlement"><small>Quyết toán cọc</small><b>Hoàn {money(deposit.refund)}</b>
        <span>Khấu trừ {money(deposit.deducted)} · {formatDateTime(deposit.settledAt)}</span></div>}
    </div>
    {rental.charges.length > 0 && <div className="finance-list"><h4>Phí phát sinh</h4>{rental.charges.map(charge => <p key={charge.id}>
      <span><b>{chargeTypeLabels[charge.chargeType] || charge.chargeType}</b><small>{charge.description}</small></span>
      <span className="finance-amount">{money(charge.amount)}<small>{paymentStatusLabels[charge.paymentStatus] || charge.paymentStatus}</small>
        {onPayCharge && charge.paymentStatus === 'PENDING' && <button type="button" onClick={() => onPayCharge(charge.id)}>Thanh toán</button>}</span>
    </p>)}</div>}
    {rental.invoices.length > 0 && <div className="finance-list"><h4>Hóa đơn</h4>{rental.invoices.map(invoice => <p key={invoice.code}>
      <span><b>{invoice.code}</b><small>{invoiceTypeLabels[invoice.type] || invoice.type}{invoice.description ? ` · ${invoice.description}` : ''}</small></span>
      <span className="finance-amount">{money(invoice.amount)}<small>{formatDateTime(invoice.issuedAt)}</small></span>
    </p>)}</div>}
  </section>;
}
