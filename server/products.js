import { newProducts } from './newProducts.js';

const cameraProducts = [
  {
    id: 'sony-alpha-a7-iv',
    brand: 'sony',
    brandLabel: 'Sony',
    format: 'Full-frame',
    name: 'Sony Alpha A7 IV',
    spec: '33MP · 4K 60p · Chống rung 5 trục',
    price: 450000,
    status: 'Có thể thuê',
    stock: 3,
    featured: true,
    rentalCount: 48
  },
  {
    id: 'canon-eos-r6-mark-ii',
    brand: 'canon',
    brandLabel: 'Canon',
    format: 'Full-frame',
    name: 'Canon EOS R6 Mark II',
    spec: '24,2MP · 4K 60p · Lấy nét Dual Pixel',
    price: 520000,
    status: 'Còn 2 máy',
    stock: 2,
    featured: true,
    rentalCount: 41
  },
  {
    id: 'fujifilm-x-t5',
    brand: 'fujifilm',
    brandLabel: 'Fujifilm',
    format: 'APS-C',
    name: 'Fujifilm X-T5',
    spec: '40,2MP · Film Simulation · Thiết kế cổ điển',
    price: 390000,
    status: 'Có thể thuê',
    stock: 3,
    featured: true,
    rentalCount: 36
  },
  {
    id: 'nikon-z6-ii',
    brand: 'nikon',
    brandLabel: 'Nikon',
    format: 'Full-frame',
    name: 'Nikon Z6 II',
    spec: '24,5MP · 4K UHD · Hai bộ xử lý',
    price: 430000,
    status: 'Có thể thuê',
    stock: 3
  },
  {
    id: 'panasonic-lumix-s5-ii',
    brand: 'panasonic',
    brandLabel: 'Panasonic',
    format: 'Full-frame',
    name: 'Panasonic Lumix S5 II',
    spec: '24,2MP · 6K 30p · Phase Hybrid AF',
    price: 460000,
    status: 'Còn 1 máy',
    stock: 1
  },
  {
    id: 'sony-zv-e10',
    brand: 'sony',
    brandLabel: 'Sony',
    format: 'APS-C',
    name: 'Sony ZV-E10',
    spec: '24,2MP · 4K 30p · Tối ưu quay vlog',
    price: 260000,
    status: 'Có thể thuê',
    stock: 4
  },
  {
    id: 'fujifilm-x-s20',
    brand: 'fujifilm',
    brandLabel: 'Fujifilm',
    format: 'APS-C',
    name: 'Fujifilm X-S20',
    spec: '26,1MP · 6,2K 30p · Chống rung IBIS',
    price: 330000,
    status: 'Có thể thuê',
    stock: 3
  },
  {
    id: 'nikon-z-fc',
    brand: 'nikon',
    brandLabel: 'Nikon',
    format: 'APS-C',
    name: 'Nikon Z fc',
    spec: '20,9MP · 4K UHD · Phong cách hoài cổ',
    price: 290000,
    status: 'Còn 2 máy',
    stock: 2
  },
  {
    id: 'sony-fx3',
    brand: 'sony',
    brandLabel: 'Sony',
    format: 'Cinema',
    name: 'Sony FX3',
    spec: 'Full-frame · 4K 120p · Cinema Line',
    price: 680000,
    status: 'Còn 1 máy',
    stock: 1
  }
];

