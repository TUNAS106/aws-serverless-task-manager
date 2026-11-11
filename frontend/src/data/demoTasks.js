export function createDemoTasks() {
  const now = Date.now()
  const examples = [
    [
      'Hoàn thiện giao diện Task Manager',
      'Chỉnh responsive, kiểm tra bộ lọc và hoàn thiện form tạo công việc.',
      'high',
      'in_progress',
      6,
      '1h',
    ],
    [
      'Vẽ sơ đồ kiến trúc AWS',
      'Thể hiện ba luồng: CRUD, sự kiện thay đổi task và nhắc deadline.',
      'high',
      'pending',
      20,
      '1h',
    ],
    [
      'Đọc tài liệu DynamoDB Streams',
      'Ghi chú cách xử lý retry và sự kiện bị gửi lặp.',
      'medium',
      'in_progress',
      -3,
      'none',
    ],
    [
      'Cấu hình Cognito User Pool',
      'Tạo public app client và thiết lập callback URL cho môi trường local.',
      'medium',
      'pending',
      48,
      '24h',
    ],
    [
      'Viết README cho repository',
      'Mô tả cách chạy local và các quyết định kỹ thuật.',
      'low',
      'pending',
      72,
      '24h',
    ],
    [
      'Khởi tạo dự án React + Vite',
      'Chuẩn bị cấu trúc thư mục frontend và các biến môi trường.',
      'medium',
      'completed',
      -24,
      'none',
    ],
    [
      'Xác định API contract',
      'Thống nhất schema, HTTP status và optimistic concurrency.',
      'high',
      'completed',
      -48,
      'none',
    ],
  ]
  return examples.map(
    ([title, description, priority, status, hours, reminderOption], index) => ({
      taskId: `demo-${index + 1}`,
      title,
      description,
      priority,
      status,
      reminderOption,
      dueAt: new Date(now + hours * 3600000).toISOString(),
      createdAt: new Date(now - index * 3600000).toISOString(),
      updatedAt: new Date(now).toISOString(),
      version: 1,
      reminderRevision: 1,
    }),
  )
}
