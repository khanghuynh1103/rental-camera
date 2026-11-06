import { Router } from 'express';
import { requireAuth, requireRole } from './auth.js';
import { query, withTransaction } from './db.js';
import { loadRentalDetail } from './rentalDetails.js';
import { handoverTx, httpError, lockRental, receiveReturnTx, startDeliveryTx, startReturnTx } from './rentalService.js';
import { isIsoDate, todayVN } from './time.js';

const router = Router();
const staffOnly = [requireAuth, requireRole('DELIVERY_STAFF')];
const taskStatuses = ['CONFIRMED', 'DELIVERING', 'RENTING', 'RETURNING'];
/** Bước tiếp theo nhân viên được làm ở mỗi trạng thái. RETURNED = nhận lại và kiểm tra thiết bị. */
const nextAction = { CONFIRMED: 'DELIVERING', DELIVERING: 'RENTING', RENTING: 'RETURNING', RETURNING: 'RETURNED' };
const clean = value => String(value ?? '').trim();

router.get('/delivery/tasks', ...staffOnly, async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page) || 1),
    limit = 10,
    offset = (page - 1) * limit,
    status = clean(req.query.status);
  const date = isIsoDate(req.query.date) ? req.query.date : null;
  if (status && !taskStatuses.includes(status))
    return res.status(422).json({ message: 'Trạng thái lọc không hợp lệ.' });
  const params = [taskStatuses, status, date, req.user.id, todayVN(), limit, offset];
  const where = `WHERE r.delivery_method='delivery' AND r.assigned_delivery_staff_id=$4 AND r.status=ANY($1::VARCHAR[]) AND ($2='' OR r.status=$2)
    AND ($3::DATE IS NULL OR r.start_date=$3::DATE OR r.end_date=$3::DATE)`;
  const [items, count, summary] = await Promise.all([
    query(
      `SELECT r.id, r.rental_code AS code, r.full_name AS "customerName", r.phone, r.delivery_address AS address,
        r.delivery_time AS "deliveryTime", r.return_time AS "returnTime", r.start_date AS "startDate", r.end_date AS "endDate", r.status,
        (r.status IN ('RENTING','RETURNING') AND r.end_date < $5::DATE) AS "isOverdue",
        (SELECT STRING_AGG(p.name, ', ' ORDER BY ri.id) FROM rental_items ri JOIN products p ON p.id=ri.product_id WHERE ri.rental_id=r.id) AS "productName",
        (SELECT STRING_AGG(e.equipment_code, ', ' ORDER BY ri.id) FROM rental_items ri JOIN equipment_items e ON e.id=ri.equipment_item_id WHERE ri.rental_id=r.id) AS "equipmentCode"
      FROM rentals r ${where}
      ORDER BY CASE r.status WHEN 'RETURNING' THEN 1 WHEN 'DELIVERING' THEN 2 WHEN 'CONFIRMED' THEN 3 ELSE 4 END,
        CASE WHEN r.status IN ('CONFIRMED','DELIVERING') THEN r.start_date ELSE r.end_date END
      LIMIT $6 OFFSET $7`,
      params
    ),
    query(`SELECT COUNT(*)::INT AS total FROM rentals r ${where}`, params.slice(0, 4)),
    query(
      `SELECT
        COUNT(*) FILTER (WHERE r.status='CONFIRMED' AND r.start_date <= $2::DATE)::INT AS "deliverToday",
        COUNT(*) FILTER (WHERE r.status='RENTING' AND r.end_date <= $2::DATE)::INT AS "collectToday",
        COUNT(*) FILTER (WHERE r.status IN ('DELIVERING','RETURNING'))::INT AS "inProgress"
      FROM rentals r WHERE r.delivery_method='delivery' AND r.assigned_delivery_staff_id=$1`,
      [req.user.id, todayVN()]
    )
  ]);
  const total = count.rows[0].total;
  res.json({
    tasks: items.rows,
    summary: summary.rows[0],
    page,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit))
  });
});

async function assignedTask(client, id, staffId) {
  const rental = await lockRental(client, id);
  if (rental.delivery_method !== 'delivery' || rental.assigned_delivery_staff_id !== staffId)
    throw httpError(404, 'Không tìm thấy công việc giao nhận.');
  return rental;
}

router.get('/delivery/tasks/:id', ...staffOnly, async (req, res) => {
  const task = await loadRentalDetail(req.params.id);
  if (!task || task.deliveryMethod !== 'delivery' || task.assignedDeliveryStaffId !== req.user.id)
    return res.status(404).json({ message: 'Không tìm thấy công việc giao nhận.' });
  if (!taskStatuses.includes(task.status))
    return res.status(409).json({ message: 'Đơn này không còn trong quy trình giao nhận.' });
  const { payment, deposit } = task;
  res.json({
    task: {
      id: task.id,
      code: task.code,
      status: task.status,
      customerName: task.fullName,
      phone: task.phone,
      email: task.email,
      address: task.address,
      startDate: task.startDate,
      endDate: task.endDate,
      deliveryTime: task.deliveryTime,
      returnTime: task.returnTime,
      note: task.note,
      isOverdue: task.isOverdue,
      items: task.items,
      logs: task.logs,
      nextStatus: nextAction[task.status],
      // Nhân viên cần biết phải thu bao nhiêu tiền khi bàn giao.
      collectOnHandover:
        (payment.method === 'handover' && payment.status === 'PENDING' ? payment.amount : 0) +
        (deposit.status === 'NOT_COLLECTED' ? deposit.amount : 0)
    }
  });
});

router.patch('/delivery/tasks/:id/status', ...staffOnly, async (req, res) => {
  const requested = clean(req.body.status).toUpperCase(),
    note = clean(req.body.note);
  const result = await withTransaction(async client => {
    const rental = await assignedTask(client, req.params.id, req.user.id);
    // Tương thích tên cũ: COMPLETED = nhận lại thiết bị.
    const action = requested === 'COMPLETED' ? 'RETURNED' : requested;
    if (nextAction[rental.status] !== action)
      throw httpError(409, 'Không thể thực hiện bước này với trạng thái hiện tại.');
    if (action === 'DELIVERING') {
      await startDeliveryTx(client, rental, req.user.id, note);
      return { status: 'DELIVERING' };
    }
    if (action === 'RENTING') {
      await handoverTx(client, rental, req.user.id, { ...req.body, note });
      return { status: 'RENTING' };
    }
    if (action === 'RETURNING') {
      await startReturnTx(client, rental, req.user.id, note);
      return { status: 'RETURNING' };
    }
    return receiveReturnTx(client, rental, req.user.id, { ...req.body, note });
  });
  const message =
    result.status === 'COMPLETED'
      ? 'Đã thu hồi, thiết bị bình thường và đơn đã được quyết toán.'
      : result.status === 'INSPECTING'
        ? 'Đã thu hồi và lập biên bản sự cố cho quản trị viên.'
        : 'Đã cập nhật công việc giao nhận.';
  res.json({ message, ...result });
});

export default router;
