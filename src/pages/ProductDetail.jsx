import { Input } from 'antd';
import UiButton from '../components/UiButton';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ProductReviews from '../components/ProductReviews';
import { api } from '../api';
import '../styles/productDetail.css';

const money=value=>new Intl.NumberFormat('vi-VN').format(value)+'đ';
const viewNames=['Chính diện','Góc trái','Góc phải'];

export default function ProductDetail(){
  const {id}=useParams();
  const navigate=useNavigate();
  const [product,setProduct]=useState(null),[activeImage,setActiveImage]=useState(0),[saved,setSaved]=useState(()=>JSON.parse(localStorage.getItem('cameraFavorites')||'[]').includes(id));
  const [message,setMessage]=useState('Chọn thời gian để kiểm tra thiết bị còn trống.'),[checking,setChecking]=useState(false),[error,setError]=useState(false);
  useEffect(()=>{let active=true;api.product(id).then(data=>{if(active){setProduct(data.product);document.title=`${data.product.name} | Trạm Máy Ảnh`}}).catch(()=>{if(active)setProduct(false)});return()=>{active=false}},[id]);
  if(product===null)return <div className="page-loader">Đang tải sản phẩm…</div>;
  if(product===false)return <div className="not-found"><h1>Không tìm thấy sản phẩm</h1><Link to="/products">← Quay lại danh sách thiết bị</Link></div>;
  const toggleSaved=()=>{const current=JSON.parse(localStorage.getItem('cameraFavorites')||'[]');const next=current.includes(id)?current.filter(item=>item!==id):[...current,id];localStorage.setItem('cameraFavorites',JSON.stringify(next));setSaved(next.includes(id))};
  const checkAvailability=async event=>{event.preventDefault();setChecking(true);setError(false);const values=Object.fromEntries(new FormData(event.currentTarget));try{const result=await api.availability(id,values);if(result.available){navigate(`/booking?product=${encodeURIComponent(id)}&start=${values.startDate}&end=${values.endDate}`);return}setMessage(`${result.message} Còn ${result.remaining} thiết bị.`);setError(true)}catch(e){setMessage(e.message);setError(true)}finally{setChecking(false)}};
  const today=new Date().toISOString().split('T')[0];
  return <><Header/><main>
    <div className="container detail-breadcrumb"><Link to="/">Trang chủ</Link><span>/</span><Link to="/products">Thiết bị</Link><span>/</span><strong>{product.name}</strong></div>
    <section className="detail-hero"><div className="container detail-layout">
      <div className="gallery"><div className="thumbs">{product.images.map((image,index)=><UiButton key={image} className={activeImage===index?'active':''} onClick={()=>setActiveImage(index)}><img src={image} alt=""/></UiButton>)}</div><div className="main-product-image"><img src={product.images[activeImage]} alt={`${product.name} - ${viewNames[activeImage]}`}/><span>{viewNames[activeImage]}</span></div></div>
      <div className="detail-info"><div className="available-detail">● {product.status}</div><p className="product-kicker">{product.brandLabel} · {product.format}</p><h1>{product.name}</h1><p className="short-spec">{product.spec}</p><a className="rating" href="#danh-gia">Xem đánh giá khách đã thuê ↓</a><div className="detail-price"><p><strong>{money(product.price)}</strong> / ngày</p><p>Tiền cọc dự kiến <strong>{money(product.deposit)}</strong></p></div>
        <form className="rental-card" onSubmit={checkAvailability}><h2>Kiểm tra lịch thuê</h2><div className="date-fields"><label>Ngày nhận thiết bị<Input name="startDate" type="date" min={today} required/></label><label>Ngày trả thiết bị<Input name="endDate" type="date" min={today} required/></label></div><p className={error?'availability error':'availability'}>{message}</p><div className="rental-actions"><UiButton disabled={checking}>{checking?'Đang kiểm tra…':'Kiểm tra và thuê thiết bị'}</UiButton><UiButton type="button" className={saved?'save active':'save'} onClick={toggleSaved} aria-label="Lưu yêu thích">{saved?'♥':'♡'}</UiButton></div><div className="assurances"><span>✓ Xác nhận lịch trước khi thanh toán</span><span>✓ Giao nhận và lưu ảnh bàn giao</span></div></form>
      </div>
    </div></section>
    <section className="product-description"><div className="container description-grid"><div><p className="eyebrow">Mô tả sản phẩm</p><h2>{product.headline}</h2>{product.description.map(text=><p key={text}>{text}</p>)}<div className="best-for"><strong>Phù hợp với</strong><div>{product.best.map(item=><span key={item}>{item}</span>)}</div></div></div><div><p className="eyebrow">Thông số kỹ thuật</p><h2>Thông tin chính.</h2><div className="spec-table">{product.specs.map(([key,value])=><div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div></div></div></section>
    <section className="included-section"><div className="container"><p className="eyebrow">Bộ thuê tiêu chuẩn</p><h2>Bạn sẽ nhận được gì?</h2><div className="included-grid">{product.included.map((item,index)=><article key={item}><span>0{index+1}</span><strong>{item}</strong><p>Được kiểm tra và ghi nhận tình trạng trước khi giao.</p></article>)}</div></div></section>
    <section className="detail-notice"><div className="container"><div><strong>Ảnh và thông số mang tính tham khảo.</strong><p>Tình trạng thực tế được nhân viên chụp và xác nhận khi bàn giao.</p></div><Link to="/products">Xem thiết bị khác →</Link></div></section>
  <ProductReviews productId={id} /></main><Footer/></>;
}
