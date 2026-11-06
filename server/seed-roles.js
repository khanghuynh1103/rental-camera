import { hashPassword } from './database.js';
import { pool, query, testDatabaseConnection } from './db.js';

const accounts = [
  {
    fullName: 'Quản trị viên',
    email: 'admin@trammayanh.vn',
    phone: '0900000000',
    password: 'Admin@123',
    role: 'ADMIN'
  },
  {
    fullName: 'Nhân viên giao nhận',
    email: 'giaonhan@trammayanh.vn',
    phone: '0900000001',
    password: 'Giaonhan@123',
    role: 'DELIVERY_STAFF'
  }
];

try {
  await testDatabaseConnection();
  for (const account of accounts) {
    const password = hashPassword(account.password);
    await query(
      `INSERT INTO users (full_name,email,phone,password_hash,password_salt,role)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (email) DO UPDATE SET full_name=EXCLUDED.full_name,phone=EXCLUDED.phone,
        password_hash=EXCLUDED.password_hash,password_salt=EXCLUDED.password_salt,role=EXCLUDED.role`,
      [account.fullName, account.email, account.phone, password.hash, password.salt, account.role]
    );
  }
  console.log('Đã tạo/cập nhật tài khoản quản trị và giao nhận mẫu.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
