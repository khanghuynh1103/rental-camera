// Quy tắc nghiệp vụ dạng hàm thuần, không truy cập database, để kiểm thử đơn vị (server/tests).
import { addDays, diffDays, isIsoDate } from './time.js';

export const RULES = Object.freeze({
  /** Số ngày đệm sau mỗi đơn để kiểm tra, vệ sinh và vận chuyển thiết bị. */
  bufferDays: 1,
  /** Phải gửi yêu cầu gia hạn khi còn ít nhất số ngày này trước hạn trả. */
  extensionNoticeDays: 3,
  maxRentalDays: 30,
  maxExtensionDays: 30,
  maxAdvanceDays: 180,
  maxItemsPerRental: 5,
  /** Phí trả muộn = giá thuê/ngày × số ngày trễ × hệ số này. */
  lateFeeRate: 1.5,
  /** Đơn chờ duyệt được giữ lịch tối đa bao nhiêu giờ. */
  pendingHoldHours: 24,
  /** Đơn chọn thanh toán online phải thanh toán trong bao nhiêu phút. */
  onlinePaymentHoldMinutes: 30,
  /** Đơn có tổng tiền cọc từ mức này trở lên cần khách đã xác minh CCCD trước khi duyệt. */
  identityDepositThreshold: 5000000
});

export const IDENTITY_CONSENT_VERSION = '2026-11';
/** Sự kiện đủ quan trọng để gửi SMS; mọi thông báo khác chỉ gửi email và hiển thị trong ứng dụng. */
export const SMS_KINDS = [
  'CONFIRMED',
  'DELIVERING',
  'RETURNING',
  'DUE_SOON',
  'OVERDUE',
  'CANCELLED',
  'EXPIRED',
  'REMINDER'
];
export const MAX_DELIVERY_ATTEMPTS = 5;

/** Bộ phụ kiện mặc định theo danh mục, dùng làm checklist khi bàn giao và thu hồi. */
export const DEFAULT_INCLUDED_ITEMS = {
  camera: ['Thân máy', 'Pin', 'Bộ sạc', 'Dây đeo', 'Túi bảo vệ'],
  lens: ['Ống kính', 'Nắp trước', 'Nắp sau', 'Hood che sáng', 'Túi bảo vệ'],
  video: ['Thiết bị chính', 'Pin', 'Bộ sạc', 'Phụ kiện lắp đặt', 'Túi bảo vệ'],
  audio: ['Thiết bị chính', 'Cáp kết nối', 'Pin hoặc bộ sạc', 'Túi bảo vệ'],
  light: ['Thân đèn', 'Nguồn và dây điện', 'Chóa tiêu chuẩn', 'Túi bảo vệ'],
  flash: ['Đèn flash', 'Pin hoặc bộ sạc', 'Chân đế', 'Túi bảo vệ'],
  accessory: ['Thiết bị chính', 'Đầu nối', 'Phụ kiện cố định', 'Túi vận chuyển']
};

/** Trạng thái đơn còn giữ lịch thiết bị. */
export const BLOCKING_RENTAL_STATUSES = ['PENDING', 'CONFIRMED', 'DELIVERING', 'RENTING', 'RETURNING'];
/** Trạng thái thiết bị không được nhận đơn mới. */
export const UNBOOKABLE_EQUIPMENT_STATUSES = ['INSPECTION', 'DAMAGED', 'MAINTENANCE', 'RETIRED'];

export function rentalDays(startDate, endDate) {
  return diffDays(startDate, endDate) + 1;
}

/**
 * Hai đơn trên cùng một thiết bị xung đột khi khoảng [start, end + đệm] của chúng giao nhau.
 * Đây cũng là điều kiện mà ràng buộc EXCLUDE trong PostgreSQL bảo đảm.
 */
export function rangesConflict(a, b, bufferDays = RULES.bufferDays) {
  return a.start <= addDays(b.end, bufferDays) && b.start <= addDays(a.end, bufferDays);
}

