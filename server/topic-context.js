"use strict";

// Khung năng lực được map từ mục lục của Grokking Machine Learning.
// Nội dung chi tiết được đọc từ PDF ở runtime, không commit PDF vào repo.
const sources = [
  { id: "GML-CH01", label: "What is machine learning?", chapter: "Chapter 1", keywords: ["machine learning", "remember-formulate-predict", "data"], summary: "Khái niệm machine learning và khung remember–formulate–predict." },
  { id: "GML-CH02", label: "Types of machine learning", chapter: "Chapter 2", keywords: ["supervised", "unsupervised", "reinforcement", "labeled", "unlabeled"], summary: "Phân biệt supervised, unsupervised và reinforcement learning." },
  { id: "GML-CH03", label: "Linear regression", chapter: "Chapter 3", keywords: ["linear regression", "regression", "error function", "polynomial"], summary: "Regression, đường hồi quy, error function và polynomial regression." },
  { id: "GML-CH04", label: "Testing, overfitting and regularization", chapter: "Chapter 4", keywords: ["underfitting", "overfitting", "validation", "regularization", "testing"], summary: "Đánh giá mô hình, overfitting, validation set và regularization." },
  { id: "GML-CH05-08", label: "Classification and model evaluation", chapter: "Chapters 5–8", keywords: ["perceptron", "logistic", "classification", "accuracy", "roc", "bayes"], summary: "Classification, logistic classifiers, accuracy, ROC và naive Bayes." },
  { id: "GML-CH09-12", label: "Trees, neural networks and ensembles", chapter: "Chapters 9–12", keywords: ["decision trees", "neural networks", "support vector", "ensemble", "gradient boosting", "xgboost"], summary: "Decision trees, neural networks, SVM và ensemble learning." },
  { id: "GML-CH13", label: "Putting it all in practice", chapter: "Chapter 13", keywords: ["data engineering", "machine learning", "real-life", "practice"], summary: "Một ví dụ thực tế kết nối data engineering và machine learning." },
];

const sections = [
  { id: "section-ml-foundations", number: "01", title: "ML foundations & problem framing", eyebrow: "NỀN TẢNG", duration: 18, prerequisite: null, sourceIds: ["GML-CH01"] },
  { id: "section-learning-types", number: "02", title: "Learning types & data", eyebrow: "ĐẶT BÀI TOÁN", competencyId: "learning-types", duration: 18, prerequisite: "section-ml-foundations", sourceIds: ["GML-CH02"] },
  { id: "section-regression", number: "03", title: "Regression & error", eyebrow: "MÔ HÌNH ĐẦU TIÊN", competencyId: "regression", duration: 25, prerequisite: "section-learning-types", sourceIds: ["GML-CH03"] },
  { id: "section-generalization", number: "04", title: "Generalization & validation", eyebrow: "ĐIỂM DỄ SAI", competencyId: "generalization", duration: 22, prerequisite: "section-regression", sourceIds: ["GML-CH04"] },
  { id: "section-classification", number: "05", title: "Classification & evaluation", eyebrow: "ĐÁNH GIÁ", competencyId: "classification", duration: 30, prerequisite: "section-generalization", sourceIds: ["GML-CH05-08"] },
  { id: "section-model-families", number: "06", title: "Model families in practice", eyebrow: "MỞ RỘNG", competencyId: "model-families", duration: 30, prerequisite: "section-classification", sourceIds: ["GML-CH09-12", "GML-CH13"] },
];

// Section 01 có competencyId riêng; khai báo sau để tránh lặp dữ liệu section.
sections[0].competencyId = "ml-foundations";

const competencies = [
  { id: "ml-foundations", title: "ML foundations", sourceIds: ["GML-CH01"] },
  { id: "learning-types", title: "Learning types & data", sourceIds: ["GML-CH02"] },
  { id: "regression", title: "Regression & error", sourceIds: ["GML-CH03"] },
  { id: "generalization", title: "Generalization & validation", sourceIds: ["GML-CH04"] },
  { id: "classification", title: "Classification & evaluation", sourceIds: ["GML-CH05-08"] },
  { id: "model-families", title: "Model families", sourceIds: ["GML-CH09-12", "GML-CH13"] },
];

