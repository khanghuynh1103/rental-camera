// Nghiệp vụ vòng đời đơn thuê. Mọi hàm *Tx nhận `client` đang ở trong transaction.
import crypto from 'node:crypto';
import { query, withTransaction } from './db.js';
import {
  BLOCKING_RENTAL_STATUSES,
  RULES,
  UNBOOKABLE_EQUIPMENT_STATUSES,
  depositStatusAfterSettlement,
  incidentTypeFor,
  lateDays,
  lateFee,
  maxExtensionEnd,
  rentalDays,
  requiresIdentity,
  settleDeposit
} from './rules.js';
import { addDays, todayVN } from './time.js';

export const RENTAL_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'DELIVERING',
  'RENTING',
  'RETURNING',
  'INSPECTING',
  'COMPLETED',
  'CANCELLED'
];
export const RETURN_CONDITIONS = ['GOOD', 'SCRATCHED', 'DAMAGED'];
const PAID = 'PAID_SIMULATED';

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

const randomCode = prefix =>
  `${prefix}-${todayVN().slice(0, 4)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

/* ------------------------------------------------------------------ */
/* Truy vấn dùng chung                                                 */
/* ------------------------------------------------------------------ */

export async function lockRental(client, rentalId, { userId = null } = {}) {
  const result = await client.query(
    `SELECT r.*, p.payment_method, p.status AS payment_status, p.amount AS payment_amount
     FROM rentals r LEFT JOIN payments p ON p.rental_id=r.id
     WHERE r.id=$1 AND ($2::UUID IS NULL OR r.user_id=$2) FOR UPDATE OF r`,
    [rentalId, userId]
  );
  if (!result.rowCount) throw httpError(404, 'Không tìm thấy đơn thuê.');
  return result.rows[0];
}

export async function rentalItems(client, rentalId) {
  const result = await client.query(
    `SELECT ri.id, ri.product_id, ri.equipment_item_id, ri.price_per_day, p.name AS product_name, p.included_items,
            e.equipment_code, e.status AS equipment_status
     FROM rental_items ri JOIN products p ON p.id=ri.product_id LEFT JOIN equipment_items e ON e.id=ri.equipment_item_id
     WHERE ri.rental_id=$1 ORDER BY ri.id`,
    [rentalId]
  );
  return result.rows;
}

/** Điều kiện SQL: thiết bị `e` chưa bị giữ lịch trong [$start, $end] (đã tính ngày đệm). */
const freeOnPeriod = (startParam, endParam, excludeParam) => `NOT EXISTS (
  SELECT 1 FROM rental_items ri
  WHERE ri.equipment_item_id=e.id AND ri.active
    AND (${excludeParam}::UUID IS NULL OR ri.rental_id<>${excludeParam}::UUID)
    AND ri.start_date <= ${endParam}::DATE + rental_buffer_days()
    AND ri.block_end_date >= ${startParam}::DATE)`;

export async function countAvailableEquipment(productId, startDate, endDate) {
  const result = await query(
    `SELECT COUNT(*)::INT AS count FROM equipment_items e
     WHERE e.product_id=$1 AND e.status <> ALL($2::VARCHAR[]) AND ${freeOnPeriod('$3', '$4', '$5')}`,
    [productId, UNBOOKABLE_EQUIPMENT_STATUSES, startDate, endDate, null]
  );
  return result.rows[0].count;
}

/** Số thiết bị còn trống theo từng ngày (để vẽ lịch trên trang sản phẩm). */
export async function availabilityCalendar(productId, fromDate, toDate) {
  const result = await query(
    `SELECT d::DATE::TEXT AS date,
       (SELECT COUNT(*) FROM equipment_items e
        WHERE e.product_id=$1 AND e.status <> ALL($4::VARCHAR[])
          AND NOT EXISTS (SELECT 1 FROM rental_items ri WHERE ri.equipment_item_id=e.id AND ri.active
                          AND d::DATE BETWEEN ri.start_date AND ri.block_end_date))::INT AS available
     FROM GENERATE_SERIES($2::DATE,$3::DATE,'1 day') d ORDER BY d`,
    [productId, fromDate, toDate, UNBOOKABLE_EQUIPMENT_STATUSES]
  );
  return result.rows;
}

async function pickEquipment(client, productId, startDate, endDate, { excludeRentalId = null, excludeIds = [] } = {}) {
  const result = await client.query(
    `SELECT e.id FROM equipment_items e
     WHERE e.product_id=$1 AND e.status <> ALL($2::VARCHAR[]) AND NOT (e.id = ANY($6::UUID[]))
       AND ${freeOnPeriod('$3', '$4', '$5')}
     ORDER BY e.equipment_code LIMIT 1 FOR UPDATE OF e SKIP LOCKED`,
    [productId, UNBOOKABLE_EQUIPMENT_STATUSES, startDate, endDate, excludeRentalId, excludeIds]
  );
  return result.rows[0]?.id || null;
}

/** Thiết bị đang ở kho (AVAILABLE/RESERVED) được đánh dấu RESERVED nếu đã gán cho đơn đã xác nhận. */
export async function refreshEquipmentStatus(client, equipmentIds) {
  const ids = equipmentIds.filter(Boolean);
  if (!ids.length) return;
  await client.query(
    `UPDATE equipment_items e SET status = CASE WHEN EXISTS (
        SELECT 1 FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id
        WHERE ri.equipment_item_id=e.id AND r.status='CONFIRMED') THEN 'RESERVED' ELSE 'AVAILABLE' END
     WHERE e.id = ANY($1::UUID[]) AND e.status IN ('AVAILABLE','RESERVED')`,
    [ids]
  );
}

async function setEquipmentStatus(client, equipmentIds, status) {
  await client.query('UPDATE equipment_items SET status=$1 WHERE id = ANY($2::UUID[])', [
    status,
    equipmentIds.filter(Boolean)
  ]);
}

export async function recordStatus(client, rental, toStatus, note, actorId) {
  await client.query('UPDATE rentals SET status=$1 WHERE id=$2', [toStatus, rental.id]);
  await client.query(
    'INSERT INTO rental_status_history(rental_id,from_status,to_status,note,changed_by) VALUES($1,$2,$3,$4,$5)',
    [rental.id, rental.status, toStatus, note || null, actorId || null]
  );
  rental.status = toStatus;
}

export async function notify(client, rentalId, kind, title, body = '') {
  await client.query(
    `INSERT INTO notifications(user_id,rental_id,kind,title,body)
     SELECT user_id,id,$2,$3,$4 FROM rentals WHERE id=$1
     ON CONFLICT (rental_id,kind) WHERE kind IN ('DUE_SOON','OVERDUE') DO NOTHING`,
    [rentalId, kind, title, body]
  );
}

/** Thông báo không gắn với đơn thuê, ví dụ kết quả xác minh CCCD. */
export async function notifyUser(client, userId, kind, title, body = '') {
  await client.query('INSERT INTO notifications(user_id,kind,title,body) VALUES($1,$2,$3,$4)', [
    userId,
    kind,
    title,
    body
  ]);
}

export async function hasVerifiedIdentity(db, userId) {
  const result = await db.query(`SELECT 1 FROM identity_verifications WHERE user_id=$1 AND status='APPROVED' LIMIT 1`, [
    userId
  ]);
  return result.rowCount > 0;
}

async function issueInvoice(client, { rentalId, type, amount, chargeId = null, description }) {
  const result = await client.query(
    `INSERT INTO invoices(rental_id,invoice_code,total_amount,invoice_type,extra_charge_id,description)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING invoice_code,issued_at`,
    [rentalId, randomCode('TMA-HD'), amount, type, chargeId, description]
  );
  return result.rows[0];
}

/* ------------------------------------------------------------------ */
/* Ảnh bằng chứng                                                     */
/* ------------------------------------------------------------------ */

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
export const EVIDENCE_LIMITS = { maxImages: 6, maxBytes: 2.5 * 1024 * 1024 };

export function parseEvidenceImages(input, { required }) {
  const list = (Array.isArray(input) ? input : input ? [input] : [])
    .map(value => String(value || '').trim())
    .filter(Boolean);
  if (required && !list.length) throw httpError(422, 'Vui lòng chụp ít nhất một ảnh bằng chứng.');
  if (list.length > EVIDENCE_LIMITS.maxImages)
    throw httpError(422, `Tối đa ${EVIDENCE_LIMITS.maxImages} ảnh cho mỗi lần bàn giao/thu hồi.`);
  return list.map(value => {
    const match = value.match(DATA_URL);
    if (!match) throw httpError(422, 'Ảnh bằng chứng phải là JPEG, PNG hoặc WebP.');
    const data = Buffer.from(match[2], 'base64');
    if (!data.length || data.length > EVIDENCE_LIMITS.maxBytes)
      throw httpError(422, 'Mỗi ảnh bằng chứng tối đa 2,5 MB sau khi nén.');
    return { mimeType: match[1], data };
  });
}

async function saveDeliveryLog(
  client,
  { rentalId, action, inspection = null, note, checklist = null, images = [], actorId }
) {
  const log = await client.query(
    `INSERT INTO delivery_logs(rental_id,action,inspection_result,note,checklist,created_by)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [rentalId, action, inspection, note || null, checklist ? JSON.stringify(checklist) : null, actorId]
  );
  for (const [position, image] of images.entries()) {
    await client.query('INSERT INTO evidence_images(delivery_log_id,mime_type,data,position) VALUES($1,$2,$3,$4)', [
      log.rows[0].id,
      image.mimeType,
      image.data,
      position
    ]);
  }
  return log.rows[0].id;
}

