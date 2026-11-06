// Kiểm thử tích hợp toàn bộ vòng đời đơn thuê: gọi REST API thật và đối chiếu dữ liệu PostgreSQL.
// Chỉ chạy trên database phát triển/thử nghiệm. Dữ liệu kiểm thử được dọn sau khi chạy.
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { hashPassword } from './database.js';
import { pool, query } from './db.js';
import { addDays, todayVN } from './time.js';

const port = 3199,
  base = `http://localhost:${port}/api`;
const stamp = Date.now(),
  password = 'Workflow@123';
const emails = {
  a: `workflow-a-${stamp}@example.com`,
  b: `workflow-b-${stamp}@example.com`,
  staff2: `workflow-staff-${stamp}@example.com`
};
const today = todayVN(),
  day = n => addDays(today, n);
const image =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKAA/9k=';
const results = [];
const smtpPort = 3198,
  smsPort = 3197,
  cronSecret = 'workflow-cron-secret';
const inbox = [],
  smsOutbox = [];
let smsFailures = 0,
  smtpServer,
  smsServer;

// Máy chủ SMTP tối giản để kiểm tra đường gửi email thật mà không cần tài khoản nhà cung cấp.
function startFakeSmtp() {
  smtpServer = net.createServer(socket => {
    let buffer = '',
      inData = false,
      mail = { to: '', raw: '' };
    socket.write('220 fake ESMTP\r\n');
    socket.on('error', () => {});
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      let index;
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            inbox.push(mail);
            mail = { to: '', raw: '' };
            socket.write('250 OK\r\n');
          } else mail.raw += `${line}\n`;
          continue;
        }
        const command = line.slice(0, 4).toUpperCase();
        if (command === 'RCPT') {
          mail.to = line.match(/<(.+)>/)?.[1] || '';
          socket.write('250 OK\r\n');
        } else if (command === 'DATA') {
          inData = true;
          socket.write('354 go\r\n');
        } else if (command === 'QUIT') {
          socket.end('221 bye\r\n');
        } else socket.write('250 OK\r\n');
      }
    });
  });
  return new Promise(resolve => smtpServer.listen(smtpPort, '127.0.0.1', resolve));
}

// API Twilio giả: nhận tin, có thể giả lập lỗi để kiểm tra cơ chế thử lại.
function startFakeSms() {
  smsServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      if (smsFailures > 0) {
        smsFailures--;
        res.writeHead(503).end('{}');
        return;
      }
      smsOutbox.push(Object.fromEntries(new URLSearchParams(body)));
      res.writeHead(201, { 'Content-Type': 'application/json' }).end('{}');
    });
  });
  return new Promise(resolve => smsServer.listen(smsPort, '127.0.0.1', resolve));
}

async function waitFor(condition, name) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await condition()) {
      results.push(name);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${name}: hết thời gian chờ`);
}
let server,
  serverError = '';
const created = { products: [], users: [] };

function check(condition, name, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  results.push(name);
}

async function request(path, options = {}, cookie = '') {
  const response = await fetch(base + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...options.headers }
  });
  const type = response.headers.get('content-type') || '';
  let data;
  if (type.includes('application/json')) data = await response.json();
  else data = { bytes: (await response.arrayBuffer()).byteLength, type };
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

async function ok(path, options = {}, cookie = '') {
  const response = await request(path, options, cookie);
  if (response.status < 200 || response.status >= 300)
    throw new Error(
      `${options.method || 'GET'} ${path} trả về ${response.status}: ${response.data.message || 'Không rõ lỗi'}`
    );
  return response;
}

async function expectStatus(status, name, path, options = {}, cookie = '') {
  const response = await request(path, options, cookie);
  check(
    response.status === status,
    name,
    `mong đợi ${status}, nhận ${response.status} (${response.data.message || ''})`
  );
  return response;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });
const rentalBody = (productIds, startDate, endDate, extra = {}) => ({
  productIds,
  startDate,
  endDate,
  fullName: 'Khách kiểm thử',
  phone: '0909999996',
  email: emails.a,
  deliveryMethod: 'delivery',
  address: 'Địa chỉ kiểm thử tự động',
  deliveryTime: '08:00 – 11:00',
  returnTime: '17:00 – 20:00',
  note: `WORKFLOW_TEST_${stamp}`,
  paymentMethod: 'online',
  ...extra
});
const fullChecklist = (items, overrides = {}) =>
  items.map(item => ({ rentalItemId: item.id, missing: [], condition: 'GOOD', ...(overrides[item.slug] || {}) }));

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${base}/products?limit=1`);
      if (response.ok) return;
    } catch (error) {
      if (attempt === 59) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Server kiểm thử không khởi động kịp thời.');
}

async function createFixtures() {
  const category = await query(`SELECT id FROM categories WHERE slug='camera'`);
  const make = async (suffix, price, deposit, items) => {
    const slug = `workflow-${suffix}-${stamp}`;
    const product = await query(
      `INSERT INTO products(slug,category_id,name,brand,format,specification,price_per_day,deposit_amount,included_items)
      VALUES($1,$2,$3,'Test','Mirrorless','Thiết bị kiểm thử',$4,$5,$6) RETURNING id`,
      [slug, category.rows[0].id, `Thiết bị kiểm thử ${suffix}`, price, deposit, items]
    );
    await query(
      `INSERT INTO equipment_items(product_id,equipment_code,condition,status) VALUES($1,$2,'GOOD','AVAILABLE')`,
      [product.rows[0].id, `TEST-${suffix}-${stamp}`.toUpperCase()]
    );
    created.products.push(product.rows[0].id);
    return slug;
  };
  const { hash, salt } = hashPassword(password);
  const staff = await query(
    `INSERT INTO users(full_name,email,phone,password_hash,password_salt,role) VALUES('Nhân viên kiểm thử 2',$1,'0900000099',$2,$3,'DELIVERY_STAFF') RETURNING id`,
    [emails.staff2, hash, salt]
  );
  created.users.push(staff.rows[0].id);
  return {
    camera: await make('camera', 100000, 1000000, ['Thân máy', 'Pin', 'Bộ sạc']),
    lens: await make('lens', 50000, 500000, ['Ống kính', 'Nắp trước']),
    pricey: await make('pricey', 500000, 6000000, ['Thân máy'])
  };
}

