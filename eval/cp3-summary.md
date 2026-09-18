# Kết quả đo CP3

- Video thao tác CP3: `demo/cp3-demo.mp4`
- Golden set: 20 case trong `eval/cp3-cases.json`
- Cơ cấu: 10 case thường, 2 case nguồn sự thật, 2 case thiếu thông tin, 2 case ngoài phạm vi, 2 case đặc thù domain và 2 case hiếm
- Nguồn case: 10 case được phát triển từ chatlog VLearn anonymized, lưu mã `conversation_id:turn_id`; 10 case còn lại do nhóm xây dựng
- Tiêu chí đạt: case trong phạm vi trả về source ID đúng; case thiếu thông tin hoặc ngoài phạm vi trả `no_evidence` và không gắn nguồn

## Chạy golden set

| Thành phần | Số case đạt | Tổng số case |
|---|---:|---:|
| Toàn hệ thống | 20 | 20 |
| AI live | 2 | 2 |
| Deterministic fallback | 18 | 18 |

Trong lượt chạy hiện tại, 2 case đầu tiên được xử lý live bằng OpenRouter `openai/gpt-4o`; 18 case còn lại chuyển sang deterministic fallback do giới hạn credit/quota của provider. Kết quả `20/20` là kết quả của toàn hệ thống, không phải độ chính xác riêng của AI live.

Kết quả chi tiết: `eval/cp3-results-final.json`.

## Lời gọi AI tại quyết định trung tâm

`POST /api/learning/analyze` chạy thành công bằng OpenRouter `openai/gpt-4o` với `live: true`, tạo competency gaps và recommended path có source ID.

Kết quả: `eval/cp3-central-result-live-check.json`.

Trace input, prompt, output và metadata provider: `eval/cp3-ai-trace.jsonl`.
