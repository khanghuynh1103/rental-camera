import { Router } from 'express';
import { requireAuth, requireRole } from './auth.js';
import { query } from './db.js';
import { expireStaleRentals, generateReminders } from './rentalService.js';
import { addDays, diffDays, isIsoDate, todayVN } from './time.js';

const router = Router();
const adminOnly = [requireAuth, requireRole('ADMIN')];
const VN = `'Asia/Ho_Chi_Minh'`;

const taskColumns = `r.id, r.rental_code AS code, r.full_name AS "customerName", r.phone, r.start_date AS "startDate", r.end_date AS "endDate",
  r.status, r.delivery_method AS "deliveryMethod", r.delivery_time AS "deliveryTime", r.return_time AS "returnTime", staff.full_name AS "staffName",
  (SELECT STRING_AGG(p.name, ', ' ORDER BY ri.id) FROM rental_items ri JOIN products p ON p.id=ri.product_id WHERE ri.rental_id=r.id) AS "productName"`;
const taskFrom = 'FROM rentals r LEFT JOIN users staff ON staff.id=r.assigned_delivery_staff_id';

async function operations(today) {
  const list = (where, order, params = [today]) =>
    query(`SELECT ${taskColumns} ${taskFrom} WHERE ${where} ORDER BY ${order} LIMIT 20`, params).then(
      result => result.rows
    );
  const [handovers, returns, dueSoon, overdue, pending, counts] = await Promise.all([
    // Cần giao / khách đến nhận: đơn đã xác nhận tới ngày nhận (kể cả trễ) và đơn đang trên đường giao.
    list(
      `(r.status='CONFIRMED' AND r.start_date <= $1::DATE) OR r.status='DELIVERING'`,
      'r.start_date, r.delivery_time'
    ),
    list(`r.status IN ('RENTING','RETURNING') AND r.end_date = $1::DATE`, 'r.return_time'),
    list(`r.status IN ('RENTING','RETURNING') AND r.end_date BETWEEN $1::DATE + 1 AND $1::DATE + 3`, 'r.end_date'),
    query(
      `SELECT ${taskColumns},
        (SELECT MIN(other.start_date)::TEXT FROM rental_items mine JOIN rental_items other
           ON other.equipment_item_id=mine.equipment_item_id AND other.rental_id<>mine.rental_id AND other.active
         WHERE mine.rental_id=r.id AND other.start_date > r.end_date) AS "nextBookingStart"
      ${taskFrom} WHERE r.status IN ('RENTING','RETURNING') AND r.end_date < $1::DATE ORDER BY r.end_date LIMIT 20`,
      [today]
    ).then(result => result.rows),
    list(`r.status='PENDING'`, 'r.created_at', []),
    query(`SELECT
        (SELECT COUNT(*)::INT FROM rental_extensions WHERE status='PENDING') AS "pendingExtensions",
        (SELECT COUNT(*)::INT FROM rental_incidents WHERE status='PENDING_REVIEW') AS "pendingIncidents",
        (SELECT COUNT(*)::INT FROM identity_verifications WHERE status='PENDING') AS "pendingIdentity",
        (SELECT COUNT(*)::INT FROM notification_deliveries WHERE status='FAILED') AS "failedDeliveries",
        (SELECT COUNT(*)::INT FROM rentals WHERE status='INSPECTING') AS inspecting,
        (SELECT COUNT(*)::INT FROM rentals WHERE status IN ('RENTING','RETURNING')) AS "activeRentals",
        (SELECT COUNT(*)::INT FROM equipment_items WHERE status IN ('RENTED','RETURNING')) AS "equipmentOut",
        (SELECT COUNT(*)::INT FROM rentals WHERE delivery_method='delivery' AND status IN ('PENDING','CONFIRMED') AND assigned_delivery_staff_id IS NULL) AS unassigned`).then(
      result => result.rows[0]
    )
  ]);
  return {
    today,
    handovers,
    returns,
    dueSoon,
    pending,
    overdue: overdue.map(row => ({
      ...row,
      lateDays: diffDays(row.endDate, today),
      blocksNextBooking: Boolean(row.nextBookingStart && row.nextBookingStart <= addDays(today, 1))
    })),
    counts: {
      ...counts,
      handovers: handovers.length,
      returns: returns.length,
      dueSoon: dueSoon.length,
      overdue: overdue.length,
      pending: pending.length
    }
  };
}