/* ------------------------------------------------------------------ */
/* Tạo đơn, thanh toán, hủy, hết hạn                                   */
/* ------------------------------------------------------------------ */

export async function createRental({
  user,
  products,
  startDate,
  endDate,
  contact,
  deliveryMethod,
  address,
  deliveryTime,
  returnTime,
  note,
  paymentMethod
}) {
  try {
    return await withTransaction(async client => {
      const days = rentalDays(startDate, endDate);
      const picked = [];
      for (const product of products) {
        const equipmentId = await pickEquipment(client, product.databaseId, startDate, endDate);
        if (!equipmentId)
          throw httpError(409, `${product.name} vừa hết lịch trong khoảng ngày này. Vui lòng chọn ngày khác.`);
        picked.push({ product, equipmentId });
      }
      const rentalFee = products.reduce((sum, product) => sum + product.price * days, 0);
      const deposit = products.reduce((sum, product) => sum + product.deposit, 0);
      const holdInterval =
        paymentMethod === 'online' ? `${RULES.onlinePaymentHoldMinutes} minutes` : `${RULES.pendingHoldHours} hours`;
      const inserted = await client.query(
        `INSERT INTO rentals (rental_code,user_id,start_date,end_date,delivery_method,delivery_address,rental_fee,deposit_amount,total_amount,
           status,note,full_name,phone,email,delivery_time,return_time,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',$10,$11,$12,$13,$14,$15,NOW() + $16::INTERVAL) RETURNING *`,
        [
          randomCode('TMA'),
          user.id,
          startDate,
          endDate,
          deliveryMethod,
          address || null,
          rentalFee,
          deposit,
          rentalFee + deposit,
          note || null,
          contact.fullName,
          contact.phone,
          contact.email,
          deliveryTime || null,
          returnTime || null,
          holdInterval
        ]
      );
      const rental = inserted.rows[0];
      for (const { product, equipmentId } of picked) {
        await client.query(
          'INSERT INTO rental_items (rental_id,product_id,equipment_item_id,price_per_day) VALUES ($1,$2,$3,$4)',
          [rental.id, product.databaseId, equipmentId, product.price]
        );
      }
      await client.query('INSERT INTO payments (rental_id,payment_method,amount,status) VALUES ($1,$2,$3,$4)', [
        rental.id,
        paymentMethod,
        rentalFee,
        'PENDING'
      ]);
      await client.query(
        "INSERT INTO rental_status_history(rental_id,from_status,to_status,note,changed_by) VALUES($1,NULL,'PENDING',$2,$3)",
        [rental.id, 'Khách hàng gửi yêu cầu thuê', user.id]
      );
      await notify(
        client,
        rental.id,
        'INFO',
        `Đã nhận yêu cầu thuê ${rental.rental_code}`,
        paymentMethod === 'online'
          ? `Vui lòng thanh toán tiền thuê trong ${RULES.onlinePaymentHoldMinutes} phút để giữ lịch.`
          : 'Cửa hàng sẽ xác nhận đơn trong vòng 24 giờ.'
      );
      const identityRequired = requiresIdentity(deposit) && !(await hasVerifiedIdentity(client, user.id));
      if (identityRequired) {
        await notify(
          client,
          rental.id,
          'IDENTITY',
          `Đơn ${rental.rental_code} cần xác minh CCCD`,
          `Đơn có tiền cọc từ ${RULES.identityDepositThreshold.toLocaleString('vi-VN')}đ. Vui lòng gửi hồ sơ trong trang Tài khoản để cửa hàng duyệt đơn.`
        );
      }
      return {
        ...summarizeRental(rental),
        paymentMethod,
        paymentStatus: 'PENDING',
        identityRequired,
        items: picked.map(({ product }) => ({ productId: product.id, productName: product.name }))
      };
    });
  } catch (error) {
    if (error.code === '23P01')
      throw httpError(409, 'Thiết bị vừa được người khác đặt trong khoảng ngày này. Vui lòng chọn ngày khác.');
    throw error;
  }
}

