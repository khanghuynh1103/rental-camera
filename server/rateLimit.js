// Giới hạn số lần thử theo khóa (IP + email) trong bộ nhớ tiến trình.
// Đủ cho bản demo; khi chạy nhiều instance cần chuyển sang Redis hoặc bảng PostgreSQL.
const buckets = new Map();

export function createLimiter({ windowMs, max, message }) {
  const hit = key => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return null;
    }
    bucket.count++;
    return bucket.count > max ? Math.ceil((bucket.resetAt - now) / 1000) : null;
  };
  return {
    /** Trả về số giây phải chờ nếu đã vượt giới hạn, ngược lại null. */
    check(key) {
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= Date.now() || bucket.count < max) return null;
      return Math.ceil((bucket.resetAt - Date.now()) / 1000);
    },
    hit,
    reset: key => buckets.delete(key),
    message
  };
}

export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
  message: 'Bạn đã đăng nhập sai quá nhiều lần.'
});
export const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.REGISTER_MAX_PER_HOUR || 20),
  message: 'Bạn đã tạo quá nhiều tài khoản.'
});

export function tooMany(res, limiter, seconds) {
  res.set('Retry-After', String(seconds));
  return res.status(429).json({ message: `${limiter.message} Vui lòng thử lại sau ${Math.ceil(seconds / 60)} phút.` });
}
