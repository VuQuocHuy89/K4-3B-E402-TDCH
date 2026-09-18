# Chạy Pathwise local với Groq

## 1. Cài cấu hình

Yêu cầu Node.js 20 trở lên. Từ thư mục gốc của project, tạo file cấu hình local:

```powershell
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
```

Mở `server/.env` và điền key Groq:

```env
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-120b
GROQ_SOURCE_MODEL=groq/compound-mini
```

`GROQ_MODEL` dùng cho sinh bài test, phân tích kết quả và sinh nội dung từng section. `GROQ_SOURCE_MODEL` tìm nguồn web của từng chặng. Model GPT-OSS dùng [Structured Outputs của Groq](https://console.groq.com/docs/structured-outputs) để giữ đúng JSON cho UI; server kiểm tra thêm ID, độ bao phủ và nguồn trích dẫn. `groq/compound-mini` dùng [web search tích hợp](https://console.groq.com/docs/compound).

Server ưu tiên biến môi trường của tiến trình, sau đó `server/.env`, rồi `.env` ở thư mục gốc; local không đọc `render.yaml`. Sửa cấu hình xong cần khởi động lại `npm start`. Key chỉ ở backend, không điền trong HTML hoặc JavaScript giao diện.

Khi provider lỗi, server thử provider dự phòng đã có key. Nếu tất cả đều lỗi, UI giữ bài làm và hiện nút thử lại; **không thay bằng test hoặc slide mock**. Giới hạn token/phút của Groq có thể khiến một bước mất thêm khoảng một phút; server thử lại tối đa hai lần trong ngân sách chờ 65 giây. Giới hạn ngày hoặc model không khả dụng cần xử lý trong tài khoản/cấu hình Groq.

## 2. Chạy ứng dụng

```powershell
npm start
```

Mở [http://localhost:4173](http://localhost:4173). Server vừa phục vụ giao diện vừa cung cấp API, nên không cần Live Server riêng.

Tài khoản local được lưu trong `server/.local-auth.json` (đã được `.gitignore` bỏ qua). Tiến độ học được lưu theo từng tài khoản trên trình duyệt; nếu có `DATABASE_URL`, server sẽ dùng PostgreSQL thay cho lưu trữ local.

## 3. Kiểm tra nhanh

Mở [http://localhost:4173/api/health](http://localhost:4173/api/health). Khi đã điền key, `providers.order` phải bắt đầu bằng `groq` và `providers.groq` là `true`.

Nếu vẫn muốn mở HTML bằng Live Server, dùng URL có `?api=local`, ví dụ `http://127.0.0.1:5500/codebase/?api=local`, đồng thời vẫn chạy `npm start` ở cổng 4173.

## 4. Luồng học theo nội dung

- **Biết sơ qua:** chủ đề → LLM xác định kỹ năng/mục tiêu → một câu diagnostic cho mỗi mục tiêu → chấm đáp án đã chọn → LLM viết lộ trình dựa trên câu đúng/sai và độ tự tin.
- **Chưa biết gì:** bỏ diagnostic, LLM tạo lộ trình nền tảng đúng chủ đề, không gán điểm yếu giả.
- Dưới 60% ở một kỹ năng: học sâu, thêm ví dụ và thực hành. Từ 80% và không có câu trả lời thiếu tự tin: ôn nhanh. Các trường hợp còn lại học mức tiêu chuẩn. Thứ tự vẫn tôn trọng kiến thức tiên quyết.
- Mở chặng: tìm nguồn → backend tải và trích văn bản thực → sinh slide/ví dụ/bài tập riêng. Citation chỉ được lấy từ các URL đã đọc; nguồn không đọc được sẽ không dùng làm bằng chứng. Hiện hỗ trợ trang HTML/text của các miền chính thống trong `server/source-catalog.js`; nếu chủ đề chưa có nguồn phù hợp, UI báo để thử lại, không bịa nội dung.
- Test chặng chỉ dựa vào mục tiêu và slide của chặng đó: mỗi mục tiêu 3 câu khi học sâu, 2 câu tiêu chuẩn, 1 câu ôn nhanh (ít nhất 2 câu/chặng). Test tổng hợp bao phủ mục tiêu của tất cả chặng đã học. Retest yêu cầu câu mới.
- Đổi chủ đề/tạo lộ trình mới sẽ tạo ID và cache mới. Bài/slide mock của phiên bản cũ được bỏ; tài khoản vẫn giữ nguyên, người học thiết lập lại mục tiêu để tạo nội dung mới.

## 5. Kiểm thử

```powershell
npm test
```

Test không gọi API thật. Kiểm tra Groq thật (có sử dụng quota) với backend đang chạy:

```powershell
node scripts/check-adaptive-live.js http://localhost:4173
```

Script tạo tài khoản kiểm thử riêng, kiểm tra diagnostic → lộ trình yếu/mạnh → hai bài học và test chặng, rồi đăng xuất. Kết quả không chứa key/token được lưu ở thư mục tạm của hệ điều hành. Có thể thêm `--resume` để tiếp tục các bước chưa xong từ kết quả đó.
