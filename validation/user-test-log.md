# Validation — R6

## Nhật ký dùng thử

**Sản phẩm:** Pathwise — diagnostic → knowledge gap → learning path  
**Thời gian:** `18/09/2026` · **Người phụ trách:** `Tống Trần Tiến Dũng`

**Task giao:** Nhập mục tiêu học, hoàn thành diagnostic, xem learning path và nói lại section nên học trước cùng lý do.

| Người dùng | Đã khai báo CP1? | Điểm bị kẹt/quan sát | Quote nguyên văn | Quyết định |
|---|---|---|---|---|
| Đặng Quang Hưng | Có | Thấy roadmap rõ nhưng quiz còn dễ; đề xuất thêm câu áp dụng, câu code/tính toán, mentor và gamification. | `“Phần quiz thì e nghĩ cần thêm nhiều câu hỏi hơn, cả phần diagnostics, cần có thêm câu hỏi về cả code lẫn câu hỏi áp dụng, tính toán nữa.”` | Cân nhắc dùng thử sau khi cập nhật. |
| Nguyễn Viết Đức | Có | Đánh giá flow đầy đủ: chọn mục tiêu, nhận roadmap, học, test và remediation khi chưa đạt. | `“Về ý tưởng và tính năng trọn vẹn rồi.”` | Sẽ dùng thử khi hoàn thiện sản phẩm. |
| U03 | Chưa xác minh | Câu hỏi test chưa sát thực tế và một số bài học còn cơ bản. | `“Tuy nhiên đôi lúc câu hỏi test còn chưa sát với thực tế và một số bài học còn khá cơ bản.”` | Sẵn sàng dùng nếu lộ trình được cập nhật phù hợp. |
| U04 | Chưa xác minh | Hệ thống từng tạo lộ trình trước diagnostic và có lỗi về logic thời gian. | `“Có lỗi mặc dù chưa làm test nhưng vẫn gen lộ trình.”` | Đã sửa route diagnostic và logic thời gian theo phản hồi. |
| U05 | Chưa xác minh | Nội dung học ban đầu khó nhìn và chưa có slide rõ ràng. | `“Nên tạo slide tinh gọn cho người đọc kèm nguồn tài liệu nếu muốn đọc sâu.”` | Đã bổ sung learning deck dạng slide có nguồn. |
## Tổng kết

- Vấn đề lặp lại nhiều nhất: `Dữ liệu sinh bài test còn dễ, nội dung học cần được trình bày theo slide và có nguồn.`
- Đã sửa trước demo: `Logic diagnostic, logic thời gian, learning deck có nguồn và flow học → mastery test.`
- Giữ nguyên và lý do: `Roadmap theo mục tiêu; roadmap.sh chỉ là nguồn tham khảo chung, còn Pathwise cá nhân hóa theo diagnostic.`
- Để dành sau hackathon: `Tăng độ khó câu hỏi, bổ sung mentor/gamification và mở rộng dữ liệu thực hành.`

## Thay đổi sau validation

1. `Khi người dùng chọn mục đã biết sơ kiến thức, hệ thống đi thẳng đến diagnostic thay vì vào dashboard gây lỗi tạo slide; đồng thời sửa logic thời gian.` — bằng chứng: `U04` — trạng thái: `đã sửa`.
2. `Nội dung học được chuyển thành learning deck có slide, ví dụ, checklist và nguồn tham chiếu.` — bằng chứng: `U05` — trạng thái: `đã sửa`.
