import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth, requireRole } from './auth.js';
import { query, withTransaction } from './db.js';
import { customerFlags, loadRentalDetail } from './rentalDetails.js';
import {
  cancelRentalTx,
  completeIfInspectionDoneTx,
  expireStaleRentals,
  extensionLimit,
  generateReminders,
  httpError,
  lockRental,
  notify,
  refreshEquipmentStatus,
  reassignFutureRentalsTx
} from './rentalService.js';
import { RULES, canCustomerCancel, canRequestExtension } from './rules.js';
import { addDays, diffDays, isIsoDate, todayVN } from './time.js';

const router = Router();
const customerOnly = [requireAuth, requireRole('CUSTOMER')],
  adminOnly = [requireAuth, requireRole('ADMIN')];
const clean = value => String(value ?? '').trim();
const EXTENDABLE = ['CONFIRMED', 'DELIVERING', 'RENTING'];

/* ----------------------------- Khách hàng ----------------------------- */

router.get('/account/rentals', ...customerOnly, async (req, res) => {
  await expireStaleRentals();
  await generateReminders(req.user.id);
  const [rentals, extensions, charges, unread] = await Promise.all([
    query(
      `SELECT r.id, r.rental_code AS code, r.start_date, r.end_date, r.status, r.total_amount::FLOAT AS total, r.delivery_method AS "deliveryMethod",
        r.expires_at AS "expiresAt", pay.payment_method, pay.status AS payment_status,
        (SELECT STRING_AGG(p.name, ', ' ORDER BY ri.id) FROM rental_items ri JOIN products p ON p.id=ri.product_id WHERE ri.rental_id=r.id) AS "productName"
      FROM rentals r LEFT JOIN payments pay ON pay.rental_id=r.id WHERE r.user_id=$1 ORDER BY r.created_at DESC`,
      [req.user.id]
    ),
    query(
      `SELECT x.id, x.rental_id AS "rentalId", r.rental_code AS code, x.old_end_date AS "oldEndDate", x.requested_end_date AS "requestedEndDate",
        x.reason, x.status, x.extra_amount::FLOAT AS "extraAmount", x.created_at AS "createdAt"
      FROM rental_extensions x JOIN rentals r ON r.id=x.rental_id WHERE r.user_id=$1 ORDER BY x.created_at DESC`,
      [req.user.id]
    ),
    query(
      `SELECT c.id, c.rental_id AS "rentalId", r.rental_code AS code, c.charge_type AS "chargeType", c.description, c.amount::FLOAT,
        c.payment_status AS "paymentStatus", c.created_at AS "createdAt"
      FROM extra_charges c JOIN rentals r ON r.id=c.rental_id WHERE r.user_id=$1 ORDER BY c.created_at DESC`,
      [req.user.id]
    ),
    query('SELECT COUNT(*)::INT AS count FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id])
  ]);
  const today = todayVN();
  res.json({
    rentals: rentals.rows.map(row => ({
      id: row.id,
      code: row.code,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      total: row.total,
      deliveryMethod: row.deliveryMethod,
      productName: row.productName,
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      expiresAt: row.expiresAt,
      ...customerFlags(row, today)
    })),
    extensions: extensions.rows,
    charges: charges.rows,
    unreadNotifications: unread.rows[0].count
  });
});

router.get('/account/rentals/:id', ...customerOnly, async (req, res) => {
  const rental = await loadRentalDetail(req.params.id, { userId: req.user.id });
  if (!rental) return res.status(404).json({ message: 'Không tìm thấy đơn thuê.' });
  delete rental.allowedActions;
  res.json({ rental });
});

router.post('/account/rentals/:id/cancel', ...customerOnly, async (req, res) => {
  const result = await withTransaction(async client => {
    const rental = await lockRental(client, req.params.id, { userId: req.user.id });
    if (!canCustomerCancel(rental.status, rental.start_date, todayVN()))
      throw httpError(409, 'Đơn chỉ có thể tự hủy khi đang chờ duyệt hoặc chưa đến ngày nhận máy.');
    const reason = clean(req.body.reason);
    return cancelRentalTx(client, rental, req.user.id, `Khách hàng hủy đơn${reason ? `: ${reason}` : '.'}`);
  });
  res.json({
    message: result.refunded
      ? `Đã hủy đơn và hoàn ${result.refunded.toLocaleString('vi-VN')}đ (mô phỏng).`
      : 'Đã hủy đơn thuê.',
    ...result
  });
});

router.get('/account/rentals/:id/extension-options', ...customerOnly, async (req, res) => {
  const options = await withTransaction(async client => {
    const rental = await lockRental(client, req.params.id, { userId: req.user.id });
    const today = todayVN();
    if (!EXTENDABLE.includes(rental.status)) return { canRequest: false, reason: 'Đơn thuê hiện không thể gia hạn.' };
    if (!canRequestExtension(rental.end_date, today))
      return {
        canRequest: false,
        reason: `Yêu cầu gia hạn phải được gửi trước hạn trả ít nhất ${RULES.extensionNoticeDays} ngày.`
      };
    const limit = await extensionLimit(client, rental);
    if (!limit.maxEndDate)
      return {
        canRequest: false,
        reason: 'Thiết bị đã có lịch thuê kế tiếp ngay sau đơn của bạn nên không thể gia hạn.',
        ...limit
      };
    return { canRequest: true, minEndDate: addDays(rental.end_date, 1), currentEndDate: rental.end_date, ...limit };
  });
  res.json(options);
});

router.post('/account/rentals/:id/extensions', ...customerOnly, async (req, res) => {
  const requested = clean(req.body.requestedEndDate),
    reason = clean(req.body.reason);
  if (!isIsoDate(requested)) return res.status(422).json({ message: 'Ngày gia hạn không hợp lệ.' });
  try {
    const id = await withTransaction(async client => {
      const rental = await lockRental(client, req.params.id, { userId: req.user.id });
      if (!EXTENDABLE.includes(rental.status)) throw httpError(409, 'Đơn thuê hiện không thể gia hạn.');
      if (!canRequestExtension(rental.end_date, todayVN()))
        throw httpError(409, `Yêu cầu gia hạn phải được gửi trước hạn trả ít nhất ${RULES.extensionNoticeDays} ngày.`);
      if (requested <= rental.end_date) throw httpError(422, 'Ngày trả mới phải sau ngày trả hiện tại.');
      const limit = await extensionLimit(client, rental);
      if (!limit.maxEndDate || requested > limit.maxEndDate) {
        throw httpError(
          409,
          limit.maxEndDate
            ? `Thiết bị chỉ còn trống đến ${limit.maxEndDate.split('-').reverse().join('/')}. Vui lòng chọn ngày trả sớm hơn.`
            : 'Thiết bị đã có lịch thuê kế tiếp nên không thể gia hạn.'
        );
      }
      const inserted = await client.query(
        'INSERT INTO rental_extensions(rental_id,old_end_date,requested_end_date,reason) VALUES($1,$2,$3,$4) RETURNING id',
        [rental.id, rental.end_date, requested, reason || null]
      );
      return inserted.rows[0].id;
    });
    res.status(201).json({ message: 'Đã gửi yêu cầu gia hạn.', id });
  } catch (error) {
    if (error.code === '23505')
      return res.status(409).json({ message: 'Đơn này đang có một yêu cầu gia hạn chờ duyệt.' });
    throw error;
  }
});

router.post('/account/charges/:id/payment', ...customerOnly, async (req, res) => {
  const invoice = await withTransaction(async client => {
    const paid = await client.query(
      `UPDATE extra_charges c SET payment_status='PAID_SIMULATED',paid_at=NOW() FROM rentals r
      WHERE c.id=$1 AND c.rental_id=r.id AND r.user_id=$2 AND c.payment_status='PENDING' RETURNING c.id,c.rental_id,c.amount,c.description`,
      [req.params.id, req.user.id]
    );
    if (!paid.rowCount) throw httpError(404, 'Không tìm thấy khoản phí cần thanh toán.');
    const charge = paid.rows[0];
    const created = await client.query(
      `INSERT INTO invoices(rental_id,invoice_code,total_amount,invoice_type,extra_charge_id,description)
      VALUES($1,$2,$3,'EXTRA_CHARGE',$4,$5) RETURNING invoice_code`,
      [
        charge.rental_id,
        `TMA-HD-${todayVN().slice(0, 4)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        charge.amount,
        charge.id,
        charge.description
      ]
    );
    return created.rows[0].invoice_code;
  });
  res.json({ message: `Đã thanh toán mô phỏng khoản phí phát sinh. Hóa đơn ${invoice}.`, invoiceCode: invoice });
});

router.get('/account/notifications', ...customerOnly, async (req, res) => {
  await generateReminders(req.user.id);
  const result = await query(
    `SELECT n.id, n.kind, n.title, n.body, n.read_at AS "readAt", n.created_at AS "createdAt", n.rental_id AS "rentalId"
    FROM notifications n WHERE n.user_id=$1 ORDER BY n.created_at DESC, n.id DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ notifications: result.rows, unread: result.rows.filter(row => !row.readAt).length });
});

router.post('/account/notifications/read', ...customerOnly, async (req, res) => {
  await query('UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ message: 'Đã đánh dấu đã đọc.' });
});

router.get('/account/notification-preferences', ...customerOnly, async (req, res) => {
  const result = await query('SELECT notify_email AS email, notify_sms AS sms FROM users WHERE id=$1', [req.user.id]);
  res.json(result.rows[0]);
});

router.patch('/account/notification-preferences', ...customerOnly, async (req, res) => {
  const result = await query(
    'UPDATE users SET notify_email=$2,notify_sms=$3 WHERE id=$1 RETURNING notify_email AS email, notify_sms AS sms',
    [req.user.id, req.body.email === true, req.body.sms === true]
  );
  res.json({ message: 'Đã lưu cài đặt thông báo.', ...result.rows[0] });
});

/* ----------------------------- Quản trị ----------------------------- */

router.get('/admin/notification-deliveries', ...adminOnly, async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page) || 1),
    limit = 20,
    status = clean(req.query.status);
  const where = `WHERE ($1='' OR d.status=$1)`;
  const [items, count, summary] = await Promise.all([
    query(
      `SELECT d.id, d.channel, d.recipient, d.subject, d.status, d.provider, d.attempts, d.last_error AS "lastError", d.created_at AS "createdAt", d.sent_at AS "sentAt"
      FROM notification_deliveries d ${where} ORDER BY d.id DESC LIMIT $2 OFFSET $3`,
      [status, limit, (page - 1) * limit]
    ),
    query(`SELECT COUNT(*)::INT AS total FROM notification_deliveries d ${where}`, [status]),
    query('SELECT status, COUNT(*)::INT AS count FROM notification_deliveries GROUP BY status')
  ]);
  res.json({
    deliveries: items.rows,
    page,
    totalPages: Math.max(1, Math.ceil(count.rows[0].total / limit)),
    summary: Object.fromEntries(summary.rows.map(row => [row.status, row.count])),
    providers: { email: process.env.NOTIFY_EMAIL_PROVIDER || 'log', sms: process.env.NOTIFY_SMS_PROVIDER || 'log' }
  });
});

router.post('/admin/notification-deliveries/:id/retry', ...adminOnly, async (req, res) => {
  const result = await query(
    `UPDATE notification_deliveries SET status='PENDING',attempts=0,next_attempt_at=NOW(),last_error=NULL WHERE id=$1 AND status='FAILED' RETURNING id`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Không tìm thấy bản ghi gửi lỗi.' });
  res.json({ message: 'Đã đưa vào hàng đợi gửi lại.' });
});

router.get('/admin/extensions', ...adminOnly, async (_req, res) => {
  const result =
    await query(`SELECT x.id, x.rental_id AS "rentalId", r.rental_code AS code, r.full_name AS "customerName", r.status AS "rentalStatus",
      (SELECT STRING_AGG(p.name, ', ' ORDER BY ri.id) FROM rental_items ri JOIN products p ON p.id=ri.product_id WHERE ri.rental_id=r.id) AS "productName",
      x.old_end_date AS "oldEndDate", x.requested_end_date AS "requestedEndDate", x.reason, x.status, x.extra_amount::FLOAT AS "extraAmount", x.created_at AS "createdAt"
    FROM rental_extensions x JOIN rentals r ON r.id=x.rental_id
    ORDER BY CASE WHEN x.status='PENDING' THEN 0 ELSE 1 END, x.created_at DESC`);
  res.json({ extensions: result.rows });
});

router.patch('/admin/extensions/:id', ...adminOnly, async (req, res) => {
  const decision = clean(req.body.status).toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(decision))
    return res.status(422).json({ message: 'Quyết định không hợp lệ.' });
  try {
    const extra = await withTransaction(async client => {
      const found = await client.query('SELECT * FROM rental_extensions WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!found.rowCount) throw httpError(404, 'Không tìm thấy yêu cầu gia hạn.');
      const ext = found.rows[0];
      if (ext.status !== 'PENDING') throw httpError(409, 'Yêu cầu này đã được xử lý.');
      const rental = await lockRental(client, ext.rental_id);
      let amount = 0;
      if (decision === 'APPROVED') {
        if (!EXTENDABLE.includes(rental.status))
          throw httpError(409, 'Đơn thuê không còn ở trạng thái có thể gia hạn.');
        if (rental.end_date !== ext.old_end_date)
          throw httpError(409, 'Ngày trả của đơn đã thay đổi sau khi khách gửi yêu cầu.');
        const limit = await extensionLimit(client, rental);
        if (!limit.maxEndDate || ext.requested_end_date > limit.maxEndDate)
          throw httpError(409, 'Thiết bị đã có lịch thuê khác trong thời gian muốn gia hạn.');
        const pricing = await client.query(
          'SELECT COALESCE(SUM(price_per_day),0)::INT AS daily FROM rental_items WHERE rental_id=$1',
          [rental.id]
        );
        const days = diffDays(ext.old_end_date, ext.requested_end_date);
        amount = pricing.rows[0].daily * days;
        await client.query(
          'UPDATE rentals SET end_date=$1,rental_fee=rental_fee+$2,total_amount=total_amount+$2 WHERE id=$3',
          [ext.requested_end_date, amount, rental.id]
        );
        await client.query(
          `INSERT INTO extra_charges(rental_id,extension_id,charge_type,description,amount,created_by) VALUES($1,$2,'EXTENSION',$3,$4,$5)`,
          [rental.id, ext.id, `Phí gia hạn thêm ${days} ngày`, amount, req.user.id]
        );
        await client.query(
          'INSERT INTO rental_status_history(rental_id,from_status,to_status,note,changed_by) VALUES($1,$2,$2,$3,$4)',
          [rental.id, rental.status, `Gia hạn ngày trả ${ext.old_end_date} → ${ext.requested_end_date}`, req.user.id]
        );
      }
      await client.query(
        'UPDATE rental_extensions SET status=$1,extra_amount=$2,reviewed_by=$3,reviewed_at=NOW() WHERE id=$4',
        [decision, amount, req.user.id, ext.id]
      );
      await notify(
        client,
        rental.id,
        'EXTENSION',
        decision === 'APPROVED'
          ? `Đã duyệt gia hạn đơn ${rental.rental_code}`
          : `Yêu cầu gia hạn đơn ${rental.rental_code} bị từ chối`,
        decision === 'APPROVED'
          ? `Ngày trả mới: ${ext.requested_end_date}. Phí gia hạn ${amount.toLocaleString('vi-VN')}đ.`
          : clean(req.body.note) || 'Vui lòng hoàn trả thiết bị đúng hạn.'
      );
      return amount;
    });
    res.json({
      message: decision === 'APPROVED' ? 'Đã duyệt yêu cầu gia hạn.' : 'Đã từ chối yêu cầu gia hạn.',
      extraAmount: extra
    });
  } catch (error) {
    if (error.code === '23P01')
      return res.status(409).json({ message: 'Thiết bị đã có lịch thuê khác trong thời gian muốn gia hạn.' });
    throw error;
  }
});

router.get('/admin/incidents', ...adminOnly, async (_req, res) => {
  const result =
    await query(`SELECT i.id, i.rental_id AS "rentalId", r.rental_code AS code, r.full_name AS "customerName", r.deposit_amount::INT AS deposit,
      e.equipment_code AS "equipmentCode", p.name AS "productName", i.incident_type AS "incidentType", i.description, i.status, i.resolution,
      i.fee_amount::FLOAT AS "feeAmount", i.missing_items AS "missingItems", i.created_at AS "createdAt", u.full_name AS "reportedBy",
      COALESCE((SELECT ARRAY_AGG('/api/evidence/' || img.id ORDER BY img.position) FROM evidence_images img WHERE img.delivery_log_id=i.delivery_log_id), ARRAY[]::TEXT[]) AS images
    FROM rental_incidents i JOIN rentals r ON r.id=i.rental_id LEFT JOIN equipment_items e ON e.id=i.equipment_item_id
    LEFT JOIN products p ON p.id=e.product_id LEFT JOIN users u ON u.id=i.reported_by
    ORDER BY CASE WHEN i.status='PENDING_REVIEW' THEN 0 ELSE 1 END, i.created_at DESC`);
  res.json({ incidents: result.rows });
});

router.patch('/admin/incidents/:id', ...adminOnly, async (req, res) => {
  const outcome = clean(req.body.equipmentOutcome).toUpperCase(),
    resolution = clean(req.body.resolution),
    fee = Number(req.body.feeAmount);
  if (
    !['AVAILABLE', 'MAINTENANCE', 'DAMAGED', 'RETIRED'].includes(outcome) ||
    !resolution ||
    !Number.isInteger(fee) ||
    fee < 0
  ) {
    return res.status(422).json({ message: 'Thông tin xử lý sự cố không hợp lệ.' });
  }
  const result = await withTransaction(async client => {
    const found = await client.query('SELECT * FROM rental_incidents WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!found.rowCount) throw httpError(404, 'Không tìm thấy biên bản sự cố.');
    const incident = found.rows[0];
    if (incident.status === 'RESOLVED') throw httpError(409, 'Biên bản này đã được xử lý.');
    await client.query(
      `UPDATE rental_incidents SET status='RESOLVED',resolution=$1,fee_amount=$2,resolved_by=$3,resolved_at=NOW() WHERE id=$4`,
      [resolution, fee, req.user.id, incident.id]
    );
    await client.query('UPDATE equipment_items SET status=$1 WHERE id=$2', [outcome, incident.equipment_item_id]);
    let reassigned = { moved: 0, unresolved: [] };
    if (outcome === 'AVAILABLE') await refreshEquipmentStatus(client, [incident.equipment_item_id]);
    else if (incident.equipment_item_id) reassigned = await reassignFutureRentalsTx(client, incident.equipment_item_id);
    if (fee > 0) {
      await client.query(
        `INSERT INTO extra_charges(rental_id,incident_id,charge_type,description,amount,created_by) VALUES($1,$2,'INCIDENT',$3,$4,$5)`,
        [incident.rental_id, incident.id, resolution, fee, req.user.id]
      );
    }
    const settlement = await completeIfInspectionDoneTx(client, incident.rental_id, req.user.id);
    if (!settlement && fee > 0)
      await notify(
        client,
        incident.rental_id,
        'INCIDENT',
        'Có khoản phí sự cố thiết bị',
        `${resolution} — ${fee.toLocaleString('vi-VN')}đ.`
      );
    return { settlement, reassigned };
  });
  const parts = ['Đã xử lý sự cố và cập nhật thiết bị.'];
  if (result.settlement)
    parts.push(
      `Đơn đã quyết toán: khấu trừ ${result.settlement.deducted.toLocaleString('vi-VN')}đ, hoàn cọc ${result.settlement.refund.toLocaleString('vi-VN')}đ.`
    );
  if (result.reassigned.moved) parts.push(`Đã chuyển ${result.reassigned.moved} đơn sắp tới sang thiết bị khác.`);
  if (result.reassigned.unresolved.length)
    parts.push(`Cần xử lý thủ công: ${result.reassigned.unresolved.join(', ')}.`);
  res.json({ message: parts.join(' '), ...result });
});

export default router;
