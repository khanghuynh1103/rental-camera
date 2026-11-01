# Trạm Máy Ảnh

Website thuê máy ảnh và thiết bị quay chụp, xây dựng bằng React, Express và PostgreSQL. Hệ thống hỗ trợ toàn bộ quy trình từ tìm thiết bị, kiểm tra lịch trống, tạo đơn thuê và thanh toán mô phỏng đến quản lý kho, giao nhận, gia hạn và xử lý sự cố.

> Đây là dự án phục vụ học tập/demo. Các luồng thanh toán trên website đều là **mô phỏng**, không kết nối cổng thanh toán thật và không nên nhập thông tin thẻ hoặc tài khoản ngân hàng thật.

## Tính năng chính

- Danh mục thiết bị, tìm kiếm, lọc và xem chi tiết sản phẩm.
- Kiểm tra thiết bị còn trống theo khoảng ngày.
- Đăng ký, đăng nhập và lưu phiên bằng cookie.
- Tạo đơn thuê, chọn giao tận nơi hoặc nhận tại cửa hàng.
- Thanh toán và xuất hóa đơn mô phỏng.
- Trang khách hàng để theo dõi đơn, cập nhật hồ sơ, yêu cầu gia hạn và thanh toán phí phát sinh.
- Trang quản trị để theo dõi doanh thu, duyệt đơn, quản lý sản phẩm, kho thiết bị, người dùng, gia hạn và sự cố.
- Trang nhân viên giao nhận để cập nhật quá trình giao, bàn giao và thu hồi thiết bị.
- Đánh giá sản phẩm sau khi hoàn tất đơn thuê.
- Trợ lý gợi ý thiết bị; có thể dùng OpenAI hoặc tự gợi ý từ dữ liệu PostgreSQL khi không cấu hình API key.
- Giao diện responsive, nội dung tiếng Việt.

## Công nghệ sử dụng

- Frontend: React, React Router, Ant Design, Vite.
- Backend: Node.js, Express.
- Cơ sở dữ liệu: PostgreSQL (`pg`).
- Xác thực: session lưu trong PostgreSQL, cookie `httpOnly`, mật khẩu băm bằng `scrypt`.
- Kiểm tra mã nguồn: ESLint.

## Yêu cầu

- Node.js 20 trở lên.
- npm.
- PostgreSQL đang hoạt động.

## Cài đặt

1. Cài dependencies:

   ```bash
   npm install
   ```

2. Tạo database PostgreSQL, ví dụ:

   ```sql
   CREATE DATABASE tram_may_anh;
   ```

3. Sao chép file cấu hình môi trường:

   ```powershell
   Copy-Item .env.example .env
   ```

   Trên macOS/Linux:

   ```bash
   cp .env.example .env
   ```

4. Cập nhật `.env` theo môi trường của bạn:

   ```dotenv
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/tram_may_anh
   PORT=3000
   OPENAI_API_KEY=
   OPENAI_MODEL=gpt-4.1-mini
   ```

   `OPENAI_API_KEY` là tùy chọn. Không có khóa này, tính năng chat vẫn gợi ý sản phẩm dựa trên dữ liệu trong PostgreSQL.

