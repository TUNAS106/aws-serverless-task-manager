# Backend Task Manager

Python 3.12, bốn Lambda độc lập, DynamoDB, SNS và EventBridge Scheduler theo hướng dẫn triển khai và SRS 1.2. Code chỉ dùng standard library và AWS SDK có sẵn trong Lambda; không cần FastAPI, Flask, ORM hoặc server chạy thường trực.

## Đọc code theo thứ tự

| File | Trách nhiệm |
|---|---|
| `task_api/handler.py` | REST proxy, CRUD, ownership, cursor và conditional write |
| `shared/validation.py` | Validation POST/PUT và các mã lỗi nghiệp vụ |
| `shared/time_utils.py` | Chuẩn hóa thời gian UTC đến giây |
| `user_setup/handler.py` | Topic SNS theo sub, subscription email và hai tag chuẩn |
| `stream_processor/handler.py` | Stream event, so sánh status, reconcile rồi gửi email |
| `shared/schedules.py` | Tạo/cập nhật/xóa một schedule theo task hiện tại |
| `reminder/handler.py` | Loại bỏ task/lịch cũ, kiểm tra khoảng giờ gửi |
| `shared/ledger.py` | Conditional lease 60 giây, ownerToken, DONE và TTL 7 ngày |
| `shared/notifications.py` | Dựng topic ARN tin cậy, email text và gửi có ledger |
| `shared/aws.py` | SDK client dùng lại, timeout ngắn và log không chứa nội dung riêng tư |

## Ba luồng cần hiểu

1. **CRUD:** React → Cognito authorizer → Task API → TasksTable. API lấy userId từ claims.sub, không nhận từ body. Thành công trả task mới, không chờ email hoặc Scheduler.
2. **Thay đổi dữ liệu:** TasksTable Streams → Stream Processor. Worker đọc task hiện tại bằng strong read và reconcile schedule. INSERT gửi TASK_CREATED; MODIFY chỉ gửi TASK_STATUS_CHANGED nếu status đổi; REMOVE không gửi email. Event cũ vẫn được dùng để mô tả email sự kiện, nhưng không được dùng làm nguồn cấu hình schedule.
3. **Nhắc việc:** Scheduler → Reminder → strong read task → kiểm tra userId, status, revision, reminderAt và thời gian → ledger → SNS riêng của user. Chỉ gửi trong khoảng `reminderAt <= now < dueAt`.

## Cấu hình từng Lambda bằng Console

Chọn Python **3.12**, runtime handler **`handler.lambda_handler`**. Các Lambda dùng cùng region. `AWS_REGION` được runtime tự cung cấp, không thêm thủ công biến reserved này. Không tạo access key cho Lambda; SDK dùng execution role.

| Function | Timeout | VPC | Environment variables cần nhập |
|---|---|---|---|
| `ptdm-task-api` | 10 giây | Hai private subnet + DynamoDB Gateway Endpoint | `TASKS_TABLE`, `ALLOWED_ORIGIN` |
| `ptdm-user-setup` | 3 giây | Không gắn custom VPC | Không cần biến riêng |
| `ptdm-stream-processor` | 30 giây | Không gắn custom VPC | `TASKS_TABLE`, `NOTIFICATION_EVENTS_TABLE`, `ACCOUNT_ID`, `SCHEDULE_GROUP`, `REMINDER_FUNCTION_ARN`, `SCHEDULER_ROLE_ARN` |
| `ptdm-reminder` | 30 giây | Không gắn custom VPC | `TASKS_TABLE`, `NOTIFICATION_EVENTS_TABLE`, `ACCOUNT_ID` |

Giá trị cụ thể:

| Key | Value |
|---|---|
| `TASKS_TABLE` | `TasksTable` |
| `NOTIFICATION_EVENTS_TABLE` | `NotificationEventsTable` |
| `ACCOUNT_ID` | Account ID thật gồm 12 chữ số |
| `ALLOWED_ORIGIN` | Origin CloudFront chính xác, ví dụ `https://d123.cloudfront.net`, không có `/` cuối |
| `SCHEDULE_GROUP` | `ptdm-reminders` |
| `REMINDER_FUNCTION_ARN` | ARN thật của ptdm-reminder |
| `SCHEDULER_ROLE_ARN` | ARN thật của PtdmSchedulerInvokeRole |

V1 cố định topic prefix `ptdm-user-`. Không cần cấu hình `SNS_TOPIC_ARN`, không có topic email chung giữa các user. ARN được dựng từ account/region triển khai và userId trong dữ liệu tin cậy. `AWS_PARTITION` là biến tùy chọn nếu dùng partition khác; Singapore/us-east-1 không cần nhập.

Nếu chưa tạo CloudFront, nhập tạm `ALLOWED_ORIGIN=http://localhost:5173` trước khi test Task API bằng Lambda Console. Sau khi có hosting, đổi sang origin CloudFront. API chỉ trả một origin cấu hình, không tự cho phép mọi website.

