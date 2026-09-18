# AI SPEC — AI Engineer Adaptive Learning Path · Nhóm TDCH · Zone E402

> Cấu trúc phủ đúng "SPEC 8 phần" của chương trình: Bằng chứng (§1-§2) · Lát cắt (§4) · Canvas (đính kèm CP1) · Augment/Automate (§4) · 4 đường đi của trải nghiệm (§6) · Kiểu lỗi (§5) · Kiểm thử (§7) · Phân công (§8). Hướng dẫn viết từng mục: `02-guide.md`.

Hướng: [ ] A — VLearn Tutor  [ ] B — Trợ lý Discord  [ ] C — Lesson Studio  [x] D — Học tập thích ứng & tương tác  [ ] E — Làn mở
Loại: [ ] Tối ưu tính năng có sẵn  [x] Tính năng mới

## §1. User & Job
- Job executor + workflow: Người muốn học để trở thành AI Engineer, đã biết một phần Python, SQL, Machine Learning, LLM/RAG nhưng chưa biết mình đang ở mức nào, còn thiếu gì và nên học tiếp từ đâu. Hiện họ học từ nhiều nguồn/tutorial khác nhau rồi chọn nội dung tiếp theo theo cảm tính hoặc học lại phần đã biết.
- Core JTBD: Khi muốn học AI Engineering nhưng chưa biết mình đang ở đâu, người học muốn xác định competency đã vững và còn thiếu để chọn bài học tiếp theo theo đúng prerequisite.
- Problem statement: Người học AI Engineering thiếu cách đáng tin cậy để biết mình đã biết gì, còn thiếu gì và nên học theo thứ tự nào; vì vậy dễ mất thời gian, bỏ sót kiến thức nền hoặc học rời rạc.
- Evidence khảo sát (n = 23, nguồn: `evidence/survey-log.md`): `16/23` gặp khó khăn vì không biết nên bắt đầu từ đâu hoặc phần nào còn hổng; `5/23` không tìm được lộ trình phù hợp; `2/23` gặp khó vì tài liệu khó kiếm. `22/23` sẵn sàng thử một công cụ AI trong 5–10 phút nếu công cụ chỉ ra phần hiểu sai/thiếu.
- Phạm vi evidence: file khảo sát không có trường nhận diện thành viên nhóm; nhóm cần xác nhận trước khi nộp rằng 23 phản hồi là từ người ngoài nhóm. Spec không dùng dữ liệu này để khẳng định đại diện rộng hơn.
- Nguyên nhân được chọn nhiều nhất: kiến thức quá rộng, không biết nên học phần nào kỹ (`22/23`); không chắc đã nắm đủ sau khi hoàn thành lộ trình (`16/23`); không tự chủ trong việc phân chia thời gian (`9/23`); ứng dụng chưa triển khai lộ trình hiệu quả (`7/23`).
- Thay đổi người học mong muốn: kiểm tra trước khi học nội dung mới (`14/23`); tập trung vào phần còn thiếu (`14/23`); roadmap phù hợp hơn (`9/23`); đổi cách thiết kế lộ trình (`5/23`); quy trình và deadline rõ ràng (`5/23`). Các lựa chọn là dạng có thể chọn nhiều đáp án nên tổng lớn hơn 23.
- Quote nguyên văn được mã hóa theo thứ tự dòng trong file khảo sát: R03 “Tài liệu khó kiếm”; R04 “Không tìm được lộ trình phù hợp”; R09 “Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ”; R17 “Ứng dụng chưa triển khai lộ trình hiệu quả”; R01 “Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung”.

