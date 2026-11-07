// Lệnh build trên Vercel. Với bản production, nâng cấp schema database trước rồi mới build giao diện.
// Migration idempotent (chạy lại nhiều lần không sao); nếu lỗi thì build dừng và Vercel giữ nguyên bản đang chạy.
import { execFileSync } from 'node:child_process';

const run = (command, args, env = process.env) => execFileSync(command, args, { stdio: 'inherit', env });

if (process.env.VERCEL_ENV === 'production' && process.env.DATABASE_URL) {
  console.log('Nâng cấp schema database production...');
  // Dùng kết nối trực tiếp (không qua pooler) cho các lệnh DDL nếu có.
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  run(process.execPath, ['server/migrate-schema.js'], { ...process.env, DATABASE_URL: databaseUrl });
} else {
  console.log('Bỏ qua migration (không phải production hoặc thiếu DATABASE_URL).');
}

run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
