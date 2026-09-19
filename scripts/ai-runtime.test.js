"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseModelJson, runHedgedProviders } = require("../server/ai-runtime");

test("parseModelJson accepts clean, fenced and prose-wrapped JSON", () => {
  assert.deepEqual(parseModelJson('{"status":"ok"}'), { status: "ok" });
  assert.deepEqual(parseModelJson('```json\n{"status":"ok"}\n```'), { status: "ok" });
  assert.deepEqual(parseModelJson('Here is the result:\n{"status":"ok","items":[1]}\nDone.'), { status: "ok", items: [1] });
  assert.throws(() => parseModelJson("No structured result"), /provider_invalid_json/);
});

test("runHedgedProviders returns the first valid provider without waiting for the slow one", async () => {
  const started = Date.now();
  const result = await runHedgedProviders(["slow", "fast"], async (provider) => {
    await new Promise((resolve) => setTimeout(resolve, provider === "slow" ? 80 : 5));
    return provider;
  }, { staggerMs: 5 });
  assert.equal(result.provider, "fast");
  assert.equal(result.value, "fast");
  assert.ok(Date.now() - started < 70);
});

test("runHedgedProviders records provider failures", async () => {
  const result = await runHedgedProviders(["one", "two"], async (provider) => {
    throw new Error(`${provider}_failed`);
  });
  assert.equal(result.provider, null);
  assert.equal(result.attempts.length, 2);
  assert.deepEqual(new Set(result.attempts.map((item) => item.reason)), new Set(["one_failed", "two_failed"]));
});

test("runHedgedProviders starts the backup immediately when the primary fails", async () => {
  const started = Date.now();
  const result = await runHedgedProviders(["primary", "backup"], async (provider) => {
    if (provider === "primary") throw new Error("quota_exhausted");
    return "live-output";
  }, { staggerMs: 500 });
  assert.equal(result.provider, "backup");
  assert.equal(result.value, "live-output");
  assert.equal(result.attempts[0].reason, "quota_exhausted");
  assert.ok(Date.now() - started < 100);
});
