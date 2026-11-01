import { pool, query, testDatabaseConnection } from './db.js';
import { readDatabase } from './database.js';

try{
  const database=await testDatabaseConnection();
  await query('ALTER TABLE rentals ADD COLUMN IF NOT EXISTS full_name VARCHAR(120)');
  await query('ALTER TABLE rentals ADD COLUMN IF NOT EXISTS phone VARCHAR(20)');
  await query('ALTER TABLE rentals ADD COLUMN IF NOT EXISTS email VARCHAR(255)');
  await query('ALTER TABLE rentals ADD COLUMN IF NOT EXISTS delivery_time VARCHAR(40)');
  await query('ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_time VARCHAR(40)');
  const source=readDatabase(),rentals=source.rentals||[];
  let migrated=0;
  for(const old of rentals){
    const user=await query('SELECT id FROM users WHERE id=$1',[old.userId]);
    const product=await query('SELECT id FROM products WHERE slug=$1',[old.productId]);
    if(!user.rowCount||!product.rowCount)continue;
    const inserted=await query(`
      INSERT INTO rentals (id,rental_code,user_id,start_date,end_date,delivery_method,delivery_address,rental_fee,deposit_amount,total_amount,status,note,full_name,phone,email,delivery_time,return_time,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (id) DO NOTHING RETURNING id
    `,[old.id,old.code,old.userId,old.startDate,old.endDate,old.deliveryMethod,old.address||null,old.rentalFee,old.deposit,old.total,old.status||'PENDING',old.note||null,old.fullName,old.phone,old.email,old.deliveryTime||null,old.returnTime||null,old.createdAt||new Date().toISOString()]);
    if(!inserted.rowCount)continue;
    const equipment=await query("SELECT id FROM equipment_items WHERE product_id=$1 AND status='AVAILABLE' ORDER BY equipment_code LIMIT 1",[product.rows[0].id]);
    await query('INSERT INTO rental_items (rental_id,product_id,equipment_item_id,price_per_day) VALUES ($1,$2,$3,$4)',[old.id,product.rows[0].id,equipment.rows[0]?.id||null,old.pricePerDay]);
    const paymentStatus=old.paymentStatus||'PENDING';
    await query('INSERT INTO payments (rental_id,payment_method,amount,status,paid_at) VALUES ($1,$2,$3,$4,$5)',[old.id,old.paymentMethod||'online',old.paidAmount||old.rentalFee,paymentStatus,old.paidAt||null]);
    if(old.invoiceCode)await query('INSERT INTO invoices (rental_id,invoice_code,total_amount,issued_at) VALUES ($1,$2,$3,$4) ON CONFLICT (rental_id) DO NOTHING',[old.id,old.invoiceCode,old.paidAmount||old.total,old.paidAt||new Date().toISOString()]);
    migrated++;
  }
  const counts=await query('SELECT (SELECT COUNT(*)::INT FROM rentals) AS rentals,(SELECT COUNT(*)::INT FROM payments) AS payments,(SELECT COUNT(*)::INT FROM invoices) AS invoices');
  console.log(`Database: ${database.database_name}`);
  console.log(`Đã nhập thêm ${migrated} đơn thuê cũ.`);
  console.log(`Đơn thuê: ${counts.rows[0].rentals} · Thanh toán: ${counts.rows[0].payments} · Hóa đơn: ${counts.rows[0].invoices}`);
}catch(error){console.error('Không thể chuyển đơn thuê sang PostgreSQL:');console.error(error.message);process.exitCode=1}finally{await pool.end()}
