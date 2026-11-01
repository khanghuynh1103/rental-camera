import app from '../server/app.js';

export default function handler(req, res) {
  const route = req.query?.route;
  if (typeof route !== 'string') return res.status(404).json({ message: 'Không tìm thấy API.' });

  const params = new URLSearchParams(req.query);
  params.delete('route');
  req.url = `/api/${route}${params.size ? `?${params}` : ''}`;
  return app(req, res);
}
