# Reflection cá nhân — Vũ Quốc Huy

## Vai trò

Đội trưởng, roadmap/RAG/citation, tích hợp repo và nộp checkpoint.

## Tôi đã đóng góp gì

- Tích hợp flow chọn mục tiêu → diagnostic → knowledge gap → learning path → học section → mastery test.
- Xây phần source-grounded learning, source ID, PDF context, source discovery và learning slide deck.
- Triển khai backend lên Render, kết nối PostgreSQL/Supabase PDF và xử lý provider timeout, quota, cache và fallback.
- Quản lý repository, checkpoint, demo slide PDF và các tài liệu nộp bài.

## Điều đã học được

LLM không tự động biến sản phẩm thành production. Cần kiểm soát schema, nguồn, timeout, quota, cache, fallback và hiển thị rõ cho người dùng biết kết quả là AI live hay dữ liệu dự phòng.

## Điều chưa tốt

Các phiên bản đầu phụ thuộc mock content nhiều hơn mong muốn, provider free có quota không ổn định và tài liệu nộp bài chưa được đồng bộ sớm. Phần slide PDF và video backup cũng cần được kiểm tra theo checklist checkpoint thay vì chỉ tập trung vào code.

## Bước tiếp theo

Hoàn thiện deploy với provider có quota ổn định, kiểm tra production bằng metadata `live/provider/fallback_reason`, tăng chất lượng câu hỏi/slide theo độ rộng section và duy trì trace để giải thích mọi kết quả AI.
