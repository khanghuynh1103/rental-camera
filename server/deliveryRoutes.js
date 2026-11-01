import { Router } from 'express';
import { requireAuth, requireRole } from './auth.js';
import { pool, query } from './db.js';

const router=Router();
const staffOnly=[requireAuth,requireRole('DELIVERY_STAFF')];
const taskStatuses=['CONFIRMED','DELIVERING','RENTING','RETURNING'];
const transitions={CONFIRMED:'DELIVERING',DELIVERING:'RENTING',RENTING:'RETURNING',RETURNING:'COMPLETED'};
const inspections=['GOOD','SCRATCHED','DAMAGED','MISSING_ACCESSORIES'];
const clean=value=>String(value??'').trim();
const proofPattern=/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

router.get('/delivery/tasks',...staffOnly,async(req,res)=>{
  const page=Math.max(1,Number.parseInt(req.query.page)||1),limit=10,offset=(page-1)*limit,status=clean(req.query.status),date=clean(req.query.date)||null;
  if(status&&!taskStatuses.includes(status))return res.status(422).json({message:'Trạng thái lọc không hợp lệ.'});
  const params=[taskStatuses,status,date,req.user.id,limit,offset];
  const where=`WHERE r.delivery_method='delivery' AND r.assigned_delivery_staff_id=$4 AND r.status=ANY($1::VARCHAR[]) AND ($2='' OR r.status=$2)
    AND ($3::DATE IS NULL OR r.start_date=$3::DATE OR r.end_date=$3::DATE)`;
  const [items,count]=await Promise.all([
    query(`SELECT r.id,r.rental_code AS code,r.full_name AS "customerName",r.phone,r.delivery_address AS address,
      r.delivery_time AS "deliveryTime",r.return_time AS "returnTime",r.start_date AS "startDate",r.end_date AS "endDate",r.status,
      STRING_AGG(DISTINCT p.name,', ') AS "productName",STRING_AGG(DISTINCT e.equipment_code,', ') AS "equipmentCode"
      FROM rentals r JOIN rental_items ri ON ri.rental_id=r.id JOIN products p ON p.id=ri.product_id
      LEFT JOIN equipment_items e ON e.id=ri.equipment_item_id ${where}
      GROUP BY r.id ORDER BY CASE WHEN r.status='RETURNING' THEN 1 WHEN r.status='CONFIRMED' THEN 2 ELSE 3 END,r.start_date LIMIT $5 OFFSET $6`,params),
    query(`SELECT COUNT(DISTINCT r.id)::INT AS total FROM rentals r ${where}`,params.slice(0,4))
  ]);
  const total=count.rows[0].total;res.json({tasks:items.rows,page,total,totalPages:Math.max(1,Math.ceil(total/limit))});
});

router.get('/delivery/tasks/:id',...staffOnly,async(req,res)=>{
  const [rental,items,logs]=await Promise.all([
    query(`SELECT id,rental_code AS code,full_name AS "customerName",phone,email,start_date AS "startDate",end_date AS "endDate",
      delivery_address AS address,delivery_time AS "deliveryTime",return_time AS "returnTime",note,status
      FROM rentals WHERE id=$1 AND delivery_method='delivery' AND assigned_delivery_staff_id=$2`,[req.params.id,req.user.id]),
    query(`SELECT ri.equipment_item_id AS "equipmentId",p.name AS "productName",e.equipment_code AS "equipmentCode",e.condition,e.status AS "equipmentStatus"
      FROM rental_items ri JOIN products p ON p.id=ri.product_id LEFT JOIN equipment_items e ON e.id=ri.equipment_item_id WHERE ri.rental_id=$1`,[req.params.id]),
    query(`SELECT l.id,l.action,l.inspection_result AS "inspectionResult",l.note,
      CASE WHEN l.proof_image IS NULL THEN NULL ELSE '/api/delivery/logs/' || l.id || '/proof' END AS "proofImage",
      l.created_at AS "createdAt",u.full_name AS "createdBy"
      FROM delivery_logs l LEFT JOIN users u ON u.id=l.created_by WHERE l.rental_id=$1 ORDER BY l.created_at DESC`,[req.params.id])
  ]);
  if(!rental.rowCount)return res.status(404).json({message:'Không tìm thấy công việc giao nhận.'});
  const task=rental.rows[0];
  if(!taskStatuses.includes(task.status))return res.status(409).json({message:'Đơn này không còn trong quy trình giao nhận.'});
  res.json({task:{...task,items:items.rows,logs:logs.rows,nextStatus:transitions[task.status]}});
});

