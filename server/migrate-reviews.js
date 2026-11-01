import { pool, query, testDatabaseConnection } from './db.js';

try {
  const database = await testDatabaseConnection();
  await query(`CREATE TABLE IF NOT EXISTS product_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    liked TEXT NOT NULL DEFAULT '',
    disliked TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rental_id, product_id),
    CHECK (length(trim(liked)) > 0 OR length(trim(disliked)) > 0)
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_product_reviews_product_date ON product_reviews(product_id,created_at DESC)');
  console.log(`Đã tạo bảng đánh giá sản phẩm trong database ${database.database_name}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
