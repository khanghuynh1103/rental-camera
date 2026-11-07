// Migration hợp nhất: tạo đầy đủ schema cho database trống và nâng cấp an toàn database cũ.
// Có thể chạy lại nhiều lần (IF NOT EXISTS, kiểm tra trước khi thêm ràng buộc).
import { pathToFileURL } from 'node:url';
import { pool, query, testDatabaseConnection } from './db.js';
import { BLOCKING_RENTAL_STATUSES, DEFAULT_INCLUDED_ITEMS, RULES, SMS_KINDS } from './rules.js';

const blocking = BLOCKING_RENTAL_STATUSES.map(status => `'${status}'`).join(',');
const smsKinds = SMS_KINDS.map(kind => `'${kind}'`).join(',');

const tables = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), full_name VARCHAR(120) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(30) NOT NULL DEFAULT '', password_hash VARCHAR(128) NOT NULL, password_salt VARCHAR(64) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'CUSTOMER', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, slug VARCHAR(120) NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug VARCHAR(180) NOT NULL UNIQUE, category_id BIGINT NOT NULL REFERENCES categories(id),
    name VARCHAR(255) NOT NULL, brand VARCHAR(120) NOT NULL DEFAULT '', format VARCHAR(120) NOT NULL DEFAULT '',
    specification TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', price_per_day INTEGER NOT NULL CHECK(price_per_day>=0),
    deposit_amount INTEGER NOT NULL DEFAULT 0 CHECK(deposit_amount>=0), featured BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE, rental_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS product_images (
    id BIGSERIAL PRIMARY KEY, product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS equipment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    equipment_code VARCHAR(120) NOT NULL UNIQUE, condition VARCHAR(30) NOT NULL DEFAULT 'GOOD',
    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS rentals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rental_code VARCHAR(80) NOT NULL UNIQUE, user_id UUID NOT NULL REFERENCES users(id),
    start_date DATE NOT NULL, end_date DATE NOT NULL, delivery_method VARCHAR(30) NOT NULL, delivery_address TEXT,
    rental_fee INTEGER NOT NULL CHECK(rental_fee>=0), deposit_amount INTEGER NOT NULL DEFAULT 0 CHECK(deposit_amount>=0),
    total_amount INTEGER NOT NULL CHECK(total_amount>=0), status VARCHAR(30) NOT NULL DEFAULT 'PENDING', note TEXT,
    full_name VARCHAR(120) NOT NULL, phone VARCHAR(30) NOT NULL, email VARCHAR(255) NOT NULL, delivery_time VARCHAR(40), return_time VARCHAR(40),
    assigned_delivery_staff_id UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK(end_date>=start_date)
  )`,
  `CREATE TABLE IF NOT EXISTS rental_items (
    id BIGSERIAL PRIMARY KEY, rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id), equipment_item_id UUID REFERENCES equipment_items(id) ON DELETE SET NULL,
    price_per_day INTEGER NOT NULL CHECK(price_per_day>=0)
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rental_id UUID NOT NULL UNIQUE REFERENCES rentals(id) ON DELETE CASCADE,
    payment_method VARCHAR(40) NOT NULL, amount INTEGER NOT NULL CHECK(amount>=0), status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    invoice_code VARCHAR(100) NOT NULL UNIQUE, total_amount INTEGER NOT NULL CHECK(total_amount>=0), issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS rental_status_history (
    id BIGSERIAL PRIMARY KEY, rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE, from_status VARCHAR(30),
    to_status VARCHAR(30) NOT NULL, note TEXT, changed_by UUID REFERENCES users(id) ON DELETE SET NULL, changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS delivery_logs (
    id BIGSERIAL PRIMARY KEY, rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE, action VARCHAR(40) NOT NULL,
    inspection_result VARCHAR(40), note TEXT, proof_image TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS evidence_images (
    id BIGSERIAL PRIMARY KEY, delivery_log_id BIGINT NOT NULL REFERENCES delivery_logs(id) ON DELETE CASCADE,
    mime_type VARCHAR(20) NOT NULL, data BYTEA NOT NULL, position INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS rental_incidents (
    id BIGSERIAL PRIMARY KEY, rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    equipment_item_id UUID REFERENCES equipment_items(id) ON DELETE SET NULL, incident_type VARCHAR(40) NOT NULL,
    description TEXT, status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW', reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution TEXT, fee_amount INTEGER NOT NULL DEFAULT 0, resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS rental_extensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    old_end_date DATE NOT NULL, requested_end_date DATE NOT NULL, reason TEXT, status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    extra_amount INTEGER NOT NULL DEFAULT 0, reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS extra_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    extension_id UUID REFERENCES rental_extensions(id) ON DELETE SET NULL, incident_id BIGINT REFERENCES rental_incidents(id) ON DELETE SET NULL,
    charge_type VARCHAR(40) NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>=0),
    payment_status VARCHAR(30) NOT NULL DEFAULT 'PENDING', paid_at TIMESTAMPTZ, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS product_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK(rating BETWEEN 1 AND 5), liked TEXT NOT NULL DEFAULT '', disliked TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(rental_id,product_id),
    CHECK(length(trim(liked))>0 OR length(trim(disliked))>0)
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rental_id UUID REFERENCES rentals(id) ON DELETE CASCADE, kind VARCHAR(40) NOT NULL DEFAULT 'INFO',
    title VARCHAR(200) NOT NULL, body TEXT NOT NULL DEFAULT '', read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS notification_deliveries (
    id BIGSERIAL PRIMARY KEY, notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    channel VARCHAR(10) NOT NULL CHECK(channel IN ('EMAIL','SMS')), recipient VARCHAR(255) NOT NULL, subject VARCHAR(200) NOT NULL, body TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','SIMULATED','FAILED')),
    provider VARCHAR(30), attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ, sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS identity_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(120) NOT NULL, id_last4 CHAR(4) NOT NULL, id_hash CHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
    consent_at TIMESTAMPTZ NOT NULL, consent_version VARCHAR(20) NOT NULL, review_note TEXT,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL, reviewed_at TIMESTAMPTZ, images_purged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS identity_images (
    id BIGSERIAL PRIMARY KEY, verification_id UUID NOT NULL REFERENCES identity_verifications(id) ON DELETE CASCADE,
    side VARCHAR(10) NOT NULL CHECK(side IN ('front','back','selfie')), mime_type VARCHAR(20) NOT NULL,
    iv BYTEA NOT NULL, auth_tag BYTEA NOT NULL, ciphertext BYTEA NOT NULL, UNIQUE(verification_id,side)
  )`,
  `CREATE TABLE IF NOT EXISTS identity_access_log (
    id BIGSERIAL PRIMARY KEY, verification_id UUID REFERENCES identity_verifications(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL, action VARCHAR(30) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
];

// Danh sách giá trị hợp lệ cho các cột trạng thái (đồng bộ với đề cương mục 6.8 và quy trình đơn thuê).
const statusChecks = {
  users_role_check: ['users', 'role', ['CUSTOMER', 'ADMIN', 'DELIVERY_STAFF']],
  equipment_items_status_check: [
    'equipment_items',
    'status',
    ['AVAILABLE', 'RESERVED', 'RENTED', 'RETURNING', 'INSPECTION', 'DAMAGED', 'MAINTENANCE', 'RETIRED']
  ],
  equipment_items_condition_check: ['equipment_items', 'condition', ['GOOD', 'FAIR', 'DAMAGED']],
  rentals_status_check: [
    'rentals',
    'status',
    ['PENDING', 'CONFIRMED', 'DELIVERING', 'RENTING', 'RETURNING', 'INSPECTING', 'COMPLETED', 'CANCELLED']
  ],
  rentals_deposit_status_check: [
    'rentals',
    'deposit_status',
    ['NOT_COLLECTED', 'HELD', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FULLY_DEDUCTED', 'NONE']
  ],
  payments_status_check: ['payments', 'status', ['PENDING', 'PAID_SIMULATED', 'REFUNDED_SIMULATED', 'VOID']],
  extra_charges_payment_status_check: [
    'extra_charges',
    'payment_status',
    ['PENDING', 'PAID_SIMULATED', 'SETTLED_BY_DEPOSIT']
  ],
  invoices_type_check: ['invoices', 'invoice_type', ['RENTAL', 'EXTRA_CHARGE', 'SETTLEMENT']]
};
const dropStatusChecks = Object.entries(statusChecks).map(
  ([name, [table]]) => `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`
);
const addStatusChecks = Object.entries(statusChecks).map(
  ([name, [table, column, values]]) =>
    `ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${column} IN (${values.map(value => `'${value}'`).join(',')}))`
);

// Nâng cấp các database đã tạo bằng phiên bản cũ.
const upgrades = [
  ...dropStatusChecks,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_sms BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS included_items TEXT[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE rentals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`,
  `ALTER TABLE rentals ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`,
  `ALTER TABLE rentals ADD COLUMN IF NOT EXISTS cancel_reason TEXT`,
  `ALTER TABLE rentals ADD COLUMN IF NOT EXISTS returned_on DATE`,
  `ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_status VARCHAR(30) NOT NULL DEFAULT 'NOT_COLLECTED'`,
  `ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_collected_at TIMESTAMPTZ`,
  `ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_deducted_amount INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_refund_amount INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE rentals ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ`,
  `ALTER TABLE rental_items ADD COLUMN IF NOT EXISTS start_date DATE`,
  `ALTER TABLE rental_items ADD COLUMN IF NOT EXISTS block_end_date DATE`,
  `ALTER TABLE rental_items ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS collected_by UUID REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ`,
  `ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_rental_id_key`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(30) NOT NULL DEFAULT 'RENTAL'`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS extra_charge_id UUID REFERENCES extra_charges(id) ON DELETE SET NULL`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE delivery_logs ADD COLUMN IF NOT EXISTS checklist JSONB`,
  `ALTER TABLE rental_incidents ADD COLUMN IF NOT EXISTS delivery_log_id BIGINT REFERENCES delivery_logs(id) ON DELETE SET NULL`,
  `ALTER TABLE rental_incidents ADD COLUMN IF NOT EXISTS missing_items TEXT[] NOT NULL DEFAULT '{}'`,
  // Thống nhất tên trạng thái thiết bị với đề cương (RENTING -> RENTED).
  `UPDATE equipment_items SET status='RENTED' WHERE status='RENTING'`,
  // Tiền cọc không phải doanh thu: khoản thanh toán chỉ còn là tiền thuê.
  `UPDATE payments p SET amount=r.rental_fee FROM rentals r
     WHERE r.id=p.rental_id AND p.payment_method='handover' AND p.status='PENDING' AND p.amount<>r.rental_fee`,
  `UPDATE rentals SET deposit_status='HELD' WHERE deposit_status='NOT_COLLECTED' AND status IN ('RENTING','RETURNING')`,
  `UPDATE rentals SET expires_at=created_at + INTERVAL '${RULES.pendingHoldHours} hours' WHERE status='PENDING' AND expires_at IS NULL`
];

const functions = [
  // Số ngày đệm dùng chung cho truy vấn lịch và ràng buộc chống trùng.
  `CREATE OR REPLACE FUNCTION rental_buffer_days() RETURNS INTEGER LANGUAGE SQL IMMUTABLE AS $$ SELECT ${Number(RULES.bufferDays)} $$`,
  // Đồng bộ khoảng ngày giữ lịch của từng dòng đơn với đơn thuê.
  `CREATE OR REPLACE FUNCTION rental_items_fill_period() RETURNS TRIGGER LANGUAGE plpgsql AS $$
   DECLARE parent rentals%ROWTYPE;
   BEGIN
     SELECT * INTO parent FROM rentals WHERE id=NEW.rental_id;
     NEW.start_date := parent.start_date;
     NEW.block_end_date := parent.end_date + rental_buffer_days();
     NEW.active := parent.status IN (${blocking});
     RETURN NEW;
   END $$`,
  `CREATE OR REPLACE FUNCTION rentals_sync_items() RETURNS TRIGGER LANGUAGE plpgsql AS $$
   BEGIN
     UPDATE rental_items SET start_date=NEW.start_date, block_end_date=NEW.end_date + rental_buffer_days(),
       active=NEW.status IN (${blocking})
     WHERE rental_id=NEW.id;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS trg_rental_items_fill_period ON rental_items`,
  `CREATE TRIGGER trg_rental_items_fill_period BEFORE INSERT OR UPDATE OF rental_id ON rental_items
     FOR EACH ROW EXECUTE FUNCTION rental_items_fill_period()`,
  `DROP TRIGGER IF EXISTS trg_rentals_sync_items ON rentals`,
  `CREATE TRIGGER trg_rentals_sync_items AFTER UPDATE OF start_date,end_date,status ON rentals
     FOR EACH ROW EXECUTE FUNCTION rentals_sync_items()`,
  // Mọi thông báo (kể cả nhắc hạn tạo bằng SQL) tự vào hàng đợi gửi trong cùng transaction.
  `CREATE OR REPLACE FUNCTION notifications_enqueue_delivery() RETURNS TRIGGER LANGUAGE plpgsql AS $$
   DECLARE target users%ROWTYPE; contact_email TEXT; contact_phone TEXT;
   BEGIN
     SELECT * INTO target FROM users WHERE id=NEW.user_id;
     SELECT email, phone INTO contact_email, contact_phone FROM rentals WHERE id=NEW.rental_id;
     contact_email := COALESCE(NULLIF(contact_email,''), target.email);
     contact_phone := COALESCE(NULLIF(contact_phone,''), target.phone);
     IF target.notify_email AND contact_email <> '' THEN
       INSERT INTO notification_deliveries(notification_id,channel,recipient,subject,body) VALUES(NEW.id,'EMAIL',contact_email,NEW.title,NEW.body);
     END IF;
     IF target.notify_sms AND contact_phone <> '' AND NEW.kind IN (${smsKinds}) THEN
       INSERT INTO notification_deliveries(notification_id,channel,recipient,subject,body) VALUES(NEW.id,'SMS',contact_phone,NEW.title,NEW.body);
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS trg_notifications_enqueue ON notifications`,
  `CREATE TRIGGER trg_notifications_enqueue AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION notifications_enqueue_delivery()`,
  `UPDATE rental_items ri SET start_date=r.start_date, block_end_date=r.end_date + rental_buffer_days(), active=r.status IN (${blocking})
     FROM rentals r WHERE r.id=ri.rental_id`,
  `ALTER TABLE rental_items ALTER COLUMN start_date SET NOT NULL`,
  `ALTER TABLE rental_items ALTER COLUMN block_end_date SET NOT NULL`
];

const indexes = [
  `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_equipment_product_status ON equipment_items(product_id,status)`,
  `CREATE INDEX IF NOT EXISTS idx_rentals_user ON rentals(user_id,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_rentals_assignment ON rentals(assigned_delivery_staff_id,status)`,
  `CREATE INDEX IF NOT EXISTS idx_rentals_status_dates ON rentals(status,start_date,end_date)`,
  `CREATE INDEX IF NOT EXISTS idx_rental_items_equipment ON rental_items(equipment_item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rental_items_rental ON rental_items(rental_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_rental_status_history_rental ON rental_status_history(rental_id,changed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_logs_rental ON delivery_logs(rental_id,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_evidence_images_log ON evidence_images(delivery_log_id,position)`,
  `CREATE INDEX IF NOT EXISTS idx_product_reviews_product_date ON product_reviews(product_id,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_deliveries_due ON notification_deliveries(status,next_attempt_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_active_user ON identity_verifications(user_id) WHERE status IN ('PENDING','APPROVED')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_active_number ON identity_verifications(id_hash) WHERE status IN ('PENDING','APPROVED')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_reminder ON notifications(rental_id,kind) WHERE kind IN ('DUE_SOON','OVERDUE')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_extension_per_rental ON rental_extensions(rental_id) WHERE status='PENDING'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_extra_charge_extension ON extra_charges(extension_id) WHERE extension_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_extra_charge_incident ON extra_charges(incident_id) WHERE incident_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_rental ON invoices(rental_id) WHERE invoice_type='RENTAL'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_settlement ON invoices(rental_id) WHERE invoice_type='SETTLEMENT'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_charge ON invoices(extra_charge_id) WHERE extra_charge_id IS NOT NULL`
];

async function migrateLegacyProofImages() {
  // Ảnh bằng chứng cũ lưu dạng data URL trong delivery_logs.proof_image -> chuyển sang evidence_images (BYTEA).
  const moved = await query(`
    WITH legacy AS (
      SELECT id, substring(proof_image from '^data:(image/(?:jpeg|png|webp));base64,') AS mime,
             substring(proof_image from '^data:image/(?:jpeg|png|webp);base64,(.+)$') AS payload
      FROM delivery_logs WHERE proof_image IS NOT NULL
    ), inserted AS (
      INSERT INTO evidence_images(delivery_log_id,mime_type,data,position)
      SELECT id, mime, decode(payload,'base64'), 0 FROM legacy WHERE mime IS NOT NULL AND payload IS NOT NULL
      RETURNING delivery_log_id
    )
    UPDATE delivery_logs SET proof_image=NULL WHERE id IN (SELECT delivery_log_id FROM inserted)`);
  return moved.rowCount;
}

async function addOverlapConstraint() {
  const exists = await query(`SELECT 1 FROM pg_constraint WHERE conname='rental_items_no_overlap'`);
  if (exists.rowCount) return 'đã có';
  try {
    await query('CREATE EXTENSION IF NOT EXISTS btree_gist');
  } catch (error) {
    return `bỏ qua (không bật được btree_gist: ${error.message})`;
  }
  const conflicts = await query(`
    SELECT a.rental_id, b.rental_id AS other FROM rental_items a JOIN rental_items b
      ON a.equipment_item_id=b.equipment_item_id AND a.id<b.id AND a.active AND b.active
     AND daterange(a.start_date,a.block_end_date,'[]') && daterange(b.start_date,b.block_end_date,'[]')
    LIMIT 5`);
  if (conflicts.rowCount)
    return `bỏ qua vì dữ liệu cũ đang trùng lịch (${conflicts.rows.map(row => `${row.rental_id}/${row.other}`).join(', ')})`;
  await query(`ALTER TABLE rental_items ADD CONSTRAINT rental_items_no_overlap
    EXCLUDE USING gist (equipment_item_id WITH =, daterange(start_date, block_end_date, '[]') WITH &&)
    WHERE (active AND equipment_item_id IS NOT NULL)`);
  return 'đã tạo';
}

export async function migrate({ log = console.log } = {}) {
  const database = await testDatabaseConnection();
  for (const statement of [...tables, ...upgrades, ...addStatusChecks, ...functions, ...indexes])
    await query(statement);

  for (const [slug, items] of Object.entries(DEFAULT_INCLUDED_ITEMS)) {
    await query(
      `UPDATE products p SET included_items=$2 FROM categories c
      WHERE c.id=p.category_id AND c.slug=$1 AND cardinality(p.included_items)=0`,
      [slug, items]
    );
  }
  await query(`INSERT INTO rental_status_history(rental_id,from_status,to_status,note)
    SELECT r.id,NULL,r.status,'Trạng thái ban đầu' FROM rentals r
    WHERE NOT EXISTS(SELECT 1 FROM rental_status_history h WHERE h.rental_id=r.id)`);

  const movedImages = await migrateLegacyProofImages();
  const constraint = await addOverlapConstraint();
  log(`Đã khởi tạo/nâng cấp schema trong database ${database.database_name}.`);
  if (movedImages) log(`Đã chuyển ${movedImages} ảnh bằng chứng cũ sang bảng evidence_images.`);
  log(`Ràng buộc chống trùng lịch: ${constraint}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await migrate();
  } catch (error) {
    console.error('Không thể khởi tạo schema PostgreSQL:');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
