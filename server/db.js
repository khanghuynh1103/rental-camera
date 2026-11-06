import 'dotenv/config';
import pg from 'pg';

const { Pool, types } = pg;

// Trả cột DATE về đúng chuỗi YYYY-MM-DD thay vì Date theo múi giờ máy chủ,
// tránh lệch một ngày khi server chạy ở UTC.
types.setTypeParser(1082, value => value);

if (!process.env.DATABASE_URL) {
  throw new Error('Thiếu biến DATABASE_URL trong file .env.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.VERCEL ? 2 : 10
});

export function query(text, values = []) {
  return pool.query(text, values);
}

/** Chạy `work(client)` trong một transaction; tự ROLLBACK khi có lỗi. */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function testDatabaseConnection() {
  const result = await query(`
    SELECT
      current_database() AS database_name,
      NOW() AS connected_at
  `);

  return result.rows[0];
}
