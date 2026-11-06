import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decryptBuffer, encryptBuffer, hashIdNumber } from '../identityCrypto.js';
import { normalizeVnPhone, requiresIdentity, retryDelayMinutes, smsText, validateCccd } from '../rules.js';

const key = 'a'.repeat(64),
  otherKey = 'b'.repeat(64);

describe('Mã hóa dữ liệu CCCD', () => {
  it('giải mã đúng dữ liệu gốc và bản mã không chứa dữ liệu gốc', () => {
    const data = Buffer.from('anh-cccd-mat-truoc');
    const sealed = encryptBuffer(data, key);
    assert.ok(!sealed.ciphertext.includes(data));
    assert.deepEqual(decryptBuffer(sealed, key), data);
  });
  it('từ chối giải mã khi sai khóa hoặc dữ liệu bị sửa', () => {
    const sealed = encryptBuffer(Buffer.from('du-lieu'), key);
    assert.throws(() => decryptBuffer(sealed, otherKey));
    const tampered = Buffer.from(sealed.ciphertext);
    tampered[0] ^= 1;
    assert.throws(() => decryptBuffer({ ...sealed, ciphertext: tampered }, key));
  });
  it('không xử lý khi chưa cấu hình khóa', () => {
    assert.throws(
      () => encryptBuffer(Buffer.from('x'), ''),
      error => error.status === 503
    );
  });
  it('băm số CCCD ổn định theo khóa và không lộ số gốc', () => {
    const hash = hashIdNumber('079123456789', key);
    assert.equal(hash, hashIdNumber('079123456789', key));
    assert.notEqual(hash, hashIdNumber('079123456789', otherKey));
    assert.ok(!hash.includes('079123456789'));
  });
});

describe('Quy tắc xác minh CCCD', () => {
  it('số CCCD gồm đúng 12 chữ số', () => {
    assert.equal(validateCccd('079123456789'), true);
    assert.equal(validateCccd('07912345678'), false);
    assert.equal(validateCccd('07912345678a'), false);
  });
  it('chỉ yêu cầu với đơn có tiền cọc từ ngưỡng trở lên', () => {
    assert.equal(requiresIdentity(4999999), false);
    assert.equal(requiresIdentity(5000000), true);
  });
});

describe('Gửi SMS và thử lại', () => {
  it('chuẩn hóa số điện thoại Việt Nam', () => {
    assert.equal(normalizeVnPhone('0909 999 996'), '+84909999996');
    assert.equal(normalizeVnPhone('+84909999996'), '+84909999996');
    assert.equal(normalizeVnPhone('84909999996'), '+84909999996');
    assert.equal(normalizeVnPhone('12345'), null);
  });
  it('SMS không dấu và tối đa 160 ký tự', () => {
    assert.equal(smsText('Đơn đã được xác nhận', 'Hẹn gặp bạn'), 'Tram May Anh: Don da duoc xac nhan. Hen gap ban');
    assert.equal(smsText('Tiêu đề', 'á'.repeat(300)).length, 160);
  });
  it('giãn thời gian thử lại, tối đa 60 phút', () => {
    assert.deepEqual([1, 2, 3, 4, 10].map(retryDelayMinutes), [2, 4, 8, 16, 60]);
  });
});
