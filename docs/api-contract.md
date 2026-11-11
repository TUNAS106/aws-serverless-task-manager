# API contract V1

REST API Gateway Lambda proxy, stage `prod`, Cognito User Pool Authorizer. Header nghiệp vụ: `Authorization: Bearer <ID-token>`. Không gắn OAuth scopes cho V1; OPTIONS không yêu cầu JWT. Backend đọc `requestContext.authorizer.claims.sub`, không tự coi token chưa xác thực là danh tính.

| Method | Path | Thành công |
|---|---|---|
| POST | `/tasks` | 201 + task |
| GET | `/tasks?limit=50&cursor=...` | 200 + `{items,nextCursor}` |
| GET | `/tasks/{taskId}` | 200 + task |
| PUT | `/tasks/{taskId}` | 200 + task mới |
| DELETE | `/tasks/{taskId}` | 204, body rỗng |

POST nhận title, dueAt; description mặc định chuỗi rỗng, priority mặc định medium, reminderOption mặc định none. Status do server đặt pending. Không gửi status, userId, taskId hoặc expectedVersion trong POST.

PUT là full replacement: gửi đủ title, description, priority, status, dueAt, reminderOption và expectedVersion. Các trường server quản lý không được nhận qua body. Mỗi PUT tăng version; reminderRevision chỉ tăng nếu deadline/reminder đổi hoặc vào/ra completed.

Timestamp phải có timezone, ví dụ `2030-01-02T17:00:00+07:00`, lưu/trả chuẩn UTC đến giây (`2030-01-02T10:00:00Z`). Không nối Z vào giờ local. Title trim 1–120 ký tự; description 0–1000. Priority low/medium/high; status pending/in_progress/completed; reminderOption none/1h/24h.

Chỉ yêu cầu deadline tương lai khi tạo/đổi deadline. Chỉ yêu cầu giờ nhắc tương lai khi tạo/đổi cấu hình có reminder. Giữ nguyên cấu hình thì vẫn sửa nội dung, hoàn thành và mở lại được sau giờ nhắc/deadline; không tạo lịch quá khứ.

List dùng Query userId-index, createdAt giảm dần; limit 1–100. Truyền nguyên nextCursor URL-encoded cho trang tiếp theo, dừng ở null. Cursor kiểm tra cấu trúc và userId; Query luôn lấy userId từ claims. GSI eventual consistency: sau thao tác ghi, frontend cập nhật state từ response thay vì giả định list phản ánh ngay.

Response task có taskId, title, description, priority, status, dueAt, reminderOption, reminderAt, version, reminderRevision, createdAt, updatedAt. Không trả userId. Lỗi backend có dạng:

```json
{"error":{"code":"VERSION_CONFLICT","message":"Công việc đã thay đổi. Hãy tải lại rồi sửa."},"requestId":"..."}
```

| HTTP | Code |
|---|---|
| 400 | VALIDATION_ERROR |
| 401 | UNAUTHORIZED |
| 404 | TASK_NOT_FOUND (không tồn tại hoặc khác chủ); NOT_FOUND cho endpoint khác |
| 409 | VERSION_CONFLICT |
| 422 | INVALID_DEADLINE hoặc REMINDER_TIME_PASSED |
| 500 | INTERNAL_ERROR |

429/throttling và lỗi authorizer do Gateway quản lý; có thể có body khác mẫu backend. Cần cấu hình CORS cho OPTIONS và Gateway Responses DEFAULT_4XX/DEFAULT_5XX ngoài CORS do handler trả. CORS không thay cho auth/ownership.

Nếu POST timeout hoặc mất response, không tự gửi lại: kiểm tra danh sách trước để giảm tạo trùng. POST chưa có idempotency key. Nếu PUT 409, tải bản mới rồi chỉnh lại.
