import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('Thiếu biến DATABASE_URL trong file .env.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export function query(text, values = []) {
  return pool.query(text, values);
}

export async function testDatabaseConnection() {
  const result = await query(`
    SELECT
      current_database() AS database_name,
      NOW() AS connected_at
  `);

  return result.rows[0];
}
