import { pool, query, testDatabaseConnection } from './db.js';

const statements=[
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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rental_id UUID NOT NULL UNIQUE REFERENCES rentals(id) ON DELETE CASCADE,
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
  `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_equipment_product_status ON equipment_items(product_id,status)`,
  `CREATE INDEX IF NOT EXISTS idx_rentals_user ON rentals(user_id,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_rentals_assignment ON rentals(assigned_delivery_staff_id,status)`,
  `CREATE INDEX IF NOT EXISTS idx_rental_items_equipment ON rental_items(equipment_item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_logs_rental ON delivery_logs(rental_id,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_product_reviews_product_date ON product_reviews(product_id,created_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_extension_per_rental ON rental_extensions(rental_id) WHERE status='PENDING'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_extra_charge_extension ON extra_charges(extension_id) WHERE extension_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_extra_charge_incident ON extra_charges(incident_id) WHERE incident_id IS NOT NULL`
];

try{
  const database=await testDatabaseConnection();
  for(const statement of statements)await query(statement);
  console.log(`Đã khởi tạo đầy đủ schema trong database ${database.database_name}.`);
}catch(error){console.error('Không thể khởi tạo schema PostgreSQL:');console.error(error.message);process.exitCode=1}finally{await pool.end()}
