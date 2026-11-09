// Thêm thiết bị vật lý để mỗi sản phẩm đang bán có tối thiểu N máy nhận được đơn. Chỉ thêm, không sửa máy đã có;
// chạy lại không tạo thừa. Dùng: node server/ensure-min-stock.js 5
import { pathToFileURL } from 'node:url';
import { pool, withTransaction } from './db.js';
import { UNBOOKABLE_EQUIPMENT_STATUSES } from './rules.js';

export async function ensureMinStock(minimum) {
  return withTransaction(async client => {
    const { rows: products } = await client.query(
      `SELECT p.id, p.slug, c.slug AS category,
         COUNT(e.id) FILTER (WHERE e.status <> ALL($1::VARCHAR[]))::INT AS usable,
         COALESCE(MAX(SUBSTRING(e.equipment_code FROM '-([0-9]+)$')::INT), 0) AS last_number
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN equipment_items e ON e.product_id = p.id
       WHERE p.active
       GROUP BY p.id, c.slug
       ORDER BY p.slug`,
      [UNBOOKABLE_EQUIPMENT_STATUSES]
    );
    let added = 0;
    for (const product of products) {
      const prefix = `${product.category.slice(0, 3).toUpperCase()}-${product.slug.slice(0, 12).toUpperCase()}`;
      for (let index = 1; index <= minimum - product.usable; index += 1) {
        const code = `${prefix}-${String(product.last_number + index).padStart(3, '0')}`;
        await client.query(
          `INSERT INTO equipment_items (product_id, equipment_code, condition, status)
           VALUES ($1, $2, 'GOOD', 'AVAILABLE')`,
          [product.id, code]
        );
        added += 1;
      }
    }
    return { products: products.length, added };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const minimum = Number(process.argv[2]);
  try {
    if (!Number.isInteger(minimum) || minimum < 1 || minimum > 50)
      throw new Error('Số máy tối thiểu phải từ 1 đến 50.');
    const result = await ensureMinStock(minimum);
    console.log(`Đã kiểm tra ${result.products} sản phẩm, thêm ${result.added} thiết bị (tối thiểu ${minimum} máy).`);
  } catch (error) {
    console.error('Không thể bổ sung thiết bị:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