export async function payRental(rentalId, userId, { simulateFailure = false } = {}) {
  return withTransaction(async client => {
    const rental = await lockRental(client, rentalId, { userId });
    if (!['PENDING', 'CONFIRMED'].includes(rental.status))
      throw httpError(409, 'Đơn thuê này không còn ở trạng thái có thể thanh toán.');
    if (rental.payment_method !== 'online') throw httpError(409, 'Đơn này thanh toán trực tiếp khi bàn giao thiết bị.');
    if (rental.payment_status === PAID) throw httpError(409, 'Đơn thuê này đã được thanh toán.');
    // Mô phỏng cổng thanh toán từ chối: không ghi nhận tiền, không tạo hóa đơn, đơn vẫn giữ lịch để khách thử lại.
    if (simulateFailure)
      throw httpError(402, 'Giao dịch mô phỏng thất bại. Bạn có thể thử lại trong thời gian giữ lịch.');
    const paid = await client.query(
      `UPDATE payments SET status=$1,paid_at=NOW() WHERE rental_id=$2 RETURNING paid_at,amount`,
      [PAID, rental.id]
    );
    const invoice = await issueInvoice(client, {
      rentalId: rental.id,
      type: 'RENTAL',
      amount: Number(paid.rows[0].amount),
      description: 'Tiền thuê thiết bị'
    });
    if (rental.status === 'PENDING')
      await client.query(`UPDATE rentals SET expires_at=NOW() + $2::INTERVAL WHERE id=$1`, [
        rental.id,
        `${RULES.pendingHoldHours} hours`
      ]);
    await notify(
      client,
      rental.id,
      'PAYMENT',
      `Đã thanh toán đơn ${rental.rental_code}`,
      `Hóa đơn ${invoice.invoice_code}. Tiền cọc thu khi nhận máy.`
    );
    return {
      ...summarizeRental(rental),
      paymentMethod: 'online',
      paymentStatus: PAID,
      paidAt: paid.rows[0].paid_at,
      paidAmount: Number(paid.rows[0].amount),
      invoiceCode: invoice.invoice_code
    };
  });
}

