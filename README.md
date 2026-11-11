# aws-serverless-task-manager

Ứng dụng quản lý task/deadline cá nhân: React + Vite, Python Lambda, Cognito, API Gateway, DynamoDB, SNS và EventBridge Scheduler. Giao diện dùng phong cách QuestUI với màu kem sáng và chữ serif.

- [Frontend: chạy demo local và nối AWS](frontend/README.md)
- [Backend: đọc code, ENV, IAM, upload ZIP bằng Console và kiểm thử](backend/README.md)
- [Kết quả kiểm tra backend](docs/verification/backend-results.md)
- [Rà soát trước khi push GitHub](docs/verification/pre-push-review.md)
- [API contract](docs/api-contract.md)
- [Ước tính chi phí AWS và ngân sách demo](docs/UOC_TINH_CHI_PHI.md)

Backend có bốn function: Task API, UserSetup, Stream Processor và Reminder. Các JSON IAM mẫu nằm tại `docs/policies/`; thay placeholder trước khi sử dụng. Bốn ZIP được tạo tại `build/` và không commit Git; mở `backend/build_packages.py` trong VS Code rồi bấm Run Python File để tạo lại.

Source đã có không đồng nghĩa hệ thống đã deploy. Chưa nghiệm thu Cognito, API Gateway, DynamoDB, SNS, Scheduler, networking và monitoring trên AWS thật; cần thực hiện các bước GUI trong hướng dẫn triển khai.