router.get('/delivery/logs/:id/proof',...staffOnly,async(req,res)=>{
  if(!/^\d+$/.test(req.params.id))return res.status(404).json({message:'Không tìm thấy ảnh bằng chứng.'});
  const result=await query(`SELECT l.proof_image FROM delivery_logs l JOIN rentals r ON r.id=l.rental_id
    WHERE l.id=$1 AND r.assigned_delivery_staff_id=$2`,[req.params.id,req.user.id]);
  const data=result.rows[0]?.proof_image;
  const match=data?.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  if(!match)return res.status(404).json({message:'Không tìm thấy ảnh bằng chứng.'});
  res.set('Cache-Control','private, no-store');
  res.type(`image/${match[1]}`).send(Buffer.from(match[2],'base64'));
});

router.patch('/delivery/tasks/:id/status',...staffOnly,async(req,res)=>{
  const requested=clean(req.body.status).toUpperCase(),note=clean(req.body.note),inspection=clean(req.body.inspectionResult).toUpperCase(),proofImage=clean(req.body.proofImage);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const found=await client.query("SELECT * FROM rentals WHERE id=$1 AND delivery_method='delivery' AND assigned_delivery_staff_id=$2 FOR UPDATE",[req.params.id,req.user.id]);
    if(!found.rowCount){await client.query('ROLLBACK');return res.status(404).json({message:'Không tìm thấy công việc giao nhận.'})}
    const rental=found.rows[0],expected=transitions[rental.status];
    if(!expected||requested!==expected){await client.query('ROLLBACK');return res.status(409).json({message:'Không thể thực hiện bước này với trạng thái hiện tại.'})}
    if(['RENTING','COMPLETED'].includes(requested)&&!proofImage){await client.query('ROLLBACK');return res.status(422).json({message:'Vui lòng chụp hoặc chọn ảnh bằng chứng bàn giao/thu hồi.'})}
    if(proofImage&&(!proofPattern.test(proofImage)||Buffer.byteLength(proofImage,'utf8')>4*1024*1024)){await client.query('ROLLBACK');return res.status(422).json({message:'Ảnh bằng chứng phải là JPEG, PNG hoặc WebP và không quá 3 MB.'})}
    if(requested==='COMPLETED'&&!inspections.includes(inspection)){await client.query('ROLLBACK');return res.status(422).json({message:'Vui lòng kiểm tra tình trạng thiết bị khi thu hồi.'})}
    if(requested==='COMPLETED'&&inspection!=='GOOD'&&!note){await client.query('ROLLBACK');return res.status(422).json({message:'Vui lòng mô tả tình trạng hoặc phụ kiện bị thiếu.'})}
    const equipment=await client.query('SELECT equipment_item_id FROM rental_items WHERE rental_id=$1',[rental.id]);
    if(requested==='DELIVERING')await client.query(`UPDATE equipment_items SET status='RENTING' WHERE id IN(SELECT equipment_item_id FROM rental_items WHERE rental_id=$1)`,[rental.id]);
    if(requested==='COMPLETED'){
      const equipmentStatus=inspection==='GOOD'?'AVAILABLE':inspection==='DAMAGED'?'DAMAGED':'MAINTENANCE';
      const equipmentCondition=inspection==='GOOD'?'GOOD':inspection==='SCRATCHED'?'FAIR':inspection==='DAMAGED'?'DAMAGED':'FAIR';
      await client.query('UPDATE equipment_items SET status=$1,condition=$2 WHERE id=ANY($3::UUID[])',[equipmentStatus,equipmentCondition,equipment.rows.map(row=>row.equipment_item_id)]);
      if(inspection!=='GOOD')for(const item of equipment.rows)await client.query(`INSERT INTO rental_incidents(rental_id,equipment_item_id,incident_type,description,reported_by) VALUES($1,$2,$3,$4,$5)`,[rental.id,item.equipment_item_id,inspection,note,req.user.id]);
    }
    await client.query('UPDATE rentals SET status=$1 WHERE id=$2',[requested,rental.id]);
    await client.query('INSERT INTO rental_status_history(rental_id,from_status,to_status,note,changed_by) VALUES($1,$2,$3,$4,$5)',[rental.id,rental.status,requested,note||null,req.user.id]);
    await client.query('INSERT INTO delivery_logs(rental_id,action,inspection_result,note,proof_image,created_by) VALUES($1,$2,$3,$4,$5,$6)',[rental.id,requested,inspection||null,note||null,proofImage||null,req.user.id]);
    await client.query('COMMIT');res.json({message:requested==='COMPLETED'?'Đã hoàn tất thu hồi và cập nhật kho.':'Đã cập nhật công việc giao nhận.',status:requested});
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
});

export default router;
