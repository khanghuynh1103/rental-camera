import { Router } from 'express';
import { requireAuth, requireRole } from './auth.js';
import { query, withTransaction } from './db.js';
import { decryptBuffer, encryptBuffer, hashIdNumber } from './identityCrypto.js';
import { httpError, notifyUser, parseEvidenceImages } from './rentalService.js';
import { IDENTITY_CONSENT_VERSION, RULES, validateCccd } from './rules.js';

const router = Router();
const customerOnly = [requireAuth, requireRole('CUSTOMER')],
  adminOnly = [requireAuth, requireRole('ADMIN')];
const clean = value => String(value ?? '').trim();
const SIDES = ['front', 'back', 'selfie'];

const publicRow = row =>
  row && {
    id: row.id,
    status: row.status,
    fullName: row.full_name,
    idLast4: row.id_last4,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at
  };

router.get('/account/identity', ...customerOnly, async (req, res) => {
  const result = await query('SELECT * FROM identity_verifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [
    req.user.id
  ]);
  res.json({ verification: publicRow(result.rows[0]) || null, depositThreshold: RULES.identityDepositThreshold });
});

router.post('/account/identity', ...customerOnly, async (req, res) => {
  const fullName = clean(req.body.fullName),
    idNumber = clean(req.body.idNumber);
  if (req.body.consent !== true)
    return res.status(422).json({ message: 'Bạn cần đồng ý cho phép xử lý dữ liệu CCCD để tiếp tục.' });
  if (fullName.length < 2) return res.status(422).json({ message: 'Vui lòng nhập họ tên đúng như trên CCCD.' });
  if (!validateCccd(idNumber)) return res.status(422).json({ message: 'Số CCCD phải gồm đúng 12 chữ số.' });
  const images = SIDES.map(side => {
    if (!req.body[side]) throw httpError(422, 'Vui lòng tải đủ ảnh mặt trước, mặt sau và ảnh chân dung.');
    return { side, ...parseEvidenceImages([req.body[side]], { required: true })[0] };
  });
  const idHash = hashIdNumber(idNumber);
  try {
    const row = await withTransaction(async client => {
      const created = await client.query(
        `INSERT INTO identity_verifications(user_id,full_name,id_last4,id_hash,consent_at,consent_version)
         VALUES($1,$2,$3,$4,NOW(),$5) RETURNING *`,
        [req.user.id, fullName, idNumber.slice(-4), idHash, IDENTITY_CONSENT_VERSION]
      );
      for (const image of images) {
        const sealed = encryptBuffer(image.data);
        await client.query(
          'INSERT INTO identity_images(verification_id,side,mime_type,iv,auth_tag,ciphertext) VALUES($1,$2,$3,$4,$5,$6)',
          [created.rows[0].id, image.side, image.mimeType, sealed.iv, sealed.authTag, sealed.ciphertext]
        );
      }
      return created.rows[0];
    });
    res.status(201).json({ message: 'Đã gửi hồ sơ xác minh. Cửa hàng sẽ phản hồi sớm.', verification: publicRow(row) });
  } catch (error) {
    if (error.constraint === 'uq_identity_active_user')
      return res.status(409).json({ message: 'Tài khoản đã có hồ sơ đang chờ duyệt hoặc đã được xác minh.' });
    if (error.constraint === 'uq_identity_active_number')
      return res.status(409).json({ message: 'Số CCCD này đã được dùng cho một tài khoản khác.' });
    throw error;
  }
});

// Khách rút hồ sơ đang chờ duyệt: xóa toàn bộ ảnh và thông tin đã gửi.
router.delete('/account/identity', ...customerOnly, async (req, res) => {
  const result = await query(`DELETE FROM identity_verifications WHERE user_id=$1 AND status='PENDING'`, [req.user.id]);
  if (!result.rowCount) return res.status(404).json({ message: 'Không có hồ sơ đang chờ duyệt.' });
  res.json({ message: 'Đã rút hồ sơ và xóa ảnh CCCD.' });
});

