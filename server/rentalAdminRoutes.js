import { Router } from 'express';
import { requireAuth, requireRole } from './auth.js';
import { query, withTransaction } from './db.js';
import { loadRentalDetail } from './rentalDetails.js';
import {
  RENTAL_STATUSES,
  cancelRentalTx,
  confirmRentalTx,
  expireStaleRentals,
  handoverTx,
  httpError,
  lockRental,
  notify,
  receiveReturnTx
} from './rentalService.js';
import { isIsoDate, todayVN } from './time.js';

const router = Router();
const adminOnly = [requireAuth, requireRole('ADMIN')];
const clean = value => String(value ?? '').trim();

router.get('/admin/rentals', ...adminOnly, async (req, res) => {
  await expireStaleRentals();
  const page = Math.max(1, Number.parseInt(req.query.page) || 1),
    limit = 10,
    offset = (page - 1) * limit;
  const status = RENTAL_STATUSES.includes(clean(req.query.status)) ? clean(req.query.status) : '';
  const from = isIsoDate(req.query.from) ? req.query.from : null,
    to = isIsoDate(req.query.to) ? req.query.to : null;
  const params = [`%${clean(req.query.q)}%`, status, from, to, req.query.overdue === 'true', todayVN(), limit, offset];
  const where = `WHERE ($1='%%' OR r.rental_code ILIKE $1 OR r.full_name ILIKE $1 OR r.phone ILIKE $1
      OR EXISTS (SELECT 1 FROM rental_items x JOIN products xp ON xp.id=x.product_id WHERE x.rental_id=r.id AND xp.name ILIKE $1))
    AND ($2='' OR r.status=$2) AND ($3::DATE IS NULL OR r.start_date >= $3::DATE) AND ($4::DATE IS NULL OR r.end_date <= $4::DATE)
    AND (NOT $5 OR (r.status IN ('RENTING','RETURNING') AND r.end_date < $6::DATE))`;
  const [items, count] = await Promise.all([
    query(
      `SELECT r.id, r.rental_code AS code, r.full_name AS "customerName", r.phone, r.start_date AS "startDate", r.end_date AS "endDate",
        r.total_amount::FLOAT AS total, r.status, r.delivery_method AS "deliveryMethod", r.created_at AS "createdAt",
        (SELECT STRING_AGG(p.name, ', ' ORDER BY ri.id) FROM rental_items ri JOIN products p ON p.id=ri.product_id WHERE ri.rental_id=r.id) AS "productName",
        pay.status AS "paymentStatus", pay.payment_method AS "paymentMethod", staff.full_name AS "staffName",
        (r.status IN ('RENTING','RETURNING') AND r.end_date < $6::DATE) AS "isOverdue"
      FROM rentals r LEFT JOIN payments pay ON pay.rental_id=r.id LEFT JOIN users staff ON staff.id=r.assigned_delivery_staff_id
      ${where} ORDER BY r.created_at DESC LIMIT $7 OFFSET $8`,
      params
    ),
    query(`SELECT COUNT(*)::INT AS total FROM rentals r ${where}`, params.slice(0, 6))
  ]);
  const total = count.rows[0].total;
  res.json({ rentals: items.rows, page, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/admin/rentals/:id', ...adminOnly, async (req, res) => {
  const rental = await loadRentalDetail(req.params.id);
  if (!rental) return res.status(404).json({ message: 'Không tìm thấy đơn thuê.' });
  res.json({ rental });
});

router.get('/admin/delivery-staff', ...adminOnly, async (_req, res) => {
  const result = await query(`SELECT u.id, u.full_name AS "fullName", u.email, u.phone,
      (SELECT COUNT(*)::INT FROM rentals r WHERE r.assigned_delivery_staff_id=u.id AND r.status IN ('CONFIRMED','DELIVERING','RETURNING')) AS "openTasks"
    FROM users u WHERE u.role='DELIVERY_STAFF' ORDER BY u.full_name`);
  res.json({ staff: result.rows });
});

router.patch('/admin/rentals/:id/assignment', ...adminOnly, async (req, res) => {
  const staffId = clean(req.body.staffId) || null;
  if (staffId) {
    const staff = await query("SELECT id FROM users WHERE id=$1 AND role='DELIVERY_STAFF'", [staffId]);
    if (!staff.rowCount) return res.status(422).json({ message: 'Nhân viên giao nhận không hợp lệ.' });
  }
  const result = await query(
    `UPDATE rentals SET assigned_delivery_staff_id=$1
    WHERE id=$2 AND delivery_method='delivery' AND status IN ('PENDING','CONFIRMED','DELIVERING','RENTING','RETURNING')
    RETURNING assigned_delivery_staff_id`,
    [staffId, req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Không tìm thấy đơn giao tận nơi đang hoạt động.' });
  res.json({
    message: staffId ? 'Đã phân công nhân viên giao nhận.' : 'Đã bỏ phân công giao nhận.',
    assignedDeliveryStaffId: result.rows[0].assigned_delivery_staff_id
  });
});

// Quản trị viên chỉ duyệt/hủy đơn. Các bước giao nhận đi qua endpoint riêng có ảnh và checklist.
router.patch('/admin/rentals/:id/status', ...adminOnly, async (req, res) => {
  const next = clean(req.body.status).toUpperCase(),
    note = clean(req.body.note);
  if (!['CONFIRMED', 'CANCELLED'].includes(next)) {
    return res.status(409).json({
      message: 'Các bước giao, bàn giao và thu hồi phải thực hiện qua quy trình giao nhận có ảnh bằng chứng.'
    });
  }
  await withTransaction(async client => {
    const rental = await lockRental(client, req.params.id);
    if (next === 'CONFIRMED') return confirmRentalTx(client, rental, req.user.id, note);
    if (!['PENDING', 'CONFIRMED'].includes(rental.status))
      throw httpError(409, 'Chỉ có thể hủy đơn trước khi giao thiết bị.');
    if (!note) throw httpError(422, 'Vui lòng nhập lý do từ chối hoặc hủy đơn.');
    return cancelRentalTx(client, rental, req.user.id, `Cửa hàng hủy đơn: ${note}`);
  });
  res.json({ message: 'Đã cập nhật trạng thái đơn thuê.', status: next });
});

async function storeOnly(client, id) {
  const rental = await lockRental(client, id);
  if (rental.delivery_method !== 'store')
    throw httpError(409, 'Đơn giao tận nơi do nhân viên giao nhận được phân công thực hiện.');
  return rental;
}

router.post('/admin/rentals/:id/handover', ...adminOnly, async (req, res) => {
  await withTransaction(async client =>
    handoverTx(client, await storeOnly(client, req.params.id), req.user.id, req.body)
  );
  res.json({ message: 'Đã bàn giao thiết bị tại cửa hàng.', status: 'RENTING' });
});

router.post('/admin/rentals/:id/return', ...adminOnly, async (req, res) => {
  const result = await withTransaction(async client =>
    receiveReturnTx(client, await storeOnly(client, req.params.id), req.user.id, req.body)
  );
  res.json({
    message:
      result.status === 'COMPLETED'
        ? 'Đã nhận lại thiết bị và quyết toán đơn.'
        : 'Đã nhận lại thiết bị, đơn chuyển sang kiểm tra sự cố.',
    ...result
  });
});

router.post('/admin/rentals/:id/remind', ...adminOnly, async (req, res) => {
  await withTransaction(async client => {
    const rental = await lockRental(client, req.params.id);
    await notify(
      client,
      rental.id,
      'REMINDER',
      `Nhắc nhở đơn ${rental.rental_code}`,
      clean(req.body.message) || 'Cửa hàng nhắc bạn kiểm tra lịch trả thiết bị.'
    );
  });
  res.json({ message: 'Đã gửi nhắc nhở cho khách hàng.' });
});

export default router;
