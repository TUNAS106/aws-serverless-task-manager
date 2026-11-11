# Ước tính chi phí AWS — Task Manager

**Ngày lập:** 11/11/2026.  
**Mục đích:** dự trù chi phí xây dựng, kiểm thử và giữ project để demo phỏng vấn.  
**Đơn vị:** USD, chưa gồm thuế và phí chuyển đổi ngoại tệ của ngân hàng.

Đây là ước tính theo kiến trúc và giá tham khảo, **không phải hóa đơn thực tế**. Chưa kiểm tra ngày tạo tài khoản, credits, hạn mức miễn phí còn lại hoặc các dịch vụ khác đang dùng chung tài khoản.

## 1. Ngân sách đề xuất

- **Dự trù vận hành demo: 1–5 USD/tháng**, với giả định sử dụng và hạn mức miễn phí ở bên dưới.
- **Dự trù cho 1–2 tháng làm project: 10 USD tổng cộng.** Đây là khoản dự phòng, không phải mức AWS bắt buộc thu.
- Nếu credits đủ bù các khoản phát sinh, tiền thực trả có thể là **0 USD**. Khi không có credits, lưu trữ và request vẫn có thể phát sinh phí nhỏ.
- Nếu các workload khác đã dùng hết hạn mức miễn phí, hoặc cấu hình/tải thay đổi, cần tính lại; 5 USD không phải mức trần bảo đảm.

Không có khoản phí triển khai một lần cố định cho toàn bộ project. Chi phí chủ yếu đến từ tài nguyên và lượng sử dụng trong thời gian học, kiểm thử và duy trì demo.

## 2. Phạm vi kiến trúc

| Thành phần | Cấu hình dự kiến |
|---|---|
| Frontend | React + Vite, file tĩnh trên S3 private, CloudFront với OAC |
| API | API Gateway REST API Regional, stage prod; không bật API cache |
| Xử lý | Bốn Lambda Python: Task API, UserSetup, Stream Processor, Reminder |
| Dữ liệu | TasksTable + GSI userId-index; NotificationEventsTable có TTL 7 ngày; on-demand |
| Xác thực | Cognito User Pool, đăng nhập email/password, Lite hoặc Essentials |
| Thông báo | SNS Standard topic riêng cho từng user, giao thức email |
| Nhắc việc | EventBridge Scheduler one-time schedule, tự xóa sau hoàn thành |
| Networking | VPC, hai private subnet, SG và DynamoDB Gateway Endpoint; không có NAT Gateway |
| Monitoring | Một dashboard, bốn standard metric alarms, CloudWatch Logs giữ 7 ngày |

Ước tính dùng CloudFront **pay-as-you-go với hạn mức miễn phí tương ứng**; không cộng phí một gói CloudFront trả tiền cố định. Không tính domain riêng, Route 53 hosted zone, WAF trả phí bổ sung, EC2, RDS, load balancer, provisioned concurrency hoặc paid support plan.

## 3. Giả định sử dụng mỗi tháng

| Chỉ tiêu | Giả định |
|---|---|
| Người dùng hoạt động | 1–5 người, tài khoản demo |
| API requests | Khoảng 10.000, gồm thao tác và các request kiểm thử/preflight phát sinh |
| Task mới | Khoảng 100–300 |
| SNS email | Không quá 1.000, tính cả email từ các thao tác và cảnh báo của project |
| Scheduler invocations | Không quá vài trăm |
| Tổng Lambda invocations | Dưới khoảng 50.000, tính cả Streams và retry thông thường |
| Lambda | Memory bắt đầu 256 MB, thời gian chạy thông thường ngắn; không provisioned concurrency |
| Dữ liệu DynamoDB | Dưới khoảng 100 MB, tính cả GSI và ledger |
| Frontend trên S3 | Dưới khoảng 100 MB; số lần upload/đọc phục vụ demo nhỏ |
| CloudFront data transfer | Dưới khoảng 1 GB |
| Logs | Dưới khoảng 100 MB log mới; retention 7 ngày |
| Region | Bảng giá minh họa chủ yếu tham chiếu us-east-1; nếu dùng Singapore phải chọn lại ap-southeast-1 khi tính chi tiết |

10.000 request API không đồng nghĩa 10.000 request DynamoDB: một thao tác có thể đọc/ghi task, cập nhật GSI, kích hoạt Streams, đọc lại task và ghi ledger. Khoản DynamoDB bên dưới đã dành khoảng dự phòng cho các thao tác này ở quy mô demo, chưa phải phép tính theo từng request unit.

## 4. Chi phí dự kiến theo dịch vụ

Các khoảng bên dưới là **ước lượng cho workload ở Mục 3**, trước khi trừ credits. Những hàng ghi 0 USD giả định tài khoản vẫn còn đủ hạn mức miễn phí tương ứng.

