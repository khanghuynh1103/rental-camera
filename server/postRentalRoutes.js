import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth, requireRole } from './auth.js';
import { pool, query } from './db.js';

const router=Router();
const customerOnly=[requireAuth,requireRole('CUSTOMER')],adminOnly=[requireAuth,requireRole('ADMIN')];
const activeStatuses=['PENDING','CONFIRMED','DELIVERING','RENTING','RETURNING'];
const clean=value=>String(value??'').trim();

router.get('/account/rentals',...customerOnly,async(req,res)=>{
  const rentals=await query(`SELECT r.id,r.rental_code AS code,r.start_date AS "startDate",r.end_date AS "endDate",r.status,
    r.total_amount::FLOAT AS total,r.delivery_method AS "deliveryMethod",STRING_AGG(DISTINCT p.name,', ') AS "productName"
    FROM rentals r JOIN rental_items ri ON ri.rental_id=r.id JOIN products p ON p.id=ri.product_id
    WHERE r.user_id=$1 GROUP BY r.id ORDER BY r.created_at DESC`,[req.user.id]);
  const extensions=await query(`SELECT x.id,x.rental_id AS "rentalId",r.rental_code AS code,x.old_end_date AS "oldEndDate",x.requested_end_date AS "requestedEndDate",x.reason,x.status,x.extra_amount::FLOAT AS "extraAmount",x.created_at AS "createdAt"
    FROM rental_extensions x JOIN rentals r ON r.id=x.rental_id WHERE r.user_id=$1 ORDER BY x.created_at DESC`,[req.user.id]);
  const charges=await query(`SELECT c.id,c.rental_id AS "rentalId",r.rental_code AS code,c.charge_type AS "chargeType",c.description,c.amount::FLOAT,c.payment_status AS "paymentStatus",c.created_at AS "createdAt"
    FROM extra_charges c JOIN rentals r ON r.id=c.rental_id WHERE r.user_id=$1 ORDER BY c.created_at DESC`,[req.user.id]);
  res.json({rentals:rentals.rows,extensions:extensions.rows,charges:charges.rows});
});

