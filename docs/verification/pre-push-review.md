# Rà soát trước khi push GitHub

Ngày kiểm tra: 11/11/2026.

## Kết luận

Source có thể đưa lên GitHub để tiếp tục triển khai và làm portfolio. Các kiểm tra local đã đạt; chưa thể xem đây là hệ thống đã nghiệm thu trên AWS.

## Kết quả kiểm tra

| Hạng mục | Kết quả |
|---|---|
| Frontend lint và production build | Pass trên Node.js 24.22.2 |
| Frontend unit/service tests | 10/10 pass; HTTP dùng fetch giả lập |
| Backend tests | 41/41 pass trên Python 3.11.9, sử dụng mock và botocore Stubber |
| File chuẩn bị commit | Không phát hiện mẫu AWS access key, private key, GitHub token hoặc JWT trong lần quét; không phải bảo đảm tuyệt đối không có secret |
| Git ignore | Loại trừ ENV thật, dependencies, virtualenv, cache, dist, ZIP/build, thư mục .aws, private key và log |

Backend được thiết kế chạy Python 3.12 trên Lambda. Lần kiểm tra này dùng botocore sẵn có trên máy để chạy test; chưa kiểm tra khởi tạo client bằng boto3 thật hoặc runtime Lambda 3.12. Xem thêm [kết quả backend](backend-results.md).

## Đã chỉnh trong lần rà soát

- Lấy chi tiết task từ API trước khi mở form sửa, giảm việc sửa trên dữ liệu cũ trong danh sách.
- Hiển thị trạng thái tải khi khôi phục phiên đăng nhập.
- Nhắc người mới đăng ký xác nhận subscription trong email AWS Notifications để nhận thông báo.
- Khi POST mất kết nối, lỗi server hoặc trả response không đọc được, yêu cầu tải lại danh sách trước khi tạo lại; không tự retry POST để tránh tạo trùng.
- Bổ sung test HTTP service và quy tắc Git ignore.

## Cần kiểm tra thủ công khi triển khai

1. Chạy demo trên trình duyệt: thêm/sửa/xóa, hoàn thành/mở lại, bộ lọc, refresh; thử màn hình desktop và điện thoại, bàn phím và modal.
2. Nối AWS thật: đăng ký, xác nhận tài khoản, login/logout; xác nhận subscription SNS rồi thử email tạo task, đổi trạng thái và nhắc deadline.
3. Thử hai tài khoản để kiểm tra cách ly dữ liệu; hai tab sửa cùng task để kiểm tra lỗi 409.
4. Kiểm tra CORS, IAM, GSI/Streams, Scheduler execution role, kết nối DynamoDB qua VPC endpoint, log và alarms.
5. Trên môi trường có mạng, chạy `npm ci`, `npm audit`, cài requirements backend và chạy lại test. Lần rà soát này không xác minh được clean install hoặc dependency audit do hạn chế mạng.

Các bước trên chưa được thực hiện đầy đủ trong sandbox: browser/listen localhost bị chặn và chưa có tài nguyên AWS được cấu hình cho kiểm thử.

## Trước khi bấm Push trong VS Code

Mở đúng thư mục `aws-serverless-task-manager` → Source Control → xem các file thay đổi. Commit source, tài liệu, lockfile và `.env.example`; kiểm tra không có giá trị bí mật trong file mẫu hay ảnh chụp. Sau đó Stage Changes → Commit → Publish Branch hoặc Sync Changes theo trạng thái repo. Lần rà soát này không tạo commit hoặc push thay bạn.
