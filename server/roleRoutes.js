import { Router } from 'express';
import { requireAuth, requireRole } from './auth.js';
import { pool, query, withTransaction } from './db.js';
import { reassignFutureRentalsTx, refreshEquipmentStatus } from './rentalService.js';

const router = Router();
const roles = ['CUSTOMER', 'ADMIN', 'DELIVERY_STAFF'];
// Trạng thái quản trị viên được đặt thủ công. RESERVED/RENTED/RETURNING/INSPECTION do quy trình thuê tự quản lý.
const manualEquipmentStatuses = ['AVAILABLE', 'MAINTENANCE', 'DAMAGED', 'RETIRED'];
const workflowEquipmentStatuses = ['RENTED', 'RETURNING', 'INSPECTION'];
const equipmentConditions = ['GOOD', 'FAIR', 'DAMAGED'];
const adminOnly = [requireAuth, requireRole('ADMIN')];
const clean = value => String(value ?? '').trim();
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateProduct(body) {
  if (clean(body.name).length < 2) return 'Tên sản phẩm phải có ít nhất 2 ký tự.';
  if (!slugPattern.test(clean(body.slug))) return 'Slug chỉ gồm chữ thường, số và dấu gạch ngang.';
  if (!Number.isInteger(Number(body.categoryId))) return 'Danh mục không hợp lệ.';
  if (!Number.isInteger(Number(body.pricePerDay)) || Number(body.pricePerDay) < 0) return 'Giá thuê không hợp lệ.';
  if (!Number.isInteger(Number(body.depositAmount)) || Number(body.depositAmount) < 0) return 'Tiền cọc không hợp lệ.';
  if (
    body.includedItems !== undefined &&
    (!Array.isArray(body.includedItems) ||
      body.includedItems.length > 20 ||
      body.includedItems.some(item => clean(item).length > 80))
  )
    return 'Danh sách phụ kiện tối đa 20 mục, mỗi mục tối đa 80 ký tự.';
  return null;
}

const includedItems = body => [
  ...new Set((Array.isArray(body.includedItems) ? body.includedItems : []).map(clean).filter(Boolean))
];

async function saveImages(client, productId, images) {
  if (!Array.isArray(images)) return;
  await client.query('DELETE FROM product_images WHERE product_id=$1', [productId]);
  for (const [position, url] of images.map(clean).filter(Boolean).entries())
    await client.query('INSERT INTO product_images (product_id,image_url,position) VALUES ($1,$2,$3)', [
      productId,
      url,
      position
    ]);
}

router.get('/admin/overview', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  const [summary, recent] = await Promise.all([
    query(`SELECT
      (SELECT COUNT(*)::INT FROM users) AS users,
      (SELECT COUNT(*)::INT FROM products WHERE active=TRUE) AS products,
      (SELECT COUNT(*)::INT FROM equipment_items WHERE status<>'RETIRED') AS equipment,
      (SELECT COUNT(*)::INT FROM rentals) AS rentals`),
    query(`SELECT r.id,r.rental_code AS code,r.full_name AS "customerName",r.start_date AS "startDate",
      r.end_date AS "endDate",r.total_amount::FLOAT AS total,r.status,r.created_at AS "createdAt",
      p.name AS "productName"
      FROM rentals r JOIN rental_items ri ON ri.rental_id=r.id JOIN products p ON p.id=ri.product_id
      ORDER BY r.created_at DESC LIMIT 8`)
  ]);
  res.json({ summary: summary.rows[0], recentRentals: recent.rows });
});

router.get('/admin/users', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  const result = await query(`SELECT id,full_name AS "fullName",email,phone,role,created_at AS "createdAt"
    FROM users ORDER BY created_at DESC`);
  res.json({ users: result.rows });
});

router.get('/admin/categories', ...adminOnly, async (_req, res) => {
  const result = await query('SELECT id,name,slug FROM categories ORDER BY id');
  res.json({ categories: result.rows });
});