async function cleanup() {
  try {
    const users = await query('SELECT id FROM users WHERE email = ANY($1::TEXT[])', [Object.values(emails)]);
    const ids = [...new Set([...users.rows.map(row => row.id), ...created.users])];
    // Xóa tường minh theo thứ tự khóa ngoại (database cũ có thể không có ON DELETE CASCADE).
    const rentals = (
      await query(
        'SELECT id FROM rentals WHERE user_id = ANY($1::UUID[]) OR id IN (SELECT rental_id FROM rental_items WHERE product_id = ANY($2::UUID[]))',
        [ids, created.products]
      )
    ).rows.map(row => row.id);
    for (const statement of [
      'DELETE FROM evidence_images WHERE delivery_log_id IN (SELECT id FROM delivery_logs WHERE rental_id = ANY($1::UUID[]))',
      'DELETE FROM invoices WHERE rental_id = ANY($1::UUID[])',
      'DELETE FROM extra_charges WHERE rental_id = ANY($1::UUID[])',
      'DELETE FROM rental_incidents WHERE rental_id = ANY($1::UUID[])',
      'DELETE FROM delivery_logs WHERE rental_id = ANY($1::UUID[])',
      'DELETE FROM rental_extensions WHERE rental_id = ANY($1::UUID[])',
      'DELETE FROM payments WHERE rental_id = ANY($1::UUID[])',
      'DELETE FROM rental_status_history WHERE rental_id = ANY($1::UUID[])',
      'DELETE FROM notifications WHERE rental_id = ANY($1::UUID[])',
      'DELETE FROM product_reviews WHERE rental_id = ANY($1::UUID[])',
      'DELETE FROM rental_items WHERE rental_id = ANY($1::UUID[])',
      'DELETE FROM rentals WHERE id = ANY($1::UUID[])'
    ])
      await query(statement, [rentals]);
    await query('DELETE FROM equipment_items WHERE product_id = ANY($1::UUID[])', [created.products]);
    await query('DELETE FROM product_images WHERE product_id = ANY($1::UUID[])', [created.products]);
    await query('DELETE FROM products WHERE id = ANY($1::UUID[])', [created.products]);
    await query('DELETE FROM user_sessions WHERE user_id = ANY($1::UUID[])', [ids]);
    await query('DELETE FROM notifications WHERE user_id = ANY($1::UUID[])', [ids]);
    await query('DELETE FROM users WHERE id = ANY($1::UUID[])', [ids]);
  } finally {
    if (server && !server.killed) server.kill('SIGTERM');
    smtpServer?.close();
    smsServer?.close();
    await pool.end();
  }
}

const rentalRow = id =>
  query(
    `SELECT r.*, p.status AS payment_status FROM rentals r LEFT JOIN payments p ON p.rental_id=r.id WHERE r.id=$1`,
    [id]
  ).then(result => result.rows[0]);
const equipmentStatus = slug =>
  query(`SELECT e.status FROM equipment_items e JOIN products p ON p.id=e.product_id WHERE p.slug=$1`, [slug]).then(
    result => result.rows[0].status
  );

