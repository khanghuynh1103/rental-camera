import { Router } from 'express';
import { requireAuth, requireRole } from './auth.js';
import { query } from './db.js';

const router=Router();
const adminOnly=[requireAuth,requireRole('ADMIN')];
const isoDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):null;

router.get('/admin/dashboard',...adminOnly,async(req,res)=>{
  const today=new Date(),range=Math.min(366,Math.max(1,Number.parseInt(req.query.range)||30));
  const defaultTo=today.toISOString().slice(0,10),fromDate=new Date(today);fromDate.setDate(fromDate.getDate()-range+1);
  const from=isoDate(req.query.from)||fromDate.toISOString().slice(0,10),to=isoDate(req.query.to)||defaultTo;
  if(new Date(from)>new Date(to))return res.status(422).json({message:'Khoảng thời gian không hợp lệ.'});
  if((new Date(to)-new Date(from))/86400000>366)return res.status(422).json({message:'Dashboard chỉ hỗ trợ tối đa 366 ngày.'});

  const [revenue,series,orders,inventory,products,incidents]=await Promise.all([
    query(`SELECT
      COALESCE((SELECT SUM(amount) FROM payments WHERE status='PAID_SIMULATED' AND paid_at::DATE BETWEEN $1 AND $2),0)::FLOAT AS "rentalRevenue",
      COALESCE((SELECT SUM(amount) FROM extra_charges WHERE payment_status='PAID_SIMULATED' AND paid_at::DATE BETWEEN $1 AND $2),0)::FLOAT AS "extraRevenue",
      COALESCE((SELECT SUM(amount) FROM payments WHERE status='PENDING'),0)::FLOAT+
      COALESCE((SELECT SUM(amount) FROM extra_charges WHERE payment_status='PENDING'),0)::FLOAT AS "pendingRevenue"`,[from,to]),
    query(`SELECT d.day::DATE AS date,
      (COALESCE((SELECT SUM(amount) FROM payments WHERE status='PAID_SIMULATED' AND paid_at::DATE=d.day),0)+
       COALESCE((SELECT SUM(amount) FROM extra_charges WHERE payment_status='PAID_SIMULATED' AND paid_at::DATE=d.day),0))::FLOAT AS amount
      FROM GENERATE_SERIES($1::DATE,$2::DATE,'1 day') d(day) ORDER BY d.day`,[from,to]),
    query(`SELECT status,COUNT(*)::INT AS count FROM rentals WHERE created_at::DATE BETWEEN $1 AND $2 GROUP BY status`,[from,to]),
    query(`SELECT status,COUNT(*)::INT AS count FROM equipment_items GROUP BY status`),
    query(`SELECT p.name,p.slug,COUNT(DISTINCT r.id)::INT AS "rentalCount",
      COALESCE(SUM((r.end_date-r.start_date)+1),0)::INT AS "rentalDays"
      FROM products p JOIN rental_items ri ON ri.product_id=p.id JOIN rentals r ON r.id=ri.rental_id
      WHERE r.created_at::DATE BETWEEN $1 AND $2 AND r.status<>'CANCELLED'
      GROUP BY p.id ORDER BY "rentalCount" DESC,"rentalDays" DESC LIMIT 5`,[from,to]),
    query(`SELECT
      COUNT(*) FILTER(WHERE status='PENDING_REVIEW')::INT AS pending,
      COUNT(*) FILTER(WHERE status='RESOLVED')::INT AS resolved,
      COALESCE(SUM(fee_amount) FILTER(WHERE status='RESOLVED'),0)::FLOAT AS "totalFees",
      COUNT(*) FILTER(WHERE incident_type='SCRATCHED')::INT AS scratched,
      COUNT(*) FILTER(WHERE incident_type='DAMAGED')::INT AS damaged,
      COUNT(*) FILTER(WHERE incident_type='MISSING_ACCESSORIES')::INT AS "missingAccessories"
      FROM rental_incidents WHERE created_at::DATE BETWEEN $1 AND $2`,[from,to])
  ]);
  const orderMap=Object.fromEntries(orders.rows.map(row=>[row.status,row.count])),inventoryMap=Object.fromEntries(inventory.rows.map(row=>[row.status,row.count]));
  const totalOrders=Object.values(orderMap).reduce((sum,value)=>sum+value,0),approved=(orderMap.CONFIRMED||0)+(orderMap.DELIVERING||0)+(orderMap.RENTING||0)+(orderMap.RETURNING||0)+(orderMap.COMPLETED||0);
  const equipmentTotal=Object.values(inventoryMap).reduce((sum,value)=>sum+value,0),equipmentUsed=(inventoryMap.RENTING||0)+(inventoryMap.RESERVED||0);
  res.json({period:{from,to},revenue:{...revenue.rows[0],total:Number(revenue.rows[0].rentalRevenue)+Number(revenue.rows[0].extraRevenue)},series:series.rows,
    orders:{total:totalOrders,approvalRate:totalOrders?Math.round(approved/totalOrders*100):0,byStatus:orderMap},
    inventory:{total:equipmentTotal,utilizationRate:equipmentTotal?Math.round(equipmentUsed/equipmentTotal*100):0,byStatus:inventoryMap},
    topProducts:products.rows,incidents:incidents.rows[0]});
});

export default router;
