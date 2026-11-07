// Đo thời gian phản hồi cơ bản của các API chính với dữ liệu mẫu lớn. Chỉ chạy trên database phát triển.
// Dữ liệu sinh thêm được đánh dấu và xóa sau khi đo.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { hashPassword } from './database.js';
import { pool, query } from './db.js';
import { addDays, todayVN } from './time.js';

const port = 3198,
  base = `http://localhost:${port}/api`;
const rentalCount = Number(process.env.PERF_RENTALS || 2000),
  rounds = Number(process.env.PERF_ROUNDS || 50);
const email = `perf-${Date.now()}@example.com`;
let server, userId;

const percentile = (sorted, ratio) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];

async function seed() {
  const { hash, salt } = hashPassword('Perfcheck@123');
  userId = (
    await query(
      `INSERT INTO users(full_name,email,phone,password_hash,password_salt,role) VALUES('Dữ liệu đo hiệu năng',$1,'0900000098',$2,$3,'CUSTOMER') RETURNING id`,
      [email, hash, salt]
    )
  ).rows[0].id;
  // Đơn đã hoàn tất trong quá khứ: không giữ lịch nhưng làm lớn các bảng mà truy vấn phải quét.
  await query(
    `WITH generated AS (
       INSERT INTO rentals(rental_code,user_id,start_date,end_date,delivery_method,rental_fee,deposit_amount,total_amount,status,full_name,phone,email,note)
       SELECT 'PERF-' || $4 || '-' || n, $1, $2::DATE - (n % 300) - 3, $2::DATE - (n % 300), 'store', 300000, 1000000, 1300000, 'COMPLETED', 'Dữ liệu đo hiệu năng', '0900000098', $3, 'PERF_CHECK'
       FROM GENERATE_SERIES(1,$5::INT) n RETURNING id
     )
     INSERT INTO rental_items(rental_id,product_id,equipment_item_id,price_per_day)
     SELECT g.id, e.product_id, e.id, 100000 FROM generated g
     CROSS JOIN LATERAL (SELECT id, product_id FROM equipment_items WHERE g.id IS NOT NULL ORDER BY random() LIMIT 1) e`,
    [userId, todayVN(), email, Date.now(), rentalCount]
  );
}

async function cleanup() {
  try {
    if (userId) {
      await query(`DELETE FROM rental_items WHERE rental_id IN (SELECT id FROM rentals WHERE user_id=$1)`, [userId]);
      await query(`DELETE FROM rental_status_history WHERE rental_id IN (SELECT id FROM rentals WHERE user_id=$1)`, [
        userId
      ]);
      await query(`DELETE FROM rentals WHERE user_id=$1`, [userId]);
      await query(`DELETE FROM user_sessions WHERE user_id=$1`, [userId]);
      await query(`DELETE FROM users WHERE id=$1`, [userId]);
    }
  } finally {
    server?.kill('SIGTERM');
    await pool.end();
  }
}

async function measure(name, url, options = {}) {
  const times = [];
  for (let round = 0; round < rounds + 3; round++) {
    const started = performance.now();
    const response = await fetch(base + url, options);
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`${name} trả về ${response.status}`);
    if (round >= 3) times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return {
    name,
    url,
    median: Math.round(percentile(times, 0.5)),
    p95: Math.round(percentile(times, 0.95)),
    max: Math.round(times.at(-1))
  };
}

try {
  await seed();
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), OPENAI_API_KEY: '', TICK_MS: '3600000' },
    stdio: 'ignore'
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${base}/products?limit=1`)).ok) break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@trammayanh.vn', password: 'Admin@123' })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const product = (await (await fetch(`${base}/products?limit=1`)).json()).products[0].id;
  const start = addDays(todayVN(), 30),
    end = addDays(todayVN(), 33);
  const json = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: start, endDate: end })
  };
  const results = [
    await measure('Danh sách sản phẩm', '/products?limit=12'),
    await measure('Lọc sản phẩm theo ngày trống', `/products?limit=12&startDate=${start}&endDate=${end}`),
    await measure('Chi tiết sản phẩm', `/products/${product}`),
    await measure('Kiểm tra lịch một sản phẩm', `/products/${product}/availability`, json),
    await measure('Lịch trống 120 ngày', `/products/${product}/calendar?days=120`),
    await measure('Danh sách đơn (quản trị)', '/admin/rentals', { headers: { Cookie: cookie } }),
    await measure('Dashboard 30 ngày', '/admin/dashboard?range=30', { headers: { Cookie: cookie } })
  ];
  const counts = (
    await query(
      'SELECT (SELECT COUNT(*) FROM rentals)::INT AS rentals,(SELECT COUNT(*) FROM equipment_items)::INT AS equipment'
    )
  ).rows[0];
  const report = { measuredAt: new Date().toISOString(), rounds, ...counts, results };
  if (process.env.PERF_REPORT) fs.writeFileSync(process.env.PERF_REPORT, JSON.stringify(report, null, 2));
  console.log(`Dữ liệu: ${counts.rentals} đơn, ${counts.equipment} thiết bị, ${rounds} lần đo mỗi API`);
  console.table(
    results.map(({ name, median, p95, max }) => ({
      API: name,
      'Trung vị (ms)': median,
      'P95 (ms)': p95,
      'Lớn nhất (ms)': max
    }))
  );
} catch (error) {
  console.error(`Đo hiệu năng thất bại: ${error.message}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
