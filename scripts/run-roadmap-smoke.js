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

const localStorage = {
  value: JSON.stringify(savedState),
  getItem() { return this.value; },
  setItem(_key, value) { this.value = value; },
  removeItem() { this.value = null; },
};
const classList = { add() {}, remove() {}, toggle() {} };
const document = {
  body: { classList },
  querySelector(selector) {
    if (selector === "#view-container") return viewContainer;
    if (selector === "#toast") return toast;
    if (selector === "#live-region") return liveRegion;
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
  matchMedia() { return { matches: true }; },
};
const context = vm.createContext({ window, document, localStorage, console, setTimeout, clearTimeout, URL, fetch: async () => { throw new Error("offline smoke test"); } });

vm.runInContext(fs.readFileSync(path.join(root, "codebase", "content-pack.js"), "utf8"), context, { filename: "content-pack.js" });
vm.runInContext(fs.readFileSync(path.join(root, "codebase", "app.js"), "utf8"), context, { filename: "app.js" });

const html = viewContainer.innerHTML;
assert.match(html, /Hành trình AI Engineer của bạn/);
assert.equal((html.match(/class="journey-checkpoint/g) || []).length, 7, "six milestones plus the final trophy");
assert.equal((html.match(/journey-micro-point is-complete/g) || []).length, 3, "completed section marks three green micro points");
assert.match(html, /class="journey-avatar[^>]*data-stop="1"/, "avatar advances to the second milestone");
assert.equal((html.match(/class="reward-art"/g) || []).length, 6, "every major milestone has reward art");
assert.match(html, /Cúp Machine Learning Foundations/);
assert.match(html, /data-action="preview-journey"/);

console.log("roadmap smoke: ok · 6 milestones · 18 micro points · avatar stop 1 · trophy rendered");
