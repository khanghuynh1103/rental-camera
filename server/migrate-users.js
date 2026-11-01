import { readDatabase } from './database.js';
import { pool, query, testDatabaseConnection } from './db.js';

try {
  const database = await testDatabaseConnection();
  const source = readDatabase();
  let migrated = 0;

  for (const user of source.users || []) {
    const result = await query(`
      INSERT INTO users (
        id,
        full_name,
        email,
        phone,
        password_hash,
        password_salt,
        role,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (email) DO NOTHING
    `, [
      user.id,
      user.fullName,
      user.email.toLowerCase(),
      user.phone || '',
      user.passwordHash,
      user.passwordSalt,
      user.role || 'CUSTOMER',
      user.createdAt || new Date().toISOString()
    ]);

    migrated += result.rowCount;
  }

  const total = await query('SELECT COUNT(*)::int AS count FROM users');
  console.log(`Database: ${database.database_name}`);
  console.log(`Đã nhập thêm ${migrated} tài khoản.`);
  console.log(`Tổng số tài khoản PostgreSQL: ${total.rows[0].count}`);
} catch (error) {
  console.error('Không thể chuyển tài khoản sang PostgreSQL:');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
