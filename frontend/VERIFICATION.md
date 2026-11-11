# Kết quả kiểm tra frontend

## Rà soát trước khi push — 11/11/2026

- `npm run lint` và `npm run build`: pass trên Node.js 24.22.2.
- `node --test --test-isolation=none`: 10/10 pass, gồm 6 test tiện ích và 4 test HTTP service trong `tests/api.test.js`. Dùng chế độ không tách process để chạy trong sandbox.
- Đã thêm tải chi tiết mới nhất trước khi mở form sửa; hiển thị loading khi khôi phục phiên; nhắc xác nhận email SNS sau đăng nhập; thông báo tải lại danh sách trước khi tạo lại nếu POST có kết quả chưa xác định.
- Browser và AWS thật vẫn chưa được kiểm tra. Kết quả bên dưới là các kiểm tra của phiên trước, không phải lần chạy lại ngày 11/11.

## Kiểm tra trước đó

Ngày: 10/11/2026. Môi trường: Node.js 24.22.2.

| Kiểm tra | Kết quả |
|---|---|
| `npm run lint` | Pass, không có warning/error |
| `npm run build` | Pass, sinh bản tĩnh trong `dist/` |
| `TZ=Asia/Ho_Chi_Minh node --test --test-isolation=none` | Pass 6 tests trong `tests/taskUtils.test.js` |
| Service demo, chạy trên bundle SSR với localStorage giả lập | Pass: seed, tạo, lưu lại dữ liệu, tăng version, từ chối version cũ, tăng reminderRevision khi hoàn thành, xóa |
| HTTP client, dùng fetch giả lập | Pass: đi đủ trang và encode cursor, Authorization, POST bỏ status, PUT expectedVersion, DELETE 204, lỗi 401/409/422, cursor lặp |
| Cognito flow, dùng fetch và khóa RSA test sinh tại runtime | Pass: PKCE S256, verifier, xác minh token/ký RSA/nonce, callback không đổi code hai lần khi StrictMode, restore, logout, từ chối state sai |
| Chạy browser và kiểm tra trực quan 375px/1366px | Chưa kiểm tra: sandbox chặn mở browser và listen localhost (`EPERM`) |
| Cognito/API Gateway/SNS/Scheduler thật | Chưa kiểm tra: chưa cấu hình tài nguyên AWS thật |

Các kiểm tra service/auth dùng harness tạm trong `/tmp/task-manager-check.mjs` và `/tmp/task-manager-auth-check.mjs` ở phiên làm việc này; không phải test tích hợp AWS và không nằm trong lệnh `npm test`. Bộ test lưu trong repo chỉ bao gồm các test ở `tests/`.

Trước khi nghiệm thu, chạy ứng dụng trên máy và kiểm tra thủ công theo README; đặc biệt responsive, keyboard/focus, CRUD, callback Cognito và hai tab cập nhật cùng task.
