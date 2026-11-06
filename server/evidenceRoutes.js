import { Router } from 'express';
import { requireAuth } from './auth.js';
import { query } from './db.js';

const router = Router();

// Ảnh bằng chứng: quản trị viên xem tất cả, nhân viên chỉ xem đơn được phân công, khách chỉ xem đơn của mình.
router.get('/evidence/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy ảnh bằng chứng.' });
  const result = await query(
    `SELECT i.mime_type, i.data FROM evidence_images i
     JOIN delivery_logs l ON l.id=i.delivery_log_id JOIN rentals r ON r.id=l.rental_id
     WHERE i.id=$1 AND ($2='ADMIN' OR ($2='DELIVERY_STAFF' AND r.assigned_delivery_staff_id=$3) OR ($2='CUSTOMER' AND r.user_id=$3))`,
    [req.params.id, req.user.role, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Không tìm thấy ảnh bằng chứng.' });
  res.set('Cache-Control', 'private, max-age=3600');
  res.type(result.rows[0].mime_type).send(result.rows[0].data);
});

export default router;
