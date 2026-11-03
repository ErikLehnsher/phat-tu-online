# Phòng niệm online: bản thử giao diện (front-end prototype)

Chạy thử trên máy bạn:

```bash
python3 -m http.server 3200
```
rồi mở http://127.0.0.1:3200

## Đây là gì
Một phòng 20 chỗ, 3 góc camera (từ bàn thờ, sau tượng, từ cửa), ngày/đêm, hai mood (nghiêm túc/vui).
Bạn chọn nhân vật, bấm một bồ đoàn trống: cửa mở, nhân vật đi vào, ngồi, rồi có thể chắp tay, lạy, gõ mõ, dâng hương.
Những người còn lại là **người giả lập** trong trình duyệt (nút "Thêm 1 người", "Đầy phòng"). **Chưa có máy chủ, chưa có đăng nhập.**

## Cấu trúc
- `index.html`, `style.css`, `app.js`: giao diện và hoạt ảnh (JS thuần, không cần build).
- `assets/`: ảnh đã tách nền (WebP) và `meta.json` (kích thước từng pose để các pose khớp cỡ nhau).
- `tools/cut.py`: tách nền trắng của ảnh gốc (từ repo ảnh) thành ảnh trong suốt.
- `tools/build.py`: tạo `assets/` từ ảnh đã tách (tách tấm chi tiết thành từng món, đo cỡ đầu từng nhân vật).
- `tools/statue_mask.py`: tách tượng khỏi nền CAM2 để vẽ đè lên người ngồi hàng đầu.

## Chỗ ngồi
Toạ độ 20 chỗ của mỗi góc camera nằm trong `CAMS` ở đầu `app.js`: mỗi hàng có `y` (% chiều cao) và `sp` (khoảng cách giữa các chỗ, % chiều rộng).
Đổi ảnh nền thì chỉnh lại các số này.

## Việc còn lại để thành sản phẩm thật
Máy chủ thời gian thực (WebSocket) giữ trạng thái chỗ ngồi và hành động, đăng nhập, giới hạn 20 người mỗi phòng, âm thanh thật (hiện là tiếng mõ tổng hợp), tối ưu cho điện thoại.
