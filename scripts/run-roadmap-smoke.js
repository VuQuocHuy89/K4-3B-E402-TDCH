"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const viewContainer = { innerHTML: "" };
const toast = { textContent: "", classList: { add() {}, remove() {} } };
const liveRegion = { textContent: "" };
const savedState = {
  assessmentVersion: 4,
  view: "roadmap",
  profileConfigured: true,
  pathTopic: "Machine Learning Foundations",
  pathLevel: "beginner",
  pathMinutes: 35,
  diagnosticSubmitted: true,
  selectedSectionId: "section-learning-types",
  timePlan: 35,
  completedSections: { "section-ml-foundations": true },
  studyChecks: [],
  tutorMessages: [],
};
// A generated path must render with its actual stage count, never the seeded six.
savedState.generatedSections = Array.from({ length: 3 }, (_, index) => ({
  id: `generated-stage-${index}`, section_id: `generated-stage-${index}`, version: 4,
  topic_label: savedState.pathTopic, competency_id: `skill-${index}`,
  title: `Kỹ năng ${index + 1}`, description: `Nội dung riêng của chặng ${index + 1}`,
  objective: `Mục tiêu ${index + 1}`, objectives: [{ id: `objective-${index}`, title: `Mục tiêu ${index + 1}` }],
  depth: index ? "deep" : "review", duration: "12 phút", estimated_minutes: 12,
  eyebrow: "CỦNG CỐ", checklist: ["Áp dụng kiến thức"], source_urls: [],
}));
savedState.aiAnalysis = { competencies: savedState.generatedSections.map((section) => ({ id: section.competency_id, title: section.title, objectives: section.objectives })), recommended_path: savedState.generatedSections };
savedState.selectedSectionId = "generated-stage-1";
savedState.completedSections = { "generated-stage-0": true };

const localStorage = {
  values: new Map([["pathwise-learning-session-v5:user:smoke-user", JSON.stringify(savedState)]]),
  getItem(key) {
    if (key === "pathwise-auth-session-v1") return "smoke-user";
    if (key === "pathwise-auth-users-v1") return JSON.stringify([{ id: "smoke-user", name: "Smoke User", email: "smoke@example.com", passwordHash: "fixture" }]);
    return this.values.get(key) || null;
  },
  setItem(key, value) { this.values.set(key, value); },
  removeItem(key) { this.values.delete(key); },
};
const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
const stubElement = {
  classList,
  inert: false,
  contains() { return false; },
  focus() {},
  setAttribute() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
};
const document = {
  body: { classList },
  activeElement: null,
  querySelector(selector) {
    if (selector === "#view-container") return viewContainer;
    if (selector === "#toast") return toast;
    if (selector === "#live-region") return liveRegion;
    if (selector === ".sidebar") return stubElement;
    return null;
  },
  querySelectorAll() { return []; },
  addEventListener() {},
};
const window = {
  location: { hash: "#roadmap" },
  history: { replaceState() {} },
  localStorage,
  setTimeout,
  clearTimeout,
  addEventListener() {},
  requestAnimationFrame(callback) { callback(); },
  matchMedia() { return { matches: true, addEventListener() {}, removeEventListener() {} }; },
};
const context = vm.createContext({ window, document, localStorage, console, setTimeout, clearTimeout, URL, fetch: async () => { throw new Error("offline smoke test"); } });

vm.runInContext(fs.readFileSync(path.join(root, "codebase", "content-pack.js"), "utf8"), context, { filename: "content-pack.js" });
vm.runInContext(fs.readFileSync(path.join(root, "codebase", "app.js"), "utf8"), context, { filename: "app.js" });

// Auth bootstrap is async even when the local fixture is already available.
setImmediate(() => {
  const html = viewContainer.innerHTML;
  assert.match(html, /Hành trình học Machine Learning Foundations/);
  assert.equal((html.match(/class="journey-checkpoint/g) || []).length, 4, "three generated milestones plus the final trophy");
  assert.equal((html.match(/journey-micro-point is-complete/g) || []).length, 3, "completed section marks three green micro points");
  assert.match(html, /class="journey-avatar[^>]*data-stop="1"/, "avatar advances to the second milestone");
  assert.equal((html.match(/class="reward-art"/g) || []).length, 3, "every major milestone has reward art");
  assert.match(html, /Cúp Machine Learning Foundations/);
  assert.match(html, /data-action="preview-journey"/);

  assert.match(html, /Hoàn thành đủ 3 cột mốc/);
  assert.match(html, /--mobile-y:860px/);
  console.log("roadmap smoke: ok · 3 generated milestones · 9 micro points · avatar stop 1 · trophy positioned after stage 3");
});
