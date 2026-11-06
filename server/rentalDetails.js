// Tải chi tiết đầy đủ của một đơn thuê cho giao diện quản trị và trang tài khoản khách hàng.
import { query } from './db.js';
import { canCustomerCancel, canRequestExtension, requiresIdentity } from './rules.js';
import { isOverdue, summarizeRental } from './rentalService.js';
import { todayVN } from './time.js';

export function adminActions(row) {
  const actions = [];
  if (row.status === 'PENDING') actions.push('CONFIRMED', 'CANCELLED');
  if (row.status === 'CONFIRMED') {
    if (row.delivery_method === 'store') actions.push('HANDOVER');
    actions.push('CANCELLED');
  }
  if (row.status === 'RENTING' && row.delivery_method === 'store') actions.push('RETURN');
  return actions;
}

export function customerFlags(row, today = todayVN()) {
  return {
    canPay:
      ['PENDING', 'CONFIRMED'].includes(row.status) &&
      row.payment_method === 'online' &&
      row.payment_status === 'PENDING',
    canCancel: canCustomerCancel(row.status, row.start_date, today),
    canExtend: ['CONFIRMED', 'DELIVERING', 'RENTING'].includes(row.status) && canRequestExtension(row.end_date, today),
    isOverdue: isOverdue(row.status, row.end_date, today)
  };
}

export async function loadRentalDetail(rentalId, { userId = null } = {}) {
  const found = await query(
    `SELECT r.*, staff.full_name AS staff_name, staff.phone AS staff_phone, pay.payment_method, pay.status AS payment_status,
            pay.amount AS payment_amount, pay.paid_at, pay.refunded_at
     FROM rentals r LEFT JOIN users staff ON staff.id=r.assigned_delivery_staff_id LEFT JOIN payments pay ON pay.rental_id=r.id
     WHERE r.id=$1 AND ($2::UUID IS NULL OR r.user_id=$2)`,
    [rentalId, userId]
  );
  if (!found.rowCount) return null;
  const row = found.rows[0];
  const [items, history, logs, images, invoices, charges, incidents, extensions, identity] = await Promise.all([
    query(
      `SELECT ri.id, p.name AS "productName", p.slug, e.equipment_code AS "equipmentCode", e.status AS "equipmentStatus",
             ri.price_per_day::INT AS "pricePerDay", p.included_items AS included,
             (SELECT pi.image_url FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.position LIMIT 1) AS image
           FROM rental_items ri JOIN products p ON p.id=ri.product_id LEFT JOIN equipment_items e ON e.id=ri.equipment_item_id
           WHERE ri.rental_id=$1 ORDER BY ri.id`,
      [rentalId]
    ),
    query(
      `SELECT h.id, h.from_status AS "fromStatus", h.to_status AS "toStatus", h.note, h.changed_at AS "changedAt", u.full_name AS "changedBy"
           FROM rental_status_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.rental_id=$1 ORDER BY h.changed_at DESC, h.id DESC`,
      [rentalId]
    ),
    query(
      `SELECT l.id, l.action, l.inspection_result AS "inspectionResult", l.note, l.checklist, l.created_at AS "createdAt",
             u.full_name AS "createdBy", u.role AS "createdByRole"
           FROM delivery_logs l LEFT JOIN users u ON u.id=l.created_by WHERE l.rental_id=$1 ORDER BY l.created_at DESC, l.id DESC`,
      [rentalId]
    ),
    query(
      `SELECT i.id, i.delivery_log_id AS "logId" FROM evidence_images i JOIN delivery_logs l ON l.id=i.delivery_log_id
           WHERE l.rental_id=$1 ORDER BY i.position`,
      [rentalId]
    ),
    query(
      `SELECT invoice_code AS code, invoice_type AS type, total_amount::INT AS amount, description, issued_at AS "issuedAt"
           FROM invoices WHERE rental_id=$1 ORDER BY issued_at`,
      [rentalId]
    ),
    query(
      `SELECT id, charge_type AS "chargeType", description, amount::INT AS amount, payment_status AS "paymentStatus", paid_at AS "paidAt", created_at AS "createdAt"
           FROM extra_charges WHERE rental_id=$1 ORDER BY created_at`,
      [rentalId]
    ),
    query(
      `SELECT i.id, i.incident_type AS "incidentType", i.description, i.status, i.resolution, i.fee_amount::INT AS "feeAmount",
             i.missing_items AS "missingItems", i.delivery_log_id AS "logId", e.equipment_code AS "equipmentCode", i.created_at AS "createdAt"
           FROM rental_incidents i LEFT JOIN equipment_items e ON e.id=i.equipment_item_id WHERE i.rental_id=$1 ORDER BY i.created_at`,
      [rentalId]
    ),
    query(
      `SELECT id, old_end_date AS "oldEndDate", requested_end_date AS "requestedEndDate", reason, status, extra_amount::INT AS "extraAmount", created_at AS "createdAt"
           FROM rental_extensions WHERE rental_id=$1 ORDER BY created_at DESC`,
      [rentalId]
    ),
    query('SELECT status FROM identity_verifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [row.user_id])
  ]);
  const imagesByLog = new Map();
  for (const image of images.rows) {
    if (!imagesByLog.has(image.logId)) imagesByLog.set(image.logId, []);
    imagesByLog.get(image.logId).push(`/api/evidence/${image.id}`);
  }
  return {
    ...summarizeRental(row),
    userId: row.user_id,
    assignedDeliveryStaffId: row.assigned_delivery_staff_id,
    assignedStaffName: row.staff_name,
    assignedStaffPhone: row.staff_phone,
    cancelReason: row.cancel_reason,
    returnedOn: row.returned_on,
    payment: {
      method: row.payment_method,
      status: row.payment_status,
      amount: Number(row.payment_amount || 0),
      paidAt: row.paid_at,
      refundedAt: row.refunded_at
    },
    deposit: {
      amount: Number(row.deposit_amount),
      status: row.deposit_status,
      collectedAt: row.deposit_collected_at,
      deducted: Number(row.deposit_deducted_amount),
      refund: Number(row.deposit_refund_amount),
      settledAt: row.settled_at
    },
    items: items.rows,
    history: history.rows,
    logs: logs.rows.map(log => ({ ...log, images: imagesByLog.get(log.id) || [] })),
    invoices: invoices.rows,
    charges: charges.rows,
    incidents: incidents.rows,
    extensions: extensions.rows,
    identity: { required: requiresIdentity(row.deposit_amount), status: identity.rows[0]?.status || 'NONE' },
    allowedActions: adminActions(row),
    ...customerFlags(row)
  };
}