export async function cancelRentalTx(client, rental, actorId, reason, { kind = 'CANCELLED' } = {}) {
  const items = await rentalItems(client, rental.id);
  await client.query('UPDATE rentals SET cancelled_at=NOW(),cancel_reason=$2,expires_at=NULL WHERE id=$1', [
    rental.id,
    reason
  ]);
  await recordStatus(client, rental, 'CANCELLED', reason, actorId);
  const payment = await client.query(
    `UPDATE payments SET status=CASE WHEN status=$2 THEN 'REFUNDED_SIMULATED' ELSE 'VOID' END,
       refunded_at=CASE WHEN status=$2 THEN NOW() END
     WHERE rental_id=$1 AND status IN ($2,'PENDING') RETURNING status,amount`,
    [rental.id, PAID]
  );
  const refunded = payment.rows[0]?.status === 'REFUNDED_SIMULATED' ? Number(payment.rows[0].amount) : 0;
  await refreshEquipmentStatus(
    client,
    items.map(item => item.equipment_item_id)
  );
  await notify(
    client,
    rental.id,
    kind,
    `Đơn ${rental.rental_code} đã bị hủy`,
    `${reason}${refunded ? ` Đã hoàn ${refunded.toLocaleString('vi-VN')}đ (mô phỏng).` : ''}`
  );
  return { refunded };
}

let lastExpireRun = 0;
/** Hủy các đơn PENDING quá thời gian giữ lịch. Gọi "lười" từ các API đọc lịch để không cần cron. */
export async function expireStaleRentals({ force = false } = {}) {
  const throttle = Number(process.env.EXPIRE_THROTTLE_MS ?? 30000);
  if (!force && Date.now() - lastExpireRun < throttle) return 0;
  lastExpireRun = Date.now();
  const stale = await query(`SELECT id FROM rentals WHERE status='PENDING' AND expires_at < NOW()`);
  for (const row of stale.rows) {
    await withTransaction(async client => {
      const rental = await lockRental(client, row.id);
      if (rental.status !== 'PENDING') return;
      const reason =
        rental.payment_method === 'online' && rental.payment_status !== PAID
          ? 'Hết thời gian giữ lịch vì đơn chưa được thanh toán online.'
          : 'Hết thời gian giữ lịch vì cửa hàng chưa xác nhận kịp thời.';
      await cancelRentalTx(client, rental, null, reason, { kind: 'EXPIRED' });
    });
  }
  return stale.rowCount;
}

/* ------------------------------------------------------------------ */
/* Duyệt đơn và giao nhận                                              */
/* ------------------------------------------------------------------ */