## §2. Impact & quyết định chọn
- Bảng impact:
  | Ứng viên | Bao nhiêu người gặp | Tần suất | Mỗi lần tốn gì | Build nổi không | Quyết định và lý do |
  |---|---|---|---|---|---|
  | Diagnostic → knowledge gap → bài học tiếp theo | 16/23 gặp khó khi bắt đầu hoặc xác định phần hổng; 14/23 muốn kiểm tra trước nội dung mới | Tần suất đau cụ thể chưa được hỏi; 23/23 chỉ xác nhận đã học thêm AI trong 2 tuần qua. | Không đo phút/lần; 16/23 mô tả trực tiếp hậu quả về bắt đầu/gap, 14/23 muốn có bước kiểm tra trước. | Một flow MVP, khả thi | Chọn làm lát cắt chính vì có evidence trực tiếp nhất. |
  | Competency map + prerequisite graph | 22/23 nói kiến thức quá rộng; 16/23 không chắc đã nắm đủ sau lộ trình | Tần suất đau cụ thể chưa được hỏi; vấn đề xuất hiện trong quá trình chuyển qua nhiều phần học. | Không đo phút/lần; hậu quả được phản ánh qua 16/23 không chắc mức nắm và 9/23 khó tự chia thời gian. | Làm cho một lát competency nhỏ | Thành phần hỗ trợ vì giải thích thứ tự, nhưng không phải lát cắt độc lập. |
  | Adaptive retest 80/20 sau khi fail | 14/23 muốn có kiểm tra trước; ngưỡng 80% là rule của prototype | Tần suất fail/retest chưa được đo trong khảo sát. | Chi phí mỗi vòng học lại/retest chưa được đo; không dùng làm số liệu impact. | Giữ như rule, không tách feature | Giới hạn phạm vi vì chưa có evidence về nhu cầu retest độc lập. |
- Ứng viên đã loại/giới hạn: Không build toàn bộ curriculum AI Engineer, không làm hệ thống chứng nhận hoàn chỉnh và không tracking dài hạn vì vượt lát cắt 1 user - 1 quyết định AI - 1 kết quả của CP4.
- Ứng viên chọn: Diagnostic → knowledge gap → next lesson, vì có evidence mạnh nhất (`16/23` gặp khó khi bắt đầu, `14/23` muốn kiểm tra trước) và gom được vào một quyết định AI trung tâm.

