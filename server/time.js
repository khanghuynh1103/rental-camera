// Mọi phép tính "ngày" của nghiệp vụ thuê đều dùng giờ Việt Nam,
// không phụ thuộc múi giờ của máy chủ (Vercel chạy UTC, máy local có thể khác).
export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Chuỗi YYYY-MM-DD hợp lệ (loại cả ngày không tồn tại như 2026-02-30). */
export function isIsoDate(value) {
  const text = String(value ?? '');
  if (!ISO_DATE.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function todayVN(now = new Date()) {
  return formatter.format(now);
}

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Số ngày từ `from` đến `to` (to - from). */
export function diffDays(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** Chuẩn hóa giá trị DATE đọc từ PostgreSQL (đã cấu hình trả về chuỗi) hoặc Date. */
export function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return formatter.format(value);
  return String(value).slice(0, 10);
}
