import { Router } from 'express';
import { requireAuth, requireRole } from './auth.js';
import { pool, query } from './db.js';

const router=Router();
const adminOnly=[requireAuth,requireRole('ADMIN')];
const transitions={PENDING:['CONFIRMED','CANCELLED'],CONFIRMED:['DELIVERING','CANCELLED'],DELIVERING:['RENTING'],RENTING:['RETURNING'],RETURNING:['COMPLETED']};
const clean=value=>String(value??'').trim();

router.get('/admin/rentals',...adminOnly,async(req,res)=>{
  const page=Math.max(1,Number.parseInt(req.query.page)||1),limit=10,offset=(page-1)*limit;
  const search=clean(req.query.q),status=clean(req.query.status),from=clean(req.query.from)||null,to=clean(req.query.to)||null;
  const params=[`%${search}%`,status,from,to,limit,offset];
  const where=`WHERE ($1='' OR r.rental_code ILIKE $1 OR r.full_name ILIKE $1 OR r.phone ILIKE $1 OR p.name ILIKE $1)
    AND ($2='' OR r.status=$2) AND ($3::DATE IS NULL OR r.start_date >= $3::DATE) AND ($4::DATE IS NULL OR r.end_date <= $4::DATE)`;
  const [items,count]=await Promise.all([
    query(`SELECT r.id,r.rental_code AS code,r.full_name AS "customerName",r.phone,r.start_date AS "startDate",r.end_date AS "endDate",
      r.total_amount::FLOAT AS total,r.status,r.delivery_method AS "deliveryMethod",r.created_at AS "createdAt",
      STRING_AGG(DISTINCT p.name,', ') AS "productName",pay.status AS "paymentStatus"
      FROM rentals r JOIN rental_items ri ON ri.rental_id=r.id JOIN products p ON p.id=ri.product_id
      LEFT JOIN payments pay ON pay.rental_id=r.id ${where}
      GROUP BY r.id,pay.status ORDER BY r.created_at DESC LIMIT $5 OFFSET $6`,params),
    query(`SELECT COUNT(DISTINCT r.id)::INT AS total FROM rentals r JOIN rental_items ri ON ri.rental_id=r.id JOIN products p ON p.id=ri.product_id ${where}`,params.slice(0,4))
  ]);
  const total=count.rows[0].total;res.json({rentals:items.rows,page,total,totalPages:Math.max(1,Math.ceil(total/limit))});
});

router.get('/admin/rentals/:id',...adminOnly,async(req,res)=>{
  const [rental,items,history]=await Promise.all([
    query(`SELECT r.*,pay.payment_method AS "paymentMethod",pay.status AS "paymentStatus",pay.amount::FLOAT AS "paidAmount",pay.paid_at AS "paidAt",
      inv.invoice_code AS "invoiceCode",inv.issued_at AS "invoiceIssuedAt"
      FROM rentals r LEFT JOIN payments pay ON pay.rental_id=r.id LEFT JOIN invoices inv ON inv.rental_id=r.id WHERE r.id=$1`,[req.params.id]),
    query(`SELECT p.name AS "productName",p.slug,e.equipment_code AS "equipmentCode",ri.price_per_day::FLOAT AS "pricePerDay"
      FROM rental_items ri JOIN products p ON p.id=ri.product_id LEFT JOIN equipment_items e ON e.id=ri.equipment_item_id WHERE ri.rental_id=$1`,[req.params.id]),
    query(`SELECT h.id,h.from_status AS "fromStatus",h.to_status AS "toStatus",h.note,h.changed_at AS "changedAt",u.full_name AS "changedBy"
      FROM rental_status_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.rental_id=$1 ORDER BY h.changed_at DESC`,[req.params.id])
  ]);
  if(!rental.rowCount)return res.status(404).json({message:'Không tìm thấy đơn thuê.'});
  const row=rental.rows[0];
  res.json({rental:{id:row.id,code:row.rental_code,customerName:row.full_name,phone:row.phone,email:row.email,startDate:row.start_date,endDate:row.end_date,deliveryMethod:row.delivery_method,address:row.delivery_address,deliveryTime:row.delivery_time,returnTime:row.return_time,note:row.note,rentalFee:Number(row.rental_fee),deposit:Number(row.deposit_amount),total:Number(row.total_amount),status:row.status,createdAt:row.created_at,paymentMethod:row.paymentMethod,paymentStatus:row.paymentStatus,paidAmount:row.paidAmount,paidAt:row.paidAt,invoiceCode:row.invoiceCode,invoiceIssuedAt:row.invoiceIssuedAt,items:items.rows,history:history.rows,allowedTransitions:transitions[row.status]||[]}});
});

