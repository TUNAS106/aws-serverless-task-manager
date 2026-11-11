# Task Manager — Frontend

React + Vite, JavaScript và CSS thuần. Giao diện tiếng Việt lấy cảm hứng QuestUI: nền giấy kem sáng, chữ nâu đậm, vàng cổ, font Cinzel/Spectral, huy hiệu và đường viền. Cỡ chữ được tăng để dễ đọc trên desktop và điện thoại. Không thêm thư viện UI, router hay state management.

## Chạy trên máy

Mở thư mục `frontend` bằng VS Code → Terminal → New Terminal. Cần Node.js 24 và npm.

```bash
npm ci
npm run dev
```

Mở địa chỉ Vite in ra, thường là `http://localhost:5173/`. Nếu terminal chưa nhận npm sau khi cài NVM, mở terminal mới hoặc chạy `source ~/.bashrc`.

Mặc định dùng **demo local**, không cần AWS hoặc `.env`. Có bảy task mẫu với deadline tương đối so với lần mở đầu tiên. Thêm/sửa/xóa được lưu trong localStorage, tải lại trang không mất dữ liệu. Demo không phát email hoặc tạo lịch AWS.

VS Code cũng chạy được bằng bảng **NPM Scripts**: bấm nút chạy cạnh `dev` hoặc `build`.

## Chức năng

- Tạo, xem, sửa, xóa có xác nhận; hoàn thành và mở lại.
- Tìm tên/mô tả; kết hợp trạng thái, ưu tiên, deadline; sắp xếp mới nhất, deadline hoặc ưu tiên.
- Tổng task, chưa hoàn thành, quá hạn, hoàn thành; tiến độ và ba deadline gần nhất.
- “Sắp đến hạn” tính trong 24 giờ tới, chỉ với task chưa hoàn thành. “Quá hạn” là giá trị tính từ deadline, không phải status trong DB.
- Form kiểm tra độ dài, deadline và reminder; thông báo lỗi, trạng thái đang gửi, chống bấm gửi liên tiếp.
- Giờ theo timezone trình duyệt, gửi ISO UTC. Giữ nguyên giây deadline cũ nếu người dùng không sửa giờ.
- Modal dùng `dialog` để giữ focus, Escape để đóng; hỗ trợ bàn phím và màn hình nhỏ.

## Nối AWS thật

VS Code Explorer → sao chép `.env.example` thành `.env.local`. Điền giá trị từ hướng dẫn triển khai:

```dotenv
VITE_USE_MOCK=false
VITE_API_BASE_URL=https://YOUR_API_ID.execute-api.ap-southeast-1.amazonaws.com/prod
VITE_COGNITO_DOMAIN=https://YOUR_PREFIX.auth.ap-southeast-1.amazoncognito.com
VITE_COGNITO_CLIENT_ID=YOUR_PUBLIC_APP_CLIENT_ID
VITE_COGNITO_USER_POOL_ID=ap-southeast-1_YOUR_POOL_ID
VITE_REDIRECT_URI=http://localhost:5173/
VITE_LOGOUT_URI=http://localhost:5173/
```

Thay region bằng region triển khai thực tế. Bật Authorization Code grant và scopes `openid email profile`; app client **không có client secret**. Đăng ký chính xác callback/logout URL ở Cognito. Mã dùng PKCE S256, state, nonce và xác minh chữ ký ID token qua JWKS. Token chỉ lưu trong sessionStorage của tab; hết phiên cần đăng nhập lại, chưa tự refresh. API nhận **ID token** đúng SRS; backend vẫn phải xác thực và kiểm tra ownership.

Base URL phải bao gồm stage `/prod`. Với URL trực tiếp ở trên, cấu hình CORS cho phép origin local khi thử trên máy; khi deploy đổi về origin CloudFront. Chưa cấu hình Vite proxy, vì vậy không đặt `/api` làm base URL. OPTIONS và response lỗi cũng cần CORS theo hướng dẫn triển khai.

