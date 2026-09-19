"use strict";

const text = (value) => String(value ?? "").trim().replace(/^\uFEFF/, "");

const parseModelJson = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const raw = text(value);
  if (!raw) throw new Error("provider_empty_response");

  const candidates = [
    raw,
    raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""),
  ];
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(raw.slice(firstBrace, lastBrace + 1));

  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  throw new Error("provider_invalid_json");
};

const errorReason = (error) => {
  if (error?.name === "AbortError") return "timeout";
  return String(error?.message || "provider_failed").slice(0, 320);
};

const runHedgedProviders = async (providers, execute, options = {}) => {
  const names = [...new Set((Array.isArray(providers) ? providers : []).filter(Boolean))];
  if (!names.length) return { provider: null, value: null, attempts: [] };

  const staggerMs = Math.max(0, Number(options.staggerMs) || 0);
  const controller = new AbortController();
  const attempts = [];
  return new Promise((resolve) => {
    let nextIndex = 0;
    let active = 0;
    let finished = false;
    let nextTimer = null;

    const completeWithoutWinner = () => {
      if (!finished && active === 0 && nextIndex >= names.length) {
        finished = true;
        resolve({ provider: null, value: null, attempts });
      }
    };

    const startNext = () => {
      if (finished || nextIndex >= names.length) return;
      if (nextTimer) clearTimeout(nextTimer);
      nextTimer = null;
      const provider = names[nextIndex++];
      active += 1;

      if (nextIndex < names.length) {
        nextTimer = setTimeout(startNext, staggerMs);
      }

      Promise.resolve().then(() => execute(provider, controller.signal)).then((value) => {
        if (finished) return;
        finished = true;
        if (nextTimer) clearTimeout(nextTimer);
        controller.abort();
        resolve({ provider, value, attempts });
      }).catch((error) => {
        active -= 1;
        if (finished) return;
        attempts.push({ provider, reason: errorReason(error) });
        if (nextIndex < names.length) startNext();
        completeWithoutWinner();
      });
    };

    startNext();
  });
};

module.exports = { parseModelJson, runHedgedProviders, errorReason };