SDK không tự retry trong handler: timeout connect/read lần lượt 1/2 giây. Riêng UserSetup dùng 0,25/0,35 giây để giữ ngân sách trigger ngắn. Đây không phải cam kết mọi lời gọi hoàn thành dưới ngưỡng timeout; timeout của Lambda vẫn là giới hạn cuối. Các worker ném lỗi để trigger retry; API trả 500 để browser xử lý có chủ đích.

## IAM bằng GUI

Trong `../docs/policies/` đã có JSON hoàn chỉnh. Mở bằng VS Code, thay mọi `<region>` và `<account-id>` bằng giá trị thật trước khi dán vào IAM Console. Nếu đổi tên bảng/function/group/role, cập nhật ARN tương ứng trong policy.

1. IAM → Roles → Create role → Custom trust policy → dùng `lambda-trust.json` cho bốn role Lambda.
2. Tạo inline permission policy tương ứng: `task-api.json`, `user-setup.json`, `stream-processor.json`, `reminder.json`.
3. Task API attach `AWSLambdaVPCAccessExecutionRole` để có quyền log/ENI. Ba Lambda còn lại attach `AWSLambdaBasicExecutionRole` để ghi log. Các JSON nghiệp vụ không tự bao gồm quyền log.
4. Role `PtdmSchedulerInvokeRole` dùng **`scheduler-trust.json`** và **`scheduler-invoke.json`**, không dùng trust của Lambda.
5. Gắn hai tag `Project=task-manager`, `Environment=demo` riêng cho từng role và function. Log groups và Scheduler group cũng cần gắn riêng theo hướng dẫn.

Task API dùng **PutItem có điều kiện** cho PUT full replacement, giữ các trường bất biến từ bản đọc mạnh. Vì vậy policy hiện tại không cần UpdateItem cho TasksTable; ledger vẫn cần UpdateItem. DeleteItem kiểm tra ownership ngay trong điều kiện ghi.

## Đóng gói và upload bằng GUI

Bốn ZIP đã được tạo tại thư mục **`../build/`**:

- `ptdm-task-api.zip`
- `ptdm-user-setup.zip`
- `ptdm-stream-processor.zip`
- `ptdm-reminder.zip`

Lambda Console → function tương ứng → Code → Upload from → .zip file → chọn đúng ZIP → Save. Kiểm tra Runtime settings là `handler.lambda_handler`.

Mỗi ZIP có cấu trúc:

```text
handler.py
shared/
  __init__.py
  aws.py
  validation.py
  ...
```

Sau khi sửa source, ZIP cũ không tự cập nhật. Có hai cách tạo lại:

- **Bằng GUI:** tạo staging folder mới, copy handler.py của function và cả thư mục shared, chọn hai phần tử bên trong → Compress ZIP. Không thêm lớp thư mục cha, `.venv`, tests hoặc `__pycache__`.
- **Trong VS Code:** mở `build_packages.py` → Run Python File. Script chỉ tạo bốn ZIP local, không gọi AWS. Nếu source đã đổi thì luôn build lại trước upload.

Lambda cung cấp boto3/botocore trong runtime; không đưa `.venv` máy local vào ZIP. `requirements-dev.txt` chỉ phục vụ kiểm thử local. Nếu sau này chủ động bundle SDK thì phải bundle boto3 cùng các dependency tương thích, không trộn một phần SDK với runtime.

## Bảng và trigger phải tạo đúng

- TasksTable: PK taskId String, GSI userId-index có userId String / createdAt String, projection ALL, Streams NEW_AND_OLD_IMAGES.
- NotificationEventsTable: PK eventKey String, TTL attribute **ttl**, epoch seconds.
- UserSetup: gắn Cognito Post confirmation; chỉ xử lý ConfirmSignUp có email_verified. ConfirmForgotPassword không đăng ký lại.
- Stream mapping: batch size 1, parallelization 1, retry attempts -1, max record age 3600 giây. Chỉ bật sau khi Reminder, Scheduler group, role và ENV đã sẵn sàng.
- Scheduler group `ptdm-reminders` phải tạo trước bằng Console. Worker chỉ tạo schedule trong group, không tự tạo group.
- Reminder → Configuration → Asynchronous invocation: retry attempts 2, max event age 3600 giây. RetryPolicy trên schedule xử lý lớp giao invocation khác với retry lỗi code Lambda.

Code không tự tạo bảng, role, group hoặc networking. Thực hiện các bước GUI trong hướng dẫn triển khai.

## Kiểm thử từ Lambda Console

Các JSON tại `examples/` chỉ là event test operator; fake claims không phải JWT để gọi API public.