export async function confirmRentalTx(client, rental, actorId, note) {
  if (rental.status !== 'PENDING') throw httpError(409, 'Chỉ có thể duyệt đơn đang chờ duyệt.');
  if (rental.payment_method === 'online' && rental.payment_status !== PAID)
    throw httpError(409, 'Khách chưa hoàn tất thanh toán online nên chưa thể duyệt đơn.');
  if (requiresIdentity(rental.deposit_amount) && !(await hasVerifiedIdentity(client, rental.user_id))) {
    throw httpError(
      409,
      `Đơn có tiền cọc từ ${RULES.identityDepositThreshold.toLocaleString('vi-VN')}đ cần khách xác minh CCCD trước khi duyệt.`
    );
  }
  const items = await rentalItems(client, rental.id);
  const touched = [];
  for (const item of items) {
    if (item.equipment_item_id && !UNBOOKABLE_EQUIPMENT_STATUSES.includes(item.equipment_status)) {
      touched.push(item.equipment_item_id);
      continue;
    }
    const replacement = await pickEquipment(client, item.product_id, rental.start_date, rental.end_date, {
      excludeRentalId: rental.id,
      excludeIds: [item.equipment_item_id].filter(Boolean)
    });
    if (!replacement)
      throw httpError(
        409,
        `Không còn ${item.product_name} sẵn sàng trong thời gian thuê. Hãy bổ sung kho hoặc từ chối đơn.`
      );
    await client.query('UPDATE rental_items SET equipment_item_id=$1 WHERE id=$2', [replacement, item.id]);
    touched.push(item.equipment_item_id, replacement);
  }
  await client.query('UPDATE rentals SET expires_at=NULL WHERE id=$1', [rental.id]);
  await recordStatus(client, rental, 'CONFIRMED', note || 'Cửa hàng xác nhận đơn', actorId);
  await refreshEquipmentStatus(client, touched);
  await notify(
    client,
    rental.id,
    'CONFIRMED',
    `Đơn ${rental.rental_code} đã được xác nhận`,
    rental.delivery_method === 'delivery'
      ? 'Nhân viên sẽ giao thiết bị theo khung giờ bạn chọn.'
      : 'Bạn có thể đến cửa hàng nhận thiết bị vào ngày nhận.'
  );
}

async function assertEquipmentReady(items) {
  for (const item of items) {
    if (!item.equipment_item_id)
      throw httpError(409, `${item.product_name} chưa được gán thiết bị. Quản trị viên cần kiểm tra lại đơn.`);
    if (UNBOOKABLE_EQUIPMENT_STATUSES.includes(item.equipment_status))
      throw httpError(
        409,
        `Thiết bị ${item.equipment_code} đang ${item.equipment_status}, cần đổi thiết bị khác trước khi giao.`
      );
  }
}

export async function startDeliveryTx(client, rental, actorId, note) {
  if (rental.delivery_method !== 'delivery' || rental.status !== 'CONFIRMED')
    throw httpError(409, 'Không thể bắt đầu giao với trạng thái hiện tại.');
  if (!rental.assigned_delivery_staff_id)
    throw httpError(409, 'Hãy phân công nhân viên giao nhận trước khi bắt đầu giao.');
  const items = await rentalItems(client, rental.id);
  await assertEquipmentReady(items);
  await setEquipmentStatus(
    client,
    items.map(item => item.equipment_item_id),
    'RENTED'
  );
  await recordStatus(client, rental, 'DELIVERING', note || 'Nhân viên nhận thiết bị và bắt đầu giao', actorId);
  await saveDeliveryLog(client, { rentalId: rental.id, action: 'DELIVERING', note, actorId });
  await notify(
    client,
    rental.id,
    'DELIVERING',
    `Đơn ${rental.rental_code} đang được giao`,
    'Vui lòng giữ liên lạc qua số điện thoại đã đăng ký.'
  );
}

function normalizeChecklist(items, input, { requireCondition }) {
  const byId = new Map((Array.isArray(input) ? input : []).map(entry => [String(entry.rentalItemId), entry]));
  return items.map(item => {
    const entry = byId.get(String(item.id));
    if (!entry) throw httpError(422, `Vui lòng kiểm tra bộ phụ kiện của ${item.product_name}.`);
    const included = item.included_items || [];
    const missing = [...new Set((Array.isArray(entry.missing) ? entry.missing : []).map(String))];
    if (missing.some(name => !included.includes(name)))
      throw httpError(422, `Danh sách phụ kiện của ${item.product_name} không hợp lệ.`);
    const condition = requireCondition ? String(entry.condition || '').toUpperCase() : 'GOOD';
    if (!RETURN_CONDITIONS.includes(condition))
      throw httpError(422, `Vui lòng chọn tình trạng của ${item.product_name}.`);
    return {
      rentalItemId: item.id,
      equipmentItemId: item.equipment_item_id,
      equipmentCode: item.equipment_code,
      productName: item.product_name,
      included,
      missing,
      condition
    };
  });
}

