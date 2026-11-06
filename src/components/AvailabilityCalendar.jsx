import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { addDays, formatDate } from '../labels';

const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * Lịch trống theo ngày của một sản phẩm. Bấm ngày đầu để chọn ngày nhận, ngày thứ hai để chọn ngày trả.
 * Số liệu chỉ để tham khảo; máy chủ kiểm tra lại khi khách đặt thuê.
 */
export default function AvailabilityCalendar({ productId, startDate, endDate, onChange }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [monthOffset, setMonthOffset] = useState(0);
  useEffect(() => {
    let live = true;
    api.productCalendar(productId, { days: 120 }).then(result => live && setData(result)).catch(e => live && setError(e.message));
    return () => { live = false; };
  }, [productId]);

  const byDate = useMemo(() => new Map((data?.days || []).map(day => [day.date, day.available])), [data]);
  const firstDay = data?.days[0]?.date;
  const month = useMemo(() => {
    if (!firstDay) return null;
    const [year, monthIndex] = firstDay.split('-').map(Number);
    const start = new Date(Date.UTC(year, monthIndex - 1 + monthOffset, 1));
    const iso = start.toISOString().slice(0, 10);
    const lead = (start.getUTCDay() + 6) % 7;
    const length = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    return { iso, lead, length, label: `Tháng ${start.getUTCMonth() + 1}/${start.getUTCFullYear()}` };
  }, [firstDay, monthOffset]);

  if (error) return <p className="calendar-error">{error}</p>;
  if (!data || !month) return <div className="availability-calendar loading">Đang tải lịch trống…</div>;

  const pick = date => {
    if (!startDate || endDate || date < startDate) onChange({ startDate: date, endDate: '' });
    else onChange({ startDate, endDate: date });
  };
  const cells = [...Array(month.lead).fill(null), ...Array.from({ length: month.length }, (_, index) => addDays(month.iso, index))];
  const lastMonthOffset = 3;

  return <div className="availability-calendar">
    <header>
      <button type="button" disabled={monthOffset === 0} onClick={() => setMonthOffset(monthOffset - 1)} aria-label="Tháng trước">‹</button>
      <b>{month.label}</b>
      <button type="button" disabled={monthOffset >= lastMonthOffset} onClick={() => setMonthOffset(monthOffset + 1)} aria-label="Tháng sau">›</button>
    </header>
    <div className="calendar-grid">
      {weekdays.map(day => <span key={day} className="weekday">{day}</span>)}
      {cells.map((date, index) => {
        if (!date) return <span key={`blank-${index}`} />;
        const available = byDate.get(date);
        const known = available !== undefined;
        const inRange = startDate && date >= startDate && date <= (endDate || startDate);
        const level = !known ? 'past' : available === 0 ? 'full' : available === 1 && data.total > 1 ? 'low' : 'free';
        return <button type="button" key={date} disabled={!known || available === 0} onClick={() => pick(date)}
          className={`day ${level} ${inRange ? 'selected' : ''}`} title={known ? `${formatDate(date)}: còn ${available} thiết bị` : ''}>
          {Number(date.slice(8))}
        </button>;
      })}
    </div>
    <footer>
      <span><i className="free" />Còn trống</span><span><i className="low" />Sắp hết</span><span><i className="full" />Đã kín</span>
    </footer>
    <p className="calendar-hint">Mỗi đơn cần {data.bufferDays} ngày đệm để kiểm tra thiết bị trước đơn kế tiếp. Tối đa {data.maxRentalDays} ngày/đơn.</p>
  </div>;
}
