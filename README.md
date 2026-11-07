# Trạm Máy Ảnh

Website thuê máy ảnh và thiết bị quay chụp, xây dựng bằng React, Express và PostgreSQL. Hệ thống hỗ trợ toàn bộ quy trình từ tìm thiết bị, kiểm tra lịch trống, tạo đơn thuê và thanh toán mô phỏng đến quản lý kho, giao nhận, gia hạn và xử lý sự cố.

> Đây là dự án phục vụ học tập/demo. Các luồng thanh toán trên website đều là **mô phỏng**, không kết nối cổng thanh toán thật và không nên nhập thông tin thẻ hoặc tài khoản ngân hàng thật.

## Tính năng chính

- Danh mục thiết bị, tìm kiếm, lọc; **trang chi tiết và lịch trống theo ngày công khai** (chỉ cần đăng nhập khi đặt thuê).
- Kiểm tra lịch theo **từng thiết bị vật lý**, có **1 ngày đệm** giữa hai đơn để kiểm tra/vận chuyển. Trùng lịch bị chặn ở cả API lẫn ràng buộc `EXCLUDE` của PostgreSQL.
- Đặt **nhiều thiết bị trong một đơn** (tối đa 5), giao tận nơi hoặc nhận tại cửa hàng.
- Thanh toán mô phỏng: online (phải thanh toán trong 30 phút để giữ lịch) hoặc trả khi bàn giao. Tiền cọc thu khi nhận máy, không tính vào doanh thu.
- Đơn chờ duyệt quá 24 giờ (hoặc chưa thanh toán online sau 30 phút) tự hủy và giải phóng lịch.
- Nhân viên giao nhận chỉ thấy đơn được phân công; **bàn giao và thu hồi bắt buộc ảnh bằng chứng** (nhiều ảnh, tự nén trên trình duyệt) và **checklist phụ kiện** theo từng sản phẩm. Đơn nhận tại cửa hàng do quản trị viên bàn giao/nhận lại với cùng yêu cầu.
- Thu hồi: kiểm tra từng thiết bị (bình thường/trầy xước/hư hỏng/thiếu phụ kiện), tự tạo biên bản sự cố, **tự tính phí trả muộn** (150% giá thuê/ngày).
- **Quyết toán tiền cọc**: phí gia hạn/trễ hạn/sự cố chưa thanh toán được trừ vào cọc, hoàn phần còn lại, phần vượt cọc thành khoản phải trả thêm; hóa đơn tách riêng từng loại.
- Gia hạn: chỉ gửi khi còn ≥ 3 ngày trước hạn trả; hệ thống gợi ý ngày trả xa nhất trước đơn kế tiếp và kiểm tra lại khi duyệt.
- Khách tự hủy đơn khi chờ duyệt hoặc chưa đến ngày nhận (hoàn tiền mô phỏng nếu đã thanh toán).
- Khách xem chi tiết đơn: tiến trình, ảnh bàn giao/thu hồi, tiền cọc, hóa đơn, phí phát sinh; **thông báo trong ứng dụng** (xác nhận, giao, sắp đến hạn, quá hạn, quyết toán…).
- Dashboard: doanh thu, tiền cọc đang giữ, **việc cần làm hôm nay** (cần giao, đến hạn trả, sắp đến hạn, quá hạn, chờ duyệt), kho thiết bị, sự cố.
- Kho thiết bị: trạng thái theo đề cương (AVAILABLE, RESERVED, RENTED, RETURNING, INSPECTION, DAMAGED, MAINTENANCE, RETIRED). Chuyển thiết bị sang bảo trì sẽ tự chuyển các đơn sắp tới sang thiết bị cùng mẫu.
- **Email và SMS** theo mô hình outbox: mọi thông báo được xếp hàng cùng transaction với nghiệp vụ, tự thử lại tối đa 5 lần khi nhà cung cấp lỗi; khách tự bật/tắt từng kênh; quản trị viên xem nhật ký gửi và gửi lại.
- **Xác minh CCCD**: đơn có tổng tiền cọc từ 5.000.000đ chỉ được duyệt khi khách đã xác minh. Ảnh mã hóa AES-256-GCM, số CCCD chỉ giữ 4 số cuối và HMAC, ảnh bị xóa ngay sau khi duyệt/từ chối, mỗi lần xem đều ghi nhật ký.
- Đánh giá sau thuê, trợ lý gợi ý thiết bị (OpenAI tùy chọn), giới hạn số lần đăng nhập sai, giao diện responsive tiếng Việt.

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
   AI_BASE_URL=
   AI_API_KEY=
   AI_MODEL=
   ```

   Trợ lý AI là tùy chọn và dùng được mọi API tương thích OpenAI (Gemini, Groq, OpenRouter, Ollama, OpenAI); xem ví dụ trong `.env.example`. Không cấu hình AI, tính năng chat vẫn gợi ý sản phẩm bằng luật lọc trên dữ liệu PostgreSQL.

5. Khởi tạo schema và dữ liệu mẫu theo hướng dẫn [Khởi tạo cơ sở dữ liệu](#khởi-tạo-cơ-sở-dữ-liệu) bên dưới.

6. Chạy ứng dụng ở chế độ phát triển:

   ```bash
   npm run dev
   ```

   - Frontend: http://localhost:5173
   - API/backend: http://localhost:3000

Vite tự chuyển tiếp các request `/api` từ cổng `5173` sang backend ở cổng `3000`.

## Khởi tạo cơ sở dữ liệu

Với database PostgreSQL trống:

```bash
npm run setup        # = migrate + migrate:products + seed:roles
```

`npm run migrate` là migration **hợp nhất và chạy lại an toàn**: tạo schema cho database trống, đồng thời nâng cấp database của phiên bản cũ (thêm cột, ràng buộc trạng thái, trigger đồng bộ lịch, ràng buộc chống trùng lịch, chuyển ảnh bằng chứng cũ sang bảng `evidence_images`). Khi cập nhật mã nguồn, chỉ cần chạy lại `npm run migrate`.

Ràng buộc chống trùng lịch cần extension `btree_gist` (có sẵn trên PostgreSQL chuẩn và Neon). Nếu không bật được hoặc dữ liệu cũ đang trùng lịch, migration bỏ qua ràng buộc và in cảnh báo; phần kiểm tra ở API vẫn hoạt động.

Nên sao lưu database trước khi migration trên dữ liệu quan trọng.

## Tài khoản mẫu

Sau khi chạy `npm run seed:roles`, hệ thống tạo/cập nhật:

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Quản trị viên | `admin@trammayanh.vn` | `Admin@123` |
| Nhân viên giao nhận | `giaonhan@trammayanh.vn` | `Giaonhan@123` |

Đây là thông tin demo. Hãy đổi hoặc vô hiệu hóa các tài khoản này trước khi triển khai công khai.

## Email, SMS và xác minh CCCD

Mặc định `NOTIFY_EMAIL_PROVIDER=log` và `NOTIFY_SMS_PROVIDER=log`: thông báo được ghi nhận với trạng thái *Mô phỏng* nhưng không gửi thật, phù hợp để demo.

Gửi thật:

- Email: đặt `NOTIFY_EMAIL_PROVIDER=smtp` cùng `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` và `APP_URL`.
- SMS: đặt `NOTIFY_SMS_PROVIDER=twilio` cùng `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. Gửi SMS tại Việt Nam thường cần đăng ký brandname với nhà cung cấp.