/** Bàn giao thiết bị cho khách: tại nhà (nhân viên) hoặc tại cửa hàng (quản trị viên). */
export async function handoverTx(client, rental, actorId, { items: checklistInput, images: imageInput, note }) {
  const expected = rental.delivery_method === 'delivery' ? 'DELIVERING' : 'CONFIRMED';
  if (rental.status !== expected) throw httpError(409, 'Không thể bàn giao với trạng thái hiện tại.');
  if (todayVN() < rental.start_date) throw httpError(409, 'Chưa đến ngày nhận thiết bị của đơn này.');
  const images = parseEvidenceImages(imageInput, { required: true });
  const items = await rentalItems(client, rental.id);
  await assertEquipmentReady(items);
  const checklist = normalizeChecklist(items, checklistInput, { requireCondition: false });
  const incomplete = checklist.find(entry => entry.missing.length);
  if (incomplete)
    throw httpError(
      422,
      `${incomplete.productName} còn thiếu: ${incomplete.missing.join(', ')}. Cần bổ sung đủ phụ kiện trước khi bàn giao.`
    );

  if (rental.payment_method === 'online' && rental.payment_status !== PAID)
    throw httpError(409, 'Khách chưa thanh toán tiền thuê online.');
  if (rental.payment_method === 'handover' && rental.payment_status !== PAID) {
    const paid = await client.query(
      `UPDATE payments SET status=$1,paid_at=NOW(),collected_by=$2 WHERE rental_id=$3 RETURNING amount`,
      [PAID, actorId, rental.id]
    );
    await issueInvoice(client, {
      rentalId: rental.id,
      type: 'RENTAL',
      amount: Number(paid.rows[0].amount),
      description: 'Tiền thuê thiết bị (thu khi bàn giao)'
    });
  }
  await client.query(`UPDATE rentals SET deposit_status='HELD',deposit_collected_at=NOW() WHERE id=$1`, [rental.id]);
  await setEquipmentStatus(
    client,
    items.map(item => item.equipment_item_id),
    'RENTED'
  );
  await saveDeliveryLog(client, { rentalId: rental.id, action: 'RENTING', note, checklist, images, actorId });
  await recordStatus(client, rental, 'RENTING', note || 'Đã bàn giao thiết bị cho khách', actorId);
  await notify(
    client,
    rental.id,
    'RENTING',
    `Đã bàn giao thiết bị đơn ${rental.rental_code}`,
    `Hạn trả: ${rental.end_date}. Tiền cọc ${Number(rental.deposit_amount).toLocaleString('vi-VN')}đ được giữ đến khi thu hồi.`
  );
}

export async function startReturnTx(client, rental, actorId, note) {
  if (rental.delivery_method !== 'delivery' || rental.status !== 'RENTING')
    throw httpError(409, 'Không thể bắt đầu thu hồi với trạng thái hiện tại.');
  const items = await rentalItems(client, rental.id);
  await setEquipmentStatus(
    client,
    items.map(item => item.equipment_item_id),
    'RETURNING'
  );
  await recordStatus(client, rental, 'RETURNING', note || 'Nhân viên bắt đầu thu hồi', actorId);
  await saveDeliveryLog(client, { rentalId: rental.id, action: 'RETURNING', note, actorId });
  await notify(
    client,
    rental.id,
    'RETURNING',
    `Nhân viên đang đến thu hồi đơn ${rental.rental_code}`,
    'Vui lòng chuẩn bị đầy đủ thiết bị và phụ kiện.'
  );
}

