import { spawn } from 'node:child_process';
import { query, pool } from './db.js';

const port=3199,base=`http://localhost:${port}/api`;
const stamp=Date.now(),email=`workflow-${stamp}@example.com`,password='Workflow@123';
let server,rentalId;
const results=[];

function check(condition,name,detail=''){
  if(!condition)throw new Error(`${name}${detail?`: ${detail}`:''}`);
  results.push(name);
}

async function request(path,options={},cookie=''){
  const response=await fetch(base+path,{...options,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...options.headers}});
  let data;try{data=await response.json()}catch(error){data={parseError:error.message}}
  return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]||cookie};
}

async function ok(path,options={},cookie=''){
  const response=await request(path,options,cookie);
  if(response.status<200||response.status>=300)throw new Error(`${path} trả về ${response.status}: ${response.data.message||'Không rõ lỗi'}`);
  return response;
}

const json=(method,body)=>({method,body:JSON.stringify(body)});

async function waitForServer(){
  for(let attempt=0;attempt<40;attempt++){
    try{const response=await fetch(`${base}/products?limit=1`);if(response.ok)return}catch(error){if(attempt===39)throw error}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('Server kiểm thử không khởi động kịp thời.');
}

async function cleanup(){
  try{
    const rentals=await query("SELECT id FROM rentals WHERE note=$1",[`WORKFLOW_TEST_${stamp}`]);
    for(const rental of rentals.rows){
      const equipment=await query('SELECT equipment_item_id FROM rental_items WHERE rental_id=$1',[rental.id]);
      for(const item of equipment.rows)await query("UPDATE equipment_items SET status='AVAILABLE',condition='GOOD' WHERE id=$1",[item.equipment_item_id]);
      await query('DELETE FROM extra_charges WHERE rental_id=$1',[rental.id]);
      await query('DELETE FROM rental_extensions WHERE rental_id=$1',[rental.id]);
      await query('DELETE FROM rental_incidents WHERE rental_id=$1',[rental.id]);
      await query('DELETE FROM delivery_logs WHERE rental_id=$1',[rental.id]);
      await query('DELETE FROM invoices WHERE rental_id=$1',[rental.id]);
      await query('DELETE FROM payments WHERE rental_id=$1',[rental.id]);
      await query('DELETE FROM rental_status_history WHERE rental_id=$1',[rental.id]);
      await query('DELETE FROM rental_items WHERE rental_id=$1',[rental.id]);
      await query('DELETE FROM rentals WHERE id=$1',[rental.id]);
    }
    await query('DELETE FROM users WHERE email=$1',[email]);
  }finally{
    if(server&&!server.killed)server.kill('SIGTERM');
    await pool.end();
  }
}

try{
  server=spawn(process.execPath,['server/index.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
  let serverError='';server.stderr.on('data',chunk=>{serverError+=chunk.toString()});
  await waitForServer();check(!serverError.includes('EADDRINUSE'),'Khởi động server kiểm thử');

  const publicProducts=await ok('/products?limit=24');check(publicProducts.data.products.length>0,'API sản phẩm công khai');
  const chat=await ok('/chat/recommend',json('POST',{message:'Tìm máy ảnh chụp chân dung'}));check(Array.isArray(chat.data.recommendations)&&chat.data.recommendations.length>0,'Trợ lý gợi ý thiết bị từ kho');
  const priceRange=await ok('/chat/recommend',json('POST',{message:'có máy trên 500k mà dưới 700k ko'}));
  check(priceRange.data.recommendations.length>0 && priceRange.data.recommendations.every(item=>item.price>500000 && item.price<700000),'Trợ lý lọc đúng khoảng giá 500–700 nghìn');
  const upperBudget=await ok('/chat/recommend',json('POST',{message:'máy ảnh dưới 400k'}));
  check(upperBudget.data.recommendations.every(item=>item.price<400000),'Trợ lý giữ đúng mức giá tối đa');
  const lenses=await ok('/chat/recommend',json('POST',{message:'Tôi cần ống kính chụp chân dung'}));
  check(lenses.data.recommendations.length>0 && lenses.data.recommendations.every(item=>item.category==='lens'),'Tìm ống kính chỉ trả về ống kính');
  const cameras=await ok('/chat/recommend',json('POST',{message:'Tôi cần máy ảnh đi du lịch'}));
  check(cameras.data.recommendations.length>0 && cameras.data.recommendations.every(item=>item.category==='camera'),'Tìm máy ảnh chỉ trả về máy ảnh');
  const lensBudget=await ok('/chat/recommend',json('POST',{message:'Tìm ống kính dưới 400k'}));
  check(lensBudget.data.recommendations.every(item=>item.category==='lens' && item.price<400000),'Kết hợp đúng loại thiết bị và ngân sách');
  const guestDetail=await request(`/products/${publicProducts.data.products[0].id}`);check(guestDetail.status===401,'Chặn chi tiết thiết bị khi chưa đăng nhập');
  const unauthorized=await request('/admin/dashboard?range=7');check(unauthorized.status===401,'Chặn người chưa đăng nhập');
  const badLogin=await request('/auth/login',json('POST',{email:'none@example.com',password:'Sai@1234'}));check(badLogin.status===401,'Từ chối sai thông tin đăng nhập');

  const registered=await ok('/auth/register',json('POST',{fullName:'Khách kiểm thử quy trình',phone:'0909999996',email,password}));
  const customerCookie=registered.cookie;check(Boolean(customerCookie)&&Boolean(registered.data.user.id),'Đăng ký và tạo phiên khách hàng');
  const me=await ok('/auth/me',{},customerCookie);check(me.data.user.role==='CUSTOMER','Đọc phiên khách hàng');
  const customerDetail=await ok(`/products/${publicProducts.data.products[0].id}`,{},customerCookie);check(Boolean(customerDetail.data.product),'Khách đã đăng nhập xem được chi tiết thiết bị');
  const customerForbidden=await request('/admin/dashboard?range=7',{},customerCookie);check(customerForbidden.status===403,'Phân quyền khách hàng');

  let rental;
  for(const product of publicProducts.data.products){
    const availability=await request(`/products/${product.id}/availability`,json('POST',{startDate:'2035-05-20',endDate:'2035-05-21'}),customerCookie);
    if(availability.status!==200||!availability.data.available)continue;
    const created=await request('/rentals',json('POST',{productId:product.id,startDate:'2035-05-20',endDate:'2035-05-21',fullName:'Khách kiểm thử quy trình',phone:'0909999996',email,deliveryMethod:'delivery',address:'Địa chỉ kiểm thử tự động',deliveryTime:'09:00',returnTime:'17:00',note:`WORKFLOW_TEST_${stamp}`,paymentMethod:'online'}),customerCookie);
    if(created.status===201){rental=created.data.rental;break}
  }
  check(Boolean(rental),'Tạo đơn thuê và giữ thiết bị');rentalId=rental.id;
  const paid=await ok(`/rentals/${rentalId}/payment`,{method:'POST'},customerCookie);check(paid.data.rental.paymentStatus==='PAID_SIMULATED','Thanh toán và xuất hóa đơn ban đầu');
  const pendingReviewProduct=await query('SELECT p.slug FROM rental_items ri JOIN products p ON p.id=ri.product_id WHERE ri.rental_id=$1 LIMIT 1',[rentalId]);
  const pendingReview=await request(`/products/${pendingReviewProduct.rows[0].slug}/reviews`,json('POST',{rentalId,rating:5,liked:'Đánh giá quá sớm'}),customerCookie);
  check(pendingReview.status===403,'Chặn đánh giá trước khi hoàn tất thuê');
  const accountBefore=await ok('/account/rentals',{},customerCookie);check(accountBefore.data.rentals.some(item=>item.id===rentalId),'Đơn xuất hiện trong tài khoản khách');

  const adminLogin=await ok('/auth/login',json('POST',{email:'admin@trammayanh.vn',password:'Admin@123'}));const adminCookie=adminLogin.cookie;
  const adminList=await ok(`/admin/rentals?q=${rental.code}`,{},adminCookie);check(adminList.data.total===1,'Quản trị tìm thấy đơn');
  await ok(`/admin/rentals/${rentalId}/status`,json('PATCH',{status:'CONFIRMED',note:'Duyệt bởi kiểm thử tự động'}),adminCookie);results.push('Quản trị duyệt đơn');

  await query("UPDATE rentals SET start_date=CURRENT_DATE-1,end_date=CURRENT_DATE+2 WHERE id=$1",[rentalId]);
  const lateExtension=await request(`/account/rentals/${rentalId}/extensions`,json('POST',{requestedEndDate:new Date(Date.now()+3*86400000).toISOString().slice(0,10),reason:'Yêu cầu quá sát hạn'}),customerCookie);
  check(lateExtension.status===409,'Chặn yêu cầu gia hạn khi còn dưới 3 ngày');
  await query("UPDATE rentals SET start_date='2035-05-20',end_date='2035-05-21' WHERE id=$1",[rentalId]);
  await ok(`/account/rentals/${rentalId}/extensions`,json('POST',{requestedEndDate:'2035-05-23',reason:'Kiểm thử gia hạn hai ngày'}),customerCookie);results.push('Khách gửi yêu cầu gia hạn');
  const extensions=await ok('/admin/extensions',{},adminCookie);const extension=extensions.data.extensions.find(item=>item.rentalId===rentalId);check(Boolean(extension),'Quản trị nhận yêu cầu gia hạn');
  const extensionReview=await ok(`/admin/extensions/${extension.id}`,json('PATCH',{status:'APPROVED'}),adminCookie);check(extensionReview.data.extraAmount>0,'Duyệt và tính phí gia hạn');

  const staffList=await ok('/admin/delivery-staff',{},adminCookie);const assignedStaff=staffList.data.staff.find(item=>item.email==='giaonhan@trammayanh.vn');check(Boolean(assignedStaff),'Có nhân viên giao nhận để phân công');
  await ok(`/admin/rentals/${rentalId}/assignment`,json('PATCH',{staffId:assignedStaff.id}),adminCookie);results.push('Quản trị phân công nhân viên giao nhận');
  const staffLogin=await ok('/auth/login',json('POST',{email:assignedStaff.email,password:'Giaonhan@123'}));const staffCookie=staffLogin.cookie;
  const staffForbidden=await request('/admin/products',{},staffCookie);check(staffForbidden.status===403,'Phân quyền nhân viên giao nhận');
  const tasks=await ok('/delivery/tasks?status=CONFIRMED',{},staffCookie);check(tasks.data.tasks.some(item=>item.id===rentalId),'Đơn xuất hiện tại giao nhận');
  const proofImage='data:image/jpeg;base64,/9j/2Q==';
  await ok(`/delivery/tasks/${rentalId}/status`,json('PATCH',{status:'DELIVERING',note:'Kiểm thử DELIVERING'}),staffCookie);
  await ok(`/delivery/tasks/${rentalId}/status`,json('PATCH',{status:'RENTING',note:'Kiểm thử RENTING',proofImage}),staffCookie);
  const deliveryDetail=await ok(`/delivery/tasks/${rentalId}`,{},staffCookie);
  const proofUrl=deliveryDetail.data.task.logs.find(log=>log.proofImage)?.proofImage;
  check(Boolean(proofUrl),'Lịch sử giao nhận có URL ảnh bằng chứng');
  const proofResponse=await fetch(`http://localhost:${port}${proofUrl}`,{headers:{Cookie:staffCookie}});
  check(proofResponse.ok&&proofResponse.headers.get('content-type')?.includes('image/jpeg')&&(await proofResponse.arrayBuffer()).byteLength>0,'Ảnh bằng chứng tải riêng với quyền nhân viên');
  await ok(`/delivery/tasks/${rentalId}/status`,json('PATCH',{status:'RETURNING',note:'Kiểm thử RETURNING'}),staffCookie);
  await ok(`/delivery/tasks/${rentalId}/status`,json('PATCH',{status:'COMPLETED',inspectionResult:'MISSING_ACCESSORIES',note:'Thiếu nắp ống kính trong kiểm thử',proofImage}),staffCookie);results.push('Hoàn tất giao nhận có ảnh bằng chứng và tạo sự cố');
  const reviewProduct=await query('SELECT p.slug FROM rental_items ri JOIN products p ON p.id=ri.product_id WHERE ri.rental_id=$1 LIMIT 1',[rentalId]);
  const reviewPath=`/products/${reviewProduct.rows[0].slug}/reviews`;
  const beforeReview=await ok(reviewPath);check(beforeReview.data.count>=0,'Khách xem được đánh giá sản phẩm');
  const guestReview=await request(reviewPath,json('POST',{rentalId,rating:5,liked:'Khách vãng lai'}));check(guestReview.status===401,'Chặn khách vãng lai đăng đánh giá');
  const eligibleReviews=await ok(reviewPath,{},customerCookie);check(eligibleReviews.data.eligibleRentals.some(item=>item.id===rentalId),'Chỉ đơn hoàn tất mới có thể đánh giá');
  await ok(reviewPath,json('POST',{rentalId,rating:5,liked:'Thiết bị hoạt động tốt',disliked:'Hướng dẫn bàn giao có thể rõ hơn'}),customerCookie);results.push('Khách đăng đánh giá sau khi thuê');
  const duplicateReview=await request(reviewPath,json('POST',{rentalId,rating:4,liked:'Thử đánh giá lặp'}),customerCookie);check(duplicateReview.status===409,'Chặn đánh giá trùng đơn thuê');

  const incidentList=await ok('/admin/incidents',{},adminCookie);const incident=incidentList.data.incidents.find(item=>item.rentalId===rentalId);check(Boolean(incident),'Quản trị nhận biên bản sự cố');
  await ok(`/admin/incidents/${incident.id}`,json('PATCH',{resolution:'Thay nắp ống kính',feeAmount:150000,equipmentOutcome:'AVAILABLE'}),adminCookie);results.push('Xử lý sự cố và tính phí');

  let account=await ok('/account/rentals',{},customerCookie);const charges=account.data.charges.filter(item=>item.rentalId===rentalId);check(charges.length===2,'Tạo phí gia hạn và phí sự cố');
  for(const charge of charges)await ok(`/account/charges/${charge.id}/payment`,{method:'POST'},customerCookie);
  account=await ok('/account/rentals',{},customerCookie);check(account.data.charges.filter(item=>item.rentalId===rentalId).every(item=>item.paymentStatus==='PAID_SIMULATED'),'Thanh toán toàn bộ phí phát sinh');

  const dashboard=await ok('/admin/dashboard?range=30',{},adminCookie);check(Array.isArray(dashboard.data.series)&&dashboard.data.series.length===30,'Dashboard 30 ngày');
  const databaseCheck=await query(`SELECT r.status,r.end_date,e.status AS equipment_status,i.status AS incident_status,inv.total_amount
    FROM rentals r JOIN rental_items ri ON ri.rental_id=r.id JOIN equipment_items e ON e.id=ri.equipment_item_id
    JOIN rental_incidents i ON i.rental_id=r.id JOIN invoices inv ON inv.rental_id=r.id WHERE r.id=$1`,[rentalId]);
  const final=databaseCheck.rows[0];check(final.status==='COMPLETED','Trạng thái đơn cuối cùng');check(final.equipment_status==='AVAILABLE','Thiết bị trở lại kho');check(final.incident_status==='RESOLVED','Sự cố đã xử lý');check(Number(final.total_amount)>0,'Hóa đơn có tổng tiền');

  const logout=await ok('/auth/logout',{method:'POST'},customerCookie);check(logout.status===200,'Đăng xuất');const expired=await request('/auth/me',{},customerCookie);check(expired.status===401,'Phiên hết hiệu lực sau đăng xuất');
  await ok('/auth/logout',{method:'POST'},adminCookie);await ok('/auth/logout',{method:'POST'},staffCookie);results.push('Dọn phiên quản trị và giao nhận');
  console.log(`\n✓ ${results.length} kiểm tra đã vượt qua:`);for(const item of results)console.log(`  ✓ ${item}`);
}catch(error){console.error(`\n✗ Kiểm thử thất bại: ${error.message}`);process.exitCode=1}finally{await cleanup()}
