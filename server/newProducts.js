const item = (id, brandLabel, category, name, format, spec, price, stock = 3) => ({
  id,
  brand: brandLabel.toLowerCase(),
  brandLabel,
  category,
  name,
  format,
  spec,
  price,
  stock,
  status: stock <= 2 ? `Còn ${stock} sản phẩm` : 'Có thể thuê',
  images: [`/${id}/front.png`, `/${id}/left.png`, `/${id}/right.png`]
});

export const newProducts = [
  item(
    'sony-fe-24-70mm-f2-8-gm-ii',
    'Sony',
    'lens',
    'Sony FE 24-70mm F2.8 GM II',
    'Ống kính zoom',
    'Full-frame · Khẩu độ F2.8 · Ngàm E',
    320000,
    2
  ),
  item(
    'sony-fe-70-200mm-f2-8-gm-ii',
    'Sony',
    'lens',
    'Sony FE 70-200mm F2.8 GM II',
    'Ống kính tele',
    'Chống rung OSS · Khẩu độ F2.8 · Ngàm E',
    380000,
    2
  ),
  item(
    'canon-rf-15-35mm-f2-8-l',
    'Canon',
    'lens',
    'Canon RF 15-35mm F2.8L IS',
    'Ống kính góc rộng',
    'Chống rung IS · Khẩu độ F2.8 · Ngàm RF',
    350000,
    2
  ),
  item(
    'canon-rf-50mm-f1-2-l',
    'Canon',
    'lens',
    'Canon RF 50mm F1.2L',
    'Ống kính chân dung',
    'Full-frame · Khẩu độ F1.2 · Ngàm RF',
    300000,
    2
  ),
  item(
    'nikon-z-24-120mm-f4-s',
    'Nikon',
    'lens',
    'Nikon Z 24-120mm F4 S',
    'Ống kính đa dụng',
    'Dải zoom 5x · Khẩu độ F4 · Ngàm Z',
    280000
  ),
  item(
    'nikon-z-85mm-f1-8-s',
    'Nikon',
    'lens',
    'Nikon Z 85mm F1.8 S',
    'Ống kính chân dung',
    'Full-frame · Khẩu độ F1.8 · Ngàm Z',
    230000
  ),
  item(
    'fujifilm-xf-23mm-f1-4-r-lm-wr',
    'Fujifilm',
    'lens',
    'Fujifilm XF 23mm F1.4 LM WR',
    'Ống kính góc rộng',
    'APS-C · Kháng thời tiết · Ngàm X',
    220000
  ),
  item(
    'sigma-35mm-f1-4-dg-dn-art',
    'Sigma',
    'lens',
    'Sigma 35mm F1.4 DG DN Art',
    'Ống kính prime',
    'Full-frame · Khẩu độ F1.4 · Art Series',
    210000
  ),
  item(
    'tamron-70-180mm-f2-8-g2',
    'Tamron',
    'lens',
    'Tamron 70-180mm F2.8 G2',
    'Ống kính tele',
    'Chống rung VC · Khẩu độ F2.8 · G2',
    260000
  ),
  item(
    'panasonic-lumix-s-50mm-f1-8',
    'Panasonic',
    'lens',
    'Lumix S 50mm F1.8',
    'Ống kính chân dung',
    'Full-frame · Khẩu độ F1.8 · Ngàm L',
    180000
  ),
  item(
    'dji-rs-4-pro',
    'DJI',
    'video',
    'DJI RS 4 Pro',
    'Gimbal chuyên nghiệp',
    'Tải trọng 4,5kg · Khóa trục tự động · LiDAR',
    420000,
    2
  ),
  item(
    'dji-rs-3-mini',
    'DJI',
    'video',
    'DJI RS 3 Mini',
    'Gimbal nhỏ gọn',
    'Tải trọng 2kg · Quay dọc · Bluetooth',
    240000
  ),
  item(
    'zhiyun-weebill-3s',
    'Zhiyun',
    'video',
    'Zhiyun Weebill 3S',
    'Gimbal máy ảnh',
    'Tải trọng 3kg · Sling 2.5 · Bluetooth',
    260000
  ),
  item(
    'zhiyun-crane-m3s',
    'Zhiyun',
    'video',
    'Zhiyun Crane M3S',
    'Gimbal nhỏ gọn',
    'Đèn tích hợp · Sạc nhanh · Bluetooth',
    220000
  ),
  item(
    'dji-osmo-action-5-pro',
    'DJI',
    'video',
    'DJI Osmo Action 5 Pro',
    'Action camera',
    '4K 120fps · Chống rung · Chống nước',
    280000,
    2
  ),
  item(
    'gopro-hero13-black',
    'GoPro',
    'video',
    'GoPro HERO13 Black',
    'Action camera',
    '5.3K 60fps · HyperSmooth · GPS',
    300000,
    2
  ),
  item(
    'insta360-ace-pro-2',
    'Insta360',
    'video',
    'Insta360 Ace Pro 2',
    'Action camera',
    '8K · Cảm biến 1/1.3 inch · Màn hình lật',
    320000,
    2
  ),
  item(
    'dji-mic-2',
    'DJI',
    'audio',
    'DJI Mic 2',
    'Micro không dây',
    '2 bộ phát · Ghi âm 32-bit float · Bluetooth',
    200000
  ),
  item(
    'rode-wireless-pro',
    'Rode',
    'audio',
    'Rode Wireless PRO',
    'Micro không dây',
    'Timecode · 32-bit float · 2 kênh',
    250000,
    2
  ),
  item(
    'sennheiser-mke-600',
    'Sennheiser',
    'audio',
    'Sennheiser MKE 600',
    'Micro shotgun',
    'Siêu định hướng · Low-cut · Nguồn phantom',
    170000
  ),
  item(
    'amaran-200x-s',
    'Amaran',
    'light',
    'Amaran 200x S',
    'Đèn LED Bi-color',
    '200W · 2700-6500K · Sidus Link',
    220000
  ),
  item(
    'aputure-ls-300d-ii',
    'Aputure',
    'light',
    'Aputure LS 300d II',
    'Đèn LED Daylight',
    '350W · 5500K · Bowens Mount',
    300000,
    2
  ),
  item(
    'godox-sl150iii',
    'Godox',
    'light',
    'Godox SL150III',
    'Đèn LED Daylight',
    '150W · 5600K · Điều khiển app',
    160000
  ),
  item(
    'nanlite-forza-60b-ii',
    'Nanlite',
    'light',
    'Nanlite Forza 60B II',
    'Đèn LED Bi-color',
    '72W · 2700-6500K · Nhỏ gọn',
    180000
  ),
  item('godox-v1', 'Godox', 'flash', 'Godox V1', 'Đèn flash đầu tròn', 'TTL · HSS · Pin lithium', 130000),
  item('profoto-a10', 'Profoto', 'flash', 'Profoto A10', 'Đèn flash cao cấp', 'TTL · AirX · Đầu đèn tròn', 260000, 2),
  item(
    'canon-speedlite-el-5',
    'Canon',
    'flash',
    'Canon Speedlite EL-5',
    'Đèn flash Canon',
    'Guide 60 · Radio 2.4GHz · Pin lithium',
    190000,
    2
  ),
  item('godox-260t', 'Godox', 'accessory', 'Godox 260T', 'Chân đèn', 'Chiều cao 260cm · Đệm khí · Nhôm', 70000),
  item(
    'manfrotto-1004bac',
    'Manfrotto',
    'accessory',
    'Manfrotto 1004BAC',
    'Chân đèn chuyên nghiệp',
    'Chiều cao 366cm · Quick Stack · Nhôm',
    110000
  ),
  item(
    'kupo-195s',
    'Kupo',
    'accessory',
    'Kupo 195S',
    'Chân đèn studio',
    'Chiều cao 385cm · Đệm khí · Tải trọng cao',
    120000
  )
];