router.get('/admin/identity', ...adminOnly, async (req, res) => {
  const status = ['PENDING', 'APPROVED', 'REJECTED'].includes(clean(req.query.status))
    ? clean(req.query.status)
    : 'PENDING';
  const result = await query(
    `SELECT v.id, v.status, v.full_name AS "fullName", v.id_last4 AS "idLast4", v.review_note AS "reviewNote", v.created_at AS "createdAt",
       v.reviewed_at AS "reviewedAt", v.images_purged_at AS "imagesPurgedAt", u.email, u.phone, u.full_name AS "accountName", reviewer.full_name AS "reviewedBy"
     FROM identity_verifications v JOIN users u ON u.id=v.user_id LEFT JOIN users reviewer ON reviewer.id=v.reviewed_by
     WHERE v.status=$1 ORDER BY v.created_at DESC LIMIT 50`,
    [status]
  );
  res.json({ verifications: result.rows });
});

router.get('/admin/identity/:id/images/:side', ...adminOnly, async (req, res) => {
  if (!SIDES.includes(req.params.side)) return res.status(404).json({ message: 'Không tìm thấy ảnh.' });
  const result = await query('SELECT * FROM identity_images WHERE verification_id=$1 AND side=$2', [
    req.params.id,
    req.params.side
  ]);
  if (!result.rowCount)
    return res.status(404).json({ message: 'Không tìm thấy ảnh hoặc ảnh đã được xóa sau khi duyệt.' });
  const image = result.rows[0];
  const data = decryptBuffer({ iv: image.iv, ciphertext: image.ciphertext, authTag: image.auth_tag });
  await query('INSERT INTO identity_access_log(verification_id,admin_id,action) VALUES($1,$2,$3)', [
    req.params.id,
    req.user.id,
    `VIEW_${req.params.side.toUpperCase()}`
  ]);
  res.set('Cache-Control', 'no-store');
  res.type(image.mime_type).send(data);
});

router.patch('/admin/identity/:id', ...adminOnly, async (req, res) => {
  const decision = clean(req.body.status).toUpperCase(),
    note = clean(req.body.note);
  if (!['APPROVED', 'REJECTED'].includes(decision))
    return res.status(422).json({ message: 'Quyết định không hợp lệ.' });
  if (decision === 'REJECTED' && !note)
    return res.status(422).json({ message: 'Vui lòng nhập lý do từ chối để khách bổ sung hồ sơ.' });
  await withTransaction(async client => {
    const found = await client.query('SELECT * FROM identity_verifications WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!found.rowCount) throw httpError(404, 'Không tìm thấy hồ sơ xác minh.');
    const row = found.rows[0];
    if (row.status !== 'PENDING') throw httpError(409, 'Hồ sơ này đã được xử lý.');
    await client.query(
      `UPDATE identity_verifications SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=NOW(),images_purged_at=NOW() WHERE id=$1`,
      [row.id, decision, note || null, req.user.id]
    );
    // Giảm thiểu dữ liệu: duyệt xong là xóa ảnh, chỉ giữ 4 số cuối và kết quả.
    await client.query('DELETE FROM identity_images WHERE verification_id=$1', [row.id]);
    await client.query('INSERT INTO identity_access_log(verification_id,admin_id,action) VALUES($1,$2,$3)', [
      row.id,
      req.user.id,
      decision
    ]);
    await notifyUser(
      client,
      row.user_id,
      'IDENTITY',
      decision === 'APPROVED' ? 'Đã xác minh CCCD thành công' : 'Hồ sơ CCCD chưa được chấp nhận',
      decision === 'APPROVED' ? 'Bạn có thể thuê các thiết bị giá trị cao.' : `Lý do: ${note}. Vui lòng gửi lại hồ sơ.`
    );
  });
  res.json({
    message: decision === 'APPROVED' ? 'Đã duyệt hồ sơ và xóa ảnh CCCD.' : 'Đã từ chối hồ sơ và xóa ảnh CCCD.',
    status: decision
  });
});

export default router;
