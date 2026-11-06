// Gửi email/SMS theo mô hình outbox: trigger trong PostgreSQL đưa mỗi thông báo vào notification_deliveries
// cùng transaction với nghiệp vụ, tiến trình này gửi sau và tự thử lại khi nhà cung cấp lỗi.
import nodemailer from 'nodemailer';
import { query } from './db.js';
import { expireStaleRentals, generateReminders } from './rentalService.js';
import { MAX_DELIVERY_ATTEMPTS, normalizeVnPhone, retryDelayMinutes, smsText } from './rules.js';

const escapeHtml = value =>
  String(value).replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );

let transport;
function smtpTransport() {
  if (!process.env.SMTP_HOST) throw new Error('Thiếu cấu hình SMTP_HOST.');
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
  }
  return transport;
}

async function sendEmail(delivery) {
  const provider = process.env.NOTIFY_EMAIL_PROVIDER || 'log';
  if (provider === 'log') return { provider, simulated: true };
  if (provider !== 'smtp') throw new Error(`Nhà cung cấp email không hỗ trợ: ${provider}`);
  const link = process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/account` : '';
  await smtpTransport().sendMail({
    from: process.env.MAIL_FROM || 'Trạm Máy Ảnh <no-reply@trammayanh.vn>',
    to: delivery.recipient,
    subject: delivery.subject,
    text: [delivery.body, link && `Xem chi tiết: ${link}`].filter(Boolean).join('\n\n'),
    html: `<h2>${escapeHtml(delivery.subject)}</h2><p>${escapeHtml(delivery.body)}</p>${link ? `<p><a href="${escapeHtml(link)}">Xem chi tiết đơn thuê</a></p>` : ''}`
  });
  return { provider };
}

async function sendSms(delivery) {
  const provider = process.env.NOTIFY_SMS_PROVIDER || 'log';
  const to = normalizeVnPhone(delivery.recipient);
  if (!to) throw Object.assign(new Error('Số điện thoại không hợp lệ.'), { permanent: true });
  if (provider === 'log') return { provider, simulated: true };
  if (provider !== 'twilio') throw new Error(`Nhà cung cấp SMS không hỗ trợ: ${provider}`);
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
  if (!sid || !token || !from) throw new Error('Thiếu cấu hình Twilio.');
  const base = process.env.TWILIO_BASE_URL || 'https://api.twilio.com';
  const response = await fetch(`${base}/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ To: to, From: from, Body: smsText(delivery.subject, delivery.body) })
  });
  if (!response.ok) throw new Error(`Twilio trả về ${response.status}`);
  return { provider };
}

async function deliver(delivery) {
  try {
    const result = await (delivery.channel === 'SMS' ? sendSms(delivery) : sendEmail(delivery));
    await query(`UPDATE notification_deliveries SET status=$2,provider=$3,sent_at=NOW(),last_error=NULL WHERE id=$1`, [
      delivery.id,
      result.simulated ? 'SIMULATED' : 'SENT',
      result.provider
    ]);
  } catch (error) {
    const giveUp = error.permanent || delivery.attempts >= MAX_DELIVERY_ATTEMPTS;
    await query(
      `UPDATE notification_deliveries SET status=$2,last_error=$3,next_attempt_at=NOW() + $4::INTERVAL WHERE id=$1`,
      [
        delivery.id,
        giveUp ? 'FAILED' : 'PENDING',
        String(error.message).slice(0, 300),
        `${retryDelayMinutes(delivery.attempts)} minutes`
      ]
    );
  }
}

/** Nhận và gửi các bản ghi đến hạn. SKIP LOCKED cho phép nhiều tiến trình chạy song song mà không gửi trùng. */
export async function dispatchPending({ limit = 20 } = {}) {
  const claimed = await query(
    `
    UPDATE notification_deliveries SET status='SENDING',claimed_at=NOW(),attempts=attempts+1
    WHERE id IN (
      SELECT id FROM notification_deliveries
      WHERE (status='PENDING' AND next_attempt_at<=NOW()) OR (status='SENDING' AND claimed_at<NOW() - INTERVAL '5 minutes')
      ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED
    ) RETURNING *`,
    [limit]
  );
  for (const delivery of claimed.rows) await deliver(delivery);
  return claimed.rowCount;
}

let running = false,
  again = false;
/** Gửi ngay sau khi API trả lời, không chặn người dùng. Lỗi đã được ghi vào bản ghi để thử lại. */
export function kickDispatch() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  dispatchPending()
    .catch(error => console.error('Không gửi được thông báo:', error.message))
    .finally(() => {
      running = false;
      if (again) {
        again = false;
        kickDispatch();
      }
    });
}

/** Việc định kỳ: hủy đơn hết hạn giữ lịch, tạo nhắc hạn trả và gửi hàng đợi. */
export async function runScheduledTasks() {
  const expired = await expireStaleRentals({ force: true });
  await generateReminders();
  const dispatched = await dispatchPending({ limit: 100 });
  return { expired, dispatched };
}