| Dịch vụ | Ước tính/tháng | Cơ sở và điều kiện |
|---|---:|---|
| S3 | $0,01–$0,10 | File build nhỏ, ít PUT/GET; bao gồm dự phòng request. [Giá S3](https://aws.amazon.com/s3/pricing/) |
| CloudFront | Khoảng $0 | Workload thấp hơn hạn mức pay-as-you-go 1 TB truyền ra và 10 triệu HTTP/HTTPS request mỗi tháng. Không tính tính năng bổ sung hoặc invalidation vượt mức miễn phí. [CloudFront FAQ](https://aws.amazon.com/cloudfront/faqs/) |
| Lambda | Khoảng $0 | Trong hạn mức 1 triệu request và 400.000 GB-seconds/tháng. Bốn function cùng chia sẻ hạn mức, không phải mỗi function có một hạn mức riêng. [Giá Lambda](https://aws.amazon.com/lambda/pricing/) |
| API Gateway REST | Khoảng $0,04 tiền request | 10.000 / 1.000.000 × $3,50 = $0,035 theo giá tham chiếu US East, trước ưu đãi; chưa cộng data transfer nếu có. [Giá API Gateway](https://aws.amazon.com/api-gateway/pricing/) |
| DynamoDB | Dự trù $0,05–$0,50 | Hai bảng on-demand, GSI, storage và ledger nhỏ. Không mặc định hạn mức provisioned capacity miễn phí áp dụng cho request on-demand. [Giá DynamoDB](https://aws.amazon.com/dynamodb/pricing/) |
| Cognito | Khoảng $0 | Ít user email/password trong hạn mức MAU miễn phí áp dụng cho Lite/Essentials. Không bật Plus, SMS hoặc các tính năng tính phí bổ sung trong ước tính này. [Giá Cognito](https://aws.amazon.com/cognito/pricing/) |
| SNS | Khoảng $0 | Trong hạn mức 1 triệu API requests và 1.000 email deliveries/tháng. Email vượt hạn mức có giá tham chiếu $2/100.000 deliveries. [SNS FAQ](https://aws.amazon.com/sns/faqs/) |
| EventBridge Scheduler | Khoảng $0 | Trong hạn mức 14 triệu invocations/tháng; Lambda được gọi vẫn tính theo giá Lambda riêng. [Giá Scheduler](https://aws.amazon.com/eventbridge/pricing/) |
| CloudWatch | Dự trù $0–$4 | Một dashboard, bốn alarm cơ bản và ít logs; xem Mục 5. [Giá CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) |
| Networking theo kiến trúc hiện tại | $0 phí tài nguyên nêu trên | Bản thân VPC không có phí bổ sung; Gateway Endpoint không có phí giờ/xử lý dữ liệu. Không dùng NAT hoặc Interface Endpoint trong ước tính. [VPC FAQ](https://aws.amazon.com/vpc/faqs/), [giá VPC](https://aws.amazon.com/vpc/pricing/) |

Tổng các dòng ước tính khoảng **$0,10–$4,64/tháng**. Chọn ngân sách **$1–$5/tháng** để dễ quản lý ở quy mô này, nhưng vẫn cần theo dõi hóa đơn vì data transfer, retry, thao tác Console và usage dùng chung tài khoản có thể làm số thực tế khác đi.

## 5. Monitoring và tài nguyên để lâu

CloudWatch có hạn mức miễn phí cho ba custom dashboards, mỗi dashboard tham chiếu tối đa 50 metrics, và 10 alarm metrics thuộc loại standard resolution được hỗ trợ. Một dashboard và bốn alarm của project có thể nằm trong hạn mức này nếu tài khoản chưa dùng hết. [Giá CloudWatch](https://aws.amazon.com/cloudwatch/pricing/).

Khi phải trả phí, mức tham chiếu US East cho một dashboard khoảng $3/tháng và bốn standard metric alarms khoảng $0,40/tháng, tổng khoảng **$3,40 trước logs và các API liên quan**. Vì vậy monitoring có thể chiếm phần lớn hóa đơn dù ứng dụng ít người dùng. Giá thực tế cần kiểm tra theo region và loại alarm. [Giá CloudWatch](https://aws.amazon.com/cloudwatch/pricing/).

Đóng tab trình duyệt hoặc dừng `npm run dev` không xóa tài nguyên AWS. Storage, dashboard/alarm phải trả phí và các lịch nhắc còn tồn tại vẫn có thể tạo chi phí. Retention 7 ngày giúp giới hạn lượng log lưu, nhưng không hoàn lại phí ingest log đã phát sinh.

## 6. Phân biệt hạn mức miễn phí và credits

**Hạn mức miễn phí theo dịch vụ:** miễn phí một lượng usage nhất định, thường tính theo tháng và có quy tắc dùng chung ở cấp tài khoản/organization. Không được cộng thêm một hạn mức mới chỉ vì tạo function, bảng hoặc project mới.

**Credits:** khoản được áp dụng để bù chi phí của các dịch vụ đủ điều kiện. AWS công bố ưu đãi tối đa $200 cho khách hàng mới đủ điều kiện; số credits thực nhận, thời hạn và dịch vụ được áp dụng cần kiểm tra trong tài khoản. Không mặc định mọi tài khoản đều có $200 hoặc cùng thời hạn. [AWS Free Tier FAQ](https://aws.amazon.com/free/free-tier-faqs/).

Ví dụ: project phát sinh $2 chi phí đủ điều kiện và còn đủ credits thì phần thanh toán cho khoản đó có thể là $0. Điều này không có nghĩa workload không phát sinh chi phí hoặc sẽ miễn phí mãi sau khi credits hết.

## 7. Những thay đổi có thể làm tăng chi phí

| Thay đổi | Tác động cần kiểm tra |
|---|---|
| Thêm NAT Gateway | Có phí theo giờ dù ít traffic. Với mức minh họa $0,045/giờ, 30 ngày là $32,40 trước phí xử lý dữ liệu và phí liên quan. Giá tùy region; kiến trúc hiện tại không cần NAT. [Giá VPC](https://aws.amazon.com/vpc/pricing/) |
| Chọn Interface Endpoint thay vì DynamoDB Gateway Endpoint | Có mô hình tính phí khác; không còn áp dụng dòng networking $0 ở trên |
| Bật API Gateway cache hoặc Lambda provisioned concurrency | Phát sinh khoản theo thời gian cấu hình, không chỉ dựa vào số thao tác demo |
| Mua domain hoặc tạo hosted zone | Thêm chi phí domain/DNS ngoài ngân sách này |
| Log quá nhiều, custom metrics hoặc mở rộng monitoring | Tăng phí ingest/storage/query/metrics |
| Event lỗi và retry nhiều | Tăng invocation, đọc/ghi ledger và logs; cần sửa nguyên nhân, không chỉ tăng retry |
| Load test hoặc public demo có nhiều traffic | Cần tính lại request, data transfer, database và email |
| Bật backup/PITR, global tables hoặc replication | Tăng chi phí ngoài cấu hình tối thiểu đang ước tính |

## 8. Theo dõi bằng AWS Console

### Trước khi triển khai

1. Mở **Billing and Cost Management** → kiểm tra Free Tier/credits hiện có và ngày hết hạn hiển thị trong tài khoản.
2. Mở **Budgets** → tạo monthly cost budget tên `task-manager-demo-budget`, mức **$5/tháng**.
3. Thêm cảnh báo actual cost ở **80% ($4)** và **100% ($5)**, gửi tới email bạn theo dõi.
4. Budget mặc định là cảnh báo, không tự ngắt hệ thống hoặc bảo đảm hóa đơn không vượt $5.
5. Gắn hai tag chuẩn cho resource hỗ trợ: `Project=task-manager`, `Environment=demo`.
6. Trong **Cost allocation tags**, kích hoạt tag Project/Environment để theo dõi chi phí sau khi billing cập nhật. Giữ cả góc nhìn tổng chi phí tài khoản vì không phải mọi khoản đều có tag project.

### Trong lúc thực hiện

1. **Bills**: xem phí theo dịch vụ và region, đặc biệt sau các buổi tạo hạ tầng hoặc kiểm thử.
2. **Cost Explorer**: chọn khoảng ngày của project, Group by Service; thêm filter tag Project khi tag đã có dữ liệu.
3. Kiểm tra riêng NAT Gateway, Interface Endpoint, cache và provisioned concurrency nếu hóa đơn cao hơn dự kiến.
4. Billing có độ trễ; lưu thời điểm quan sát, không kết luận không có phí chỉ vì màn hình hiện $0 ngay sau khi tạo tài nguyên.
5. Khi cần báo giá chi tiết hơn, dùng [AWS Pricing Calculator](https://calculator.aws/) với region và usage thực tế; kiểm tra rõ estimate đang tính trước hay sau ưu đãi/credits.

### Sau khi demo

Lưu evidence rồi làm teardown theo hướng dẫn triển khai: tắt stream mapping, dọn schedules, Lambda/API, SNS, Cognito, DynamoDB, CloudFront/S3, monitoring và networking dành riêng cho project. Kiểm tra lại billing sau khi dữ liệu cập nhật. Không xóa tài nguyên ngoài inventory của project.

## 9. Mẫu ghi chi phí thực tế

| Khoản | Ước tính | Thực tế | Ghi chú |
|---|---:|---:|---|
| Tháng 1 | $1–$5 | Chưa đo | |
| Tháng 2, nếu tiếp tục giữ demo | $1–$5 | Chưa đo | |
| Credits đã áp dụng | Tùy tài khoản | Chưa kiểm tra | |
| Thuế/phí chuyển đổi | Chưa tính | Chưa đo | |
| Tổng thanh toán | Dự phòng $10 cho 1–2 tháng, chưa thuế/phí | Chưa đo | |

Khi trình bày phỏng vấn, phân biệt rõ **chi phí ước tính**, **usage cost trước credits** và **số tiền thực trả**. Chỉ công bố chi phí thực tế khi có hóa đơn/evidence tương ứng; không dùng ước tính này làm bằng chứng hệ thống đã chạy miễn phí.