router.get('/admin/dashboard', ...adminOnly, async (req, res) => {
  await expireStaleRentals();
  await generateReminders();
  const today = todayVN(),
    range = Math.min(366, Math.max(1, Number.parseInt(req.query.range) || 30));
  const from = isIsoDate(req.query.from) ? req.query.from : addDays(today, -range + 1);
  const to = isIsoDate(req.query.to) ? req.query.to : today;
  if (from > to) return res.status(422).json({ message: 'Khoảng thời gian không hợp lệ.' });
  if (diffDays(from, to) > 366) return res.status(422).json({ message: 'Dashboard chỉ hỗ trợ tối đa 366 ngày.' });

  // Doanh thu ghi nhận: tiền thuê đã thu + phí phát sinh đã thanh toán + phần cọc đã khấu trừ (không tính tiền cọc giữ hộ).
  const revenueOn = dayFilter => `(
    COALESCE((SELECT SUM(amount) FROM payments WHERE status='PAID_SIMULATED' AND ${dayFilter('paid_at')}),0) )`;
  const extraOn = dayFilter => `(
    COALESCE((SELECT SUM(amount) FROM extra_charges WHERE payment_status='PAID_SIMULATED' AND ${dayFilter('paid_at')}),0) +
    COALESCE((SELECT SUM(deposit_deducted_amount) FROM rentals WHERE settled_at IS NOT NULL AND ${dayFilter('settled_at')}),0) )`;
  const inRange = column => `(${column} AT TIME ZONE ${VN})::DATE BETWEEN $1 AND $2`;
  const onDay = column => `(${column} AT TIME ZONE ${VN})::DATE = d.day`;

  const [revenue, series, orders, inventory, products, incidents, ops] = await Promise.all([
    query(
      `SELECT ${revenueOn(inRange)}::FLOAT AS "rentalRevenue", ${extraOn(inRange)}::FLOAT AS "extraRevenue",
      (COALESCE((SELECT SUM(p.amount) FROM payments p JOIN rentals r ON r.id=p.rental_id WHERE p.status='PENDING' AND r.status<>'CANCELLED'),0)+
       COALESCE((SELECT SUM(amount) FROM extra_charges WHERE payment_status='PENDING'),0))::FLOAT AS "pendingRevenue",
      COALESCE((SELECT SUM(deposit_amount) FROM rentals WHERE deposit_status='HELD'),0)::FLOAT AS "depositsHeld",
      COALESCE((SELECT SUM(deposit_refund_amount) FROM rentals WHERE settled_at IS NOT NULL AND ${inRange('settled_at')}),0)::FLOAT AS "depositsRefunded"`,
      [from, to]
    ),
    query(
      `SELECT d.day::DATE AS date, (${revenueOn(onDay)} + ${extraOn(onDay)})::FLOAT AS amount
      FROM GENERATE_SERIES($1::DATE,$2::DATE,'1 day') d(day) ORDER BY d.day`,
      [from, to]
    ),
    query(`SELECT status, COUNT(*)::INT AS count FROM rentals WHERE ${inRange('created_at')} GROUP BY status`, [
      from,
      to
    ]),
    query(`SELECT status, COUNT(*)::INT AS count FROM equipment_items GROUP BY status`),
    query(
      `SELECT p.name, p.slug, COUNT(DISTINCT r.id)::INT AS "rentalCount", COALESCE(SUM((r.end_date-r.start_date)+1),0)::INT AS "rentalDays"
      FROM products p JOIN rental_items ri ON ri.product_id=p.id JOIN rentals r ON r.id=ri.rental_id
      WHERE ${inRange('r.created_at')} AND r.status<>'CANCELLED'
      GROUP BY p.id ORDER BY "rentalCount" DESC, "rentalDays" DESC LIMIT 5`,
      [from, to]
    ),
    query(
      `SELECT
      COUNT(*) FILTER(WHERE status='PENDING_REVIEW')::INT AS pending,
      COUNT(*) FILTER(WHERE status='RESOLVED')::INT AS resolved,
      COALESCE(SUM(fee_amount) FILTER(WHERE status='RESOLVED'),0)::FLOAT AS "totalFees",
      COUNT(*) FILTER(WHERE incident_type='SCRATCHED')::INT AS scratched,
      COUNT(*) FILTER(WHERE incident_type='DAMAGED')::INT AS damaged,
      COUNT(*) FILTER(WHERE incident_type='MISSING_ACCESSORIES')::INT AS "missingAccessories"
      FROM rental_incidents WHERE ${inRange('created_at')}`,
      [from, to]
    ),
    operations(today)
  ]);
  const orderMap = Object.fromEntries(orders.rows.map(row => [row.status, row.count]));
  const inventoryMap = Object.fromEntries(inventory.rows.map(row => [row.status, row.count]));
  const totalOrders = Object.values(orderMap).reduce((sum, value) => sum + value, 0);
  const approved = ['CONFIRMED', 'DELIVERING', 'RENTING', 'RETURNING', 'INSPECTING', 'COMPLETED'].reduce(
    (sum, status) => sum + (orderMap[status] || 0),
    0
  );
  const equipmentTotal = Object.entries(inventoryMap)
    .filter(([status]) => status !== 'RETIRED')
    .reduce((sum, [, value]) => sum + value, 0);
  const equipmentUsed = (inventoryMap.RENTED || 0) + (inventoryMap.RETURNING || 0) + (inventoryMap.RESERVED || 0);
  res.json({
    period: { from, to },
    revenue: {
      ...revenue.rows[0],
      total: Number(revenue.rows[0].rentalRevenue) + Number(revenue.rows[0].extraRevenue)
    },
    series: series.rows,
    orders: {
      total: totalOrders,
      approvalRate: totalOrders ? Math.round((approved / totalOrders) * 100) : 0,
      byStatus: orderMap
    },
    inventory: {
      total: equipmentTotal,
      utilizationRate: equipmentTotal ? Math.round((equipmentUsed / equipmentTotal) * 100) : 0,
      byStatus: inventoryMap
    },
    topProducts: products.rows,
    incidents: incidents.rows[0],
    operations: ops
  });
});

export default router;
