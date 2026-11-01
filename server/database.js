import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, 'data');
const file = path.join(dataDir, 'database.json');
export const hashPassword = (password, salt=crypto.randomBytes(16).toString('hex')) => ({ salt, hash:crypto.scryptSync(password,salt,64).toString('hex') });
export const verifyPassword = (password,user) => {const salt=user.passwordSalt??user.password_salt,hash=user.passwordHash??user.password_hash;return Boolean(salt&&hash)&&crypto.timingSafeEqual(crypto.scryptSync(password,salt,64),Buffer.from(hash,'hex'))};
export const publicUser = source => ({id:source.id,fullName:source.fullName??source.full_name,email:source.email,phone:source.phone||'',role:source.role,createdAt:source.createdAt??source.created_at});
export function initDatabase(){fs.mkdirSync(dataDir,{recursive:true});if(fs.existsSync(file))return;const admin=hashPassword('Admin@123'),customer=hashPassword('Khachhang@123'),createdAt=new Date().toISOString();writeDatabase({users:[{id:crypto.randomUUID(),fullName:'Quản trị viên',email:'admin@trammayanh.vn',phone:'0900000000',role:'ADMIN',passwordSalt:admin.salt,passwordHash:admin.hash,createdAt},{id:crypto.randomUUID(),fullName:'Khách hàng mẫu',email:'khachhang@example.com',phone:'0912345678',role:'CUSTOMER',passwordSalt:customer.salt,passwordHash:customer.hash,createdAt}],rentals:[]})}
export const readDatabase=()=>JSON.parse(fs.readFileSync(file,'utf8'));
export function writeDatabase(data){const temp=`${file}.tmp`;fs.writeFileSync(temp,JSON.stringify(data,null,2));fs.renameSync(temp,file)}
