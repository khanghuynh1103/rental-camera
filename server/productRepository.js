import { query } from './db.js';

const categoryContent={
  camera:{label:'Máy ảnh',headline:'Linh hoạt cho cả ảnh và video.',best:['Chân dung','Sự kiện','Du lịch','Nội dung số'],included:['Thân máy','Pin và bộ sạc','Dây đeo máy','Túi bảo vệ']},
  lens:{label:'Ống kính',headline:'Góc nhìn phù hợp cho từng câu chuyện.',best:['Chân dung','Sản phẩm','Sự kiện','Ngoại cảnh'],included:['Ống kính','Nắp trước và sau','Hood che sáng','Túi bảo vệ']},
  video:{label:'Thiết bị quay',headline:'Chuyển động mượt mà trong mọi khung hình.',best:['Vlog','Phim ngắn','Sự kiện','Du lịch'],included:['Thiết bị chính','Pin và bộ sạc','Phụ kiện lắp đặt','Túi bảo vệ']},
  audio:{label:'Âm thanh',headline:'Thu âm rõ ràng cho nội dung chuyên nghiệp.',best:['Phỏng vấn','Podcast','Sự kiện','Video'],included:['Thiết bị chính','Cáp kết nối','Pin hoặc bộ sạc','Túi bảo vệ']},
  light:{label:'Đèn studio',headline:'Kiểm soát ánh sáng theo ý tưởng của bạn.',best:['Studio','Sản phẩm','Phỏng vấn','Chân dung'],included:['Thân đèn','Nguồn và dây điện','Chóa tiêu chuẩn','Túi bảo vệ']},
  flash:{label:'Đèn flash',headline:'Làm chủ ánh sáng trong từng khoảnh khắc.',best:['Sự kiện','Chân dung','Cưới hỏi','Ngoại cảnh'],included:['Đèn flash','Pin hoặc bộ sạc','Chân đế','Túi bảo vệ']},
  accessory:{label:'Phụ kiện',headline:'Nền tảng chắc chắn cho mỗi buổi chụp.',best:['Studio','Ngoại cảnh','Sự kiện','Sản phẩm'],included:['Thiết bị chính','Đầu nối','Phụ kiện cố định','Túi vận chuyển']}
};

const productSelect=`
  SELECT
    p.id AS database_id,
    p.slug,
    p.name,
    p.brand,
    p.format,
    p.specification,
    p.description,
    p.price_per_day,
    p.deposit_amount,
    p.featured,
    COALESCE(p.rental_count,0) AS rental_count,
    c.slug AS category,
    COALESCE(
      ARRAY_AGG(DISTINCT pi.image_url ORDER BY pi.image_url)
        FILTER (WHERE pi.image_url IS NOT NULL),
      ARRAY[]::TEXT[]
    ) AS images,
    COUNT(DISTINCT e.id)::INT AS stock,
    COUNT(DISTINCT e.id) FILTER (WHERE e.status='AVAILABLE')::INT AS available_stock
  FROM products p
  JOIN categories c ON c.id=p.category_id
  LEFT JOIN product_images pi ON pi.product_id=p.id
  LEFT JOIN equipment_items e ON e.product_id=p.id AND e.status<>'RETIRED'
`;

function mapProduct(row){
  const detail=categoryContent[row.category]||categoryContent.accessory;
  const stock=Number(row.stock),available=Number(row.available_stock);
  const status=available>2?'Có thể thuê':available>0?`Còn ${available} sản phẩm`:'Tạm hết thiết bị';
  const brandLabel=row.brand;
  return {
    id:row.slug,
    databaseId:row.database_id,
    brand:String(row.brand||'').toLowerCase(),
    brandLabel,
    category:row.category,
    name:row.name,
    format:row.format,
    spec:row.specification,
    price:Number(row.price_per_day),
    deposit:Number(row.deposit_amount),
    featured:row.featured,
    rentalCount:Number(row.rental_count),
    stock,
    availableStock:available,
    status,
    images:row.images,
    code:`${row.category.slice(0,3).toUpperCase()}-${String(row.slug).slice(0,8).toUpperCase()}`,
    headline:detail.headline,
    description:[row.description||`${row.name} là ${detail.label.toLowerCase()} phù hợp cho nhiều nhu cầu quay chụp thực tế.`,`Sản phẩm thuộc thương hiệu ${brandLabel}, có ${String(row.specification).toLowerCase()} và được kiểm tra trước khi bàn giao.`],
    best:detail.best,
    included:detail.included,
    specs:[['Thương hiệu',brandLabel],['Nhóm thiết bị',detail.label],['Phân loại',row.format],['Thông số nổi bật',row.specification],['Tình trạng',status],['Số lượng tại trạm',`${stock} thiết bị`]]
  };
}

export async function listProducts(){
  const result=await query(`${productSelect} WHERE p.active=TRUE GROUP BY p.id,c.slug ORDER BY p.created_at,p.name`);
  return result.rows.map(mapProduct);
}

export async function getProductBySlug(slug){
  const result=await query(`${productSelect} WHERE p.slug=$1 AND p.active=TRUE GROUP BY p.id,c.slug`,[slug]);
  return result.rows[0]?mapProduct(result.rows[0]):null;
}
