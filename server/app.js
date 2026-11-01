import express from 'express';
import cookieParser from 'cookie-parser';
import routes from './routes.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());
app.use('/api', routes);
app.use((error, _req, res, next) => {
  void next;
  console.error(error);
  res.status(error.status || 500).json({ message: error.status ? error.message : 'Máy chủ gặp lỗi. Vui lòng thử lại.' });
});

export default app;