const categoryDetails = {
  camera: {
    label: 'Máy ảnh',
    headline: 'Linh hoạt cho cả ảnh và video.',
    description: 'Thiết bị được kiểm tra cảm biến, lấy nét, pin và khả năng ghi hình trước mỗi lượt thuê.',
    best: ['Chân dung', 'Sự kiện', 'Du lịch', 'Nội dung số'],
    included: ['Thân máy', 'Pin và bộ sạc', 'Dây đeo máy', 'Túi bảo vệ']
  },
  lens: {
    label: 'Ống kính',
    headline: 'Góc nhìn phù hợp cho từng câu chuyện.',
    description: 'Ống kính được kiểm tra thấu kính, vòng lấy nét, khẩu độ và vệ sinh kỹ trước khi bàn giao.',
    best: ['Chân dung', 'Sản phẩm', 'Sự kiện', 'Ngoại cảnh'],
    included: ['Ống kính', 'Nắp trước và sau', 'Hood che sáng', 'Túi bảo vệ']
  },
  video: {
    label: 'Thiết bị quay',
    headline: 'Chuyển động mượt mà trong mọi khung hình.',
    description: 'Thiết bị quay được cân chỉnh, cập nhật firmware và kiểm tra đầy đủ các chế độ ổn định hình ảnh.',
    best: ['Vlog', 'Phim ngắn', 'Sự kiện', 'Du lịch'],
    included: ['Thiết bị chính', 'Pin và bộ sạc', 'Phụ kiện lắp đặt', 'Túi bảo vệ']
  },
  audio: {
    label: 'Âm thanh',
    headline: 'Thu âm rõ ràng cho nội dung chuyên nghiệp.',
    description: 'Micro và bộ thu phát được kiểm tra tín hiệu, pin, kết nối và chất lượng âm thanh trước khi giao.',
    best: ['Phỏng vấn', 'Podcast', 'Sự kiện', 'Video'],
    included: ['Thiết bị chính', 'Cáp kết nối', 'Pin hoặc bộ sạc', 'Túi bảo vệ']
  },
  light: {
    label: 'Đèn studio',
    headline: 'Kiểm soát ánh sáng theo ý tưởng của bạn.',
    description: 'Đèn được kiểm tra công suất, nhiệt màu, quạt tản nhiệt và khả năng điều khiển trước mỗi đơn thuê.',
    best: ['Studio', 'Sản phẩm', 'Phỏng vấn', 'Chân dung'],
    included: ['Thân đèn', 'Nguồn và dây điện', 'Chóa tiêu chuẩn', 'Túi bảo vệ']
  },
  flash: {
    label: 'Đèn flash',
    headline: 'Làm chủ ánh sáng trong từng khoảnh khắc.',
    description: 'Đèn flash được kiểm tra công suất, đồng bộ, pin và các chế độ TTL hoặc HSS trước khi bàn giao.',
    best: ['Sự kiện', 'Chân dung', 'Cưới hỏi', 'Ngoại cảnh'],
    included: ['Đèn flash', 'Pin hoặc bộ sạc', 'Chân đế', 'Túi bảo vệ']
  },
  accessory: {
    label: 'Phụ kiện',
    headline: 'Nền tảng chắc chắn cho mỗi buổi chụp.',
    description: 'Phụ kiện được kiểm tra khóa, khớp nối, độ ổn định và tải trọng trước khi đưa vào sử dụng.',
    best: ['Studio', 'Ngoại cảnh', 'Sự kiện', 'Sản phẩm'],
    included: ['Thiết bị chính', 'Đầu nối', 'Phụ kiện cố định', 'Túi vận chuyển']
  }
};

const enrich = (product, index) => {
  const detail = categoryDetails[product.category];
  return {
    ...product,
    images: [`/${product.id}/front.png`, `/${product.id}/left.png`, `/${product.id}/right.png`],
    code: `${product.category.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
    deposit: Math.ceil((product.price * 18) / 100000) * 100000,
    headline: detail.headline,
    description: [
      `${product.name} là ${detail.label.toLowerCase()} phù hợp cho nhiều nhu cầu quay chụp thực tế. ${detail.description}`,
      `Sản phẩm thuộc thương hiệu ${product.brandLabel}, có ${product.spec.toLowerCase()} và được nhân viên ghi nhận tình trạng bằng hình ảnh khi giao nhận.`
    ],
    best: detail.best,
    included: detail.included,
    specs: [
      ['Thương hiệu', product.brandLabel],
      ['Nhóm thiết bị', detail.label],
      ['Phân loại', product.format],
      ['Thông số nổi bật', product.spec],
      ['Tình trạng', product.status],
      ['Số lượng tại trạm', `${product.stock} thiết bị`]
    ]
  };
};

export const products = [...cameraProducts.map(product => ({ category: 'camera', ...product })), ...newProducts].map(
  enrich
);
