import { Router } from 'express';
import { createSession, currentUser, destroySession, requireAuth, requireRole, sessionOptions } from './auth.js';
import { hashPassword, publicUser, verifyPassword } from './database.js';
import { query } from './db.js';
import productRoutes from './productRoutes.js';
import { getProductBySlug } from './productRepository.js';
import { completeRentalPayment, createRental } from './rentalRepository.js';
import roleRoutes from './roleRoutes.js';
import rentalAdminRoutes from './rentalAdminRoutes.js';
import deliveryRoutes from './deliveryRoutes.js';
import postRentalRoutes from './postRentalRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import reviewRoutes from './reviewRoutes.js';
import chatRoutes from './chatRoutes.js';

const router=Router();
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validate=body=>{const errors={};if(!body.fullName?.trim()||body.fullName.trim().length<2)errors.fullName='Họ tên phải có ít nhất 2 ký tự.';if(!emailPattern.test(body.email||''))errors.email='Email không hợp lệ.';if(!body.password||body.password.length<8||!/[A-Z]/.test(body.password)||!/[0-9]/.test(body.password))errors.password='Mật khẩu cần ít nhất 8 ký tự, một chữ hoa và một chữ số.';return errors};

router.use(productRoutes);
router.use(reviewRoutes);
router.use(chatRoutes);
router.use(roleRoutes);
router.use(rentalAdminRoutes);
router.use(deliveryRoutes);
router.use(postRentalRoutes);
router.use(dashboardRoutes);


router.post('/auth/register',async(req,res)=>{const errors=validate(req.body);if(Object.keys(errors).length)return res.status(422).json({message:'Vui lòng kiểm tra lại thông tin.',errors});const email=req.body.email.trim().toLowerCase(),existing=await query('SELECT id FROM users WHERE email=$1',[email]);if(existing.rowCount)return res.status(409).json({message:'Email này đã được sử dụng.'});const password=hashPassword(req.body.password),result=await query('INSERT INTO users (full_name,email,phone,password_hash,password_salt,role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,full_name,email,phone,role,created_at',[req.body.fullName.trim(),email,req.body.phone?.trim()||'',password.hash,password.salt,'CUSTOMER']);const user=publicUser(result.rows[0]),token=await createSession(user.id);res.cookie('session',token,sessionOptions).status(201).json({message:'Đăng ký thành công.',user})});
router.post('/auth/login',async(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase(),result=await query('SELECT * FROM users WHERE email=$1',[email]),user=result.rows[0];if(!user||!verifyPassword(String(req.body.password||''),user))return res.status(401).json({message:'Email hoặc mật khẩu không chính xác.'});const token=await createSession(user.id);res.cookie('session',token,sessionOptions).json({message:'Đăng nhập thành công.',user:publicUser(user)})});
router.post('/auth/logout',async(req,res)=>{await destroySession(req.cookies.session);res.clearCookie('session',{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/'}).json({message:'Đã đăng xuất.'})});
router.get('/auth/me',async(req,res)=>{const user=await currentUser(req);return user?res.json({user}):res.status(401).json({message:'Bạn chưa đăng nhập.'})});
router.patch('/account',requireAuth,async(req,res)=>{const user=req.user;if(!req.body.fullName?.trim()||req.body.fullName.trim().length<2)return res.status(422).json({message:'Họ tên phải có ít nhất 2 ký tự.'});const result=await query('UPDATE users SET full_name=$1,phone=$2 WHERE id=$3 RETURNING id,full_name,email,phone,role,created_at',[req.body.fullName.trim(),String(req.body.phone||'').trim(),user.id]);res.json({message:'Đã cập nhật thông tin.',user:publicUser(result.rows[0])})});
router.post('/rentals',requireAuth,requireRole('CUSTOMER'),async(req,res)=>{const user=req.user;const product=await getProductBySlug(req.body.productId);if(!product)return res.status(404).json({message:'Không tìm thấy sản phẩm.'});const start=new Date(req.body.startDate),end=new Date(req.body.endDate),today=new Date();today.setHours(0,0,0,0);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||start<today||end<start)return res.status(422).json({message:'Khoảng thời gian thuê không hợp lệ.'});if(!req.body.fullName?.trim()||!req.body.phone?.trim()||!emailPattern.test(req.body.email||''))return res.status(422).json({message:'Vui lòng điền đầy đủ thông tin liên hệ.'});if(req.body.deliveryMethod==='delivery'&&!req.body.address?.trim())return res.status(422).json({message:'Vui lòng nhập địa chỉ giao và thu hồi thiết bị.'});const rental=await createRental({user,product,startDate:req.body.startDate,endDate:req.body.endDate,fullName:req.body.fullName.trim(),phone:req.body.phone.trim(),email:req.body.email.trim(),deliveryMethod:req.body.deliveryMethod==='store'?'store':'delivery',address:String(req.body.address||'').trim(),deliveryTime:String(req.body.deliveryTime||'').trim(),returnTime:String(req.body.returnTime||'').trim(),note:String(req.body.note||'').trim(),paymentMethod:req.body.paymentMethod==='handover'?'handover':'online'});res.status(201).json({message:'Đã gửi yêu cầu thuê thành công.',rental})});

router.post('/rentals/:id/payment',requireAuth,requireRole('CUSTOMER'),async(req,res)=>{const rental=await completeRentalPayment(req.params.id,req.user.id);res.json({message:'Thanh toán mô phỏng thành công.',rental})});

export default router;


