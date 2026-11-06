import express from 'express';
import cookieParser from 'cookie-parser';
import { kickDispatch } from './notificationDelivery.js';
import routes from './routes.js';

const app = express();
app.disable('x-powered-by');
// Vercel/Proxy đứng trước Express: lấy đúng IP khách cho giới hạn đăng nhập.
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=()'
  });
  next();
});

// Chỉ các route nộp ảnh bằng chứng được phép gửi body lớn.
const uploadRoute = /^\/api\/(delivery\/tasks\/[^/]+\/status|admin\/rentals\/[^/]+\/(handover|return)|account\/identity)$/;
const largeJson = express.json({ limit: '16mb' }), smallJson = express.json({ limit: '200kb' });
app.use((req, res, next) => (uploadRoute.test(req.path) ? largeJson : smallJson)(req, res, next));
app.use(cookieParser());
// Sau mỗi thao tác ghi, gửi email/SMS đang chờ mà không làm chậm phản hồi.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') res.on('finish', kickDispatch);
  next();
});
app.use('/api', routes);

app.use((error, _req, res, next) => {
  void next;
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Dữ liệu gửi lên quá lớn.' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Dữ liệu gửi lên không hợp lệ.' });
  // Mã định danh sai định dạng (UUID, số…) coi như không tìm thấy.
  if (error.code === '22P02') return res.status(404).json({ message: 'Không tìm thấy dữ liệu yêu cầu.' });
  if (error.code === '23P01') return res.status(409).json({ message: 'Thiết bị đã có lịch thuê khác trong khoảng ngày này.' });
  if (!error.status) console.error(error);
  res.status(error.status || 500).json({ message: error.status ? error.message : 'Máy chủ gặp lỗi. Vui lòng thử lại.' });
});

export default app;
