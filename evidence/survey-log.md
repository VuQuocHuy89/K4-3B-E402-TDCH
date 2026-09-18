# Nhật ký khảo sát nhu cầu học AI Engineer

## Nguồn và cách mã hóa

- Nguồn gốc: file khảo sát Google Forms được xuất thành `khaosat_TDCH.xlsx`.
- Số phản hồi trong file: **23**.
- `R01`–`R23` là mã ẩn danh theo thứ tự dòng dữ liệu trong file Excel, không phải tên người trả lời.
- Không đưa file Excel gốc vào repository; nội dung câu hỏi và câu trả lời dưới đây được chép lại nguyên văn để đối chiếu.
- Cột `I` và `J` cho phép chọn nhiều phương án; vì vậy tổng số lựa chọn có thể lớn hơn 23.

## Câu hỏi trong biểu mẫu

| Mã | Nội dung câu hỏi |
|---|---|
| B | Trong 2 tuần qua, bạn có từng học thêm 1 kiến thức nào mới liên quan đến AI không |
| C | kết quả bạn muốn đạt được là gì. |
| D | Bạn đã học bằng cách nào |
| E | khó khăn lớn nhất bạn gặp phải là gì |
| F | Trong 7 ngày đó, bạn học bao nhiêu tiếng 1 ngày |
| G | Bạn thường mất khoảng bao lâu để hoàn thành khóa học |
| H | Bạn nắm khoảng bao nhiêu kiến thức sau khi hoàn thành |
| I | bạn nghĩ nguyên nhân do đâu khiến bạn gặp khó khăn trong việc học |
| J | Cách ôn hiện tại có điểm gì bạn thấy muốn đổi nhất? |
| K | Nếu có công cụ AI chỉ đúng chỗ bạn còn hiểu sai/thiếu, bạn có sẵn sàng thử 5-10 phút không? |

## Tóm tắt số liệu

- B: `23/23` trả lời “Có”.
- C: `20/23` học để bổ sung kiến thức; `2/23` học lấy chứng chỉ; `1/23` chọn mục tiêu khác.
- D: `9/23` học tại lớp; `7/23` học trên nền tảng trực tuyến; `7/23` qua tài liệu.
- E: `16/23` không biết nên bắt đầu từ đâu/không chắc phần bị hổng; `5/23` không tìm được lộ trình phù hợp; `2/23` khó tìm tài liệu.
- I: `22/23` chọn nguyên nhân kiến thức quá rộng/không biết nên học phần nào kỹ; `16/23` không chắc đã nắm đủ sau lộ trình; `9/23` khó tự chủ phân chia thời gian; `7/23` cho rằng ứng dụng chưa triển khai lộ trình hiệu quả.
- J: `14/23` muốn kiểm tra trước nội dung mới; `14/23` muốn tập trung vào phần còn thiếu; `9/23` muốn roadmap phù hợp hơn; `5/23` muốn đổi cách thiết kế lộ trình; `5/23` muốn quy trình và deadline rõ ràng.
- K: `22/23` sẵn sàng thử công cụ AI trong 5–10 phút; `1/23` trả lời “không”.

## Quote nguyên văn được dùng trong `spec.md`

| Mã | Câu trả lời | Cột |
|---|---|---|
| R01 | “Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung” | E |
| R03 | “Tài liệu khó kiếm” | E |
| R04 | “Không tìm được lộ trình phù hợp” | E |
| R09 | “Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ” | I |
| R17 | “Ứng dụng chưa triển khai lộ trình hiệu quả” | I |

## Bảng câu trả lời nguyên văn

