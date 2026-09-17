# AI SPEC — AI Engineer Adaptive Learning Path · Nhóm TDCH · Zone E402

> Cấu trúc phủ đúng "SPEC 8 phần" của chương trình: Bằng chứng (§1-§2) · Lát cắt (§4) · Canvas (đính kèm CP1) · Augment/Automate (§4) · 4 đường đi của trải nghiệm (§6) · Kiểu lỗi (§5) · Kiểm thử (§7) · Phân công (§8). Hướng dẫn viết từng mục: `02-guide.md`.

Hướng: [ ] A — VLearn Tutor  [ ] B — Trợ lý Discord  [ ] C — Lesson Studio  [x] D — Học tập thích ứng & tương tác  [ ] E — Làn mở
Loại: [ ] Tối ưu tính năng có sẵn  [x] Tính năng mới

## §1. User & Job
- Job executor + workflow: Người muốn học để trở thành AI Engineer, đã biết một phần Python, SQL, Machine Learning, LLM/RAG nhưng chưa biết mình đang ở mức nào, còn thiếu gì và nên học tiếp từ đâu. Hiện họ học từ nhiều nguồn/tutorial khác nhau rồi chọn nội dung tiếp theo theo cảm tính hoặc học lại phần đã biết.
- Core JTBD: Khi muốn học AI Engineering nhưng chưa biết mình đang ở đâu, người học muốn xác định competency đã vững và còn thiếu để chọn bài học tiếp theo theo đúng prerequisite.
- Problem statement: Người học AI Engineering thiếu cách đáng tin cậy để biết mình đã biết gì, còn thiếu gì và nên học theo thứ tự nào; vì vậy dễ mất thời gian, bỏ sót kiến thức nền hoặc học rời rạc.
- Evidence ban đầu (khảo sát/phỏng vấn sơ bộ, n = 18): `14/18` không biết chính xác nên bắt đầu từ đâu; `5/18` từng học nhiều nguồn nhưng không biết còn thiếu kiến thức nào; `12/18` muốn được kiểm tra trình độ trước khi nhận lộ trình học.
- Ghi chú evidence: n = 18 chưa đạt ngưỡng khảo sát ≥20; cần bổ sung tối thiểu 2 người và lưu toàn bộ câu hỏi/câu trả lời nguyên văn trong `evidence/survey-log.md` trước CP4.
- Quote/ví dụ nguyên văn: TODO — bổ sung tối thiểu 5 quote có nguồn.

## §2. Impact & quyết định chọn
- Bảng impact sơ bộ:
  | Ứng viên | Evidence | Tần suất/chi phí | Khả thi | Quyết định |
  |---|---|---|---|---|
  | Diagnostic → knowledge gap → bài học tiếp theo | 14/18 không biết bắt đầu; 12/18 muốn diagnostic | TODO — bổ sung thời gian/tần suất mất mỗi lần | Một flow MVP, khả thi | Chọn |
  | Competency map + prerequisite graph | 5/18 học nhiều nguồn nhưng không biết còn thiếu gì | TODO — bổ sung số lần gặp/tác hại | Làm cho một lát competency nhỏ | Thành phần hỗ trợ |
  | Adaptive retest 80/20 sau khi fail | Cần xác nhận bằng test thật | TODO | Giữ như rule, không tách feature | Giới hạn phạm vi |
- Ứng viên đã loại/giới hạn: Không build toàn bộ curriculum AI Engineer, không làm hệ thống chứng nhận hoàn chỉnh và không tracking dài hạn.
- Ứng viên chọn: Diagnostic → knowledge gap → next lesson, vì có evidence mạnh nhất (`14/18`, `12/18`) và gom được vào một quyết định AI trung tâm.

## §3. Giải pháp tương tự đã nghiên cứu
- [Sản phẩm 1]: flow / đáng học / đáng né / mình khác gì
- [Sản phẩm 2]: ...

