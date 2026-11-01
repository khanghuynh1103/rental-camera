import { Input } from 'antd';
import UiButton from '../components/UiButton';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { categories, steps } from '../data';
import { api } from '../api';
import '../styles/home.css';
import '../styles/featured.css';

function SectionTitle({ eyebrow, children, dark=false }) { return <div className={`section-title ${dark?'light':''}`}><div><p className="eyebrow">{eyebrow}</p><h2>{children}</h2></div><a href="#tim-thiet-bi">Kiểm tra ngày thuê →</a></div>; }
const categoryIds=['camera','lens','video','light'];

export default function Home() {
  const navigate=useNavigate();
  const [message, setMessage] = useState('');
  const [featuredProducts, setFeaturedProducts] = useState([]);
  useEffect(()=>{let active=true;api.products({featured:'true'}).then(data=>{if(active)setFeaturedProducts(data.products)});return()=>{active=false}},[]);
  const search = event => { event.preventDefault(); const data = new FormData(event.currentTarget); const start=data.get('start'); const end=data.get('end'); if(!start||!end){setMessage('Vui lòng chọn đầy đủ ngày nhận và ngày trả.');return}if(end<start){setMessage('Ngày trả phải sau ngày nhận.');return}navigate(`/products?${new URLSearchParams({category:data.get('category'),startDate:start,endDate:end})}`); };
  return <><Header /><main>
    <section className="hero"><div className="container hero-card"><div className="hero-copy"><p className="eyebrow">Thiết bị tốt · Hành trình đẹp</p><h1>Chọn máy ảnh.<br/><em>Bắt đầu câu chuyện.</em></h1><p>Thuê máy ảnh, ống kính và thiết bị quay chụp với lịch trống minh bạch. Giao tận nơi, kiểm tra rõ ràng và hỗ trợ trong suốt thời gian thuê.</p><div><a className="button primary" href="#tim-thiet-bi">Kiểm tra lịch trống →</a><a className="button dark" href="/products">Xem sản phẩm</a></div></div><div className="hero-visual"><span className="available">● Có thiết bị trống hôm nay</span><div className="camera"><i></i></div><small>Máy ảnh được kiểm tra kỹ trước mỗi chuyến thuê.</small></div></div>
      <div className="container search-box" id="tim-thiet-bi"><form onSubmit={search}><label>Bạn cần thuê gì?<select name="category"><option value="camera">Máy ảnh</option><option value="lens">Ống kính</option><option value="video">Thiết bị quay</option><option value="audio">Âm thanh</option><option value="light">Đèn studio</option><option value="flash">Đèn flash</option><option value="accessory">Phụ kiện</option></select></label><label>Ngày nhận<Input name="start" type="date" min={new Date().toISOString().split('T')[0]} /></label><label>Ngày trả<Input name="end" type="date" min={new Date().toISOString().split('T')[0]} /></label><UiButton className="button primary">Tìm thiết bị</UiButton></form><p>{message}</p></div>
    </section>
    <section className="trust"><div className="container trust-grid">{[['✓','Lịch thuê minh bạch','Kiểm tra theo ngày thực tế'],['⌂','Giao nhận tận nơi','Nhân viên cửa hàng phụ trách'],['◎','Ảnh bàn giao rõ ràng','Đối chiếu trước và sau thuê'],['↗','Hỗ trợ gia hạn','Kiểm tra lịch trước khi duyệt']].map(x=><article key={x[1]}><i>{x[0]}</i><div><strong>{x[1]}</strong><small>{x[2]}</small></div></article>)}</div></section>
    <section className="section" id="thiet-bi"><div className="container"><SectionTitle eyebrow="Danh mục thiết bị">Một trạm, đủ thiết bị<br/>cho mọi góc nhìn.</SectionTitle><div className="category-grid">{categories.map(([n,icon,title,text],index)=><Link to={`/products?category=${categoryIds[index]}`} key={n}><article><b>{n}</b><i>{icon}</i><h3>{title}</h3><p>{text}</p></article></Link>)}</div></div></section>
    <section className="section featured" id="noi-bat"><div className="container"><SectionTitle eyebrow="Được thuê nhiều" dark>Máy ảnh được chuộng tuần này.</SectionTitle><div className="product-grid">{featuredProducts.map((product,index)=><article className="product featured-product" key={product.id}><div className="featured-media"><img src={product.images[0]} alt={product.name}/><span className="rank">0{index+1}</span><span className="featured-status">{product.status}</span></div><div className="product-info"><small>{product.brandLabel} · {product.format}</small><h3>{product.name}</h3><p className="rental-count">Đã được thuê {product.rentalCount} lượt</p><div><b>{new Intl.NumberFormat('vi-VN').format(product.price)}đ <small>/ ngày</small></b><Link to="/products" aria-label={`Xem ${product.name}`}>→</Link></div></div></article>)}</div><div className="featured-footer"><p>Những mẫu máy được khách hàng lựa chọn nhiều nhất trong tuần.</p><Link to="/products">Xem toàn bộ thiết bị →</Link></div></div></section>
    <section className="section process" id="quy-trinh"><div className="container process-grid"><div><p className="eyebrow">Cách thuê thiết bị</p><h2>Từ lựa chọn<br/>đến bàn giao.</h2><p>Mọi bước đều được theo dõi trên một hệ thống, giúp bạn chủ động thời gian và biết rõ tình trạng đơn thuê.</p><a className="button primary" href="#tim-thiet-bi">Bắt đầu chọn ngày</a></div><div>{steps.map(([n,title,text])=><article className="step" key={n}><b>{n}</b><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></div></section>
    <section className="story" id="gioi-thieu"><div className="container story-card"><div><p className="eyebrow">Về Trạm Máy Ảnh</p><h2>Mỗi chuyến đi cần một điểm khởi đầu.</h2><p>Trạm Máy Ảnh là nơi bạn tìm thấy đúng thiết bị cho buổi chụp, chuyến đi hay dự án tiếp theo.</p></div><div className="facts"><p><b>120+</b>thiết bị sẵn sàng</p><p><b>4,9/5</b>đánh giá trải nghiệm</p><p><b>3 bước</b>để tạo đơn thuê</p><p><b>7 ngày</b>hỗ trợ mỗi tuần</p></div></div></section>
  </main><Footer /></>;
}