5. Chuẩn bị database và chạy các migration phù hợp. Xem lưu ý [Khởi tạo cơ sở dữ liệu](#khởi-tạo-cơ-sở-dữ-liệu) bên dưới.

6. Chạy ứng dụng ở chế độ phát triển:

   ```bash
   npm run dev
   ```

   - Frontend: http://localhost:5173
   - API/backend: http://localhost:3000

Vite tự chuyển tiếp các request `/api` từ cổng `5173` sang backend ở cổng `3000`.

## Khởi tạo cơ sở dữ liệu

Các migration trong repository hiện **không tạo toàn bộ schema lõi từ một database trống**. Chúng giả định các bảng chính như `users`, `categories`, `products`, `product_images`, `equipment_items`, `rentals`, `rental_items`, `payments` và `invoices` đã tồn tại.

Repository hiện chưa có file SQL/schema ban đầu cho các bảng này. Vì vậy, để cài mới hoàn toàn, bạn cần khôi phục schema PostgreSQL đã được dùng cho dự án hoặc bổ sung migration khởi tạo schema lõi trước khi chạy các lệnh bên dưới.

Khi schema lõi đã sẵn sàng, thứ tự khuyến nghị là:

```bash
npm run migrate:users
npm run migrate:products
npm run migrate:sessions
npm run migrate:rentals
npm run migrate:rental-workflow
npm run migrate:delivery-workflow
npm run migrate:post-rental
npm run migrate:reviews
npm run seed:roles
```

Các script được thiết kế để có thể chạy lại an toàn ở phần lớn thao tác (`IF NOT EXISTS`, `ON CONFLICT`), nhưng vẫn nên sao lưu database trước khi migration trên dữ liệu quan trọng.

`migrate:users` và `migrate:rentals` nhập dữ liệu cũ từ `data/database.json`. File này là dữ liệu cục bộ, được bỏ qua bởi Git và có thể không tồn tại trong một bản clone mới.

## Tài khoản mẫu

Sau khi chạy `npm run seed:roles`, hệ thống tạo/cập nhật:

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Quản trị viên | `admin@trammayanh.vn` | `Admin@123` |
| Nhân viên giao nhận | `giaonhan@trammayanh.vn` | `Giaonhan@123` |

Đây là thông tin demo. Hãy đổi hoặc vô hiệu hóa các tài khoản này trước khi triển khai công khai.

## Các lệnh npm

| Lệnh | Chức năng |
| --- | --- |
| `npm run dev` | Chạy đồng thời backend có watch mode và Vite dev server. |
| `npm run build` | Build frontend vào thư mục `dist/`. |
| `npm start` | Build frontend rồi chạy Express ở chế độ phục vụ ứng dụng. |
| `npm run check` | Kiểm tra mã nguồn bằng ESLint. |
| `npm run test:workflow` | Chạy kiểm thử tích hợp cho quy trình thuê/giao nhận. |
| `npm run migrate:users` | Nhập người dùng cũ vào PostgreSQL. |
| `npm run migrate:products` | Nhập/cập nhật danh mục, sản phẩm, ảnh và thiết bị kho. |
| `npm run migrate:rentals` | Nhập đơn thuê cũ và bổ sung các cột liên quan. |
| `npm run migrate:rental-workflow` | Tạo lịch sử trạng thái đơn thuê. |
| `npm run migrate:delivery-workflow` | Tạo log giao nhận và sự cố thiết bị. |
| `npm run migrate:post-rental` | Tạo dữ liệu gia hạn và phí phát sinh. |
| `npm run migrate:sessions` | Tạo bảng lưu phiên đăng nhập. |
| `npm run migrate:reviews` | Tạo bảng đánh giá sản phẩm. |
| `npm run seed:roles` | Tạo tài khoản quản trị và giao nhận mẫu. |

## Cấu trúc thư mục

```text
.
├── data/                 # Dữ liệu JSON cũ dùng cho migration cục bộ
├── img/                  # Logo và ảnh sản phẩm, được Vite phục vụ như public assets
├── server/               # Express API, repository, route và migration PostgreSQL
├── src/
│   ├── components/       # Thành phần giao diện dùng chung và màn hình quản trị
│   ├── context/          # AuthContext và trạng thái đăng nhập
│   ├── pages/            # Các trang của ứng dụng
│   ├── styles/           # CSS theo trang/tính năng
│   ├── api.js            # Client gọi REST API
│   ├── App.jsx           # Routing và bảo vệ route theo vai trò
│   └── main.jsx          # Entry point của React
├── .env.example          # Mẫu biến môi trường
├── package.json          # Dependencies và scripts
└── vite.config.js        # Cấu hình Vite, public assets và API proxy
```

## Phân quyền và route chính

| Vai trò | Khu vực chính |
| --- | --- |
| Khách chưa đăng nhập | Trang chủ, danh sách sản phẩm, giới thiệu, hướng dẫn, đăng nhập/đăng ký. |
| `CUSTOMER` | Chi tiết sản phẩm, đặt thuê, tài khoản và lịch sử thuê. |
| `ADMIN` | `/admin` – dashboard và toàn bộ công cụ quản trị. |
| `DELIVERY_STAFF` | `/delivery` – các tác vụ giao nhận và kiểm tra thiết bị. |

REST API được đặt dưới prefix `/api`. Các route cần đăng nhập hoặc vai trò phù hợp sẽ trả về lỗi `401`/`403` nếu người dùng không có quyền.

## Kiểm tra trước khi commit

```bash
npm run check
npm run build
```

Khi PostgreSQL thử nghiệm đã được chuẩn bị đầy đủ, có thể chạy thêm:

```bash
npm run test:workflow
```

Kiểm thử workflow tạo và thay đổi dữ liệu. Chỉ chạy trên database phát triển/thử nghiệm, không chạy trực tiếp trên database production.

## Lưu ý bảo mật và triển khai

- Không commit `.env`, API key, mật khẩu database hoặc dữ liệu người dùng. `.gitignore` đã loại trừ các file môi trường và `data/database.json`.
- Thay toàn bộ tài khoản/mật khẩu mẫu trước khi đưa ứng dụng lên Internet.
- Dùng kết nối PostgreSQL được mã hóa và quản lý secret bằng nền tảng triển khai.
- Đặt `NODE_ENV=production` để cookie phiên bật thuộc tính `secure`; production phải phục vụ qua HTTPS.
- Thanh toán hiện chỉ là mô phỏng. Muốn thu tiền thật cần tích hợp cổng thanh toán phía server, xác minh callback/webhook và có quy trình bảo mật riêng.
- `npm start` luôn build lại frontend trước khi khởi động server. Express phục vụ thư mục `dist` và fallback về `index.html` cho client-side routing.

## Hạn chế hiện tại

- Chưa có migration/schema khởi tạo đầy đủ cho database mới.
- Chưa có bộ test unit/frontend tự động; hiện chỉ có kiểm thử workflow backend.
- Thanh toán, hóa đơn và các kênh VNPAY/ATM/thẻ đều là dữ liệu mô phỏng.
- Việc upload ảnh chưa được tích hợp; quản trị viên nhập URL ảnh sản phẩm.