Danh sách tải đủ các trang `nextCursor` trước khi lọc/tính tổng. PUT gửi toàn bộ trường có thể sửa kèm `expectedVersion`. Thành công cập nhật state từ response để tránh độ trễ GSI. HTTP 409 yêu cầu tải lại rồi sửa lại; 401 về đăng nhập; 400/422 hiển thị lỗi. DELETE 204 không cần JSON body.

**Restart dev server sau khi đổi ENV.** ENV Vite là thông tin công khai trong bundle; không điền access key hoặc client secret.

## Build và kiểm tra

```bash
npm run lint
npm test
npm run build
```

Upload **nội dung bên trong `dist/`** lên S3 bằng Console. Không upload `node_modules` hoặc source. Với CloudFront, đổi callback/logout ENV sang URL HTTPS CloudFront, cập nhật Cognito, rồi build lại. Ứng dụng dùng URL gốc, không cần router hoặc rewrite route con; Default root object là `index.html`.

Tests kiểm tra validation deadline/reminder, sửa sau giờ nhắc, khoảng 24 giờ, timezone và giữ nguyên giây. Test HTTP dùng fetch giả lập để kiểm tra tải chi tiết, lỗi 404, POST không tự retry khi kết quả chưa rõ, response lỗi định dạng, expectedVersion và DELETE 204. Chúng không thay thế kiểm tra tích hợp AWS.

Kiểm tra thủ công ở 1366px và 375px: CRUD, tìm kiếm kết hợp bộ lọc, hoàn thành/mở lại, refresh giữ dữ liệu, Escape đóng modal, Tab qua các nút. Khi nối AWS, thử login/logout, hết phiên, CORS, pagination và sửa cùng task ở hai tab để kiểm tra 409.

## Đọc code theo thứ tự

| File | Trách nhiệm |
|---|---|
| `src/App.jsx` | State màn hình, lọc, điều phối CRUD và bố cục |
| `src/components/TaskRow.jsx` | Một dòng task và thao tác |
| `src/components/Summary.jsx` | Các số liệu tổng quan |
| `src/components/FilterBar.jsx` | Các input tìm kiếm và bộ lọc |
| `src/components/JourneyPanels.jsx` | Tiến độ và deadline gần nhất |
| `src/components/TaskForm.jsx` | Form tạo/sửa, hiển thị lỗi |
| `src/components/Modal.jsx` | Hộp thoại và focus |
| `src/components/Icon.jsx` | Icon SVG, không cần thư viện |
| `src/taskUtils.js` | Enum, validation, thời gian |
| `src/services/api.js` | Mock local hoặc HTTP theo cùng contract |
| `src/data/demoTasks.js` | Dữ liệu mẫu |
| `src/auth/cognito.js` | Login/callback/logout |
| `src/index.css`, `src/App.css` | Token QuestUI, style và responsive |

## Giới hạn và điểm cần hiểu khi phỏng vấn

- Đây là frontend. SNS, Scheduler, bảo mật API và ownership cần backend AWS đúng đặc tả; chưa có bằng chứng tích hợp AWS thật.
- Mock localStorage dành cho một người dùng, không đồng bộ realtime giữa các tab. Tải lại để lấy bản mới. Mock phát hiện version cũ khi sửa, nhưng không thay thế conditional write DynamoDB.
- Lọc toàn bộ task đã tải phù hợp demo; dữ liệu lớn cần server filtering và pagination UI.
- sessionStorage còn rủi ro nếu có XSS. React render task dưới dạng text, không chèn HTML. Production nên đánh giá CSP và session/BFF; V1 chưa tự refresh token.
- Google Fonts cần mạng; offline dùng font serif dự phòng. Có thể self-host font sau.
- Chưa tự retry thao tác ghi để tránh tạo task trùng. Người dùng chủ động tải lại hoặc thử lại sau lỗi.

Reset demo: browser DevTools → Application → Local Storage → xóa riêng key `task-manager-demo-v1`, reload. Chỉ dữ liệu demo của trình duyệt này bị xóa.

Tham khảo: [Cognito PKCE](https://docs.aws.amazon.com/cognito/latest/developerguide/using-pkce-in-authorization-code.html), [xác minh JWT](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html). Đặc tả và hướng dẫn ở thư mục cha của repo là nguồn yêu cầu chính.
