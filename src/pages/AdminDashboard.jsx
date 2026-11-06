import UiButton from '../components/UiButton';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import AdminProducts from '../components/AdminProducts';
import AdminEquipment from '../components/AdminEquipment';
import AdminRentals from '../components/AdminRentals';
import AdminAftercare from '../components/AdminAftercare';
import AdminAnalytics from '../components/AdminAnalytics';
import AdminIdentity from '../components/AdminIdentity';
import AdminDeliveries from '../components/AdminDeliveries';
import { api } from '../api';
import '../styles/roleDashboard.css';

export default function AdminDashboard(){
  const [tab,setTab]=useState('overview'),[rentalFilter,setRentalFilter]=useState(null),[data,setData]=useState(null),[users,setUsers]=useState([]),[error,setError]=useState('');
  const load=()=>Promise.all([api.adminOverview(),api.adminUsers()]).then(([overview,userData])=>{setData(overview);setUsers(userData.users)}).catch(e=>setError(e.message));
  useEffect(()=>{load()},[]);
  const changeRole=async(id,role)=>{try{await api.updateUserRole(id,role);await load()}catch(e){setError(e.message);await load()}};
  return <><Header/><main className="role-page container"><p className="eyebrow">Quản trị hệ thống</p><h1>Quản lý Trạm Máy Ảnh</h1><nav className="admin-tabs">{[['overview','Tổng quan'],['rentals','Đơn thuê'],['extensions','Gia hạn'],['incidents','Sự cố'],['products','Sản phẩm'],['equipment','Kho thiết bị'],['identity','Xác minh CCCD'],['deliveries','Email/SMS'],['users','Phân quyền']].map(([value,label])=><UiButton className={tab===value?'active':''} key={value} onClick={()=>{setTab(value);if(value==='rentals')setRentalFilter(null)}}>{label}</UiButton>)}</nav>{error&&<p className="role-error">{error}</p>}{!data?<div className="page-loader compact">Đang tải…</div>:<>{tab==='overview'&&<AdminAnalytics onOpenRentals={filter=>{setRentalFilter(filter);setTab('rentals')}}/>}{tab==='rentals'&&<AdminRentals key={JSON.stringify(rentalFilter)} initialFilter={rentalFilter}/>}{tab==='extensions'&&<AdminAftercare mode="extensions"/>}{tab==='incidents'&&<AdminAftercare mode="incidents"/>}{tab==='products'&&<AdminProducts/>}{tab==='equipment'&&<AdminEquipment/>}{tab==='identity'&&<AdminIdentity/>}{tab==='deliveries'&&<AdminDeliveries/>}{tab==='users'&&<section className="role-card"><h2>Tài khoản và phân quyền</h2><div className="table-scroll"><table><thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.fullName}</td><td>{u.email}</td><td><select value={u.role} onChange={e=>changeRole(u.id,e.target.value)}><option value="CUSTOMER">Khách hàng</option><option value="DELIVERY_STAFF">Nhân viên giao nhận</option><option value="ADMIN">Quản trị viên</option></select></td></tr>)}</tbody></table></div></section>}</>}</main><Footer/></>;
}
