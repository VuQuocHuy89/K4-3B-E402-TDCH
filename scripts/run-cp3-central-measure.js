"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const baseUrl = process.env.PATHWISE_URL || "http://127.0.0.1:4173";
const savePath = process.argv.includes("--save")
  ? path.resolve(process.argv[process.argv.indexOf("--save") + 1])
  : null;

const payload = {
  topic_id: "grokking-machine-learning",
  learner: { target_role: "AI Engineer", level: "beginner-to-intermediate" },
  available_time_minutes: 45,
  answers: [
    { question_id: "diag-ml-01", competency_id: "ml-foundations", answer_index: 0, is_correct: true, confidence: "high", source_ids: ["GML-CH01"] },
    { question_id: "diag-ml-02", competency_id: "learning-types", answer_index: 1, is_correct: false, confidence: "low", source_ids: ["GML-CH02"] },
    { question_id: "diag-ml-03", competency_id: "regression", answer_index: 0, is_correct: true, confidence: "medium", source_ids: ["GML-CH03"] },
    { question_id: "diag-ml-04", competency_id: "generalization", answer_index: 1, is_correct: false, confidence: "low", source_ids: ["GML-CH04"] },
    { question_id: "diag-ml-05", competency_id: "classification", answer_index: 0, is_correct: true, confidence: "medium", source_ids: ["GML-CH05-08"] },
    { question_id: "diag-ml-06", competency_id: "model-families", answer_index: 0, is_correct: true, confidence: "medium", source_ids: ["GML-CH04", "GML-CH09-12"] },
  ],
};

const main = async () => {
  const started = Date.now();
  let result;
  try {
    const response = await fetch(`${baseUrl}/api/learning/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    const data = body.data || {};
    const validPath = Array.isArray(data.recommended_path) && data.recommended_path.length > 0;
    const validReason = typeof data.reason === "string" && data.reason.length > 0;
    const validGaps = Array.isArray(data.competency_gaps)
      && data.competency_gaps.every((gap) => Array.isArray(gap.source_ids) && gap.source_ids.length > 0);
    result = {
      generated_at: new Date().toISOString(),
      base_url: baseUrl,
      case_id: "central-analyze-01",
      input: payload,
      pass: response.ok && validPath && validReason && validGaps,
      provider: body.meta?.provider,
      model: body.meta?.model,
      live: body.meta?.live,
      fallback_reason: body.meta?.fallback_reason || null,
      status: data.status,
      recommended_path: data.recommended_path || [],
      competency_gaps: data.competency_gaps || [],
      latency_ms: Date.now() - started,
    };
  } catch (error) {
    result = {
      generated_at: new Date().toISOString(),
      base_url: baseUrl,
      case_id: "central-analyze-01",
      input: payload,
      pass: false,
      provider: "request-error",
      live: false,
      reason: error.message,
      latency_ms: Date.now() - started,
    };
  }
  console.log(JSON.stringify(result, null, 2));
  if (savePath) await fs.writeFile(savePath, `${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.pass ? 0 : 1;
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