/** Nhận lại thiết bị: kiểm tra từng thiết bị, ghi sự cố, tính phí trả muộn và quyết toán nếu không có sự cố. */
export async function receiveReturnTx(client, rental, actorId, { items: checklistInput, images: imageInput, note }) {
  const expected = rental.delivery_method === 'delivery' ? 'RETURNING' : 'RENTING';
  if (rental.status !== expected) throw httpError(409, 'Không thể nhận lại thiết bị với trạng thái hiện tại.');
  const images = parseEvidenceImages(imageInput, { required: true });
  const items = await rentalItems(client, rental.id);
  const checklist = normalizeChecklist(items, checklistInput, { requireCondition: true });
  const issues = checklist
    .map(entry => ({ ...entry, incidentType: incidentTypeFor(entry.condition, entry.missing) }))
    .filter(entry => entry.incidentType);
  if (issues.length && !String(note || '').trim())
    throw httpError(422, 'Vui lòng mô tả tình trạng hư hỏng hoặc phụ kiện bị thiếu.');

  const worst =
    issues.find(entry => entry.incidentType === 'DAMAGED') ||
    issues.find(entry => entry.incidentType === 'SCRATCHED') ||
    issues[0];
  const logId = await saveDeliveryLog(client, {
    rentalId: rental.id,
    action: 'RETURNED',
    inspection: worst?.incidentType || 'GOOD',
    note,
    checklist,
    images,
    actorId
  });

  const today = todayVN();
  await client.query('UPDATE rentals SET returned_on=$2 WHERE id=$1', [rental.id, today]);
  const late = lateDays(rental.end_date, today);
  if (late > 0) {
    const daily = items.reduce((sum, item) => sum + Number(item.price_per_day), 0);
    await client.query(
      `INSERT INTO extra_charges(rental_id,charge_type,description,amount,created_by) VALUES($1,'LATE_RETURN',$2,$3,$4)`,
      [rental.id, `Trả muộn ${late} ngày (${RULES.lateFeeRate * 100}% giá thuê/ngày)`, lateFee(daily, late), actorId]
    );
  }

  for (const entry of checklist) {
    const issue = issues.find(candidate => candidate.rentalItemId === entry.rentalItemId);
    if (!issue) {
      await client.query(`UPDATE equipment_items SET status='AVAILABLE' WHERE id=$1`, [entry.equipmentItemId]);
      continue;
    }
    const condition = issue.incidentType === 'DAMAGED' ? 'DAMAGED' : 'FAIR';
    await client.query(`UPDATE equipment_items SET status='INSPECTION',condition=$2 WHERE id=$1`, [
      entry.equipmentItemId,
      condition
    ]);
    const missingText = issue.missing.length ? ` Thiếu: ${issue.missing.join(', ')}.` : '';
    await client.query(
      `INSERT INTO rental_incidents(rental_id,equipment_item_id,incident_type,description,reported_by,delivery_log_id,missing_items)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        rental.id,
        entry.equipmentItemId,
        issue.incidentType,
        `${String(note || '').trim()}${missingText}`.trim(),
        actorId,
        logId,
        issue.missing
      ]
    );
  }
  await refreshEquipmentStatus(
    client,
    checklist.map(entry => entry.equipmentItemId)
  );

  if (issues.length) {
    await recordStatus(
      client,
      rental,
      'INSPECTING',
      'Đã thu hồi, phát hiện bất thường cần quản trị viên xử lý',
      actorId
    );
    await notify(
      client,
      rental.id,
      'INSPECTING',
      `Đơn ${rental.rental_code} đang được kiểm tra sự cố`,
      'Cửa hàng sẽ thông báo hướng xử lý và chi phí phát sinh (nếu có).'
    );
    return { status: 'INSPECTING', lateDays: late };
  }
  const settlement = await settleRentalTx(client, rental, actorId);
  return { status: 'COMPLETED', lateDays: late, settlement };
}

/** Quyết toán: trừ các khoản phí chưa thanh toán vào tiền cọc, hoàn phần còn lại, hoàn tất đơn. */
export async function settleRentalTx(client, rental, actorId) {
  const depositHeld = rental.deposit_status === 'HELD' ? Number(rental.deposit_amount) : 0;
  const pending = await client.query(
    `SELECT id,amount FROM extra_charges WHERE rental_id=$1 AND payment_status='PENDING' FOR UPDATE`,
    [rental.id]
  );
  const result = settleDeposit(
    depositHeld,
    pending.rows.map(row => Number(row.amount))
  );
  if (result.deducted > 0) {
    await client.query(
      `UPDATE extra_charges SET payment_status='SETTLED_BY_DEPOSIT',paid_at=NOW() WHERE id = ANY($1::UUID[])`,
      [pending.rows.map(row => row.id)]
    );
    await issueInvoice(client, {
      rentalId: rental.id,
      type: 'SETTLEMENT',
      amount: result.deducted,
      description: 'Khấu trừ phí phát sinh vào tiền cọc'
    });
    if (result.shortfall > 0) {
      await client.query(
        `INSERT INTO extra_charges(rental_id,charge_type,description,amount,created_by) VALUES($1,'DEPOSIT_SHORTFALL',$2,$3,$4)`,
        [rental.id, 'Phần phí phát sinh vượt quá tiền cọc', result.shortfall, actorId]
      );
    }
  }
  const depositStatus = depositStatusAfterSettlement(depositHeld, result.refund);
  await client.query(
    `UPDATE rentals SET deposit_status=$2,deposit_deducted_amount=$3,deposit_refund_amount=$4,settled_at=NOW() WHERE id=$1`,
    [rental.id, depositStatus, result.deducted, result.refund]
  );
  const note = depositHeld
    ? `Quyết toán: khấu trừ ${result.deducted.toLocaleString('vi-VN')}đ, hoàn cọc ${result.refund.toLocaleString('vi-VN')}đ`
    : 'Hoàn tất đơn thuê';
  await recordStatus(client, rental, 'COMPLETED', note, actorId);
  await notify(
    client,
    rental.id,
    'COMPLETED',
    `Đơn ${rental.rental_code} đã hoàn tất`,
    `${note}.${result.shortfall > 0 && result.deducted > 0 ? ` Còn ${result.shortfall.toLocaleString('vi-VN')}đ cần thanh toán thêm.` : ''} Cảm ơn bạn đã thuê thiết bị!`
  );
  return { depositHeld, ...result, depositStatus };
}

export async function completeIfInspectionDoneTx(client, rentalId, actorId) {
  const rental = await lockRental(client, rentalId);
  if (rental.status !== 'INSPECTING') return null;
  const open = await client.query(
    `SELECT 1 FROM rental_incidents WHERE rental_id=$1 AND status='PENDING_REVIEW' LIMIT 1`,
    [rentalId]
  );
  if (open.rowCount) return null;
  return settleRentalTx(client, rental, actorId);
}

/* ------------------------------------------------------------------ */
/* Gia hạn, kho và nhắc hạn                                            */
/* ------------------------------------------------------------------ */

/** Ngày bắt đầu sớm nhất của đơn khác trên cùng thiết bị, sau ngày trả hiện tại. */
export async function nextBookingStart(client, rental) {
  const result = await client.query(
    `SELECT MIN(other.start_date)::TEXT AS next FROM rental_items mine
     JOIN rental_items other ON other.equipment_item_id=mine.equipment_item_id AND other.rental_id<>mine.rental_id AND other.active
     WHERE mine.rental_id=$1 AND other.start_date > $2::DATE`,
    [rental.id, rental.end_date]
  );
  return result.rows[0].next;
}

export async function extensionLimit(client, rental) {
  const next = await nextBookingStart(client, rental);
  return { nextBookingStart: next, maxEndDate: maxExtensionEnd(rental.end_date, next, RULES.bufferDays) };
}

/** Khi một thiết bị chuyển sang bảo trì/hư hỏng: chuyển các đơn chưa giao sang thiết bị cùng mẫu còn trống. */
export async function reassignFutureRentalsTx(client, equipmentId) {
  const affected = await client.query(
    `SELECT ri.id, ri.product_id, r.id AS rental_id, r.rental_code, r.start_date, r.end_date FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id
     WHERE ri.equipment_item_id=$1 AND ri.active AND r.status IN ('PENDING','CONFIRMED') ORDER BY r.start_date`,
    [equipmentId]
  );
  const unresolved = [];
  let moved = 0;
  for (const row of affected.rows) {
    const replacement = await pickEquipment(client, row.product_id, row.start_date, row.end_date, {
      excludeRentalId: row.rental_id,
      excludeIds: [equipmentId]
    });
    if (!replacement) {
      unresolved.push(row.rental_code);
      continue;
    }
    await client.query('UPDATE rental_items SET equipment_item_id=$1 WHERE id=$2', [replacement, row.id]);
    await refreshEquipmentStatus(client, [replacement]);
    moved++;
  }
  return { moved, unresolved };
}

/** Tạo nhắc hạn trả (còn ≤ 2 ngày) và cảnh báo quá hạn, mỗi loại một lần cho mỗi đơn. */
export async function generateReminders(userId = null) {
  const today = todayVN();
  await query(
    `INSERT INTO notifications(user_id,rental_id,kind,title,body)
     SELECT user_id,id,'DUE_SOON','Đơn ' || rental_code || ' sắp đến hạn trả','Hạn trả: ' || to_char(end_date,'DD/MM/YYYY') || '. Muốn thuê thêm cần gửi gia hạn sớm.'
     FROM rentals WHERE status IN ('RENTING','RETURNING') AND end_date BETWEEN $1::DATE AND $1::DATE + 2 AND ($2::UUID IS NULL OR user_id=$2)
     ON CONFLICT (rental_id,kind) WHERE kind IN ('DUE_SOON','OVERDUE') DO NOTHING`,
    [today, userId]
  );
  await query(
    `INSERT INTO notifications(user_id,rental_id,kind,title,body)
     SELECT user_id,id,'OVERDUE','Đơn ' || rental_code || ' đã quá hạn trả','Phí trả muộn được tính ${RULES.lateFeeRate * 100}% giá thuê cho mỗi ngày trễ. Vui lòng liên hệ cửa hàng.'
     FROM rentals WHERE status IN ('RENTING','RETURNING') AND end_date < $1::DATE AND ($2::UUID IS NULL OR user_id=$2)
     ON CONFLICT (rental_id,kind) WHERE kind IN ('DUE_SOON','OVERDUE') DO NOTHING`,
    [today, userId]
  );
}

export function summarizeRental(row) {
  const startDate = String(row.start_date).slice(0, 10),
    endDate = String(row.end_date).slice(0, 10);
  return {
    id: row.id,
    code: row.rental_code,
    status: row.status,
    startDate,
    endDate,
    days: rentalDays(startDate, endDate),
    rentalFee: Number(row.rental_fee),
    deposit: Number(row.deposit_amount),
    total: Number(row.total_amount),
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    deliveryMethod: row.delivery_method,
    address: row.delivery_address || '',
    deliveryTime: row.delivery_time || '',
    returnTime: row.return_time || '',
    note: row.note || '',
    createdAt: row.created_at,
    expiresAt: row.expires_at || null
  };
}

export const isOverdue = (status, endDate, today = todayVN()) =>
  ['RENTING', 'RETURNING'].includes(status) && endDate < today;
export const blockingStatuses = BLOCKING_RENTAL_STATUSES;
export { addDays };
