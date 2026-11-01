import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { hashPassword } from './database.js';

const { DEMO_ADMIN_PASSWORD, DEMO_DELIVERY_PASSWORD, DATABASE_URL } = process.env;

if (!DATABASE_URL) throw new Error('Thiếu DATABASE_URL để khởi tạo database.');
if (!DEMO_ADMIN_PASSWORD || !DEMO_DELIVERY_PASSWORD) {
  throw new Error('Cần đặt DEMO_ADMIN_PASSWORD và DEMO_DELIVERY_PASSWORD trên dịch vụ hosting.');
}
if (DEMO_ADMIN_PASSWORD.length < 12 || DEMO_DELIVERY_PASSWORD.length < 12) {
  throw new Error('Mật khẩu demo trên hosting phải có ít nhất 12 ký tự.');
}
if (DEMO_ADMIN_PASSWORD === DEMO_DELIVERY_PASSWORD) {
  throw new Error('Hai tài khoản demo cần dùng mật khẩu khác nhau.');
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

try {
  const schema = await pool.query("SELECT to_regclass('public.products') IS NOT NULL AS exists");
  if (!schema.rows[0].exists) {
    execFileSync(process.execPath, ['server/migrate-schema.js'], { stdio: 'inherit' });
  }

  const productCount = await pool.query('SELECT COUNT(*)::int AS count FROM products');
  if (productCount.rows[0].count === 0) {
    execFileSync(process.execPath, ['server/migrate-products.js'], { stdio: 'inherit' });
  }

  const accounts = [
    { name: 'Quản trị viên', email: 'admin@trammayanh.vn', phone: '0900000000', role: 'ADMIN', password: DEMO_ADMIN_PASSWORD },
    { name: 'Nhân viên giao nhận', email: 'giaonhan@trammayanh.vn', phone: '0900000001', role: 'DELIVERY_STAFF', password: DEMO_DELIVERY_PASSWORD }
  ];

  for (const account of accounts) {
    const { hash, salt } = hashPassword(account.password);
    await pool.query(`INSERT INTO users (full_name, email, phone, password_hash, password_salt, role)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING`,
    [account.name, account.email, account.phone, hash, salt, account.role]);
  }

  console.log('Database đã sẵn sàng cho website công khai.');
} finally {
  await pool.end();
}
