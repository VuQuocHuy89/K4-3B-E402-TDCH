# Prototype — Pathwise AI Engineer Learning Path

Prototype CP3 cho lát cắt: người học muốn trở thành AI Engineer, tự chọn hướng học và thời lượng trước khi dùng diagnostic để nhận thứ tự học cá nhân hóa.

## Luồng demo

1. Chọn hoặc nhập một hướng học, trình độ hiện tại và thời lượng học mỗi ngày (10–240 phút); `/api/learning/blueprint` tạo số section và nội dung lộ trình theo độ rộng của topic.
2. Hoàn thành diagnostic có số câu được tính theo các section rồi gửi kết quả tới `/api/learning/analyze`; agent đọc ngữ cảnh tài liệu và đề xuất competency/section ưu tiên.
3. Mở section theo prerequisite, học, làm mastery test và chỉ mở bước tiếp theo khi đạt 80%.
4. Nếu chưa đạt, gọi `/api/remediation` để tạo vòng ôn ngắn; AI tutor dùng `/api/tutor` để giải thích có source ID.

## Phần chạy thật

- `server/index.js` đọc PDF local bằng `pdftotext`, chọn các đoạn liên quan làm document context và ghi input, prompt, phản hồi mô hình, output cùng metadata vào `AI_TRACE_FILE`.
- `/api/learning/analyze` là quyết định AI trung tâm: xếp ưu tiên competency và learning path từ diagnostic.
- `/api/sources/discover` tìm nguồn học bổ sung theo section bằng web grounding của provider; backend chỉ trả về URL HTTPS thuộc allowlist tài liệu chính thống và có curated catalog dự phòng.
- `/api/learning/package` chuyển các nguồn đã lọc thành learning deck 7–9 slide gồm mục tiêu, giải thích, ví dụ, lỗi thường gặp, checklist, self-check và nguồn riêng cho từng slide; nếu tạo live thất bại, deck catalog an toàn vẫn được giữ lại.
- OpenRouter và Gemini được chạy theo kiểu hedged request: provider ưu tiên chạy trước, provider dự phòng bắt đầu sau 12 giây hoặc ngay khi provider chính báo lỗi; kết quả hợp lệ đầu tiên được dùng. Blueprint và learning deck sinh thành công được cache trong PostgreSQL để lần mở sau không tốn thêm lượt AI.
- Nội dung source được map theo các chapter `GML-CH01` đến `GML-CH13` của `Grokking Machine Learning`.

## Phần do ứng dụng kiểm soát

- Điểm câu hỏi, ngưỡng pass 80% và unlock section do client kiểm soát, không giao cho model.
- Số lượng và nội dung câu diagnostic/mastery/final được tạo ở runtime theo số section, competency và nguồn đã xác minh; backend kiểm tra đủ độ bao phủ trước khi chấp nhận output của model.
- Khi người học mở section, hệ thống tìm nguồn trước rồi mới tạo learning deck. Deck và nguồn được lưu trong session của tài khoản để có thể reload; source URL chỉ được nhận nếu HTTPS và thuộc allowlist. Người học có thể chuyển slide bằng nút điều khiển hoặc phím `←` / `→`.
- Không commit PDF, API key, `.env` hoặc dữ liệu người học vào repo.

## Chạy local

```bash
cp server/.env.example server/.env
# điền GEMINI_API_KEY và/hoặc OPENROUTER_API_KEY trong server/.env
AI_TRACE_FILE=eval/cp3-ai-trace.jsonl node --env-file=server/.env server/index.js
```

Mở `http://localhost:4173`. Cần cài `pdftotext` để server nạp được PDF.

## Đo CP3

Sau khi server chạy, dùng 20 câu trong `eval/cp3-cases.json`:

```bash
PATHWISE_URL=http://127.0.0.1:4173 node scripts/run-cp3-measure.js --save eval/cp3-results-final.json
PATHWISE_URL=http://127.0.0.1:4173 node scripts/run-cp3-central-measure.js --save eval/cp3-central-result-live-check.json
```

Kết quả tách riêng số case đạt ở cấp hệ thống, số lượt AI live và số lượt deterministic fallback; không gộp fallback thành độ chính xác của model. Chỉ nộp số liệu sau khi chạy với API key đã cấu hình và giữ nguyên quality bar đã chốt trong `spec.md`.

## Production data path

Khi chạy với `PATHWISE_API_BASE`, sau đăng nhập frontend gọi `/api/content/catalog` để lấy learning catalog đã publish từ PostgreSQL. `content-pack.js` chỉ còn là seed/fallback khi backend hoặc database chưa sẵn sàng. Tiến độ cá nhân vẫn được lưu qua `/api/session` theo user và được cache cục bộ để giao diện phản hồi nhanh.

Trên Render cần cấu hình `DOCUMENT_PDF_URL` bằng một URL HTTPS ổn định tới file PDF được phép sử dụng. Server sẽ kiểm tra chữ ký PDF, tải vào `/tmp`, chạy `pdftotext` và báo `document.loaded` trong `/api/health`. Không dùng đường dẫn local trong repo cho production.

Để tránh model miễn phí ngẫu nhiên tiêu hết token vào reasoning, cấu hình `OPENROUTER_MODEL=nex-agi/nex-n2.5-mini:free` và `OPENROUTER_REASONING_EFFORT=none`. Free tier vẫn có quota theo tài khoản; khi quota cạn hệ thống chuyển nhanh sang provider còn lại hoặc catalog an toàn thay vì chờ treo giao diện.

Khi cập nhật nội dung seed, tăng `CONTENT_CATALOG_VERSION` để server upsert catalog mới vào database. Không coi việc LLM trả fallback là dữ liệu production: UI và trace phải phân biệt rõ live provider, database catalog và deterministic fallback.