| Mã | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| R01 | Có | Học để bổ sung kiến thức | Học trên nền tảng trực tuyến | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 6 tiếng | 3 tiếng | 6-70% | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức, Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu, Có quy trình rõ ràng, deadline cụ thể | có |
| R02 | Có | Học để bổ sung kiến thức | Học trên nền tảng trực tuyến | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 8.0 | 3.0 | 40.0 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu, đưa ra roadmap phù hợp hơn | có |
| R03 | Có | Học để bổ sung kiến thức | học tại lớp | Tài liệu khó kiếm | 12 tiếng | 4 tiếng | 0.8 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi không thể tự chủ trong việc phân chia thời gian, Ứng dụng chưa triển khai lộ trình hiệu quả, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu | có |
| R04 | Có | Học lấy chứng chỉ | Qua tài liệu | Không tìm được lộ trình phù hợp | Tùy thời gian | 4 tuần | 0.7 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Ứng dụng chưa triển khai lộ trình hiệu quả, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức, Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu | có |
| R05 | Có | Học để bổ sung kiến thức | học tại lớp | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 5 tiếng | 8 tuần | 0.6 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu, Có quy trình rõ ràng, deadline cụ thể | có |
| R06 | Có | Học để bổ sung kiến thức | Học trên nền tảng trực tuyến | Không tìm được lộ trình phù hợp | 2.0 | 3 tuần  | 0.6 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu, đưa ra roadmap phù hợp hơn | có |
| R07 | Có | Học lấy chứng chỉ | học tại lớp | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 14h | 1 tháng | 0.5 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức, đưa ra roadmap phù hợp hơn | có |
| R08 | Có | Học để bổ sung kiến thức | Học trên nền tảng trực tuyến | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 2 tiếng | 2 tiếng | không rõ | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi không thể tự chủ trong việc phân chia thời gian, Ứng dụng chưa triển khai lộ trình hiệu quả, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức, Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu, đưa ra roadmap phù hợp hơn | có |
| R09 | Có | Học để bổ sung kiến thức | Học trên nền tảng trực tuyến | Không tìm được lộ trình phù hợp | 2 tiếng | Không rõ | Không rõ | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức | có |
| R10 | Có | Học để bổ sung kiến thức | học tại lớp | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 1.5 | 2.0 | 0.6 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức, Có quy trình rõ ràng, deadline cụ thể | có |
| R11 | Có | Học để bổ sung kiến thức | học tại lớp | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 4 tiếng | 1 tháng | 0.5 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức, Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu | không |
| R12 | Có | Học để bổ sung kiến thức | học tại lớp | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 8.0 | 8-12 tieng | 0.2 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi không thể tự chủ trong việc phân chia thời gian, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu, đổi cách thiết kế lộ trình | có |
| R13 | Có | Học để bổ sung kiến thức | Qua tài liệu | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 8.0 | 8tieng | 0.5 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi không thể tự chủ trong việc phân chia thời gian | Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu | có |
| R14 | Có | Học để bổ sung kiến thức | học tại lớp | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 8.0 | 12h | 0.2 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi không thể tự chủ trong việc phân chia thời gian, Ứng dụng chưa triển khai lộ trình hiệu quả | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức, Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu | có |
| R15 | Có | Học để bổ sung kiến thức | học tại lớp | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 5.0 | 10h | 0.3 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi không thể tự chủ trong việc phân chia thời gian, Ứng dụng chưa triển khai lộ trình hiệu quả, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | đổi cách thiết kế lộ trình, đưa ra roadmap phù hợp hơn | có |
| R16 | Có | Học để bổ sung kiến thức | học tại lớp | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 3.0 | 20 giờ | 75% của khóa học đó | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức | có |
| R17 | Có | Học để bổ sung kiến thức | Học trên nền tảng trực tuyến | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 12.0 | nhiều h | 70.0 | Ứng dụng chưa triển khai lộ trình hiệu quả | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức | có |
| R18 | Có | Học để bổ sung kiến thức | Qua tài liệu | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 2.0 | 1-2 ngày | 0.7 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức, Có quy trình rõ ràng, deadline cụ thể | có |
| R19 | Có | Học để bổ sung kiến thức | Qua tài liệu | Không tìm được lộ trình phù hợp | 2.0 | Không | Không rõ | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi không thể tự chủ trong việc phân chia thời gian, Ứng dụng chưa triển khai lộ trình hiệu quả, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức, Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu, đổi cách thiết kế lộ trình, đưa ra roadmap phù hợp hơn, Có quy trình rõ ràng, deadline cụ thể | có |
| R20 | Có | Học để bổ sung kiến thức | Học trên nền tảng trực tuyến | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 2.0 | tùy khóa học | 0.8 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức, Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu, đổi cách thiết kế lộ trình, đưa ra roadmap phù hợp hơn | có |
| R21 | Có | Khác | Qua tài liệu | Không tìm được lộ trình phù hợp | 3.0 | 30p | 0.6 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | Hỗ trợ tập trung kiến thức vào phần bản thân bị thiếu | có |
| R22 | Có | Học để bổ sung kiến thức | Qua tài liệu | Không biết nên bắt đầu từ đâu, không chắc phần nào mình bị hổng kiến thức và cần tập trung | 3.0 | 1 tháng | 0.5 | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi không thể tự chủ trong việc phân chia thời gian, Tôi thường không chắc mình đã nắm đủ kiến thức chưa sau khi hoàn thành lộ trình | có kiểm tra trước khi bắt đầu nội dung mới để chắc chắn bản thân nắm rõ kiến thức, đưa ra roadmap phù hợp hơn | có |
| R23 | Có | Học để bổ sung kiến thức | Qua tài liệu | Tài liệu khó kiếm | Dưới 1 | Không cụ thể, tuỳ vào nội dung. | Thường là đầy đủ. | Kiến thức học quá rộng, tôi không biết nên học phần nào kĩ, Tôi không thể tự chủ trong việc phân chia thời gian | đổi cách thiết kế lộ trình, đưa ra roadmap phù hợp hơn | có |
