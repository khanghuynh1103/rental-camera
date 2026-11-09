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
  ),
  item(
    'dji-rs-4',
    'DJI',
    'video',
    'DJI RS 4',
    'Gimbal máy ảnh',
    'Tải trọng 3kg · Khóa trục tự động · Bluetooth',
    330000,
    5
  ),
  item(
    'dji-osmo-action-4',
    'DJI',
    'video',
    'DJI Osmo Action 4',
    'Action camera',
    'Cảm biến 1/1,3 inch · 4K 120fps · Chống nước 18m',
    220000,
    5
  ),
  item(
    'gopro-hero12-black',
    'GoPro',
    'video',
    'GoPro Hero12 Black',
    'Action camera',
    '5,3K 60fps · HyperSmooth 6.0 · Chống nước 10m',
    240000,
    5
  ),
  item(
    'rode-videomic-ntg',
    'Rode',
    'audio',
    'Rode VideoMic NTG',
    'Micro shotgun',
    'Thu định hướng · USB-C · Pin sạc tích hợp',
    110000,
    5
  ),
  item(
    'hollyland-lark-m2',
    'Hollyland',
    'audio',
    'Hollyland Lark M2',
    'Micro không dây',
    '2 micro cài áo · Khử ồn · Hộp sạc',
    120000,
    5
  ),
  item(
    'nanlite-fs-150',
    'Nanlite',
    'light',
    'Nanlite FS-150',
    'Đèn LED Daylight',
    'Daylight 5600K · LED COB · Ngàm Bowens',
    230000,
    5
  ),
  item(
    'sony-hvl-f60rm2',
    'Sony',
    'flash',
    'Sony HVL-F60RM2',
    'Đèn flash Sony',
    'GN60 · Radio không dây · Ngàm MI',
    230000,
    5
  ),
  item(
    'nikon-sb-700',
    'Nikon',
    'flash',
    'Nikon SB-700',
    'Đèn flash Nikon',
    'i-TTL · Zoom 24-120mm · Điều khiển không dây',
    150000,
    5
  ),
  item(
    'godox-la-300',
    'Godox',
    'accessory',
    'Godox LA-300',
    'Chân đèn',
    'Chiều cao 300cm · Ba chân · Khóa nút vặn',
    80000,
    5
  ),
  item(
    'avenger-a2030d',
    'Avenger',
    'accessory',
    'Avenger A2030D',
    'Chân đèn C-Stand',
    'C-Stand · Chân tháo rời · Thép mạ chrome',
    130000,
    5
  )
];