1. Dùng `api-create.json` cho Task API; đổi dueAt thành thời gian tương lai của lần test. Body là **chuỗi JSON**, không phải object trực tiếp. Mẫu dùng năm 2030 chỉ để tránh copy deadline cũ.
2. Dùng `api-list.json`; kiểm tra userId trong item DynamoDB đúng demo-user-a. Xóa fixture sau khi test handler.
3. Với Cognito thật, dùng frontend VITE_USE_MOCK=false. Kiểm tra JWT/CORS bằng browser; Lambda Test không kiểm chứng authorizer hoặc preflight API Gateway.
4. `user-setup.json`: thay sub/email bằng thông tin đã xác minh ở Cognito. Không tự gán email_verified cho địa chỉ chưa xác minh. Invoke lại hai lần, không tạo thêm subscription; xác nhận email SNS trước test thông báo.
5. `stream-reconcile.json`: thay taskId thật; OldImage/NewImage cùng status nên chỉ reconcile, không gửi email. Handler đọc bản hiện tại từ DB, không dựa vào status mẫu để lập lịch.
6. `reminder.json`: lấy đủ bốn giá trị thật từ DB/schedule. Invoke trước reminderAt sẽ skip, payload revision cũ cũng skip. Không sửa riêng reminderAt trong payload để giả lập đến giờ vì sẽ bị coi là lịch cũ.
7. Test nhắc thật: task có deadline khoảng 65–70 phút tới, reminder 1h; chờ tới giờ nhắc. Không đổi offset trong source chỉ để demo.

SNS chỉ gửi email khi subscription đã confirmed; UserSetup thành công không đồng nghĩa user đã xác nhận SNS.

## Chạy unit tests local

VS Code → chọn Python interpreter của môi trường local. Các lệnh sau chỉ phục vụ phát triển local, không quản trị AWS:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m unittest discover -s tests -t . -v
```

Chạy từ thư mục `backend`. Tests dùng unittest, in-memory table fixtures và botocore Stubber; không cần credentials thật và không gọi AWS. Stubber kiểm tra tham số SNS/Scheduler theo model SDK. In-memory table chỉ mô phỏng những điều kiện được dùng trong code, không thay thế DynamoDB thật.

Đã có test ownership, validation, timezone, version/revision, phân trang, conditional race, lease/DONE/retry, stale reminder, SNS setup và Scheduler conflict. Kết quả thực tế và giới hạn môi trường được ghi tại `../docs/verification/backend-results.md`.

## Giới hạn để chuẩn bị phỏng vấn

- Ledger giảm email trùng nhưng **không exactly-once**. Nếu SNS đã nhận Publish rồi ghi DONE thất bại, retry sau khi lease hết có thể gửi lại.
- Strong read không tạo transaction với SNS/Scheduler. Nếu task đổi sau khi đọc nhưng trước Publish thì vẫn có cửa sổ cạnh tranh.
- SNS Subscribe có bước kiểm tra trước để tránh tạo lặp thông thường, nhưng không có distributed lock cho nhiều UserSetup chạy đồng thời. Đủ cho demo; operator cần kiểm tra khi phục hồi.
- UserSetup bắt lỗi để trả event gốc; timeout thật vẫn có thể làm trigger thất bại. Theo dõi log và chạy lại thủ công, không hứa tự phục hồi.
- Schedule conflict được thử lại tối đa ba lần, mỗi lần đọc task mới; nếu vẫn lỗi thì trả lỗi cho trigger retry. Không có vòng lặp vô hạn hoặc sleep trong Lambda.
- Không gửi reminder bù đã qua giờ reconcile, và không gửi từ deadline trở đi. Mở lại task cũ vẫn được nhưng có thể không lập lịch mới.
- Cursor chỉ là khóa tiếp tục đã kiểm tra, không phải quyền truy cập. Query luôn dùng userId từ authorizer. Cursor không có chữ ký; thao tác sửa cursor trong phạm vi cùng user có thể thay điểm bắt đầu, không được phép đổi chủ dữ liệu.
- POST chưa có idempotency key. Nếu browser mất response, tải lại danh sách trước khi tạo lại để tránh trùng.
- Deserializer stream hỗ trợ đúng schema hiện tại: String, Number và NULL. Nếu mở rộng schema sang Map/List/Boolean, dùng TypeDeserializer đầy đủ hoặc mở rộng hàm.
- Chưa có DLQ, IaC, tự replay hoặc kiểm thử tải; AWS retry có giới hạn và record hết tuổi có thể bị mất. Dùng runbook, alarms và công bố giới hạn theo SRS.

Nguồn SDK: [DynamoDB conditional PutItem](https://docs.aws.amazon.com/boto3/latest/reference/services/dynamodb/table/put_item.html), [Scheduler CreateSchedule](https://docs.aws.amazon.com/boto3/latest/reference/services/scheduler/client/create_schedule.html), [Scheduler UpdateSchedule](https://docs.aws.amazon.com/boto3/latest/reference/services/scheduler/client/update_schedule.html), [SNS subscriptions](https://docs.aws.amazon.com/boto3/latest/reference/services/sns/client/list_subscriptions_by_topic.html).