router.get('/admin/products', ...adminOnly, async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page) || 1),
    limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit) || 10)),
    search = clean(req.query.q),
    offset = (page - 1) * limit;
  const active = req.query.active === 'all' ? null : req.query.active === 'false' ? false : true;
  const values = [`%${search}%`, active, limit, offset];
  const where = `WHERE ($1='' OR p.name ILIKE $1 OR p.slug ILIKE $1 OR p.brand ILIKE $1) AND ($2::BOOLEAN IS NULL OR p.active=$2)`;
  const [items, count] = await Promise.all([
    query(
      `SELECT p.id,p.slug,p.name,p.brand,p.format,p.specification,p.description,p.price_per_day AS "pricePerDay",
      p.deposit_amount AS "depositAmount",p.featured,p.active,p.included_items AS "includedItems",p.category_id AS "categoryId",c.name AS "categoryName",
      COALESCE(ARRAY_AGG(pi.image_url ORDER BY pi.position) FILTER(WHERE pi.id IS NOT NULL),ARRAY[]::TEXT[]) AS images,
      COUNT(DISTINCT e.id) FILTER(WHERE e.status<>'RETIRED')::INT AS stock
      FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN product_images pi ON pi.product_id=p.id
      LEFT JOIN equipment_items e ON e.product_id=p.id ${where} GROUP BY p.id,c.name ORDER BY p.created_at DESC LIMIT $3 OFFSET $4`,
      values
    ),
    query(`SELECT COUNT(*)::INT AS total FROM products p ${where}`, [values[0], values[1]])
  ]);
  const total = count.rows[0].total;
  res.json({ products: items.rows, page, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

router.post('/admin/products', ...adminOnly, async (req, res) => {
  const validation = validateProduct(req.body);
  if (validation) return res.status(422).json({ message: validation });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO products
    (slug,category_id,name,brand,format,specification,description,price_per_day,deposit_amount,featured,active,included_items)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        clean(req.body.slug),
        Number(req.body.categoryId),
        clean(req.body.name),
        clean(req.body.brand),
        clean(req.body.format),
        clean(req.body.specification),
        clean(req.body.description),
        Number(req.body.pricePerDay),
        Number(req.body.depositAmount),
        Boolean(req.body.featured),
        req.body.active !== false,
        includedItems(req.body)
      ]
    );
    await saveImages(client, result.rows[0].id, req.body.images);
    await client.query('COMMIT');
    res.status(201).json({ message: 'Đã thêm sản phẩm.', id: result.rows[0].id });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ message: 'Slug sản phẩm đã tồn tại.' });
    throw error;
  } finally {
    client.release();
  }
});

