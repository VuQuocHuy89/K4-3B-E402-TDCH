"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const baseUrl = process.env.PATHWISE_URL || "http://127.0.0.1:4173";
const casesPath = path.resolve(__dirname, "../eval/cp3-cases.json");
const savePath = process.argv.includes("--save") ? path.resolve(process.argv[process.argv.indexOf("--save") + 1]) : null;
const delayMs = Number(process.env.PATHWISE_DELAY_MS || 2500);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const main = async () => {
  const cases = JSON.parse(await fs.readFile(casesPath, "utf8"));
  const results = [];

  for (const [index, testCase] of cases.entries()) {
    const started = Date.now();
    try {
      const response = await fetch(`${baseUrl}/api/tutor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_id: "grokking-machine-learning", section_id: "section-ml-foundations", message: testCase.input }),
      });
      const body = await response.json();
      const data = body.data || {};
      const returnedSources = data.source_ids || [];
      const sourceMatched = testCase.expect_no_evidence
        ? data.status === "no_evidence" && returnedSources.length === 0
        : testCase.expected_source_ids.some((sourceId) => returnedSources.includes(sourceId));
      results.push({
        id: testCase.id,
        input: testCase.input,
        risk_class: testCase.risk_class || null,
        difficulty: testCase.difficulty || null,
        origin: testCase.origin || null,
        chatlog_ref: testCase.chatlog_ref || null,
        source_ref: testCase.source_ref || null,
        pass: response.ok && sourceMatched && Boolean(data.answer),
        status: data.status,
        source_ids: returnedSources,
        provider: body.meta?.provider,
        model: body.meta?.model,
        live: body.meta?.live,
        fallback_reason: body.meta?.fallback_reason || null,
        attempts: body.meta?.attempts || [],
        latency_ms: Date.now() - started,
        reason: sourceMatched ? null : (testCase.expect_no_evidence ? "expected_no_evidence_not_returned" : "expected_source_not_returned"),
      });
    } catch (error) {
      results.push({ id: testCase.id, input: testCase.input, risk_class: testCase.risk_class || null, difficulty: testCase.difficulty || null, origin: testCase.origin || null, chatlog_ref: testCase.chatlog_ref || null, source_ref: testCase.source_ref || null, pass: false, provider: "request-error", live: false, latency_ms: Date.now() - started, reason: error.message });
    }
    if (delayMs > 0 && index < cases.length - 1) await wait(delayMs);
  }

  const passed = results.filter((item) => item.pass).length;
  const liveResults = results.filter((item) => item.live === true);
  const fallbackResults = results.filter((item) => item.provider === "deterministic-fallback");
  const providers = results.reduce((counts, item) => {
    counts[item.provider] = (counts[item.provider] || 0) + 1;
    return counts;
  }, {});
  const coverage = cases.reduce((summary, testCase) => {
    const riskClass = testCase.risk_class || "unclassified";
    const origin = testCase.origin || "unclassified";
    summary.risk_classes[riskClass] = (summary.risk_classes[riskClass] || 0) + 1;
    summary.origins[origin] = (summary.origins[origin] || 0) + 1;
    return summary;
  }, { risk_classes: {}, origins: {} });
  const summary = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    total: results.length,
    passed,
    failed: results.length - passed,
    system_accuracy: Number((passed / results.length).toFixed(4)),
    live_total: liveResults.length,
    live_passed: liveResults.filter((item) => item.pass).length,
    fallback_total: fallbackResults.length,
    fallback_passed: fallbackResults.filter((item) => item.pass).length,
    providers,
    coverage,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (savePath) await fs.writeFile(savePath, `${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = passed === results.length ? 0 : 1;
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
