import crypto from 'node:crypto';
import { pool, query } from './db.js';

const activeStatuses=['PENDING','CONFIRMED','DELIVERING','RENTING','RETURNING'];

export async function countAvailableEquipment(productId,startDate,endDate){
  const result=await query(`
    SELECT COUNT(*)::INT AS count
    FROM equipment_items e
    WHERE e.product_id=$1
      AND e.status='AVAILABLE'
      AND NOT EXISTS (
        SELECT 1
        FROM rental_items ri
        JOIN rentals r ON r.id=ri.rental_id
        WHERE ri.equipment_item_id=e.id
          AND r.status=ANY($2::VARCHAR[])
          AND r.start_date<=$4::DATE
          AND r.end_date>=$3::DATE
      )
  `,[productId,activeStatuses,startDate,endDate]);
  return result.rows[0].count;
}

export async function createRental({user,product,startDate,endDate,fullName,phone,email,deliveryMethod,address,deliveryTime,returnTime,note,paymentMethod}){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const equipment=await client.query(`
      SELECT e.id
      FROM equipment_items e
      WHERE e.product_id=$1
        AND e.status='AVAILABLE'
        AND NOT EXISTS (
          SELECT 1 FROM rental_items ri
          JOIN rentals r ON r.id=ri.rental_id
          WHERE ri.equipment_item_id=e.id
            AND r.status=ANY($2::VARCHAR[])
            AND r.start_date<=$4::DATE
            AND r.end_date>=$3::DATE
        )
      ORDER BY e.equipment_code
      LIMIT 1
      FOR UPDATE OF e SKIP LOCKED
    `,[product.databaseId,activeStatuses,startDate,endDate]);
    if(!equipment.rowCount){const error=new Error('Thiết bị vừa hết lịch trong khoảng ngày này. Vui lòng chọn ngày khác.');error.status=409;throw error}

    const days=Math.floor((new Date(endDate)-new Date(startDate))/86400000)+1;
    const rentalFee=product.price*days,total=rentalFee+product.deposit;
    const code=`TMA-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const rentalResult=await client.query(`
      INSERT INTO rentals (rental_code,user_id,start_date,end_date,delivery_method,delivery_address,rental_fee,deposit_amount,total_amount,status,note,full_name,phone,email,delivery_time,return_time)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',$10,$11,$12,$13,$14,$15)
      RETURNING *
    `,[code,user.id,startDate,endDate,deliveryMethod,address||null,rentalFee,product.deposit,total,note||null,fullName,phone,email,deliveryTime||null,returnTime||null]);
    const rental=rentalResult.rows[0];
    await client.query('INSERT INTO rental_items (rental_id,product_id,equipment_item_id,price_per_day) VALUES ($1,$2,$3,$4)',[rental.id,product.databaseId,equipment.rows[0].id,product.price]);
    await client.query('INSERT INTO payments (rental_id,payment_method,amount,status) VALUES ($1,$2,$3,$4)',[rental.id,paymentMethod,paymentMethod==='online'?rentalFee:total,'PENDING']);
    await client.query("INSERT INTO rental_status_history(rental_id,from_status,to_status,note) VALUES($1,NULL,'PENDING',$2)",[rental.id,'Khách hàng gửi yêu cầu thuê']);
    await client.query('COMMIT');
    return mapRental(rental,{productId:product.id,productName:product.name,paymentMethod});
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

export async function completeRentalPayment(rentalId,userId){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const found=await client.query(`
      SELECT r.*,p.payment_method,p.amount,pr.slug AS product_slug,pr.name AS product_name
      FROM rentals r
      JOIN payments p ON p.rental_id=r.id
      JOIN rental_items ri ON ri.rental_id=r.id
      JOIN products pr ON pr.id=ri.product_id
      WHERE r.id=$1 AND r.user_id=$2
      FOR UPDATE OF r,p
    `,[rentalId,userId]);
    if(!found.rowCount){const error=new Error('Không tìm thấy đơn thuê.');error.status=404;throw error}
    const rental=found.rows[0],paidAt=new Date();
    await client.query("UPDATE payments SET status='PAID_SIMULATED',paid_at=$1 WHERE rental_id=$2",[paidAt,rental.id]);
    const invoiceCode=`TMA-HD-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const invoice=await client.query(`
      INSERT INTO invoices (rental_id,invoice_code,total_amount,issued_at)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (rental_id) DO UPDATE SET total_amount=EXCLUDED.total_amount
      RETURNING invoice_code,issued_at
    `,[rental.id,invoiceCode,rental.amount,paidAt]);
    await client.query('COMMIT');
    return {...mapRental(rental,{productId:rental.product_slug,productName:rental.product_name,paymentMethod:rental.payment_method}),paymentStatus:'PAID_SIMULATED',paidAt:paidAt.toISOString(),paidAmount:Number(rental.amount),invoiceCode:invoice.rows[0].invoice_code};
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

function mapRental(row,extra={}){
  const days=Math.floor((new Date(row.end_date)-new Date(row.start_date))/86400000)+1;
  return {id:row.id,code:row.rental_code,userId:row.user_id,productId:extra.productId,productName:extra.productName,startDate:String(row.start_date).slice(0,10),endDate:String(row.end_date).slice(0,10),days,pricePerDay:days?Number(row.rental_fee)/days:0,rentalFee:Number(row.rental_fee),deposit:Number(row.deposit_amount),total:Number(row.total_amount),fullName:row.full_name,phone:row.phone,email:row.email,deliveryMethod:row.delivery_method,address:row.delivery_address||'',deliveryTime:row.delivery_time||'',returnTime:row.return_time||'',note:row.note||'',paymentMethod:extra.paymentMethod,status:row.status,createdAt:row.created_at};
}
