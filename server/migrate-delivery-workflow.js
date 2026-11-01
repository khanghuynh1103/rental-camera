import { pool, query, testDatabaseConnection } from './db.js';

try{
  const database=await testDatabaseConnection();
  await query(`CREATE TABLE IF NOT EXISTS delivery_logs (
    id BIGSERIAL PRIMARY KEY,
    rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    action VARCHAR(40) NOT NULL,
    inspection_result VARCHAR(40),
    note TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_delivery_logs_rental ON delivery_logs(rental_id,created_at)');
  await query(`CREATE TABLE IF NOT EXISTS rental_incidents (
    id BIGSERIAL PRIMARY KEY,
    rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    equipment_item_id UUID REFERENCES equipment_items(id) ON DELETE SET NULL,
    incident_type VARCHAR(40) NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW',
    reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log(`Đã cập nhật quy trình giao nhận trong database ${database.database_name}.`);
}catch(error){console.error(error.message);process.exitCode=1}finally{await pool.end()}