router.patch('/admin/rentals/:id/status',...adminOnly,async(req,res)=>{
  const next=clean(req.body.status).toUpperCase(),note=clean(req.body.note);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const found=await client.query('SELECT * FROM rentals WHERE id=$1 FOR UPDATE',[req.params.id]);
    if(!found.rowCount){await client.query('ROLLBACK');return res.status(404).json({message:'Không tìm thấy đơn thuê.'})}
    const rental=found.rows[0];
    if(!(transitions[rental.status]||[]).includes(next)){await client.query('ROLLBACK');return res.status(409).json({message:`Không thể chuyển từ ${rental.status} sang ${next}.`})}
    if(next==='CANCELLED'&&!note){await client.query('ROLLBACK');return res.status(422).json({message:'Vui lòng nhập lý do từ chối hoặc hủy đơn.'})}
    if(next==='CONFIRMED'){
      const rentalItems=await client.query('SELECT * FROM rental_items WHERE rental_id=$1 FOR UPDATE',[rental.id]);
      for(const item of rentalItems.rows){
        const usable=await client.query(`SELECT e.id FROM equipment_items e WHERE e.id=$1 AND e.status='AVAILABLE' AND NOT EXISTS(
          SELECT 1 FROM rental_items other JOIN rentals r ON r.id=other.rental_id WHERE other.equipment_item_id=e.id AND r.id<>$2
          AND r.status=ANY($3::VARCHAR[]) AND r.start_date<=$5::DATE AND r.end_date>=$4::DATE)`,[item.equipment_item_id,rental.id,['PENDING','CONFIRMED','DELIVERING','RENTING','RETURNING'],rental.start_date,rental.end_date]);
        if(!usable.rowCount){
          const replacement=await client.query(`SELECT e.id FROM equipment_items e WHERE e.product_id=$1 AND e.status='AVAILABLE' AND NOT EXISTS(
            SELECT 1 FROM rental_items other JOIN rentals r ON r.id=other.rental_id WHERE other.equipment_item_id=e.id AND r.id<>$2
            AND r.status=ANY($3::VARCHAR[]) AND r.start_date<=$5::DATE AND r.end_date>=$4::DATE) ORDER BY e.equipment_code LIMIT 1 FOR UPDATE OF e SKIP LOCKED`,[item.product_id,rental.id,['PENDING','CONFIRMED','DELIVERING','RENTING','RETURNING'],rental.start_date,rental.end_date]);
          if(!replacement.rowCount){await client.query('ROLLBACK');return res.status(409).json({message:'Không còn thiết bị phù hợp trong thời gian thuê. Hãy bổ sung kho hoặc từ chối đơn.'})}
          await client.query('UPDATE rental_items SET equipment_item_id=$1 WHERE id=$2',[replacement.rows[0].id,item.id]);
        }
      }
    }
    if(next==='DELIVERING')await client.query(`UPDATE equipment_items SET status='RENTING' WHERE id IN(SELECT equipment_item_id FROM rental_items WHERE rental_id=$1)`,[rental.id]);
    if(['COMPLETED','CANCELLED'].includes(next))await client.query(`UPDATE equipment_items SET status='AVAILABLE' WHERE id IN(SELECT equipment_item_id FROM rental_items WHERE rental_id=$1) AND status IN('RESERVED','RENTING')`,[rental.id]);
    await client.query('UPDATE rentals SET status=$1 WHERE id=$2',[next,rental.id]);
    await client.query('INSERT INTO rental_status_history(rental_id,from_status,to_status,note,changed_by) VALUES($1,$2,$3,$4,$5)',[rental.id,rental.status,next,note||null,req.user.id]);
    await client.query('COMMIT');res.json({message:'Đã cập nhật trạng thái đơn thuê.',status:next});
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
});

export default router;
