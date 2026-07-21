# 📱 iSpend - Ứng Dụng Quản Lý Chi Tiêu iOS Style

Ứng dụng web di động (SPA) nhỏ gọn, được tối ưu hóa giao diện chuẩn iOS, hỗ trợ chụp ảnh hóa đơn/món đồ, nhập số tiền và tổng hợp báo cáo chi tiêu tự động theo **Ngày, Tuần, Tháng** trực tiếp trên điện thoại của bạn.

---

## ✨ Tính năng nổi bật

1. **Giao diện iOS Premium**: Thiết kế tối (Dark Mode), bo góc mềm mại, hiệu ứng mờ kính (Glassmorphic) và chuyển tab mượt mà.
2. **Camera đính kèm**: Chụp ảnh món đồ hoặc hóa đơn mua hàng trực tiếp từ camera điện thoại.
3. **Nén ảnh thông minh**: Tự động giảm kích thước và nén ảnh về Base64 dạng nhẹ trước khi lưu để tiết kiệm bộ nhớ LocalStorage của trình duyệt.
4. **Báo cáo trực quan**:
   - Thống kê chi tiêu theo Ngày, Tuần, Tháng.
   - Biểu đồ xu hướng tuần (Bar Chart) bằng Chart.js.
   - Biểu đồ cơ cấu danh mục tháng (Doughnut Chart) và tỷ lệ phần trăm tương ứng.
5. **Quản lý dữ liệu**:
   - Lưu trữ cục bộ bảo mật, không cần tài khoản, không tải dữ liệu lên đám mây.
   - Hỗ trợ xuất dữ liệu (Backup JSON) và nhập lại (Restore JSON) nhanh chóng.
   - Tính năng xóa sạch dữ liệu khi muốn đặt lại từ đầu.

---

## 🚀 Hướng dẫn khởi chạy và kết nối từ iPhone

Để mở ứng dụng trên điện thoại iPhone, bạn cần chạy một máy chủ cục bộ (Local Server) trên máy tính rồi kết nối qua mạng Wifi nội bộ (cả PC và iPhone đều kết nối cùng 1 mạng Wifi).

### Bước 1: Khởi động Server trên Máy tính

Bạn có thể sử dụng một trong các cách sau:

#### Cách 1: Sử dụng Python (Đơn giản nhất nếu máy có Python)
Mở terminal (PowerShell hoặc Command Prompt) tại thư mục dự án và chạy:
```bash
python -m http.server 8000 --bind 0.0.0.0
```

#### Cách 2: Sử dụng Node.js (npx)
Nếu bạn có Node.js cài sẵn trên máy:
```bash
npx http-server -p 8000 -a 0.0.0.0
```
Hoặc:
```bash
npm install
npm run dev
```

#### Cách 3: Sử dụng tiện ích Live Server trong VS Code
Nếu bạn dùng VS Code, chỉ cần cài extension **Live Server**, nhấn chuột phải vào tệp `index.html` và chọn **Open with Live Server**.

---

### Bước 2: Tìm địa chỉ IP máy tính của bạn (trên Windows)

1. Mở PowerShell hoặc CMD trên máy tính.
2. Nhập lệnh:
   ```powershell
   ipconfig
   ```
3. Tìm dòng **IPv4 Address** dưới card mạng Wifi đang kết nối (ví dụ: `192.168.1.15`).

---

### Bước 3: Truy cập trên điện thoại iPhone (iOS)

1. Đảm bảo iPhone và máy tính đang dùng chung một mạng Wifi.
2. Mở trình duyệt **Safari** hoặc **Chrome** trên iPhone.
3. Truy cập địa chỉ IP tìm được ở Bước 2 kèm cổng `8000` (hoặc cổng tương ứng của server):
   ```text
   http://192.168.1.15:8000
   ```
4. **Mẹo iOS (Để chạy như ứng dụng thật)**: Bấm vào nút **Chia sẻ (Share)** trên Safari ở dưới cùng màn hình -> Chọn **Thêm vào MH chính (Add to Home Screen)**. Từ lúc này, ứng dụng sẽ có biểu tượng riêng trên màn hình chính và khởi chạy toàn màn hình (không có thanh địa chỉ trình duyệt).

---

## 🛠️ Cấu trúc dự án
- [index.html](file:///c:/Users/tiphu/Desktop/DATA%20NKC/QLCT/index.html) - Cấu trúc giao diện chính
- [css/styles.css](file:///c:/Users/tiphu/Desktop/DATA%20NKC/QLCT/css/styles.css) - Hệ thống CSS, Responsive & Mobile Shell
- [js/app.js](file:///c:/Users/tiphu/Desktop/DATA%20NKC/QLCT/js/app.js) - Quản lý trạng thái, nén ảnh, lưu LocalStorage
- [js/chart-config.js](file:///c:/Users/tiphu/Desktop/DATA%20NKC/QLCT/js/chart-config.js) - Cấu hình vẽ đồ thị Chart.js
