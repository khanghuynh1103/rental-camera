import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import routes from './routes.js';
import { testDatabaseConnection } from './db.js';

const app=express();
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port=Number(process.env.PORT)||3000;
app.disable('x-powered-by');
app.use(express.json({limit:'100kb'}));
app.use(cookieParser());
app.use('/api',routes);
app.use(express.static(path.join(root,'dist')));
app.get('/{*splat}',(_req,res)=>res.sendFile(path.join(root,'dist','index.html')));
app.use((error,_req,res,next)=>{void next;console.error(error);res.status(error.status||500).json({message:error.status?error.message:'Máy chủ gặp lỗi. Vui lòng thử lại.'})});

try {
  const database = await testDatabaseConnection();
  console.log(`Đã kết nối PostgreSQL: ${database.database_name}`);
} catch (error) {
  console.error('Không thể kết nối PostgreSQL:');
  console.error(error.message);
  process.exit(1);
}

const server=app.listen(port,()=>console.log(`Trạm Máy Ảnh đang chạy tại http://localhost:${port}`));
server.on('error',error=>{if(error.code==='EADDRINUSE'){console.error(`Cổng ${port} đang được sử dụng. Hãy đóng tiến trình cũ hoặc đặt PORT khác.`);process.exit(1)}throw error});
