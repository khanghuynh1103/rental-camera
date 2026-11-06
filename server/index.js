import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';
import { testDatabaseConnection } from './db.js';
import { runScheduledTasks } from './notificationDelivery.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT) || 3000;
app.use(express.static(path.join(root, 'dist')));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));

try {
  const database = await testDatabaseConnection();
  console.log(`Đã kết nối PostgreSQL: ${database.database_name}`);
} catch (error) {
  console.error('Không thể kết nối PostgreSQL:');
  console.error(error.message);
  process.exit(1);
}

const server = app.listen(port, () => console.log(`Trạm Máy Ảnh đang chạy tại http://localhost:${port}`));
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Cổng ${port} đang được sử dụng. Hãy đóng tiến trình cũ hoặc đặt PORT khác.`);
    process.exit(1);
  }
  throw error;
});

// Chạy nền khi tự host; trên Vercel việc này do Cron gọi /api/cron/tick.
setInterval(
  () => runScheduledTasks().catch(error => console.error('Tác vụ định kỳ lỗi:', error.message)),
  Number(process.env.TICK_MS) || 60000
).unref();
