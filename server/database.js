// Tiện ích tài khoản: băm mật khẩu bằng scrypt và chuẩn hóa dữ liệu người dùng trả về client.
import crypto from 'node:crypto';

export const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash: crypto.scryptSync(password, salt, 64).toString('hex')
});

export const verifyPassword = (password, user) => {
  const salt = user.passwordSalt ?? user.password_salt,
    hash = user.passwordHash ?? user.password_hash;
  return (
    Boolean(salt && hash) && crypto.timingSafeEqual(crypto.scryptSync(password, salt, 64), Buffer.from(hash, 'hex'))
  );
};

export const publicUser = source => ({
  id: source.id,
  fullName: source.fullName ?? source.full_name,
  email: source.email,
  phone: source.phone || '',
  role: source.role,
  createdAt: source.createdAt ?? source.created_at
});
