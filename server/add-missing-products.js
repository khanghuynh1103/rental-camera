// Thêm vào database các sản phẩm có trong danh sách code nhưng chưa có trong database.
// Chỉ thêm mới, không ghi đè giá, lượt thuê hay trạng thái của sản phẩm đã có; chạy lại không tạo trùng.
import { pathToFileURL } from 'node:url';
import { pool, withTransaction } from './db.js';
import { products } from './products.js';
import { DEFAULT_INCLUDED_ITEMS } from './rules.js';

export async function addMissingProducts() {
  return withTransaction(async client => {
    const added = [];
    for (const product of products) {
      const category = await client.query('SELECT id FROM categories WHERE slug=$1', [product.category]);
      if (!category.rowCount) throw new Error(`Chưa có danh mục ${product.category}.`);
      const inserted = await client.query(
        `INSERT INTO products
           (slug,category_id,name,brand,format,specification,description,price_per_day,deposit_amount,featured,active,included_items)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,TRUE,$10)
         ON CONFLICT (slug) DO NOTHING RETURNING id`,
        [
          product.id,
          category.rows[0].id,
          product.name,
          product.brandLabel,
          product.format,
          product.spec,
          product.description?.[0] || '',
          product.price,
          product.deposit,
          DEFAULT_INCLUDED_ITEMS[product.category] || []
        ]
      );
      if (!inserted.rowCount) continue;
      const productId = inserted.rows[0].id;
      for (const [position, image] of product.images.entries())
        await client.query('INSERT INTO product_images (product_id,image_url,position) VALUES ($1,$2,$3)', [
          productId,
          image,
          position
        ]);
      const prefix = `${product.category.slice(0, 3).toUpperCase()}-${product.id.toUpperCase()}`;
      for (let index = 1; index <= product.stock; index += 1)
        await client.query(
          `INSERT INTO equipment_items (product_id,equipment_code,condition,status) VALUES ($1,$2,'GOOD','AVAILABLE')`,
          [productId, `${prefix}-${String(index).padStart(3, '0')}`]
        );
      added.push(product.id);
    }
    return added;
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const added = await addMissingProducts();
    console.log(`Đã thêm ${added.length} sản phẩm mới${added.length ? `: ${added.join(', ')}` : ''}.`);
  } catch (error) {
    console.error('Không thể thêm sản phẩm:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
