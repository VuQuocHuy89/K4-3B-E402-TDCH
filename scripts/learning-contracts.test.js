"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  assessmentCountForSections,
  validateAssessmentQuestion,
} = require("../server/learning-contracts");

const sections = [
  { id: "foundation", concepts: [{}, {}], checklist: [{}, {}], source_ids: ["source-a"] },
  { id: "workflow", concepts: [{}], checklist: [{}], source_ids: ["source-b"] },
  { id: "evaluation", concepts: [{}, {}, {}, {}], checklist: [{}, {}], source_ids: ["source-c"] },
];

test("assessment count follows topic coverage instead of a fixed question count", () => {
  assert.equal(assessmentCountForSections("diagnostic", sections), 5);
  assert.equal(assessmentCountForSections("mastery", sections, "evaluation"), 8);
  assert.equal(assessmentCountForSections("final", sections), 6);
});

test("assessment contract rejects duplicates, short explanations and unknown sources", () => {
  const base = {
    id: "q-1",
    prompt: "Trong pipeline này, bước nào giúp đánh giá khả năng tổng quát hóa?",
    options: ["Tách validation", "Xóa dữ liệu", "Đổi tên model", "Bỏ metric"],
    correct_index: 0,
    explanation: "Validation giúp kiểm tra model trên dữ liệu chưa dùng để fit và phát hiện overfitting.",
  };
  const seenPrompts = new Set();
  const valid = validateAssessmentQuestion(base, { section: sections[0], sourceIds: ["source-a"], seenPrompts });
  assert.ok(valid);
  seenPrompts.add(valid.promptKey);
  assert.equal(validateAssessmentQuestion(base, { section: sections[0], sourceIds: ["source-a"], seenPrompts }), null);
  assert.equal(validateAssessmentQuestion({ ...base, explanation: "Sai." }, { section: sections[0], sourceIds: ["source-a"] }), null);
  assert.equal(validateAssessmentQuestion(base, { section: sections[0], sourceIds: ["source-z"] }), null);
  assert.equal(validateAssessmentQuestion({ ...base, options: ["Giống nhau", "giống nhau", "Khác", "Không biết"] }, { section: sections[0], sourceIds: ["source-a"] }), null);
});

test("assessment contract preserves a valid question and scopes its source", () => {
  const result = validateAssessmentQuestion({
    id: "q-2",
    prompt: "Khi dữ liệu mất cân bằng, vì sao chỉ nhìn accuracy có thể gây hiểu lầm?",
    options: ["Nó có thể che khuất lỗi của lớp thiểu số", "Vì accuracy luôn bằng không", "Vì model không cần dữ liệu", "Vì metric không liên quan"],
    correct_index: 0,
    explanation: "Accuracy có thể vẫn cao khi model bỏ qua lớp thiểu số, nên cần xem thêm metric theo loại lỗi.",
  }, { section: sections[0], sourceIds: ["source-a", "source-z"] });
  assert.deepEqual(result.sourceIds, ["source-a"]);
  assert.equal(result.correctIndex, 0);
  assert.equal(result.options.length, 4);
});
