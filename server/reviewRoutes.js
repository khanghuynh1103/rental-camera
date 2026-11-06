import { Router } from 'express';
import { query } from './db.js';
import { currentUser, requireAuth, requireRole } from './auth.js';
import { getProductBySlug } from './productRepository.js';

const router = Router();

router.get('/products/:id/reviews', async (req, res) => {
  const product = await getProductBySlug(req.params.id);
  if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
  const [reviews, summary, user] = await Promise.all([
    query(
      `SELECT pr.id,pr.rating,pr.liked,pr.disliked,pr.created_at AS "createdAt",u.full_name AS "author"
      FROM product_reviews pr JOIN users u ON u.id=pr.user_id
      WHERE pr.product_id=$1 ORDER BY pr.created_at DESC LIMIT 50`,
      [product.databaseId]
    ),
    query(
      'SELECT COUNT(*)::INT AS count,ROUND(AVG(rating)::NUMERIC,1)::FLOAT AS average FROM product_reviews WHERE product_id=$1',
      [product.databaseId]
    ),
    currentUser(req)
  ]);
  let eligibleRentals = [];
  if (user?.role === 'CUSTOMER') {
    const result = await query(
      `SELECT DISTINCT r.id,r.rental_code AS code FROM rentals r
      JOIN rental_items ri ON ri.rental_id=r.id
      WHERE r.user_id=$1 AND r.status='COMPLETED' AND ri.product_id=$2
      AND NOT EXISTS (SELECT 1 FROM product_reviews pr WHERE pr.rental_id=r.id AND pr.product_id=$2)
      ORDER BY r.id`,
      [user.id, product.databaseId]
    );
    eligibleRentals = result.rows;
  }
  res.json({ reviews: reviews.rows, count: summary.rows[0].count, average: summary.rows[0].average, eligibleRentals });
});

router.post('/products/:id/reviews', requireAuth, requireRole('CUSTOMER'), async (req, res) => {
  const product = await getProductBySlug(req.params.id);
  if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
  const rating = Number(req.body.rating);
  const liked = String(req.body.liked || '').trim();
  const disliked = String(req.body.disliked || '').trim();
  const rentalId = String(req.body.rentalId || '');
  if (
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    (!liked && !disliked) ||
    liked.length > 1000 ||
    disliked.length > 1000 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rentalId)
  ) {
    return res
      .status(422)
      .json({ message: 'Vui lòng chọn 1–5 sao và nhập nhận xét hợp lệ (tối đa 1000 ký tự mỗi ô).' });
  }
  const eligible = await query(
    `SELECT 1 FROM rentals r JOIN rental_items ri ON ri.rental_id=r.id
    WHERE r.id=$1 AND r.user_id=$2 AND r.status='COMPLETED' AND ri.product_id=$3`,
    [rentalId, req.user.id, product.databaseId]
  );
  if (!eligible.rowCount)
    return res.status(403).json({ message: 'Bạn chỉ có thể đánh giá sản phẩm sau khi hoàn tất đơn thuê.' });
  const saved = await query(
    `INSERT INTO product_reviews(product_id,rental_id,user_id,rating,liked,disliked)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (rental_id,product_id) DO NOTHING RETURNING id`,
    [product.databaseId, rentalId, req.user.id, rating, liked, disliked]
  );
  if (!saved.rowCount) return res.status(409).json({ message: 'Đơn thuê này đã được đánh giá.' });
  res.status(201).json({ message: 'Cảm ơn bạn đã đánh giá sản phẩm.', id: saved.rows[0].id });
});

export default router;
