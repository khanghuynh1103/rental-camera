import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RULES, canCustomerCancel, canRequestExtension, depositStatusAfterSettlement, incidentTypeFor, lateDays, lateFee,
  maxExtensionEnd, rangesConflict, rentalDays, settleDeposit, validateRentalPeriod
} from '../rules.js';
import { addDays, diffDays, isIsoDate, todayVN } from '../time.js';

describe('Ngày theo giờ Việt Nam', () => {
  it('lấy đúng ngày VN khi UTC vẫn là ngày hôm trước', () => {
    // 2026-11-05 18:30 UTC = 2026-11-06 01:30 giờ Việt Nam
    assert.equal(todayVN(new Date('2026-11-05T18:30:00Z')), '2026-11-06');
    assert.equal(todayVN(new Date('2026-11-05T16:59:00Z')), '2026-11-05');
  });
  it('kiểm tra chuỗi ngày hợp lệ', () => {
    assert.equal(isIsoDate('2026-02-28'), true);
    assert.equal(isIsoDate('2026-02-30'), false);
    assert.equal(isIsoDate('05/11/2026'), false);
    assert.equal(isIsoDate(''), false);
  });
  it('cộng ngày qua tháng và năm', () => {
    assert.equal(addDays('2026-12-30', 3), '2027-01-02');
    assert.equal(diffDays('2026-09-20', '2026-09-25'), 5);
  });
});

describe('Số ngày thuê và khoảng ngày hợp lệ', () => {
  it('tính cả ngày nhận và ngày trả', () => {
    assert.equal(rentalDays('2026-09-20', '2026-09-25'), 6);
    assert.equal(rentalDays('2026-09-20', '2026-09-20'), 1);
  });
  it('từ chối ngày quá khứ, ngày trả trước ngày nhận, đơn quá dài', () => {
    const today = '2026-09-10';
    assert.equal(validateRentalPeriod('2026-09-12', '2026-09-14', today), null);
    assert.match(validateRentalPeriod('2026-09-09', '2026-09-14', today), /quá khứ/);
    assert.match(validateRentalPeriod('2026-09-14', '2026-09-12', today), /Ngày trả/);
    assert.match(validateRentalPeriod('2026-09-12', addDays('2026-09-12', RULES.maxRentalDays), today), /tối đa/);
    assert.match(validateRentalPeriod(addDays(today, RULES.maxAdvanceDays + 1), addDays(today, RULES.maxAdvanceDays + 2), today), /đặt trước/);
  });
});

describe('Chống trùng lịch (mục 6.1 đề cương)', () => {
  const a = { start: '2026-09-20', end: '2026-09-25' };
  it('khách B không được đặt trùng khoảng ngày của khách A', () => {
    assert.equal(rangesConflict(a, { start: '2026-09-22', end: '2026-09-23' }), true);
    assert.equal(rangesConflict(a, { start: '2026-09-18', end: '2026-09-20' }), true);
  });
  it('cần một ngày đệm để kiểm tra thiết bị giữa hai đơn', () => {
    assert.equal(rangesConflict(a, { start: '2026-09-26', end: '2026-09-28' }, 1), true);
    assert.equal(rangesConflict(a, { start: '2026-09-27', end: '2026-09-28' }, 1), false);
    assert.equal(rangesConflict(a, { start: '2026-09-26', end: '2026-09-28' }, 0), false);
  });
});

describe('Quy tắc gia hạn trước 3 ngày (mục 6.4)', () => {
  it('cho phép khi còn đúng 3 ngày, chặn khi còn 2 ngày', () => {
    assert.equal(canRequestExtension('2026-09-25', '2026-09-22'), true);
    assert.equal(canRequestExtension('2026-09-25', '2026-09-23'), false);
  });
  it('ví dụ đề cương: A 20/09→25/09, B đã đặt 27/09→30/09 thì không gia hạn được tới 30/09', () => {
    const max = maxExtensionEnd('2026-09-25', '2026-09-27', 1);
    assert.equal(max, null);
    assert.ok(!max || '2026-09-30' > max);
  });
  it('giới hạn ngày trả mới trước đơn kế tiếp trừ ngày đệm', () => {
    assert.equal(maxExtensionEnd('2026-09-25', '2026-10-01', 1), '2026-09-29');
    assert.equal(maxExtensionEnd('2026-09-25', null, 1), addDays('2026-09-25', RULES.maxExtensionDays));
  });
});

describe('Trả muộn', () => {
  it('đếm số ngày trễ', () => {
    assert.equal(lateDays('2026-09-25', '2026-09-25'), 0);
    assert.equal(lateDays('2026-09-25', '2026-09-24'), 0);
    assert.equal(lateDays('2026-09-25', '2026-09-27'), 2);
  });
  it('phí trễ = 150% giá thuê mỗi ngày, làm tròn nghìn đồng', () => {
    assert.equal(lateFee(450000, 2), 1350000);
    assert.equal(lateFee(333333, 1), 500000);
  });
});

describe('Quyết toán tiền cọc', () => {
  it('hoàn toàn bộ cọc khi không có phí', () => {
    assert.deepEqual(settleDeposit(5000000, []), { totalCharges: 0, deducted: 0, refund: 5000000, shortfall: 0 });
    assert.equal(depositStatusAfterSettlement(5000000, 5000000), 'REFUNDED');
  });
  it('khấu trừ phí vào cọc và hoàn phần còn lại', () => {
    assert.deepEqual(settleDeposit(5000000, [150000, 900000]), { totalCharges: 1050000, deducted: 1050000, refund: 3950000, shortfall: 0 });
    assert.equal(depositStatusAfterSettlement(5000000, 3950000), 'PARTIALLY_REFUNDED');
  });
  it('phần phí vượt cọc trở thành khoản phải trả thêm', () => {
    assert.deepEqual(settleDeposit(1000000, [1500000]), { totalCharges: 1500000, deducted: 1000000, refund: 0, shortfall: 500000 });
    assert.equal(depositStatusAfterSettlement(1000000, 0), 'FULLY_DEDUCTED');
    assert.equal(depositStatusAfterSettlement(0, 0), 'NONE');
  });
});

describe('Hủy đơn và kết luận sự cố', () => {
  it('khách chỉ tự hủy khi chờ duyệt hoặc chưa tới ngày nhận', () => {
    assert.equal(canCustomerCancel('PENDING', '2026-09-20', '2026-09-20'), true);
    assert.equal(canCustomerCancel('CONFIRMED', '2026-09-20', '2026-09-19'), true);
    assert.equal(canCustomerCancel('CONFIRMED', '2026-09-20', '2026-09-20'), false);
    assert.equal(canCustomerCancel('RENTING', '2026-09-20', '2026-09-10'), false);
  });
  it('ưu tiên mức nghiêm trọng hư hỏng > trầy xước > thiếu phụ kiện', () => {
    assert.equal(incidentTypeFor('GOOD', []), null);
    assert.equal(incidentTypeFor('GOOD', ['Pin']), 'MISSING_ACCESSORIES');
    assert.equal(incidentTypeFor('SCRATCHED', ['Pin']), 'SCRATCHED');
    assert.equal(incidentTypeFor('DAMAGED', []), 'DAMAGED');
  });
});
