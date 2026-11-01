import { pool, query, testDatabaseConnection } from './db.js';

try{
  const database=await testDatabaseConnection();
  await query(`CREATE TABLE IF NOT EXISTS rental_extensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    old_end_date DATE NOT NULL, requested_end_date DATE NOT NULL, reason TEXT, status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    extra_amount INTEGER NOT NULL DEFAULT 0, reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS extra_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    extension_id UUID REFERENCES rental_extensions(id) ON DELETE SET NULL,
    incident_id BIGINT REFERENCES rental_incidents(id) ON DELETE SET NULL,
    charge_type VARCHAR(40) NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>=0),
    payment_status VARCHAR(30) NOT NULL DEFAULT 'PENDING', paid_at TIMESTAMPTZ, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query('ALTER TABLE rental_incidents ADD COLUMN IF NOT EXISTS resolution TEXT');
  await query('ALTER TABLE rental_incidents ADD COLUMN IF NOT EXISTS fee_amount INTEGER NOT NULL DEFAULT 0');
  await query('ALTER TABLE rental_incidents ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id) ON DELETE SET NULL');
  await query('ALTER TABLE rental_incidents ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_extension_per_rental ON rental_extensions(rental_id) WHERE status=\'PENDING\'');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_extra_charge_extension ON extra_charges(extension_id) WHERE extension_id IS NOT NULL');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_extra_charge_incident ON extra_charges(incident_id) WHERE incident_id IS NOT NULL');
  console.log(`Đã cập nhật gia hạn và phí phát sinh trong database ${database.database_name}.`);
}catch(error){console.error(error.message);process.exitCode=1}finally{await pool.end()}