router.post('/account/rentals/:id/extensions',...customerOnly,async(req,res)=>{
  const requested=new Date(req.body.requestedEndDate),reason=clean(req.body.reason);
  if(Number.isNaN(requested.getTime()))return res.status(422).json({message:'Ngày gia hạn không hợp lệ.'});
  const rental=await query('SELECT * FROM rentals WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);
  if(!rental.rowCount)return res.status(404).json({message:'Không tìm thấy đơn thuê.'});
  const row=rental.rows[0],oldEnd=new Date(row.end_date);
  if(!['CONFIRMED','DELIVERING','RENTING'].includes(row.status))return res.status(409).json({message:'Đơn thuê hiện không thể gia hạn.'});
  if(requested<=oldEnd)return res.status(422).json({message:'Ngày trả mới phải sau ngày trả hiện tại.'});
  try{const result=await query(`INSERT INTO rental_extensions(rental_id,old_end_date,requested_end_date,reason) VALUES($1,$2,$3,$4) RETURNING id`,[row.id,row.end_date,req.body.requestedEndDate,reason||null]);res.status(201).json({message:'Đã gửi yêu cầu gia hạn.',id:result.rows[0].id})}catch(error){if(error.code==='23505')return res.status(409).json({message:'Đơn này đang có một yêu cầu gia hạn chờ duyệt.'});throw error}
});

router.post('/account/charges/:id/payment',...customerOnly,async(req,res)=>{
  const result=await query(`UPDATE extra_charges c SET payment_status='PAID_SIMULATED',paid_at=NOW() FROM rentals r
    WHERE c.id=$1 AND c.rental_id=r.id AND r.user_id=$2 AND c.payment_status='PENDING' RETURNING c.rental_id,c.amount`,[req.params.id,req.user.id]);
  if(!result.rowCount)return res.status(404).json({message:'Không tìm thấy khoản phí cần thanh toán.'});
  const rentalId=result.rows[0].rental_id;
  await query(`INSERT INTO invoices(rental_id,invoice_code,total_amount) SELECT r.id,$2,r.total_amount FROM rentals r WHERE r.id=$1
    ON CONFLICT(rental_id) DO UPDATE SET total_amount=EXCLUDED.total_amount,issued_at=NOW()`,[rentalId,`TMA-HD-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`]);
  res.json({message:'Đã thanh toán mô phỏng khoản phí phát sinh.'});
});

router.get('/admin/extensions',...adminOnly,async(_req,res)=>{
  const result=await query(`SELECT x.id,x.rental_id AS "rentalId",r.rental_code AS code,r.full_name AS "customerName",p.name AS "productName",
    x.old_end_date AS "oldEndDate",x.requested_end_date AS "requestedEndDate",x.reason,x.status,x.extra_amount::FLOAT AS "extraAmount",x.created_at AS "createdAt"
    FROM rental_extensions x JOIN rentals r ON r.id=x.rental_id JOIN rental_items ri ON ri.rental_id=r.id JOIN products p ON p.id=ri.product_id
    ORDER BY CASE WHEN x.status='PENDING' THEN 0 ELSE 1 END,x.created_at DESC`);
  res.json({extensions:result.rows});
});

router.patch('/admin/extensions/:id',...adminOnly,async(req,res)=>{
  const decision=clean(req.body.status).toUpperCase();if(!['APPROVED','REJECTED'].includes(decision))return res.status(422).json({message:'Quyết định không hợp lệ.'});
  const client=await pool.connect();
  try{await client.query('BEGIN');const found=await client.query(`SELECT x.*,r.status AS rental_status FROM rental_extensions x JOIN rentals r ON r.id=x.rental_id WHERE x.id=$1 FOR UPDATE OF x,r`,[req.params.id]);
    if(!found.rowCount){await client.query('ROLLBACK');return res.status(404).json({message:'Không tìm thấy yêu cầu gia hạn.'})}const ext=found.rows[0];
    if(ext.status!=='PENDING'){await client.query('ROLLBACK');return res.status(409).json({message:'Yêu cầu này đã được xử lý.'})}
    let extra=0;
    if(decision==='APPROVED'){
      const conflict=await client.query(`SELECT 1 FROM rental_items mine JOIN rental_items other ON other.equipment_item_id=mine.equipment_item_id JOIN rentals r ON r.id=other.rental_id
        WHERE mine.rental_id=$1 AND other.rental_id<>$1 AND r.status=ANY($2::VARCHAR[]) AND r.start_date<=$3::DATE AND r.end_date>$4::DATE LIMIT 1`,[ext.rental_id,activeStatuses,ext.requested_end_date,ext.old_end_date]);
      if(conflict.rowCount){await client.query('ROLLBACK');return res.status(409).json({message:'Thiết bị đã có lịch thuê khác trong thời gian muốn gia hạn.'})}
      const pricing=await client.query('SELECT COALESCE(SUM(price_per_day),0)::INT AS daily FROM rental_items WHERE rental_id=$1',[ext.rental_id]);
      const days=Math.round((new Date(ext.requested_end_date)-new Date(ext.old_end_date))/86400000);extra=pricing.rows[0].daily*days;
      await client.query('UPDATE rentals SET end_date=$1,rental_fee=rental_fee+$2,total_amount=total_amount+$2 WHERE id=$3',[ext.requested_end_date,extra,ext.rental_id]);
      await client.query(`INSERT INTO extra_charges(rental_id,extension_id,charge_type,description,amount,created_by) VALUES($1,$2,'EXTENSION',$3,$4,$5)`,[ext.rental_id,ext.id,`Phí gia hạn thêm ${days} ngày`,extra,req.user.id]);
    }
    await client.query('UPDATE rental_extensions SET status=$1,extra_amount=$2,reviewed_by=$3,reviewed_at=NOW() WHERE id=$4',[decision,extra,req.user.id,ext.id]);
    await client.query('COMMIT');res.json({message:decision==='APPROVED'?'Đã duyệt yêu cầu gia hạn.':'Đã từ chối yêu cầu gia hạn.',extraAmount:extra});
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
});

router.get('/admin/incidents',...adminOnly,async(_req,res)=>{
  const result=await query(`SELECT i.id,i.rental_id AS "rentalId",r.rental_code AS code,r.full_name AS "customerName",e.equipment_code AS "equipmentCode",p.name AS "productName",
    i.incident_type AS "incidentType",i.description,i.status,i.resolution,i.fee_amount::FLOAT AS "feeAmount",i.created_at AS "createdAt"
    FROM rental_incidents i JOIN rentals r ON r.id=i.rental_id LEFT JOIN equipment_items e ON e.id=i.equipment_item_id LEFT JOIN products p ON p.id=e.product_id
    ORDER BY CASE WHEN i.status='PENDING_REVIEW' THEN 0 ELSE 1 END,i.created_at DESC`);
  res.json({incidents:result.rows});
});

router.patch('/admin/incidents/:id',...adminOnly,async(req,res)=>{
  const outcome=clean(req.body.equipmentOutcome).toUpperCase(),resolution=clean(req.body.resolution),fee=Number(req.body.feeAmount);
  if(!['AVAILABLE','MAINTENANCE','DAMAGED','RETIRED'].includes(outcome)||!resolution||!Number.isInteger(fee)||fee<0)return res.status(422).json({message:'Thông tin xử lý sự cố không hợp lệ.'});
  const client=await pool.connect();
  try{await client.query('BEGIN');const found=await client.query('SELECT * FROM rental_incidents WHERE id=$1 FOR UPDATE',[req.params.id]);if(!found.rowCount){await client.query('ROLLBACK');return res.status(404).json({message:'Không tìm thấy biên bản sự cố.'})}const incident=found.rows[0];if(incident.status==='RESOLVED'){await client.query('ROLLBACK');return res.status(409).json({message:'Biên bản này đã được xử lý.'})}
    await client.query('UPDATE rental_incidents SET status=\'RESOLVED\',resolution=$1,fee_amount=$2,resolved_by=$3,resolved_at=NOW() WHERE id=$4',[resolution,fee,req.user.id,incident.id]);
    await client.query('UPDATE equipment_items SET status=$1 WHERE id=$2',[outcome,incident.equipment_item_id]);
    if(fee>0){await client.query(`INSERT INTO extra_charges(rental_id,incident_id,charge_type,description,amount,created_by) VALUES($1,$2,'INCIDENT',$3,$4,$5)`,[incident.rental_id,incident.id,resolution,fee,req.user.id]);await client.query('UPDATE rentals SET total_amount=total_amount+$1 WHERE id=$2',[fee,incident.rental_id])}
    await client.query('COMMIT');res.json({message:'Đã xử lý sự cố và cập nhật thiết bị.'});
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
});

export default router;