const diagnosticQuestions = [
  { id: "diag-ml-01", competencyId: "ml-foundations", label: "Problem framing", prompt: "Machine learning khác với việc viết một tập luật cố định ở điểm cốt lõi nào?", options: ["Model học một quy luật từ dữ liệu để đưa ra dự đoán hoặc quyết định.", "Model luôn cho kết quả đúng nếu có đủ dữ liệu.", "Machine learning chỉ là cách lưu dữ liệu nhanh hơn.", "Machine learning không cần xác định đầu ra cần dự đoán."], correctIndex: 0, explanation: "ML dùng dữ liệu và quy trình huấn luyện để hình thành quy luật phục vụ dự đoán hoặc quyết định.", sourceIds: ["GML-CH01"] },
  { id: "diag-ml-02", competencyId: "learning-types", label: "Learning type", prompt: "Bài toán dự đoán giá nhà từ các mẫu đã có giá nhãn thường thuộc loại nào?", options: ["Supervised learning.", "Unsupervised learning.", "Reinforcement learning.", "Không thuộc machine learning."], correctIndex: 0, explanation: "Có đầu ra/nhãn đã biết trong dữ liệu huấn luyện nên đây là supervised learning.", sourceIds: ["GML-CH02"] },
  { id: "diag-ml-03", competencyId: "regression", label: "Regression", prompt: "Linear regression thường được dùng để làm gì?", options: ["Dự đoán một giá trị liên tục từ các đặc trưng.", "Chỉ gom dữ liệu thành các nhóm không nhãn.", "Sinh phần thưởng cho một tác nhân.", "Xóa các điểm dữ liệu ngoại lệ mà không cần đo lỗi."], correctIndex: 0, explanation: "Regression mô hình hóa quan hệ để dự đoán giá trị liên tục; error function dùng để đo mức lệch.", sourceIds: ["GML-CH03"] },
  { id: "diag-ml-04", competencyId: "generalization", label: "Generalization", prompt: "Dấu hiệu nào phù hợp nhất với overfitting?", options: ["Mô hình tốt trên dữ liệu huấn luyện nhưng kém trên dữ liệu chưa thấy.", "Mô hình không học được cả dữ liệu huấn luyện.", "Mô hình luôn có ít tham số hơn dữ liệu.", "Mô hình không cần validation set."], correctIndex: 0, explanation: "Overfitting xảy ra khi mô hình bám quá sát dữ liệu huấn luyện và generalize kém trên dữ liệu mới.", sourceIds: ["GML-CH04"] },
  { id: "diag-ml-05", competencyId: "classification", label: "Evaluation", prompt: "Vì sao accuracy không phải lúc nào cũng đủ để đánh giá classifier?", options: ["Vì các loại lỗi khác nhau có thể có chi phí khác nhau, đặc biệt khi lớp mất cân bằng.", "Vì accuracy chỉ dùng được cho regression.", "Vì classifier không thể có dự đoán sai.", "Vì accuracy không liên quan đến dữ liệu kiểm thử."], correctIndex: 0, explanation: "Khi false positive và false negative có hậu quả khác nhau hoặc lớp mất cân bằng, cần nhìn thêm các metric phù hợp.", sourceIds: ["GML-CH07"] },
  { id: "diag-ml-06", competencyId: "model-families", label: "Model choice", prompt: "Khi cần chọn giữa nhiều model, bước nào giúp kiểm tra khả năng tổng quát hóa công bằng hơn?", options: ["Đánh giá trên dữ liệu chưa dùng để fit và giữ quy trình validation nhất quán.", "Chọn model có tên phức tạp nhất.", "Đánh giá trên đúng dữ liệu đã huấn luyện rồi kết luận.", "Bỏ qua error function để tránh mất thời gian."], correctIndex: 0, explanation: "Dữ liệu validation/test và quy trình đánh giá nhất quán giúp tránh kết luận chỉ dựa trên dữ liệu đã học.", sourceIds: ["GML-CH04", "GML-CH09-12"] },
];

module.exports = {
  topicContext: { topicId: "grokking-machine-learning", title: "Machine Learning Foundations", documentName: "Grokking Machine Learning", sources, sections, competencies },
  sources,
  sections,
  competencies,
  diagnosticQuestions,
  sourceIds: new Set(sources.map((item) => item.id)),
  sectionIds: new Set(sections.map((item) => item.id)),
  competencyIds: new Set(competencies.map((item) => item.id)),
};