export function validateRentalPeriod(startDate, endDate, today, rules = RULES) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return 'Ngày thuê không hợp lệ.';
  if (startDate < today) return 'Ngày nhận không được nằm trong quá khứ.';
  if (endDate < startDate) return 'Ngày trả phải sau hoặc trùng ngày nhận.';
  if (diffDays(today, startDate) > rules.maxAdvanceDays)
    return `Chỉ nhận đặt trước tối đa ${rules.maxAdvanceDays} ngày.`;
  if (rentalDays(startDate, endDate) > rules.maxRentalDays) return `Mỗi đơn thuê tối đa ${rules.maxRentalDays} ngày.`;
  return null;
}

export function canRequestExtension(endDate, today, rules = RULES) {
  return diffDays(today, endDate) >= rules.extensionNoticeDays;
}

/**
 * Ngày trả xa nhất có thể gia hạn: trước đơn kế tiếp (trừ ngày đệm) và không quá giới hạn gia hạn.
 * Trả về null nếu không thể gia hạn thêm ngày nào.
 */
export function maxExtensionEnd(currentEnd, nextBookingStart, bufferDays = RULES.bufferDays, rules = RULES) {
  let limit = addDays(currentEnd, rules.maxExtensionDays);
  if (nextBookingStart) {
    const beforeNext = addDays(nextBookingStart, -bufferDays - 1);
    if (beforeNext < limit) limit = beforeNext;
  }
  return limit > currentEnd ? limit : null;
}

export function lateDays(endDate, returnedOn) {
  return Math.max(0, diffDays(endDate, returnedOn));
}

export function lateFee(dailyPrice, days, rules = RULES) {
  return Math.round((dailyPrice * days * rules.lateFeeRate) / 1000) * 1000;
}

/**
 * Quyết toán tiền cọc: các khoản phí chưa thanh toán được trừ vào cọc,
 * phần cọc còn lại hoàn cho khách, phần phí vượt cọc trở thành khoản phải trả thêm.
 */
export function settleDeposit(depositHeld, pendingCharges) {
  const totalCharges = pendingCharges.reduce((sum, amount) => sum + Number(amount || 0), 0);
  const deducted = Math.min(depositHeld, totalCharges);
  return { totalCharges, deducted, refund: depositHeld - deducted, shortfall: totalCharges - deducted };
}

export function depositStatusAfterSettlement(depositHeld, refund) {
  if (depositHeld === 0) return 'NONE';
  if (refund === depositHeld) return 'REFUNDED';
  return refund > 0 ? 'PARTIALLY_REFUNDED' : 'FULLY_DEDUCTED';
}

/** Khách tự hủy khi đơn chờ duyệt, hoặc đã xác nhận nhưng chưa đến ngày nhận. */
export function canCustomerCancel(status, startDate, today) {
  return status === 'PENDING' || (status === 'CONFIRMED' && today < startDate);
}

/** Kết luận sự cố từ kết quả kiểm tra một thiết bị khi thu hồi. */
export function incidentTypeFor(condition, missingItems = []) {
  if (condition === 'DAMAGED') return 'DAMAGED';
  if (condition === 'SCRATCHED') return 'SCRATCHED';
  if (missingItems.length) return 'MISSING_ACCESSORIES';
  return null;
}

export function requiresIdentity(depositAmount, rules = RULES) {
  return Number(depositAmount) >= rules.identityDepositThreshold;
}

export const validateCccd = value => /^\d{12}$/.test(String(value ?? ''));

/** Chuẩn hóa số điện thoại Việt Nam sang E.164 (+84...). Trả về null nếu không hợp lệ. */
export function normalizeVnPhone(value) {
  const digits = String(value ?? '').replace(/[\s.()-]/g, '');
  const match = digits.match(/^(?:\+?84|0)([35789]\d{8})$/);
  return match ? `+84${match[1]}` : null;
}

/** Thử lại giãn dần: 2, 4, 8, 16 phút, tối đa 60 phút. */
export function retryDelayMinutes(attempts) {
  return Math.min(60, 2 ** Math.max(1, attempts));
}

/** SMS không dấu trong 160 ký tự để tính một tin nhắn. */
export function smsText(title, body = '') {
  const plain = `Tram May Anh: ${title}. ${body}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 160 ? `${plain.slice(0, 157)}...` : plain;
}