## §3. Giải pháp tương tự đã nghiên cứu
- **roadmap.sh AI Tutor / AI Engineer roadmap** ([AI Engineer roadmap](https://roadmap.sh/ai-engineer), [AI learning plan](https://roadmap.sh/ai/plan)):
  - Flow: người học chọn roadmap hoặc trả lời một số câu hỏi về mục tiêu để tạo learning plan; có AI Tutor và các roadmap theo vai trò.
  - Đáng học: bắt đầu từ mục tiêu và cung cấp cấu trúc prerequisite/roadmap thay vì chỉ liệt kê khóa học.
  - Đáng né: roadmap rộng, chưa cho thấy trong lát cắt này một cơ chế diagnostic có source ID, mastery threshold và remediation sau mỗi section.
  - Mình khác: Pathwise dùng diagnostic 6 competency cho topic đã chọn, giải thích gap bằng source ID, xếp section theo prerequisite và khóa mastery theo ngưỡng 80%.
- **LinkedIn Learning Skill Evaluations / Learning Paths** ([Skill Evaluations](https://www.linkedin.com/help/learning/answer/a1406059), [LinkedIn Learning](https://www.linkedin.com/learning/)):
  - Flow: người học làm skill evaluation, nhận proficiency level theo topic và đề xuất khóa học/learning path phù hợp.
  - Đáng học: kết quả đánh giá được nối trực tiếp với nội dung học và có các learning path đã biên soạn.
  - Đáng né: đánh giá và nội dung thuộc hệ sinh thái riêng; người học không nhìn thấy trong lát cắt này cách một AI quyết định dựa trên tài liệu được map và xử lý khi thiếu căn cứ.
  - Mình khác: Pathwise tập trung vào một quyết định hẹp là chọn section tiếp theo cho AI Engineer, hiển thị nguồn, confidence, đường fallback và cho phép tạo lại lộ trình khi người học sửa thông tin.

## §4. Thiết kế
- Lát cắt MỘT CÂU (1 user · 1 việc · 1 quyết định AI · 1 kết quả): Một học viên chọn mục tiêu học, nền tảng và thời gian học rồi hoàn thành diagnostic; AI phân tích knowledge gap và chọn thứ tự topic/section; kết quả là learning path cá nhân có lý do và điều kiện chuyển bước. Hệ thống không mặc định topic trước khi học viên xác nhận.
- Non-goals (≥3 thứ KHÔNG build):
  1. Không xây lại toàn bộ giao diện VLearn.
  2. Không triển khai toàn bộ curriculum AI Engineer.
  3. Không xây hệ thống chứng chỉ hoặc thay thế giảng viên/TA.
- Mức prototype nhắm tới: [ ] Sketch [ ] Mock [x] Working — CP3 chạy local end-to-end với tài liệu `Grokking Machine Learning.pdf`, diagnostic, AI analysis, roadmap, tutor và remediation. PDF đọc từ đường dẫn local khi chạy dev hoặc từ `DOCUMENT_PDF_URL` HTTPS khi deploy; file không commit vào repo.
- Automation: [ ] augment [x] conditional [ ] automate — AI đề xuất competency profile, knowledge gap và learning path; rule kiểm tra dữ liệu đầu vào, ngưỡng đánh giá và các luồng fallback.
- §4b. Nguyên tắc đã áp dụng (≥4 — HAX/PAIR, xem guide):
  | Nguyên tắc | Áp cụ thể vào đâu trong prototype |
  |---|---|
  | G10 — Thu hẹp phạm vi khi nghi ngờ | Khi dữ liệu thiếu hoặc confidence thấp, yêu cầu bổ sung hoặc làm lại diagnostic; không tự chốt roadmap. |
  | G8 — Gạt bỏ dễ dàng | Cho phép người học bỏ qua hoặc không chấp nhận learning path được đề xuất. |
  | G9 — Sửa dễ dàng | Cho phép sửa mục tiêu, thời gian, deadline hoặc câu trả lời để tạo lại learning path. |
| G11 — Giải thích vì sao | Mỗi topic/section được đề xuất kèm knowledge gap, prerequisite hoặc kết quả diagnostic làm căn cứ. |

### CP3 — Phạm vi chạy thật
- AI call trung tâm: `POST /api/learning/analyze` nhận kết quả diagnostic và đề xuất competency gap, thứ tự section, lý do và thời lượng.
- Grounding: server dùng `pdftotext` đọc `Grokking Machine Learning.pdf` khi có tài liệu local; nếu section cần học liệu bổ sung, route `/api/sources/discover` dùng web grounding của provider để tìm nguồn chính thống. URL được lọc qua allowlist HTTPS trước khi hiển thị. Tutor và remediation trả về `source_ids` thuộc map `GML-CH01`–`GML-CH13`.
- Provider của lượt demo: OpenRouter `openai/gpt-4o`, giới hạn 800 token; khi provider lỗi, hệ thống chuyển sang provider dự phòng hoặc deterministic fallback. Trace trong `eval/cp3-ai-trace.jsonl` lưu route, input, prompt, phản hồi mô hình, output, provider và lỗi fallback; API key được loại bỏ.
- Rule do ứng dụng giữ: điểm diagnostic/mastery, ngưỡng pass 80% và unlock section không do model tự quyết.
- Learning package: mỗi section hiển thị mục tiêu, learning cards, ví dụ transfer, checklist, mastery test và reference desk. Nguồn mới có thể được tìm theo section; khi provider lỗi, hệ thống dùng curated catalog thay vì để nội dung trống.

## §5. Kiểu lỗi — 4 lớp chỗ khó + kịch bản (≥8) [bảng theo guide §2.5]
| # | Tình huống | Lớp | Hành vi mong muốn | Nguyên tắc tác động |
|---:|---|---|---|---|
| 1 | Người học bỏ trống nhiều câu diagnostic hoặc nhập thời lượng không hợp lệ. | ② Low-confidence | Chặn tạo kết luận, chỉ ra trường thiếu và yêu cầu bổ sung. | G10 — Thu hẹp phạm vi khi nghi ngờ |
| 2 | Người học trả lời sai nhiều câu nhưng tự đánh giá là đã biết. | ② Low-confidence | Tách kết quả tự đánh giá khỏi điểm test, hiển thị gap và cho phép làm lại. | G11 — Giải thích vì sao; G9 — Sửa dễ dàng |
| 3 | API AI timeout, quota hết hoặc trả lỗi mạng. | ① Failure/no-grounding | Retry có giới hạn, chuyển provider/fallback; không nói là AI live nếu không phải live. | G10 — Thu hẹp phạm vi khi nghi ngờ |
| 4 | Tài liệu không có căn cứ cho câu hỏi hoặc PDF chưa được nạp. | ① Failure/no-grounding | Trả `no_evidence`, không gắn source ID giả; đề xuất tìm nguồn chính thống hoặc hỏi hẹp hơn. | G10 — Thu hẹp phạm vi khi nghi ngờ |
| 5 | Người học hỏi thời tiết hoặc tư vấn pháp lý ngoài topic Machine Learning. | ③ Out-of-scope | Nêu rõ phạm vi hỗ trợ và đưa người học trở lại topic đang học. | G10 — Thu hẹp phạm vi khi nghi ngờ |
| 6 | AI trả về section không tồn tại hoặc source ID không thuộc catalog. | ① Failure/no-grounding | Reject output, lọc theo competency/source hợp lệ và dùng kế hoạch an toàn của ứng dụng. | G11 — Giải thích vì sao |
| 7 | Tổng thời gian người học chọn ngắn hơn thời lượng tối thiểu của roadmap. | ④ Domain/constraint | Nêu trade-off, đề xuất giảm phạm vi hoặc tăng thời gian; không hứa hoàn thành toàn bộ. | G9 — Sửa dễ dàng |
| 8 | Người học không đạt mastery test 80% sau khi học section. | ④ Domain/learning loop | Giữ section hiện tại, tạo remediation cho gap, cho phép retest; không mở section phụ thuộc. | G11 — Giải thích vì sao |
| 9 | Người học muốn bỏ qua section đang bị khóa. | ④ Domain/learning loop | Hiển thị prerequisite còn thiếu; chỉ mở bằng quick check hoặc khi hoàn thành điều kiện đã định. | G8 — Gạt bỏ dễ dàng; G11 — Giải thích vì sao |
| 10 | Câu hỏi gộp nhiều competency và không đủ thông tin để phân loại. | ② Low-confidence | Yêu cầu người học tách câu hỏi hoặc bổ sung bối cảnh trước khi tạo gap. | G10 — Thu hẹp phạm vi khi nghi ngờ |

Kịch bản nhóm lo ngại nhất khi demo là AI trả về một roadmap có vẻ hợp lý nhưng không có căn cứ trong tài liệu. Vì vậy hệ thống phải ưu tiên `no_evidence`/fallback an toàn và hiển thị source ID hợp lệ thay vì cố trả lời cho đủ.

## §6. Bốn đường đi của trải nghiệm
- Happy path: Nhập đủ thông tin → hoàn thành diagnostic → tạo competency profile → tạo learning path → học section → mastery test đạt từ 80% → chuyển section/topic tiếp theo.
- Low-confidence (②): Dữ liệu chưa đủ hoặc AI confidence thấp → yêu cầu thêm câu trả lời/thông tin → chạy lại diagnostic → chưa đưa ra kết luận chắc chắn.
- Failure/không căn cứ (①): AI API lỗi/timeout → retry hoặc fallback; không tìm thấy tài liệu → thông báo chưa đủ căn cứ, không tự tạo nội dung.
- Correction (user sửa): Người học sửa mục tiêu, thời gian, deadline hoặc câu trả lời → tạo lại competency profile và learning path.
- Khi bị đòi ngoài phạm vi (③): Câu hỏi không thuộc topic/content pack → thông báo phạm vi hỗ trợ và đưa người học về nội dung đang học.
- Case đặc thù domain (④): Nếu còn thiếu prerequisite Python/SQL/ML/LLM → ưu tiên kiến thức nền trước topic mới; nếu deadline không khả thi → đề xuất điều chỉnh thời gian hoặc phạm vi.

## §7. Kiểm thử
- Chiều chất lượng + định nghĩa kiểm chứng được:
  - Grounding: câu trả lời phải có source ID hợp lệ khi case yêu cầu có căn cứ; case ngoài phạm vi phải trả `no_evidence` và không gắn source.
  - Relevance: trả lời trực tiếp câu hỏi, không chuyển sang topic khác.
  - Safety: không tự suy đoán khi PDF không có căn cứ; hiển thị đường chuyển tiếp.
- Golden set: 20 case trong `eval/cp3-cases.json`, gồm 10 case thường, 2 case nguồn sự thật, 2 case thiếu thông tin, 2 case ngoài phạm vi, 2 case đặc thù domain và 2 case hiếm. Trong đó 10 case được phát triển từ chatlog VLearn anonymized, lưu mã `conversation_id:turn_id` và không đưa nguyên văn chatlog vào repo.
- Quality bar chốt tại CP4: `quality_rate = số case đạt đồng thời grounding và relevance / tổng số case`. Bộ 20 case đạt khi `quality_rate ≥ 80%` và `out_of_scope_no_evidence_rate = 100%`.
- Chạy đo: `PATHWISE_URL=http://127.0.0.1:4173 node scripts/run-cp3-measure.js --save eval/cp3-results-final.json`. Kết quả lượt chạy trọn bộ: 20/20 case đạt ở cấp hệ thống; 2 case dùng OpenRouter live và 18 case dùng deterministic fallback do giới hạn credit/quota của provider.
- Kiểm thử quyết định trung tâm: `POST /api/learning/analyze` đã chạy thành công bằng OpenRouter `openai/gpt-4o`, `live: true`, có competency gaps, recommended path và source IDs. Kết quả lưu tại `eval/cp3-central-result-live-check.json`.
- Bảng kết quả: 20/20 case đạt ở cấp hệ thống (`100%`), gồm 2/2 case AI live (`100%`) và 18/18 case deterministic fallback (`100%`). Kết quả này không được diễn giải thành độ chính xác riêng của AI live.

## §8. Phân công & kế hoạch
- Phân công:
  | Đầu việc | Người phụ trách |
  |---|---|
  | Diagnostic, scoring và gap detection | Nguyễn Hoàng Cường |
  | Khảo sát, evidence và survey log/quote | Tống Trần Dũng |
  | Competency map và prerequisite graph | Vũ Đức Thiện |
  | Roadmap, RAG/citation, tích hợp repo và nộp checkpoint | Vũ Quốc Huy |
- Willing users và kế hoạch validation:
  | Người dùng | Vai trò | Task dự kiến |
  |---|---|---|
  | Đặng Quang Hưng | Học viên | Nhập mục tiêu AI Engineer, chọn thời lượng, hoàn thành diagnostic và đánh giá roadmap được đề xuất. |
  | Nguyễn Viết Đức | Học viên | Thực hiện cùng luồng; thử học một section, làm mastery test và kiểm tra cách hệ thống xử lý khi chưa đạt 80%. |
  - Người phụ trách validation và ghi nhật ký: Tống Trần Dũng. Người phụ trách dry-run flow và video demo: Vũ Quốc Huy; Nguyễn Hoàng Cường kiểm tra diagnostic/scoring; Vũ Đức Thiện kiểm tra competency map/prerequisite.
  - Khi validation được thực hiện, nhóm sẽ ghi người thử, task, điểm kẹt, quote nguyên văn, quyết định thay đổi và lưu nhật ký trong `validation/`; chưa ghi nhận kết quả validation ở CP4.

## §9. Changelog
| Thời điểm | Đổi gì | Vì sao (trỏ về feedback/case nào) |
|---|---|---|
| 17/9 | Chốt lát cắt diagnostic → knowledge gap → learning path cho người muốn học AI Engineer. | Khảo sát ghi nhận 16/23 người gặp khó khi bắt đầu/xác định phần hổng và 14/23 muốn kiểm tra trước nội dung mới. |
| 17/9 | Để người học tự nhập topic và thời lượng trước diagnostic, không gán sẵn topic khi mở ứng dụng. | Phù hợp với lát cắt một người học tự xác nhận mục tiêu và thời gian trước khi nhận lộ trình. |
| 18/9 | Bổ sung source ID, no-evidence, retry/fallback và quality bar cho 20 case. | Trace CP3 ghi nhận provider có lỗi quota/timeout; cần phân biệt AI live với deterministic fallback và không tạo nguồn giả. |
| 18/9 | Bổ sung learning package, transfer check, mastery gate và remediation sau khi chưa đạt 80%. | Biến kết quả roadmap thành hành động học, kiểm tra và ôn lại trong phạm vi prototype. |
| 18/9 | sửa luồng logic tạo lộ trình học, loại bỏ nút reset thời gian | Lỗi code logic khiến người dùng trải nghiệm không đúng |
## Tự khai phần chưa hoàn thiện tại CP4
- Evidence đã có `n = 23` phản hồi và log câu hỏi/câu trả lời trong `evidence/survey-log.md`. Đây là khảo sát thuận tiện trong phạm vi nhóm tiếp cận, không khẳng định đại diện cho toàn bộ người học AI Engineer.
- File khảo sát không ghi thông tin để kiểm tra thành viên nhóm; điều kiện “23 người ngoài nhóm” cần được đội trưởng xác nhận khi nộp.
- Validation với willing users chưa thực hiện; kế hoạch đã ghi ở §8 và sẽ ghi kết quả thật trong `validation/` khi triển khai.
- Kết quả 20/20 là phép đo cấp hệ thống; chỉ 2/20 case được xử lý bằng AI live trong lượt chạy đã lưu, 18/20 case dùng deterministic fallback.
- Production đã có cơ chế tải/cache PDF qua `DOCUMENT_PDF_URL`, nhưng Render vẫn cần được cấu hình một URL HTTPS tới file được cấp quyền. Khi chưa cấu hình biến này, health check sẽ báo `document.loaded=false`; không trình bày grounding PDF cloud là đã hoàn tất.