Khi tự host, server chạy tác vụ định kỳ mỗi phút (hủy đơn hết hạn, nhắc hạn trả, gửi hàng đợi). Trên Vercel, `vercel.json` gọi `/api/cron/tick` mỗi ngày lúc 8 giờ sáng; cần đặt `CRON_SECRET`. Gói Hobby chỉ cho cron hằng ngày, nên nhắc hạn trên Vercel chạy một lần/ngày.

Xác minh CCCD cần `KYC_ENCRYPTION_KEY` (32 byte, lệnh tạo có trong `.env.example`). **Mất khóa này thì không giải mã được hồ sơ đang chờ duyệt.** Ngưỡng tiền cọc cấu hình ở `identityDepositThreshold` trong `server/rules.js`.

Bản demo công khai không nên nhận CCCD thật. Khi vận hành thật, cửa hàng cần có chính sách bảo vệ dữ liệu cá nhân và tuân thủ quy định hiện hành.

## Các lệnh npm

| Lệnh | Chức năng |
| --- | --- |
| `npm run dev` | Chạy đồng thời backend có watch mode và Vite dev server. |
| `npm run build` | Build frontend vào thư mục `dist/`. |
| `npm start` | Build frontend rồi chạy Express ở chế độ phục vụ ứng dụng. |
| `npm run check` | Kiểm tra mã nguồn bằng ESLint. |
| `npm test` / `npm run test:unit` | Unit test quy tắc nghiệp vụ (`server/tests`), không cần database. |
| `npm run test:workflow` | Kiểm thử tích hợp toàn bộ vòng đời đơn thuê qua API + PostgreSQL. |
| `npm run test:perf` | Đo thời gian phản hồi các API chính với dữ liệu mẫu lớn. |
| `npm run format` | Định dạng mã nguồn bằng Prettier. |
| `npm run setup` | Khởi tạo database trống: schema, sản phẩm, tài khoản mẫu. |
| `npm run migrate` | Tạo/nâng cấp schema (an toàn khi chạy lại). |
| `npm run migrate:products` | Nhập/cập nhật danh mục, sản phẩm, ảnh và thiết bị kho. |
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

