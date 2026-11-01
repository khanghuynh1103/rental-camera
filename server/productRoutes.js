import { Router } from 'express';
import { getProductBySlug, listProducts } from './productRepository.js';
import { countAvailableEquipment } from './rentalRepository.js';
import { requireAuth } from './auth.js';

const router=Router();

router.get('/products',async(req,res)=>{
  let result=await listProducts();
  const brand=String(req.query.brand||'all').toLowerCase();
  const category=String(req.query.category||'all').toLowerCase();
  const subcategory=String(req.query.subcategory||'').toLowerCase();
  const search=String(req.query.q||'').trim().toLocaleLowerCase('vi');

  if(brand!=='all')result=result.filter(item=>item.brand===brand);
  if(category!=='all'){
    if(category==='lighting')result=result.filter(item=>['light','flash','accessory'].includes(item.category));
    else if(category==='video'&&subcategory==='micro')result=result.filter(item=>['video','audio'].includes(item.category));
    else result=result.filter(item=>item.category===category);
  }
  if(subcategory){
    const matches={gimbal:item=>item.category==='video'&&/dji-rs|zhiyun/.test(item.id),micro:item=>item.category==='audio','action-camera':item=>item.category==='video'&&/action|gopro|insta360/.test(item.id),'studio-light':item=>item.category==='light',flash:item=>item.category==='flash','light-stand':item=>item.category==='accessory'&&/260t|1004bac|195s/.test(item.id)};
    if(matches[subcategory])result=result.filter(matches[subcategory]);
  }
  if(search)result=result.filter(item=>`${item.name} ${item.brandLabel} ${item.spec}`.toLocaleLowerCase('vi').includes(search));

  const startDate=req.query.startDate?new Date(req.query.startDate):null;
  const endDate=req.query.endDate?new Date(req.query.endDate):null;
  if(startDate&&endDate&&!Number.isNaN(startDate.getTime())&&!Number.isNaN(endDate.getTime())&&endDate>=startDate){
    const availability=await Promise.all(result.map(async product=>[product.id,await countAvailableEquipment(product.databaseId,req.query.startDate,req.query.endDate)]));
    const availableIds=new Set(availability.filter(([,count])=>count>0).map(([id])=>id));
    result=result.filter(product=>availableIds.has(product.id));
  }
  if(req.query.featured==='true')result=result.filter(item=>item.featured).sort((a,b)=>b.rentalCount-a.rentalCount);
  if(req.query.sort==='low')result.sort((a,b)=>a.price-b.price);
  if(req.query.sort==='high')result.sort((a,b)=>b.price-a.price);

  const total=result.length,page=Math.max(1,Number.parseInt(req.query.page)||1),limit=Math.min(24,Math.max(1,Number.parseInt(req.query.limit)||12)),totalPages=Math.max(1,Math.ceil(total/limit)),safePage=Math.min(page,totalPages),start=(safePage-1)*limit;
  res.json({products:result.slice(start,start+limit),total,page:safePage,limit,totalPages,rentalPeriod:startDate&&endDate?{startDate:req.query.startDate,endDate:req.query.endDate}:null});
});

router.get('/products/:id',requireAuth,async(req,res)=>{
  const product=await getProductBySlug(req.params.id);
  return product?res.json({product}):res.status(404).json({message:'Không tìm thấy sản phẩm.'});
});

router.post('/products/:id/availability',requireAuth,async(req,res)=>{
  const product=await getProductBySlug(req.params.id);
  if(!product)return res.status(404).json({message:'Không tìm thấy sản phẩm.'});
  const start=new Date(req.body.startDate),end=new Date(req.body.endDate);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<start)return res.status(422).json({message:'Khoảng thời gian thuê không hợp lệ.'});
  const today=new Date();today.setHours(0,0,0,0);
  if(start<today)return res.status(422).json({message:'Ngày nhận không được nằm trong quá khứ.'});
  const remaining=await countAvailableEquipment(product.databaseId,req.body.startDate,req.body.endDate),available=remaining>0;
  res.json({available,message:available?`${product.name} đang có thể thuê trong thời gian bạn chọn.`:`${product.name} đã hết lịch trong thời gian này.`,remaining});
});

export default router;
