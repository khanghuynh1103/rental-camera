import { pool, query, testDatabaseConnection } from './db.js';

try{
  const database=await testDatabaseConnection();
  await query(`CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at)');
  await query('DELETE FROM user_sessions WHERE expires_at<=NOW()');
  console.log(`Đã tạo kho phiên đăng nhập trong database ${database.database_name}.`);
}catch(error){console.error(error.message);process.exitCode=1}finally{await pool.end()}