## Đưa bản demo lên Internet bằng Vercel

Vercel build giao diện Vite vào `dist/`, phục vụ ảnh trong `img/` và chuyển request `/api/*` đến Express Function qua `vercel.json`. Vì Vercel không cung cấp PostgreSQL trực tiếp, cần tạo database ở một nhà cung cấp như Neon rồi đặt `DATABASE_URL` trong biến môi trường của Vercel. Chọn khu vực Function gần khu vực database để giảm độ trễ.

Trước lần triển khai đầu, đặt `DATABASE_URL`, `DEMO_ADMIN_PASSWORD` và `DEMO_DELIVERY_PASSWORD` trong môi trường dùng để khởi tạo database rồi chạy `node server/bootstrap-hosted.js` **một lần**. Hai mật khẩu demo phải khác nhau, mỗi mật khẩu ít nhất 12 ký tự; không ghi chúng vào GitHub. Script chạy migration (tạo mới hoặc nâng cấp schema), nạp dữ liệu sản phẩm nếu còn trống và tạo hai tài khoản demo. Khi cập nhật phiên bản mới, chạy lại script này để nâng cấp database đã triển khai. Không chạy `npm run seed:roles` trên database công khai vì lệnh đó dùng mật khẩu mẫu cố định.

Import repository `khanghuynh1103/rental-camera` vào Vercel, chọn root là thư mục gốc, thêm `DATABASE_URL` cho Production và triển khai. Sau đó kiểm tra trang chủ, `/api/products`, ảnh sản phẩm, đăng nhập và tạo đơn trước khi gửi URL `*.vercel.app` cho người xem. Giới hạn lưu trữ và thời gian hoạt động của PostgreSQL phụ thuộc gói dịch vụ database đã chọn.

## Hạn chế hiện tại

- Chưa có kiểm thử frontend tự động; backend có unit test cho quy tắc nghiệp vụ và kiểm thử workflow tích hợp.
- Thanh toán, hoàn tiền, hóa đơn và các kênh VNPAY/ATM/thẻ đều là mô phỏng.
- Email/SMS mới được kiểm thử với máy chủ SMTP và API Twilio giả lập, chưa thử với tài khoản nhà cung cấp thật.
- Xác minh CCCD do quản trị viên đối chiếu thủ công, chưa dùng OCR hay đối chiếu với cơ sở dữ liệu quốc gia.
- Vercel giới hạn request khoảng 4,5 MB, nên hồ sơ có ảnh lớn có thể bị từ chối dù ảnh đã nén.
- Ảnh bằng chứng lưu trong PostgreSQL (BYTEA) để phù hợp môi trường demo; production nên chuyển sang object storage.
- Giới hạn đăng nhập sai lưu trong bộ nhớ tiến trình; khi chạy nhiều instance cần chuyển sang Redis/PostgreSQL.
- Quy tắc nghiệp vụ (ngày đệm, phí trễ, thời gian giữ lịch…) cấu hình trong `server/rules.js`; đổi `bufferDays` cần chạy lại `npm run migrate`.
