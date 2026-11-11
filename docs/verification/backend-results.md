# Kết quả kiểm tra backend

Ngày: 10/11/2026. Đây là kết quả kiểm tra source local, không phải biên bản nghiệm thu AWS.

| Kiểm tra | Kết quả |
|---|---|
| Unit tests trên Python 3.11.9 | 41 tests pass |
| Unit tests trên Python 3.14.4 | 41 tests pass |
| Kiểm tra cú pháp theo grammar Python 3.12 | Pass |
| Compile source Python | Pass |
| JSON policies và event mẫu | Parse thành công |
| Bốn ZIP | handler.py ở root, có shared/, không chứa .venv/tests/credentials; import handler thành công |
| AWS thật: IAM, authorizer/CORS, networking, DynamoDB, SNS, Scheduler, retry async, monitoring | Chưa kiểm tra / chưa triển khai |

## Phạm vi test

- POST defaults, trim title, UTC normalization; JSON/enums/độ dài/trường cấm và deadline/reminder sai.
- Thiếu claims, OPTIONS, ownership GET/PUT/DELETE, giữ riêng dữ liệu từng user.
- PUT đủ trường, expectedVersion không nhận bool/float; version/revision; conditional race 409 hoặc 404.
- Sửa nội dung, hoàn thành, mở lại task sau deadline; giữ nguyên thời gian ở timezone khác không tạo thay đổi giả.
- Query GSI theo user, đi hết pagination, cursor sai/cross-user và limit sai; Decimal JSON; 204 rỗng; lỗi 500 không lộ chi tiết.
- Ledger mới, DONE, lease còn/hết hạn, ownerToken cũ, Publish lỗi, ghi DONE lỗi sau Publish.
- Scheduler create/update đầy đủ target/timezone/retry/action; delete missing/completed/none/past; conflict đọc lại task, retry có giới hạn.
- Reminder quá sớm/quá hạn, task xóa/completed/none, owner/revision/time mismatch, publish với strong read, payload lỗi và lỗi AWS phải ném exception.
- Stream INSERT/status change, sửa title/REMOVE/operator reconcile không phát email; retry vẫn reconcile khi email DONE; Scheduler lỗi không bị nuốt.
- UserSetup tạo topic có tag, subscribe, tìm pending subscription qua nhiều trang, bỏ qua reset password/unverified email, thiếu thời gian và lỗi SNS không log email.
- Workflow dùng chung state giả lập: API tạo → Streams gửi email/tạo schedule → Reminder đến giờ → duplicate bị bỏ → hoàn thành/hủy lịch → xóa → Reminder cũ bỏ qua.

## Giới hạn của môi trường và bằng chứng

Tests dùng unittest, MemoryTable và botocore Stubber. MemoryTable chỉ mô phỏng điều kiện cần dùng; không kiểm chứng DynamoDB server thực thi expression. Stubber kiểm tra schema tham số SNS/Scheduler, không kiểm chứng quyền IAM, mạng, delivery hoặc email tới inbox.

Môi trường có Python 3.11.9/3.14.4, chưa có interpreter 3.12; kiểm tra grammar không thay thế chạy trên runtime Lambda Python 3.12. Pip không tải được boto3 ở phiên này; các test chạy với botocore 1.43.72 đã có sẵn trên máy qua đường dẫn test tạm. Boto3 resource/client factories được thay bằng fixture/mock trong tests; chưa chạy smoke test factory với boto3 thật. Không sửa hay đưa đường dẫn môi trường đó vào source ứng dụng.

`requirements-dev.txt` cung cấp boto3 1.40.0 cho môi trường phát triển thông thường, nhưng pin này chưa được cài/kiểm chứng trong phiên này. ZIP không chứa SDK local, Lambda dùng SDK có sẵn trong runtime. Sau upload cần chạy smoke test factory/CRUD trên Lambda trước khi bật Streams.

Các lệnh test thông thường ở backend/README.md dùng môi trường đã cài requirements-dev. Trước bàn giao hệ thống, tiếp tục AT-01 đến AT-24 bằng tài nguyên AWS thật theo hướng dẫn; không ghi các test đó Pass chỉ dựa trên test local.
