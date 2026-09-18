"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const topic = "Python list và hàm";
const makeQuestion = (section = "", id = "q1") => ({ id, section_id: section, competency_id: "python", objective_id: "index", label: "Chỉ số list", prompt: "Trong Python, [10, 20, 30][1] trả về giá trị nào?", options: ["10", "20", "30", "Lỗi"], correct_index: 1, explanation: "Chỉ số bắt đầu từ 0 nên phần tử ở vị trí 1 là 20.", source_urls: ["https://docs.python.org/3/tutorial/"] });
const competencies = [{ id: "python", title: "List Python", objectives: [{ id: "index", title: "Truy cập chỉ số list" }] }];
const section = (id) => ({ id, section_id: id, topic_label: topic, version: 4, context_key: `context-${id}`, competency_id: "python", objectives: competencies[0].objectives, title: `List ${id}`, description: "Học về chỉ số", objective: "Truy cập list", depth: "deep", mastery_question_count: 3, estimated_minutes: 12, duration: "12 phút", checklist: ["Tính kết quả"], eyebrow: "CỦNG CỐ", source_urls: [] });
const diagnostic = { version: 4, topic_label: topic, competencies, questions: [makeQuestion()] };
const reply = (data, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => ok ? { data, meta: { live: true, provider: "fixture" } } : { message: "LLM đang giới hạn token" } });
function harness(handler) {
  const calls = [], values = new Map();
  const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  const view = { innerHTML: "", classList };
  const element = { classList, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  const storage = { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) };
  const document = { body: { classList }, addEventListener() {}, querySelectorAll() { return []; }, querySelector(selector) { return selector === "#view-container" ? view : ["#toast", "#live-region", ".sidebar"].includes(selector) ? element : null; } };
  const window = { PATHWISE_API_BASE: "http://localhost:4173", location: { hash: "" }, history: { replaceState() {} }, localStorage: storage, setTimeout() { return 1; }, clearTimeout() {}, addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; }, requestAnimationFrame() {}, queueMicrotask() {} };
  const context = vm.createContext({ window, document, localStorage: storage, console, URL, AbortSignal, fetch: async (url, options = {}) => { const call = { url, payload: options.body ? JSON.parse(options.body) : null }; calls.push(call); return handler(call); } });
  const root = path.resolve(__dirname, "../codebase");
  vm.runInContext(fs.readFileSync(path.join(root, "content-pack.js"), "utf8"), context);
  // Expose closures only inside this isolated VM, without adding hooks to the shipped app.
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8").replace("  bootstrapAuth();", `
    currentUser = { id: "test-user", name: "Test", email: "test@example.test" }; authToken = "fixture";
    window.testApp = { state, loadAssessment, submitDiagnostic, createSectionLearningPackage, hasCurrentLesson, applyGeneratedSections, resetAssessmentState, logout, renderStudy, lessonRemediation };
  `);
  vm.runInContext(app, context);
  const api = window.testApp;
  Object.assign(api.state, { pathTopic: topic, pathLevel: "beginner", profileConfigured: true });
  return { ...api, calls, values, view };
}

test("UI diagnostic sends only chosen topic and preserves the original key after option shuffling", async () => {
  const app = harness(async () => reply(diagnostic));
  await app.loadAssessment("diagnostic");
  assert.equal(app.calls[0].payload.topic_label, topic);
  assert.equal(app.calls[0].payload.sections.length, 0);
  assert.equal(app.calls[0].payload.fallback_questions, undefined);
  const q = app.state.assessmentQuestions.diagnostic[0];
  assert.equal(q.options[q.correctIndex], "20");
  assert.equal(app.state.diagnosticAssessment.questions[0].correct_index, 1);
  assert.match(app.view.innerHTML, /\[10, 20, 30\]/);
});

test("submitting diagnostic sends selected answer text and replaces all old path content", async () => {
  const stages = [section("new-a"), section("new-b")];
  const app = harness(async (call) => call.url.endsWith("/analyze") ? reply({ version: 4, topic_label: topic, recommended_path: stages, competencies, competency_gaps: [] }) : reply(diagnostic));
  await app.loadAssessment("diagnostic");
  const q = app.state.assessmentQuestions.diagnostic[0];
  app.state.diagnosticAnswers[q.id] = q.correctIndex;
  app.state.generatedPackages.old = { title: "Old ML slides" };
  app.state.completedSections.old = true;
  await app.submitDiagnostic();
  const payload = app.calls.find((call) => call.url.endsWith("/analyze")).payload;
  assert.equal(payload.answers[0].selected_answer, "20");
  assert.equal(payload.assessment.topic_label, topic);
  assert.equal(app.state.generatedPackages.old, undefined);
  assert.equal(app.state.completedSections.old, undefined);
  assert.equal(app.state.selectedSectionId, "new-a");
  assert.ok(app.values.has("pathwise-learning-session-v5:user:test-user"));
});

test("mastery sends only current section and its matching lesson, rejecting stale decks", async () => {
  const stages = [section("a"), section("b")];
  const lesson = { version: 4, topic_label: topic, section_id: "b", context_key: "context-b", slides: [{ title: "List indexing" }], sources: [] };
  let invalid = false;
  const app = harness(async (call) => call.url.endsWith("/package") ? reply(invalid ? { ...lesson, topic_label: "Old ML topic" } : lesson) : reply({ ...diagnostic, questions: [makeQuestion("b")] }));
  app.state.generatedSections = stages; app.state.aiAnalysis = { competencies };
  app.applyGeneratedSections(stages);
  app.state.selectedSectionId = "b";
  app.state.studyCompleted = true;
  await app.createSectionLearningPackage(stages[1]);
  assert.ok(app.hasCurrentLesson(stages[1]));
  await app.loadAssessment("mastery", "b");
  const payload = app.calls.at(-1).payload;
  assert.deepEqual(payload.sections.map((s) => s.id), ["b"]);
  assert.deepEqual(Object.keys(payload.packages), ["b"]);
  invalid = true;
  await assert.rejects(app.createSectionLearningPackage(stages[1]), /khớp section/);
  assert.equal(app.state.generatedPackages.b.topic_label, topic);
});

test("failed generation retains answers and shows retry instead of seeded questions", async () => {
  const app = harness(async () => reply(null, false));
  app.state.diagnosticAnswers.q1 = 2;
  await app.loadAssessment("diagnostic");
  assert.equal(app.state.view, "generation-error");
  assert.equal(app.state.diagnosticAnswers.q1, 2);
  assert.equal(app.state.assessmentQuestions.diagnostic.length, 0);
  assert.match(app.view.innerHTML, /Thử lại/);
  assert.equal(app.calls.length, 1, "no failover to a remote deployment");
});

test("a response that arrives after logout cannot populate the next user's state", async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const app = harness(async (call) => call.url.endsWith("/logout") ? reply({}) : pending);
  const request = app.loadAssessment("diagnostic");
  app.logout();
  resolve(reply(diagnostic));
  await request;
  assert.equal(app.state.pathTopic, "");
  assert.equal(app.state.assessmentQuestions.diagnostic.length, 0);
});