## §4. Thiết kế
- Lát cắt MỘT CÂU (1 user · 1 việc · 1 quyết định AI · 1 kết quả): Một học viên nhập mục tiêu, nền tảng và thời gian học rồi hoàn thành diagnostic; AI phân tích knowledge gap và chọn thứ tự topic/section; kết quả là learning path cá nhân có lý do và điều kiện chuyển bước.
- Non-goals (≥3 thứ KHÔNG build):
  1. Không xây lại toàn bộ giao diện VLearn.
  2. Không triển khai toàn bộ curriculum AI Engineer.
  3. Không xây hệ thống chứng chỉ hoặc thay thế giảng viên/TA.
- Mức prototype nhắm tới: [ ] Sketch [x] Mock [ ] Working — CP2 sử dụng sơ đồ flow trong `codebase/`; AI/API, scoring và dữ liệu chạy thật chưa triển khai.
- Automation: [ ] augment [x] conditional [ ] automate — AI đề xuất competency profile, knowledge gap và learning path; rule kiểm tra dữ liệu đầu vào, ngưỡng đánh giá và các luồng fallback.
- §4b. Nguyên tắc đã áp dụng (≥4 — HAX/PAIR, xem guide):
  | Nguyên tắc | Áp cụ thể vào đâu trong prototype |
  |---|---|
  | G10 — Thu hẹp phạm vi khi nghi ngờ | Khi dữ liệu thiếu hoặc confidence thấp, yêu cầu bổ sung hoặc làm lại diagnostic; không tự chốt roadmap. |
  | G8 — Gạt bỏ dễ dàng | Cho phép người học bỏ qua hoặc không chấp nhận learning path được đề xuất. |
  | G9 — Sửa dễ dàng | Cho phép sửa mục tiêu, thời gian, deadline hoặc câu trả lời để tạo lại learning path. |
  | G11 — Giải thích vì sao | Mỗi topic/section được đề xuất kèm knowledge gap, prerequisite hoặc kết quả diagnostic làm căn cứ. |

## §5. Kiểu lỗi — 4 lớp chỗ khó + kịch bản (≥8) [bảng theo guide §2.5]

## §6. Bốn đường đi của trải nghiệm
- Happy path: Nhập đủ thông tin → hoàn thành diagnostic → tạo competency profile → tạo learning path → học section → mastery test đạt từ 80% → chuyển section/topic tiếp theo.
- Low-confidence (②): Dữ liệu chưa đủ hoặc AI confidence thấp → yêu cầu thêm câu trả lời/thông tin → chạy lại diagnostic → chưa đưa ra kết luận chắc chắn.
- Failure/không căn cứ (①): AI API lỗi/timeout → retry hoặc fallback; không tìm thấy tài liệu → thông báo chưa đủ căn cứ, không tự tạo nội dung.
- Correction (user sửa): Người học sửa mục tiêu, thời gian, deadline hoặc câu trả lời → tạo lại competency profile và learning path.
- Khi bị đòi ngoài phạm vi (③): Câu hỏi không thuộc topic/content pack → thông báo phạm vi hỗ trợ và đưa người học về nội dung đang học.
- Case đặc thù domain (④): Nếu còn thiếu prerequisite Python/SQL/ML/LLM → ưu tiên kiến thức nền trước topic mới; nếu deadline không khả thi → đề xuất điều chỉnh thời gian hoặc phạm vi.

## §7. Kiểm thử
- Chiều chất lượng + định nghĩa kiểm chứng được:
- Golden set (≥20 case theo cơ cấu trong guide §2.6, file trong eval/):
- Quality bar (chốt từ hạn chốt spec của khoá, giữ nguyên sau đó): "Đạt khi ≥ ___% qua bộ, và ___"
- Kết quả các lượt chạy (bảng % — cập nhật đến trước CP6):

## §8. Phân công & kế hoạch
- Phân công có tên: spec / evidence / prompt / code / demo
- Willing users (≥2 tên) + kế hoạch vòng validation *(bonus, nếu làm)*:
- Multi-prototype (nếu làm): trục khác biệt của ≥2 phương án + lý do chọn:

## §9. Changelog
| Thời điểm | Đổi gì | Vì sao (trỏ về feedback/case nào) |
