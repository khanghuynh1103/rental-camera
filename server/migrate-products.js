import { pool, query, testDatabaseConnection } from './db.js';
import { products } from './products.js';

const categoryNames={camera:'Máy ảnh',lens:'Ống kính',video:'Thiết bị quay',audio:'Âm thanh',light:'Đèn studio',flash:'Đèn flash',accessory:'Phụ kiện'};
const hiddenProducts=new Set([
  'amaran-200x-s',
  'aputure-ls-300d-ii',
  'canon-eos-r8',
  'canon-rf-15-35mm-f2-8-l',
  'godox-sl150iii',
  'gopro-hero13-black',
  'nanlite-forza-60b-ii',
  'nikon-z-24-120mm-f4-s',
  'nikon-z-85mm-f1-8-s',
  'panasonic-lumix-s-50mm-f1-8',
  'sony-fe-24-70mm-f2-8-gm-ii',
  'sony-fe-70-200mm-f2-8-gm-ii',
  'zhiyun-crane-m3s'
]);

try {
  const database=await testDatabaseConnection();
  await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS rental_count INTEGER NOT NULL DEFAULT 0');
  const categoryIds=new Map();

  for(const [slug,name] of Object.entries(categoryNames)){
    const result=await query('INSERT INTO categories (name,slug) VALUES ($1,$2) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id',[name,slug]);
    categoryIds.set(slug,result.rows[0].id);
  }

  for(const product of products){
    const result=await query(`
      INSERT INTO products (slug,category_id,name,brand,format,specification,description,price_per_day,deposit_amount,featured,active,rental_count)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (slug) DO UPDATE SET category_id=EXCLUDED.category_id,name=EXCLUDED.name,brand=EXCLUDED.brand,format=EXCLUDED.format,specification=EXCLUDED.specification,description=EXCLUDED.description,price_per_day=EXCLUDED.price_per_day,deposit_amount=EXCLUDED.deposit_amount,featured=EXCLUDED.featured,active=EXCLUDED.active,rental_count=EXCLUDED.rental_count
      RETURNING id
    `,[product.id,categoryIds.get(product.category),product.name,product.brandLabel,product.format,product.spec,product.description?.[0]||'',product.price,product.deposit,Boolean(product.featured),!hiddenProducts.has(product.id),product.rentalCount||0]);
    const productId=result.rows[0].id;

    await query('DELETE FROM product_images WHERE product_id=$1',[productId]);
    for(const [position,image] of product.images.entries())await query('INSERT INTO product_images (product_id,image_url,position) VALUES ($1,$2,$3)',[productId,image,position]);

    const existing=await query('SELECT COUNT(*)::INT AS count FROM equipment_items WHERE product_id=$1',[productId]);
    for(let index=existing.rows[0].count;index<product.stock;index++){
      const equipmentCode=`${product.category.slice(0,3).toUpperCase()}-${product.id.slice(0,12).toUpperCase()}-${String(index+1).padStart(3,'0')}`;
      await query('INSERT INTO equipment_items (product_id,equipment_code,condition,status) VALUES ($1,$2,$3,$4) ON CONFLICT (equipment_code) DO NOTHING',[productId,equipmentCode,'GOOD','AVAILABLE']);
    }
  }

  const counts=await query('SELECT (SELECT COUNT(*)::INT FROM products) AS products,(SELECT COUNT(*)::INT FROM equipment_items) AS equipment');
  console.log(`Database: ${database.database_name}`);
  console.log(`Sản phẩm PostgreSQL: ${counts.rows[0].products}`);
  console.log(`Thiết bị vật lý PostgreSQL: ${counts.rows[0].equipment}`);
} catch(error){
  console.error('Không thể chuyển sản phẩm sang PostgreSQL:');
  console.error(error.message);
  process.exitCode=1;
} finally {
  await pool.end();
}
