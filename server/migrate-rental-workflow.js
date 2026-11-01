import { pool, query, testDatabaseConnection } from './db.js';

try{
  const database=await testDatabaseConnection();
  await query(`CREATE TABLE IF NOT EXISTS rental_status_history (
    id BIGSERIAL PRIMARY KEY,
    rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    from_status VARCHAR(30),
    to_status VARCHAR(30) NOT NULL,
    note TEXT,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_rental_status_history_rental ON rental_status_history(rental_id,changed_at)');
  await query(`INSERT INTO rental_status_history(rental_id,from_status,to_status,note)
    SELECT r.id,NULL,r.status,'Trạng thái ban đầu' FROM rentals r
    WHERE NOT EXISTS(SELECT 1 FROM rental_status_history h WHERE h.rental_id=r.id)`);
  console.log(`Đã cập nhật quy trình đơn thuê trong database ${database.database_name}.`);
}catch(error){console.error(error.message);process.exitCode=1}finally{await pool.end()}