router.patch('/admin/products/:id', ...adminOnly, async (req, res) => {
  const validation = validateProduct(req.body);
  if (validation) return res.status(422).json({ message: validation });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE products SET slug=$1,category_id=$2,name=$3,brand=$4,format=$5,specification=$6,description=$7,price_per_day=$8,deposit_amount=$9,featured=$10,active=$11,included_items=$13 WHERE id=$12 RETURNING id`,
      [
        clean(req.body.slug),
        Number(req.body.categoryId),
        clean(req.body.name),
        clean(req.body.brand),
        clean(req.body.format),
        clean(req.body.specification),
        clean(req.body.description),
        Number(req.body.pricePerDay),
        Number(req.body.depositAmount),
        Boolean(req.body.featured),
        req.body.active !== false,
        req.params.id,
        includedItems(req.body)
      ]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
    }
    await saveImages(client, req.params.id, req.body.images);
    await client.query('COMMIT');
    res.json({ message: 'Đã cập nhật sản phẩm.' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ message: 'Slug sản phẩm đã tồn tại.' });
    throw error;
  } finally {
    client.release();
  }
});

router.patch('/admin/products/:id/visibility', ...adminOnly, async (req, res) => {
  const result = await query('UPDATE products SET active=$1 WHERE id=$2 RETURNING active', [
    Boolean(req.body.active),
    req.params.id
  ]);
  if (!result.rowCount) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
  res.json({
    message: result.rows[0].active ? 'Đã hiển thị sản phẩm.' : 'Đã ẩn sản phẩm.',
    active: result.rows[0].active
  });
});

router.get('/admin/equipment', ...adminOnly, async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page) || 1),
    limit = 12,
    search = clean(req.query.q),
    status = clean(req.query.status),
    offset = (page - 1) * limit;
  const values = [`%${search}%`, status, limit, offset];
  const where = `WHERE ($1='' OR e.equipment_code ILIKE $1 OR p.name ILIKE $1) AND ($2='' OR e.status=$2)`;
  const [items, count] = await Promise.all([
    query(
      `SELECT e.id,e.equipment_code AS "equipmentCode",e.condition,e.status,e.created_at AS "createdAt",p.id AS "productId",p.name AS "productName" FROM equipment_items e JOIN products p ON p.id=e.product_id ${where} ORDER BY e.created_at DESC LIMIT $3 OFFSET $4`,
      values
    ),
    query(`SELECT COUNT(*)::INT AS total FROM equipment_items e JOIN products p ON p.id=e.product_id ${where}`, [
      values[0],
      values[1]
    ])
  ]);
  const total = count.rows[0].total;
  res.json({ equipment: items.rows, page, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

router.post('/admin/equipment', ...adminOnly, async (req, res) => {
  const code = clean(req.body.equipmentCode).toUpperCase(),
    condition = clean(req.body.condition).toUpperCase();
  if (!req.body.productId || code.length < 3 || !equipmentConditions.includes(condition))
    return res.status(422).json({ message: 'Thông tin thiết bị không hợp lệ.' });
  try {
    const result = await query(
      `INSERT INTO equipment_items(product_id,equipment_code,condition,status) VALUES($1,$2,$3,'AVAILABLE') RETURNING id`,
      [req.body.productId, code, condition]
    );
    res.status(201).json({ message: 'Đã thêm thiết bị vào kho.', id: result.rows[0].id });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'Mã thiết bị đã tồn tại.' });
    throw error;
  }
});

router.patch('/admin/equipment/:id', ...adminOnly, async (req, res) => {
  const status = clean(req.body.status).toUpperCase(),
    condition = clean(req.body.condition).toUpperCase();
  if (!equipmentConditions.includes(condition))
    return res.status(422).json({ message: 'Tình trạng thiết bị không hợp lệ.' });
  const result = await withTransaction(async client => {
    const found = await client.query('SELECT * FROM equipment_items WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!found.rowCount) return { status: 404, message: 'Không tìm thấy thiết bị.' };
    const item = found.rows[0];
    if (status === item.status || !status) {
      await client.query('UPDATE equipment_items SET condition=$1 WHERE id=$2', [condition, item.id]);
      return { message: 'Đã cập nhật tình trạng thiết bị.' };
    }
    if (!manualEquipmentStatuses.includes(status))
      return { status: 422, message: 'Trạng thái này do quy trình thuê tự cập nhật.' };
    if (workflowEquipmentStatuses.includes(item.status))
      return {
        status: 409,
        message:
          item.status === 'INSPECTION'
            ? 'Thiết bị đang chờ xử lý biên bản sự cố. Hãy xử lý tại mục Sự cố.'
            : 'Thiết bị đang ở ngoài cửa hàng trong một đơn thuê.'
      };
    await client.query('UPDATE equipment_items SET status=$1,condition=$2 WHERE id=$3', [status, condition, item.id]);
    if (status === 'AVAILABLE') {
      await refreshEquipmentStatus(client, [item.id]);
      return { message: 'Đã đưa thiết bị trở lại kho cho thuê.' };
    }
    const reassigned = await reassignFutureRentalsTx(client, item.id);
    const parts = ['Đã cập nhật thiết bị.'];
    if (reassigned.moved) parts.push(`Đã chuyển ${reassigned.moved} đơn sắp tới sang thiết bị cùng mẫu.`);
    if (reassigned.unresolved.length)
      parts.push(
        `Không còn thiết bị thay thế cho đơn ${reassigned.unresolved.join(', ')} — cần liên hệ khách hoặc hủy đơn.`
      );
    return { message: parts.join(' '), reassigned };
  });
  res.status(result.status || 200).json(result);
});

router.patch('/admin/users/:id/role', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const role = String(req.body.role || '').toUpperCase();
  if (!roles.includes(role)) return res.status(422).json({ message: 'Vai trò không hợp lệ.' });
  if (req.params.id === req.user.id && role !== 'ADMIN')
    return res.status(422).json({ message: 'Bạn không thể tự gỡ quyền quản trị của mình.' });
  const result = await query(
    `UPDATE users SET role=$1 WHERE id=$2
    RETURNING id,full_name AS "fullName",email,phone,role,created_at AS "createdAt"`,
    [role, req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
  res.json({ message: 'Đã cập nhật vai trò.', user: result.rows[0] });
});

export default router;
