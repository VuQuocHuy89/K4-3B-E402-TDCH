"use strict";
// Opt-in integration check against a running local backend; makes real provider calls.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const base = process.argv[2] || "http://localhost:4181";
let token = "";
const post = async (route, input) => {
  const response = await fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(input) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${route}: ${result.error} — ${result.message}`);
  return result;
};
async function main() {
  const account = await post("/api/auth/register", { name: "Adaptive integration check", email: `adaptive-${crypto.randomUUID()}@example.test`, password: crypto.randomBytes(18).toString("hex") });
  token = account.access_token;
  const output = path.join(os.tmpdir(), "pathwise-adaptive-live-result.json");
  const prior = process.argv.includes("--resume") && fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : null;
  const topic = prior?.topic || "Python: list, dictionary và hàm return";
  const assessment = prior ? { data: prior.assessment, meta: { live: true, provider: "saved-live-result" } } : await post("/api/learning/assessment", { topic_label: topic, learner_level: "beginner", mode: "diagnostic" });
  assert.equal(assessment.meta.live, true);
  console.log(JSON.stringify({ step: "diagnostic", provider: assessment.meta.provider, count: assessment.data.questions.length, skills: assessment.data.competencies.map((c) => c.title), sample: assessment.data.questions[0].prompt }));
  const strongId = assessment.data.competencies[0].id;
  const answers = assessment.data.questions.map((q) => ({ question_id: q.id, confidence: "high", selected_answer: q.options[q.competency_id === strongId ? q.correct_index : (q.correct_index + 1) % 4] }));
  const roadmap = prior ? { data: prior.roadmap } : await post("/api/learning/analyze", { topic_label: topic, assessment: assessment.data, answers, available_time_minutes: 30 });
  const sections = roadmap.data.recommended_path;
  assert.ok(sections.some((s) => s.depth === "review"));
  assert.ok(sections.some((s) => s.depth === "deep"));
  console.log(JSON.stringify({ step: "roadmap", stages: sections.map((s) => ({ title: s.title, depth: s.depth, minutes: s.estimated_minutes, questions: s.mastery_question_count })) }));
  const packages = prior?.packages || {};
  const results = { topic, assessment: assessment.data, roadmap: roadmap.data, packages, tests: prior?.tests || {} };
  fs.writeFileSync(output, JSON.stringify(results, null, 2));
  for (const section of [sections.find((s) => s.depth === "review"), sections.find((s) => s.depth === "deep")]) {
    const lesson = packages[section.id] ? { data: packages[section.id], meta: { live: true } } : await post("/api/learning/package", { topic_label: topic, section_id: section.id, section, neighbor_sections: sections.filter((s) => s.id !== section.id).map((s) => ({ title: s.title, objectives: s.objectives })) });
    packages[section.id] = lesson.data;
    fs.writeFileSync(output, JSON.stringify(results, null, 2));
    assert.ok(lesson.meta.live);
    console.log(JSON.stringify({ step: "lesson", title: section.title, slides: lesson.data.slides.length, first_slide: lesson.data.slides[0].title, sources: lesson.data.source_urls }));
    const test = results.tests[section.id] ? { data: results.tests[section.id] } : await post("/api/learning/assessment", { topic_label: topic, mode: "mastery", section_id: section.id, sections, packages });
    assert.ok(test.data.questions.every((q) => q.section_id === section.id));
    assert.equal(test.data.questions.length, section.mastery_question_count);
    results.tests[section.id] = test.data;
    fs.writeFileSync(output, JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ step: "mastery", section: section.title, count: test.data.questions.length, sample: test.data.questions[0].prompt }));
  }
  console.log("Live adaptive workflow passed. " + output);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => { if (token) await post("/api/auth/logout", {}).catch(() => {}); });
