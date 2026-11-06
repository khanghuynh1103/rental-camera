// Mã hóa dữ liệu CCCD. Ảnh được mã hóa AES-256-GCM trước khi ghi vào database;
// số CCCD không lưu nguyên văn, chỉ lưu 4 số cuối và HMAC để phát hiện trùng.
import crypto from 'node:crypto';

function parseKey(value) {
  const text = String(value || '').trim();
  const key = /^[0-9a-f]{64}$/i.test(text) ? Buffer.from(text, 'hex') : Buffer.from(text, 'base64');
  if (key.length !== 32) {
    throw Object.assign(new Error('Chức năng xác minh CCCD chưa được cấu hình khóa mã hóa.'), { status: 503 });
  }
  return key;
}

const deriveKey = (master, purpose) => Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), purpose, 32));

export function encryptBuffer(data, keyValue = process.env.KYC_ENCRYPTION_KEY) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(parseKey(keyValue), 'tma-identity-image'), iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return { iv, ciphertext, authTag: cipher.getAuthTag() };
}

export function decryptBuffer({ iv, ciphertext, authTag }, keyValue = process.env.KYC_ENCRYPTION_KEY) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(parseKey(keyValue), 'tma-identity-image'), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function hashIdNumber(idNumber, keyValue = process.env.KYC_ENCRYPTION_KEY) {
  return crypto
    .createHmac('sha256', deriveKey(parseKey(keyValue), 'tma-identity-number'))
    .update(String(idNumber))
    .digest('hex');
}