try {
  const slugs = await createFixtures();
  await startFakeSmtp();
  await startFakeSms();
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      OPENAI_API_KEY: '',
      EXPIRE_THROTTLE_MS: '0',
      LOGIN_MAX_ATTEMPTS: '3',
      KYC_ENCRYPTION_KEY: 'c'.repeat(64),
      CRON_SECRET: cronSecret,
      APP_URL: 'http://localhost:5173',
      NOTIFY_EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtpPort),
      SMTP_USER: '',
      MAIL_FROM: 'Test <test@example.com>',
      NOTIFY_SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM: '+15005550006',
      TWILIO_BASE_URL: `http://127.0.0.1:${smsPort}`
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', chunk => {
    serverError += chunk.toString();
  });
  await waitForServer();
  check(!serverError.includes('EADDRINUSE'), 'Khởi động server kiểm thử');

  /* ---------------- Khách vãng lai, xác thực, phân quyền ---------------- */
  const publicProducts = await ok('/products?limit=24');
  check(publicProducts.data.products.length > 0, 'API sản phẩm công khai');
  const chat = await ok('/chat/recommend', json('POST', { message: 'Tìm máy ảnh chụp chân dung' }));
  check(chat.data.recommendations.length > 0, 'Trợ lý gợi ý thiết bị từ kho');
  const priceRange = await ok('/chat/recommend', json('POST', { message: 'có máy trên 500k mà dưới 700k ko' }));
  check(
    priceRange.data.recommendations.every(item => item.price > 500000 && item.price < 700000),
    'Trợ lý lọc đúng khoảng giá'
  );
  const guestDetail = await ok(`/products/${slugs.camera}`);
  check(guestDetail.data.product.included.includes('Pin'), 'Khách vãng lai xem được chi tiết và bộ phụ kiện');
  const calendar = await ok(`/products/${slugs.camera}/calendar?days=14`);
  check(calendar.data.days.length === 14 && calendar.data.days[0].available === 1, 'Lịch trống theo ngày');
  await expectStatus(
    422,
    'Từ chối ngày thuê trong quá khứ',
    `/products/${slugs.camera}/availability`,
    json('POST', { startDate: day(-1), endDate: day(1) })
  );
  await expectStatus(401, 'Chặn người chưa đăng nhập vào quản trị', '/admin/dashboard?range=7');
  await expectStatus(
    401,
    'Chặn khách vãng lai tạo đơn',
    '/rentals',
    json('POST', rentalBody([slugs.camera], day(1), day(2)))
  );
  const victim = `nobody-${stamp}@example.com`;
  for (let attempt = 0; attempt < 3; attempt++)
    await expectStatus(
      401,
      `Sai mật khẩu lần ${attempt + 1}`,
      '/auth/login',
      json('POST', { email: victim, password: 'Sai@1234' })
    );
  await expectStatus(
    429,
    'Giới hạn số lần đăng nhập sai',
    '/auth/login',
    json('POST', { email: victim, password: 'Sai@1234' })
  );

  const a = (
    await ok(
      '/auth/register',
      json('POST', { fullName: 'Khách A kiểm thử', phone: '0909999996', email: emails.a, password })
    )
  ).cookie;
  const b = (
    await ok(
      '/auth/register',
      json('POST', { fullName: 'Khách B kiểm thử', phone: '0909999997', email: emails.b, password })
    )
  ).cookie;
  check(Boolean(a && b), 'Đăng ký hai khách hàng');
  await expectStatus(403, 'Khách hàng không vào được quản trị', '/admin/dashboard?range=7', {}, a);
  const admin = (await ok('/auth/login', json('POST', { email: 'admin@trammayanh.vn', password: 'Admin@123' }))).cookie;
  const staff1 = (await ok('/auth/login', json('POST', { email: 'giaonhan@trammayanh.vn', password: 'Giaonhan@123' })))
    .cookie;
  const staff2 = (await ok('/auth/login', json('POST', { email: emails.staff2, password }))).cookie;
  await expectStatus(403, 'Nhân viên giao nhận không vào được quản trị', '/admin/products', {}, staff1);

  /* ---------------- Đặt thuê nhiều thiết bị và chống trùng lịch ---------------- */
  const r1 = (await ok('/rentals', json('POST', rentalBody([slugs.camera, slugs.lens], today, day(5))), a)).data.rental;
  check(
    r1.items.length === 2 && r1.rentalFee === 150000 * 6 && r1.deposit === 1500000,
    'Tạo đơn nhiều thiết bị, tính đúng tiền thuê và cọc'
  );
  await expectStatus(
    409,
    'Chặn đặt trùng lịch cùng thiết bị',
    '/rentals',
    json('POST', rentalBody([slugs.camera], day(2), day(3), { email: emails.b })),
    b
  );
  await expectStatus(
    409,
    'Chặn đặt ngay sau đơn khác khi chưa đủ ngày đệm kiểm tra',
    '/rentals',
    json('POST', rentalBody([slugs.camera], day(6), day(6), { email: emails.b })),
    b
  );
  const overlapInDb = await query(
    `INSERT INTO rental_items(rental_id,product_id,equipment_item_id,price_per_day)
      SELECT $1, ri.product_id, ri.equipment_item_id, 1 FROM rental_items ri WHERE ri.rental_id=$1 LIMIT 1`,
    [r1.id]
  ).then(
    () => 'inserted',
    error => error.code
  );
  check(
    overlapInDb === '23P01',
    'Ràng buộc EXCLUDE trong PostgreSQL chặn trùng lịch kể cả khi bỏ qua API',
    overlapInDb
  );
  const r2 = (
    await ok(
      '/rentals',
      json(
        'POST',
        rentalBody([slugs.camera], day(9), day(10), {
          email: emails.b,
          deliveryMethod: 'store',
          paymentMethod: 'handover'
        })
      ),
      b
    )
  ).data.rental;
  check(Boolean(r2.id), 'Khách B đặt được lịch kế tiếp sau ngày đệm');

  /* ---------------- Thanh toán và duyệt đơn ---------------- */
  await expectStatus(
    409,
    'Không duyệt đơn online khi khách chưa thanh toán',
    `/admin/rentals/${r1.id}/status`,
    json('PATCH', { status: 'CONFIRMED' }),
    admin
  );
  const paid = await ok(`/rentals/${r1.id}/payment`, { method: 'POST' }, a);
  check(
    paid.data.rental.paymentStatus === 'PAID_SIMULATED' && paid.data.rental.paidAmount === 900000,
    'Thanh toán online chỉ gồm tiền thuê, không gồm cọc'
  );
  await expectStatus(409, 'Chặn thanh toán lặp lại', `/rentals/${r1.id}/payment`, { method: 'POST' }, a);
  await expectStatus(
    404,
    'Khách khác không thanh toán được đơn của người khác',
    `/rentals/${r1.id}/payment`,
    { method: 'POST' },
    b
  );
  await ok(
    `/admin/rentals/${r1.id}/status`,
    json('PATCH', { status: 'CONFIRMED', note: 'Duyệt bởi kiểm thử tự động' }),
    admin
  );
  check((await equipmentStatus(slugs.camera)) === 'RESERVED', 'Thiết bị chuyển sang RESERVED sau khi duyệt');
  await expectStatus(
    409,
    'Quản trị viên không bỏ qua được bước giao nhận có ảnh',
    `/admin/rentals/${r1.id}/status`,
    json('PATCH', { status: 'DELIVERING' }),
    admin
  );

  /* ---------------- Gia hạn (mục 6.4) ---------------- */
  await query('UPDATE rentals SET end_date=$2 WHERE id=$1', [r1.id, day(2)]);
  await expectStatus(
    409,
    'Chặn yêu cầu gia hạn khi còn dưới 3 ngày',
    `/account/rentals/${r1.id}/extensions`,
    json('POST', { requestedEndDate: day(4) }),
    a
  );
  await query('UPDATE rentals SET end_date=$2 WHERE id=$1', [r1.id, day(5)]);
  const options = await ok(`/account/rentals/${r1.id}/extension-options`, {}, a);
  check(
    options.data.maxEndDate === day(7) && options.data.nextBookingStart === day(9),
    'Gợi ý ngày gia hạn tối đa trước đơn kế tiếp',
    JSON.stringify(options.data)
  );
  await expectStatus(
    409,
    'Chặn gia hạn chồng lên lịch của khách khác',
    `/account/rentals/${r1.id}/extensions`,
    json('POST', { requestedEndDate: day(9) }),
    a
  );
  const extensionId = (
    await ok(
      `/account/rentals/${r1.id}/extensions`,
      json('POST', { requestedEndDate: day(7), reason: 'Kiểm thử gia hạn hai ngày' }),
      a
    )
  ).data.id;
  await expectStatus(
    409,
    'Mỗi đơn chỉ có một yêu cầu gia hạn chờ duyệt',
    `/account/rentals/${r1.id}/extensions`,
    json('POST', { requestedEndDate: day(6) }),
    a
  );
  const approved = await ok(`/admin/extensions/${extensionId}`, json('PATCH', { status: 'APPROVED' }), admin);
  check(approved.data.extraAmount === 300000, 'Duyệt gia hạn và tính phí 2 ngày × 150.000đ');

  /* ---------------- Giao nhận tận nơi ---------------- */
  const staffList = await ok('/admin/delivery-staff', {}, admin);
  await ok(
    `/admin/rentals/${r1.id}/assignment`,
    json('PATCH', { staffId: staffList.data.staff.find(item => item.email === 'giaonhan@trammayanh.vn').id }),
    admin
  );
  await expectStatus(
    404,
    'Nhân viên không được phân công không xem được nhiệm vụ',
    `/delivery/tasks/${r1.id}`,
    {},
    staff2
  );
  await expectStatus(
    404,
    'Nhân viên không được phân công không cập nhật được nhiệm vụ',
    `/delivery/tasks/${r1.id}/status`,
    json('PATCH', { status: 'DELIVERING' }),
    staff2
  );
  await expectStatus(
    409,
    'Nhân viên không nhảy cóc bước giao nhận',
    `/delivery/tasks/${r1.id}/status`,
    json('PATCH', { status: 'RENTING', images: [image] }),
    staff1
  );
  await ok(`/delivery/tasks/${r1.id}/status`, json('PATCH', { status: 'DELIVERING' }), staff1);
  const task = (await ok(`/delivery/tasks/${r1.id}`, {}, staff1)).data.task;
  check(
    task.items.length === 2 && task.collectOnHandover === 1500000,
    'Nhân viên thấy danh sách thiết bị và số tiền cọc cần thu'
  );
  await expectStatus(
    422,
    'Từ chối bàn giao khi thiếu ảnh bằng chứng',
    `/delivery/tasks/${r1.id}/status`,
    json('PATCH', { status: 'RENTING', items: fullChecklist(task.items) }),
    staff1
  );
  await expectStatus(
    422,
    'Từ chối bàn giao khi bộ thiết bị thiếu phụ kiện',
    `/delivery/tasks/${r1.id}/status`,
    json('PATCH', {
      status: 'RENTING',
      images: [image],
      items: fullChecklist(task.items, { [slugs.camera]: { missing: ['Pin'] } })
    }),
    staff1
  );
  await expectStatus(
    422,
    'Từ chối ảnh sai định dạng',
    `/delivery/tasks/${r1.id}/status`,
    json('PATCH', { status: 'RENTING', images: ['data:text/plain;base64,SGVsbG8='], items: fullChecklist(task.items) }),
    staff1
  );
  await ok(
    `/delivery/tasks/${r1.id}/status`,
    json('PATCH', { status: 'RENTING', images: [image, image], items: fullChecklist(task.items), note: 'Đã bàn giao' }),
    staff1
  );
  const afterHandover = await rentalRow(r1.id);
  check(
    afterHandover.status === 'RENTING' && afterHandover.deposit_status === 'HELD',
    'Bàn giao thành công, tiền cọc được giữ'
  );
  check((await equipmentStatus(slugs.camera)) === 'RENTED', 'Thiết bị chuyển sang RENTED');

  const detailA = (await ok(`/account/rentals/${r1.id}`, {}, a)).data.rental;
  const handoverLog = detailA.logs.find(log => log.action === 'RENTING');
  check(
    handoverLog?.images.length === 2 && handoverLog.checklist.length === 2,
    'Khách xem được nhật ký bàn giao kèm ảnh và checklist'
  );
  const evidencePath = handoverLog.images[0].replace('/api', '');
  check((await request(evidencePath, {}, a)).data.bytes > 0, 'Khách tải được ảnh bằng chứng của đơn mình');
  check((await request(evidencePath, {}, admin)).data.bytes > 0, 'Quản trị viên xem được ảnh bằng chứng');
  await expectStatus(404, 'Khách khác không xem được ảnh bằng chứng', evidencePath, {}, b);
  await expectStatus(404, 'Nhân viên không được phân công không xem được ảnh', evidencePath, {}, staff2);
  await expectStatus(404, 'Khách khác không xem được chi tiết đơn', `/account/rentals/${r1.id}`, {}, b);

  const future = await ok(
    `/products/${slugs.camera}/availability`,
    json('POST', { startDate: day(12), endDate: day(13) })
  );
  check(future.data.available === true, 'Thiết bị đang cho thuê vẫn nhận đặt cho ngày trống trong tương lai');

  /* ---------------- Thu hồi trễ hạn, sự cố và quyết toán cọc ---------------- */
  await ok(`/delivery/tasks/${r1.id}/status`, json('PATCH', { status: 'RETURNING' }), staff1);
  await query('UPDATE rentals SET start_date=$2,end_date=$3 WHERE id=$1', [r1.id, day(-4), day(-2)]);
  const dashboardOverdue = await ok('/admin/dashboard?range=30', {}, admin);
  check(
    dashboardOverdue.data.operations.overdue.some(item => item.id === r1.id && item.lateDays === 2),
    'Dashboard liệt kê đơn quá hạn'
  );
  const returnItems = fullChecklist(task.items, { [slugs.camera]: { missing: ['Pin'] } });
  await expectStatus(
    422,
    'Bắt buộc mô tả khi thiết bị có bất thường',
    `/delivery/tasks/${r1.id}/status`,
    json('PATCH', { status: 'RETURNED', images: [image], items: returnItems }),
    staff1
  );
  const returned = await ok(
    `/delivery/tasks/${r1.id}/status`,
    json('PATCH', { status: 'RETURNED', images: [image], items: returnItems, note: 'Thiếu pin máy ảnh' }),
    staff1
  );
  check(
    returned.data.status === 'INSPECTING' && returned.data.lateDays === 2,
    'Thu hồi trễ 2 ngày, đơn chuyển sang kiểm tra sự cố'
  );
  check(
    (await equipmentStatus(slugs.camera)) === 'INSPECTION' && (await equipmentStatus(slugs.lens)) === 'AVAILABLE',
    'Chỉ thiết bị có sự cố bị giữ lại kiểm tra'
  );
  const lateCharge = await query(`SELECT amount FROM extra_charges WHERE rental_id=$1 AND charge_type='LATE_RETURN'`, [
    r1.id
  ]);
  check(
    Number(lateCharge.rows[0]?.amount) === 450000,
    'Tính phí trả muộn 150% × 2 ngày',
    String(lateCharge.rows[0]?.amount)
  );

  const incident = (await ok('/admin/incidents', {}, admin)).data.incidents.find(item => item.rentalId === r1.id);
  check(
    incident?.incidentType === 'MISSING_ACCESSORIES' &&
      incident.missingItems.includes('Pin') &&
      incident.images.length === 1,
    'Biên bản sự cố có phụ kiện thiếu và ảnh'
  );
  const resolved = await ok(
    `/admin/incidents/${incident.id}`,
    json('PATCH', { resolution: 'Thay pin mới', feeAmount: 150000, equipmentOutcome: 'AVAILABLE' }),
    admin
  );
  check(
    resolved.data.settlement?.deducted === 900000 && resolved.data.settlement.refund === 600000,
    'Quyết toán: trừ 900.000đ phí vào cọc, hoàn 600.000đ',
    JSON.stringify(resolved.data.settlement)
  );
  const settled = await rentalRow(r1.id);
  check(
    settled.status === 'COMPLETED' && settled.deposit_status === 'PARTIALLY_REFUNDED',
    'Đơn hoàn tất sau khi xử lý sự cố'
  );
  const charges = await query(`SELECT payment_status FROM extra_charges WHERE rental_id=$1`, [r1.id]);
  check(
    charges.rows.length === 3 && charges.rows.every(row => row.payment_status === 'SETTLED_BY_DEPOSIT'),
    'Các khoản gia hạn, trễ hạn, sự cố được khấu trừ vào cọc'
  );
  const invoices = await query(
    `SELECT invoice_type, total_amount FROM invoices WHERE rental_id=$1 ORDER BY issued_at`,
    [r1.id]
  );
  check(
    invoices.rows.map(row => `${row.invoice_type}:${row.total_amount}`).join(',') === 'RENTAL:900000,SETTLEMENT:900000',
    'Hóa đơn tách riêng tiền thuê và khấu trừ quyết toán'
  );
  check((await equipmentStatus(slugs.camera)) === 'AVAILABLE', 'Thiết bị trở lại kho sau xử lý sự cố');

  /* ---------------- Đánh giá sau thuê ---------------- */
  const reviewPath = `/products/${slugs.camera}/reviews`;
  await expectStatus(
    401,
    'Chặn khách vãng lai đăng đánh giá',
    reviewPath,
    json('POST', { rentalId: r1.id, rating: 5, liked: 'Khách vãng lai' })
  );
  const eligible = await ok(reviewPath, {}, a);
  check(
    eligible.data.eligibleRentals.some(item => item.id === r1.id),
    'Đơn hoàn tất được phép đánh giá'
  );
  await ok(reviewPath, json('POST', { rentalId: r1.id, rating: 5, liked: 'Thiết bị hoạt động tốt' }), a);
  await expectStatus(
    409,
    'Chặn đánh giá trùng đơn thuê',
    reviewPath,
    json('POST', { rentalId: r1.id, rating: 4, liked: 'Lặp' }),
    a
  );

  /* ---------------- Hủy đơn và hết hạn giữ lịch ---------------- */
  await expectStatus(
    404,
    'Khách không hủy được đơn của người khác',
    `/account/rentals/${r2.id}/cancel`,
    { method: 'POST' },
    a
  );
  await ok(`/account/rentals/${r2.id}/cancel`, json('POST', { reason: 'Đổi kế hoạch' }), b);
  const cancelled = await rentalRow(r2.id);
  check(cancelled.status === 'CANCELLED' && cancelled.payment_status === 'VOID', 'Khách tự hủy đơn chờ duyệt');
  const r3 = (await ok('/rentals', json('POST', rentalBody([slugs.camera], day(12), day(13), { email: emails.b })), b))
    .data.rental;
  await query(`UPDATE rentals SET expires_at=NOW() - INTERVAL '1 minute' WHERE id=$1`, [r3.id]);
  await ok(`/products/${slugs.camera}/calendar?days=7`);
  check(
    (await rentalRow(r3.id)).status === 'CANCELLED',
    'Đơn online không thanh toán tự hủy khi hết thời gian giữ lịch'
  );
  await expectStatus(409, 'Không thanh toán được đơn đã hủy', `/rentals/${r3.id}/payment`, { method: 'POST' }, b);
  const notices = await ok('/account/notifications', {}, b);
  check(
    notices.data.notifications.some(item => item.kind === 'EXPIRED' && item.rentalId === r3.id),
    'Khách nhận thông báo đơn hết hạn'
  );

  /* ---------------- Nhận và trả tại cửa hàng ---------------- */
  const r4 = (
    await ok(
      '/rentals',
      json(
        'POST',
        rentalBody([slugs.lens], today, day(1), { email: emails.b, deliveryMethod: 'store', paymentMethod: 'handover' })
      ),
      b
    )
  ).data.rental;
  await ok(`/admin/rentals/${r4.id}/status`, json('PATCH', { status: 'CONFIRMED' }), admin);
  const storeDetail = (await ok(`/admin/rentals/${r4.id}`, {}, admin)).data.rental;
  check(storeDetail.allowedActions.includes('HANDOVER'), 'Đơn tại cửa hàng có thao tác bàn giao cho quản trị viên');
  await expectStatus(
    409,
    'Endpoint cửa hàng không dùng cho đơn giao tận nơi',
    `/admin/rentals/${r1.id}/handover`,
    json('POST', {}),
    admin
  );
  await expectStatus(
    422,
    'Bàn giao tại cửa hàng cũng bắt buộc ảnh',
    `/admin/rentals/${r4.id}/handover`,
    json('POST', { items: fullChecklist(storeDetail.items) }),
    admin
  );
  await ok(
    `/admin/rentals/${r4.id}/handover`,
    json('POST', { images: [image], items: fullChecklist(storeDetail.items) }),
    admin
  );
  const storeRental = await rentalRow(r4.id);
  check(
    storeRental.payment_status === 'PAID_SIMULATED' && storeRental.deposit_status === 'HELD',
    'Thu tiền thuê và cọc khi bàn giao tại cửa hàng'
  );
  const storeReturn = await ok(
    `/admin/rentals/${r4.id}/return`,
    json('POST', { images: [image], items: fullChecklist(storeDetail.items) }),
    admin
  );
  check(
    storeReturn.data.status === 'COMPLETED' && storeReturn.data.settlement.refund === 500000,
    'Trả máy đúng hạn, hoàn đủ cọc'
  );

  /* ---------------- Bảo trì thiết bị có đơn sắp tới ---------------- */
  const r5 = (
    await ok(
      '/rentals',
      json(
        'POST',
        rentalBody([slugs.camera], day(20), day(21), { paymentMethod: 'handover', deliveryMethod: 'store' })
      ),
      a
    )
  ).data.rental;
  await ok(`/admin/rentals/${r5.id}/status`, json('PATCH', { status: 'CONFIRMED' }), admin);
  const unit = await query(`SELECT e.id FROM equipment_items e JOIN products p ON p.id=e.product_id WHERE p.slug=$1`, [
    slugs.camera
  ]);
  const maintenance = await ok(
    `/admin/equipment/${unit.rows[0].id}`,
    json('PATCH', { status: 'MAINTENANCE', condition: 'FAIR' }),
    admin
  );
  check(
    maintenance.data.reassigned?.unresolved.includes(r5.code),
    'Cảnh báo đơn sắp tới khi thiết bị chuyển sang bảo trì'
  );
  const blockedCalendar = await ok(
    `/products/${slugs.camera}/availability`,
    json('POST', { startDate: day(30), endDate: day(31) })
  );
  check(blockedCalendar.data.available === false, 'Thiết bị bảo trì không nhận đơn mới');
  await expectStatus(
    422,
    'Không đặt thủ công trạng thái do quy trình quản lý',
    `/admin/equipment/${unit.rows[0].id}`,
    json('PATCH', { status: 'RENTED', condition: 'GOOD' }),
    admin
  );
  await ok(`/admin/equipment/${unit.rows[0].id}`, json('PATCH', { status: 'AVAILABLE', condition: 'GOOD' }), admin);
  check((await equipmentStatus(slugs.camera)) === 'RESERVED', 'Thiết bị trở lại kho và giữ chỗ cho đơn đã xác nhận');

  /* ---------------- Email và SMS ---------------- */
  const deliveries = (rentalId, channel) =>
    query(
      `SELECT d.* FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id
    WHERE n.rental_id=$1 AND d.channel=$2 ORDER BY d.id`,
      [rentalId, channel]
    ).then(result => result.rows);
  await waitFor(
    () => inbox.some(mail => mail.to === emails.a && mail.raw.includes('localhost:5173/account')),
    'Email thật được gửi qua SMTP kèm liên kết tài khoản'
  );
  await waitFor(
    () =>
      smsOutbox.some(sms => sms.To === '+84909999996' && sms.Body.includes('Tram May Anh') && sms.Body.length <= 160),
    'SMS được gửi qua API với số +84, không dấu, trong 160 ký tự'
  );
  const emailRows = await deliveries(r1.id, 'EMAIL');
  check(
    emailRows.length > 5 && emailRows.every(row => row.status === 'SENT' && row.provider === 'smtp'),
    'Mọi mốc của đơn đều có bản ghi email đã gửi'
  );
  check(
    (await deliveries(r1.id, 'SMS')).every(row => !/thanh toán|hoàn tất/i.test(row.subject)),
    'SMS chỉ gửi cho các mốc quan trọng'
  );

  smsFailures = 1;
  const r7 = (
    await ok(
      '/rentals',
      json('POST', rentalBody([slugs.lens], day(50), day(51), { paymentMethod: 'handover', deliveryMethod: 'store' })),
      a
    )
  ).data.rental;
  await ok(`/admin/rentals/${r7.id}/status`, json('PATCH', { status: 'CONFIRMED' }), admin);
  await waitFor(
    async () =>
      (await deliveries(r7.id, 'SMS')).some(row => row.status === 'PENDING' && row.attempts === 1 && row.last_error),
    'SMS lỗi từ nhà cung cấp được giữ lại để thử lại'
  );
  await query(`UPDATE notification_deliveries SET next_attempt_at=NOW() WHERE status='PENDING'`);
  await expectStatus(401, 'Route cron yêu cầu khóa bí mật', '/cron/tick');
  await ok('/cron/tick', { headers: { Authorization: `Bearer ${cronSecret}` } });
  check(
    (await deliveries(r7.id, 'SMS')).every(row => row.status === 'SENT' && row.attempts === 2),
    'Gửi lại thành công ở lần thử thứ hai'
  );

  await ok('/account/notification-preferences', json('PATCH', { email: true, sms: false }), a);
  await ok(`/account/rentals/${r7.id}/cancel`, json('POST', { reason: 'Kiểm tra tắt SMS' }), a);
  await ok(`/admin/rentals/${r5.id}/status`, json('PATCH', { status: 'CANCELLED', note: 'Kiểm tra tắt SMS' }), admin);
  check(
    !(await deliveries(r5.id, 'SMS')).some(row => /bị hủy/.test(row.subject)),
    'Khách tắt SMS thì không nhận SMS mới'
  );
  await ok('/account/notification-preferences', json('PATCH', { email: true, sms: true }), a);
  const badPhone = (
    await ok(
      '/rentals',
      json(
        'POST',
        rentalBody([slugs.lens], day(60), day(61), {
          phone: '12345',
          deliveryMethod: 'store',
          paymentMethod: 'handover'
        })
      ),
      a
    )
  ).data.rental;
  await ok(`/admin/rentals/${badPhone.id}/status`, json('PATCH', { status: 'CONFIRMED' }), admin);
  await waitFor(
    async () => (await deliveries(badPhone.id, 'SMS')).some(row => row.status === 'FAILED'),
    'Số điện thoại sai bị đánh dấu thất bại, không thử lại vô ích'
  );
  const deliveryLog = await ok('/admin/notification-deliveries?status=FAILED', {}, admin);
  check(
    deliveryLog.data.deliveries.some(row => row.recipient === '12345'),
    'Quản trị viên thấy bản ghi gửi lỗi'
  );
  await expectStatus(403, 'Khách không xem được nhật ký gửi', '/admin/notification-deliveries', {}, a);

  /* ---------------- Xác minh CCCD ---------------- */
  const idNumber = String(stamp).padStart(12, '0').slice(-12),
    otherIdNumber = String(stamp + 1)
      .padStart(12, '0')
      .slice(-12);
  const idBody = (number, extra = {}) => ({
    fullName: 'Khách A kiểm thử',
    idNumber: number,
    consent: true,
    front: image,
    back: image,
    selfie: image,
    ...extra
  });
  const r6 = (
    await ok(
      '/rentals',
      json(
        'POST',
        rentalBody([slugs.pricey], day(40), day(41), { paymentMethod: 'handover', deliveryMethod: 'store' })
      ),
      a
    )
  ).data.rental;
  check(r6.identityRequired === true, 'Đơn cọc từ 5 triệu được đánh dấu cần xác minh CCCD');
  await expectStatus(
    409,
    'Không duyệt được đơn cọc cao khi khách chưa xác minh',
    `/admin/rentals/${r6.id}/status`,
    json('PATCH', { status: 'CONFIRMED' }),
    admin
  );
  await expectStatus(
    422,
    'Bắt buộc đồng ý xử lý dữ liệu',
    '/account/identity',
    json('POST', idBody(idNumber, { consent: false })),
    a
  );
  await expectStatus(422, 'Từ chối số CCCD sai định dạng', '/account/identity', json('POST', idBody('123')), a);
  await expectStatus(
    422,
    'Bắt buộc đủ 3 ảnh',
    '/account/identity',
    json('POST', idBody(idNumber, { selfie: undefined })),
    a
  );
  await expectStatus(401, 'Khách vãng lai không gửi được hồ sơ', '/account/identity', json('POST', idBody(idNumber)));
  const submitted = (await ok('/account/identity', json('POST', idBody(idNumber)), a)).data.verification;
  check(
    submitted.idLast4 === idNumber.slice(-4) && !JSON.stringify(submitted).includes(idNumber),
    'API không trả lại số CCCD đầy đủ'
  );
  const stored = (await query('SELECT * FROM identity_verifications WHERE id=$1', [submitted.id])).rows[0];
  check(!JSON.stringify(stored).includes(idNumber), 'Database không lưu số CCCD nguyên văn');
  const rawImage = Buffer.from(image.split(',')[1], 'base64');
  const sealed = (await query('SELECT ciphertext FROM identity_images WHERE verification_id=$1', [submitted.id])).rows;
  check(
    sealed.length === 3 && sealed.every(row => !row.ciphertext.includes(rawImage.subarray(0, 32))),
    'Ảnh CCCD được mã hóa trong database'
  );
  await expectStatus(
    409,
    'Một tài khoản chỉ có một hồ sơ đang hiệu lực',
    '/account/identity',
    json('POST', idBody(otherIdNumber)),
    a
  );
  await expectStatus(
    409,
    'Một số CCCD không dùng được cho hai tài khoản',
    '/account/identity',
    json('POST', idBody(idNumber)),
    b
  );
  await expectStatus(403, 'Khách không xem được ảnh hồ sơ', `/admin/identity/${submitted.id}/images/front`, {}, a);
  await expectStatus(
    403,
    'Nhân viên giao nhận không xem được ảnh hồ sơ',
    `/admin/identity/${submitted.id}/images/front`,
    {},
    staff1
  );
  const viewed = await ok(`/admin/identity/${submitted.id}/images/front`, {}, admin);
  check(viewed.data.bytes === rawImage.length, 'Quản trị viên xem được ảnh đã giải mã');
  check(
    (await query(`SELECT 1 FROM identity_access_log WHERE verification_id=$1 AND action='VIEW_FRONT'`, [submitted.id]))
      .rowCount === 1,
    'Mỗi lần xem ảnh được ghi nhật ký'
  );
  await expectStatus(
    422,
    'Từ chối hồ sơ phải có lý do',
    `/admin/identity/${submitted.id}`,
    json('PATCH', { status: 'REJECTED' }),
    admin
  );
  await ok(`/admin/identity/${submitted.id}`, json('PATCH', { status: 'REJECTED', note: 'Ảnh bị mờ' }), admin);
  const imageCount = id =>
    query('SELECT 1 FROM identity_images WHERE verification_id=$1', [id]).then(result => result.rowCount);
  check((await imageCount(submitted.id)) === 0, 'Ảnh bị xóa ngay sau khi từ chối');
  await expectStatus(
    409,
    'Hồ sơ bị từ chối vẫn chưa duyệt được đơn',
    `/admin/rentals/${r6.id}/status`,
    json('PATCH', { status: 'CONFIRMED' }),
    admin
  );
  const second = (await ok('/account/identity', json('POST', idBody(idNumber)), a)).data.verification;
  await ok(`/admin/identity/${second.id}`, json('PATCH', { status: 'APPROVED' }), admin);
  check((await imageCount(second.id)) === 0, 'Ảnh bị xóa ngay sau khi duyệt');
  await expectStatus(
    404,
    'Không còn xem được ảnh sau khi duyệt',
    `/admin/identity/${second.id}/images/front`,
    {},
    admin
  );
  await expectStatus(
    409,
    'Không xử lý lại hồ sơ đã duyệt',
    `/admin/identity/${second.id}`,
    json('PATCH', { status: 'REJECTED', note: 'x' }),
    admin
  );
  await ok(`/admin/rentals/${r6.id}/status`, json('PATCH', { status: 'CONFIRMED' }), admin);
  check((await rentalRow(r6.id)).status === 'CONFIRMED', 'Duyệt được đơn cọc cao sau khi xác minh');
  const withdrawn = (await ok('/account/identity', json('POST', idBody(otherIdNumber)), b)).data.verification;
  await ok('/account/identity', { method: 'DELETE' }, b);
  check(
    (await query('SELECT 1 FROM identity_verifications WHERE id=$1', [withdrawn.id])).rowCount === 0,
    'Khách rút hồ sơ thì dữ liệu bị xóa'
  );

  /* ---------------- Dashboard và kết thúc ---------------- */
  const dashboard = await ok('/admin/dashboard?range=30', {}, admin);
  check(
    dashboard.data.series.length === 30 && dashboard.data.revenue.rentalRevenue >= 900000 + 50000 * 2,
    'Dashboard doanh thu 30 ngày'
  );
  check(
    typeof dashboard.data.operations.counts.handovers === 'number' && Array.isArray(dashboard.data.operations.dueSoon),
    'Dashboard có khối việc cần làm hôm nay'
  );
  const notifyA = await ok('/account/notifications', {}, a);
  check(
    notifyA.data.notifications.some(item => item.kind === 'COMPLETED' && item.rentalId === r1.id),
    'Khách nhận thông báo quyết toán'
  );

  await ok('/auth/logout', { method: 'POST' }, a);
  await expectStatus(401, 'Phiên hết hiệu lực sau đăng xuất', '/auth/me', {}, a);
  for (const cookie of [b, admin, staff1, staff2]) await ok('/auth/logout', { method: 'POST' }, cookie);

  console.log(`\n✓ ${results.length}/${results.length} kiểm tra đã vượt qua:`);
  for (const item of results) console.log(`  ✓ ${item}`);
} catch (error) {
  console.error(`\n✗ Kiểm thử thất bại sau ${results.length} bước đạt: ${error.message}`);
  if (serverError.trim()) console.error(`\nLog server:\n${serverError.trim().split('\n').slice(-25).join('\n')}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
