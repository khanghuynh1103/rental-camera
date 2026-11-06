// Nhãn hiển thị và định dạng dùng chung cho các màn hình khách hàng, quản trị và giao nhận.
export const rentalStatusLabels = {
  PENDING: 'Chờ duyệt',
  CONFIRMED: 'Đã xác nhận',
  DELIVERING: 'Đang giao',
  RENTING: 'Đang thuê',
  RETURNING: 'Đang thu hồi',
  INSPECTING: 'Đang kiểm tra',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy'
};

export const equipmentStatusLabels = {
  AVAILABLE: 'Sẵn sàng',
  RESERVED: 'Đã đặt',
  RENTED: 'Đang cho thuê',
  RETURNING: 'Đang thu hồi',
  INSPECTION: 'Đang kiểm tra',
  DAMAGED: 'Hư hỏng',
  MAINTENANCE: 'Bảo trì',
  RETIRED: 'Ngừng sử dụng'
};

export const paymentStatusLabels = {
  PENDING: 'Chờ thanh toán',
  PAID_SIMULATED: 'Đã thanh toán',
  REFUNDED_SIMULATED: 'Đã hoàn tiền',
  VOID: 'Đã hủy',
  SETTLED_BY_DEPOSIT: 'Đã trừ vào cọc'
};

export const depositStatusLabels = {
  NOT_COLLECTED: 'Chưa thu',
  HELD: 'Đang giữ',
  REFUNDED: 'Đã hoàn đủ',
  PARTIALLY_REFUNDED: 'Đã hoàn một phần',
  FULLY_DEDUCTED: 'Đã khấu trừ hết',
  NONE: 'Không có'
};

export const chargeTypeLabels = {
  EXTENSION: 'Phí gia hạn',
  INCIDENT: 'Phí sự cố thiết bị',
  LATE_RETURN: 'Phí trả muộn',
  DEPOSIT_SHORTFALL: 'Phí vượt tiền cọc'
};

export const invoiceTypeLabels = {
  RENTAL: 'Tiền thuê',
  EXTRA_CHARGE: 'Phí phát sinh',
  SETTLEMENT: 'Khấu trừ quyết toán'
};

export const incidentLabels = {
  SCRATCHED: 'Trầy xước',
  DAMAGED: 'Hư hỏng',
  MISSING_ACCESSORIES: 'Thiếu phụ kiện',
  GOOD: 'Bình thường'
};

export const conditionLabels = { GOOD: 'Bình thường', SCRATCHED: 'Trầy xước', DAMAGED: 'Hư hỏng' };

export const logActionLabels = {
  DELIVERING: 'Nhận thiết bị, bắt đầu giao',
  RENTING: 'Bàn giao cho khách',
  RETURNING: 'Bắt đầu thu hồi',
  RETURNED: 'Nhận lại và kiểm tra',
  COMPLETED: 'Thu hồi (dữ liệu cũ)'
};

export const statusClass = status => `status rental-${String(status || '').toLowerCase()}`;

export const money = value => `${Number(value || 0).toLocaleString('vi-VN')}đ`;

/** Hiển thị ngày từ chuỗi YYYY-MM-DD mà không bị lệch múi giờ. */
export function formatDate(value) {
  if (!value) return '—';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.split('-').reverse().join('/');
  return new Date(text).toLocaleDateString('vi-VN');
}

export const formatDateTime = value => (value ? new Date(value).toLocaleString('vi-VN') : '—');

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD (dùng cho thuộc tính min của ô chọn ngày). */
export const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
