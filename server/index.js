"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { URL } = require("node:url");
const {
  topicContext,
  sources,
  sections,
  competencies,
  diagnosticQuestions,
  sourceIds,
  sectionIds,
  competencyIds,
} = require("./topic-context");
const { discoverCatalogSources, sanitizeSources } = require("./source-catalog");

const execFileAsync = promisify(execFile);
const port = Number(process.env.PORT || 4173);
const rootDir = path.resolve(__dirname, "..");
const codebaseDir = path.join(rootDir, "codebase");
const pdfPath = process.env.DOCUMENT_PDF_PATH || path.join(rootDir, "Grokking Machine Learning.pdf");
const traceFile = process.env.AI_TRACE_FILE || "/tmp/pathwise-agent-trace.jsonl";

const traceLimit = 12000;
let dbPool = null;
let dbInitError = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require("pg");
    dbPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false }, max: 5 });
  } catch (error) {
    dbInitError = error.message;
  }
}

const redactTrace = (value) => {
  if (Array.isArray(value)) return value.map(redactTrace);
  if (!value || typeof value !== "object") return typeof value === "string" ? value.slice(0, traceLimit) : value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/key|token|authorization|secret/i.test(key)) return [key, "[redacted]"];
    if (key === "name") return [key, "[redacted]"];
    return [key, redactTrace(item)];
  }));
};

const writeTrace = async (event) => {
  try {
    await fs.mkdir(path.dirname(traceFile), { recursive: true });
    await fs.appendFile(traceFile, `${JSON.stringify(redactTrace(event))}\n`);
  } catch {}
};

const initDatabase = async () => {
  if (!dbPool) return;
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS learning_sessions (
        session_key TEXT PRIMARY KEY,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch (error) {
    dbInitError = error.message;
  }
};

const sessionKeyIsValid = (value) => typeof value === "string" && value.trim().length >= 3 && value.trim().length <= 160;
const loadSession = async (sessionKey) => {
  if (!dbPool || !sessionKeyIsValid(sessionKey)) return null;
  const result = await dbPool.query("SELECT state, updated_at FROM learning_sessions WHERE session_key = $1", [sessionKey.trim()]);
  return result.rows[0] || null;
};
const saveSession = async (sessionKey, state) => {
  if (!dbPool || !sessionKeyIsValid(sessionKey) || !state || typeof state !== "object" || Array.isArray(state)) return false;
  await dbPool.query(
    "INSERT INTO learning_sessions (session_key, state, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (session_key) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()",
    [sessionKey.trim(), JSON.stringify(state)],
  );
  return true;
};

const documentState = {
  loaded: false,
  path: pdfPath,
  fileName: path.basename(pdfPath),
  text: "",
  pages: [],
  error: null,
};

const json = (res, status, value) => {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(body);
};

const text = (res, status, body, type = "text/plain; charset=utf-8") => {
  res.writeHead(status, { "Content-Type": type, "Content-Length": Buffer.byteLength(body) });
  res.end(body);
};

const bodyOf = (req) => new Promise((resolve, reject) => {
  let raw = "";
  req.on("data", (part) => {
    raw += part;
    if (raw.length > 512 * 1024) reject(new Error("request_too_large"));
  });
  req.on("end", () => {
    try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("invalid_json")); }
  });
  req.on("error", reject);
});

const normalise = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const configured = (name) => name === "gemini"
  ? Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
  : name === "openrouter" ? Boolean(process.env.OPENROUTER_API_KEY) : false;

const providerOrder = () => {
  const requested = String(process.env.AI_PROVIDER || "auto").toLowerCase();
  const preference = requested === "openrouter" ? ["openrouter", "gemini"] : ["gemini", "openrouter"];
  return preference.filter(configured);
};

const modelFor = (name) => name === "openrouter"
  ? (process.env.OPENROUTER_MODEL || "openai/gpt-4o")
  : (process.env.GEMINI_MODEL || process.env.AI_MODEL || "gemini-3.6-flash");

const loadDocument = async () => {
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", pdfPath, "-"], { maxBuffer: 64 * 1024 * 1024 });
    documentState.text = stdout;
    documentState.pages = stdout.split("\f").map((page) => page.trim()).filter(Boolean);
    documentState.loaded = documentState.pages.length > 0;
    documentState.error = documentState.loaded ? null : "document_empty";
  } catch (error) {
    documentState.error = error.code === "ENOENT" ? "pdftotext_not_installed" : error.message;
  }
};

const sourceContext = () => sources.map((item) => `${item.id} | ${item.chapter} | ${item.label} | ${item.summary}`).join("\n");
const sectionContext = () => sections.map((item) => `${item.id} | ${item.title} | competency=${item.competencyId} | prerequisite=${item.prerequisite || "none"}`).join("\n");

const queryTerms = (query) => normalise(query).split(/[^a-z0-9]+/).filter((term) => term.length > 2);
const relevantDocumentContext = (query, maxPages = 3) => {
  if (!documentState.loaded) return "PDF chưa được nạp trong phiên này.";
  const terms = new Set(queryTerms(query));
  const scored = documentState.pages.map((page, index) => {
    const words = normalise(page);
    const score = [...terms].reduce((total, term) => total + (words.includes(term) ? 1 : 0), 0);
    return { index, score, page };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, maxPages);
  const selected = scored.length ? scored : documentState.pages.slice(0, 2).map((page, index) => ({ index, page }));
  return selected.map((item) => `[PDF page ${item.index + 1}]\n${item.page.slice(0, 2200)}`).join("\n\n").slice(0, 7000);
};

const systemPrompt = (route, input) => `You are Pathwise, a bounded Vietnamese learning-path agent for a learner who wants to become an AI Engineer. Route: ${route}. Use only the mapped topic and PDF excerpts below. Return JSON only. Never invent learner facts, scores, IDs or citations. The deterministic application owns answer scoring, pass/fail and section unlocks. If evidence is insufficient, return no_evidence and explain the limit.

Mapped sources:
${sourceContext()}

Allowed sections:
${sectionContext()}

Document-grounded excerpts from ${topicContext.documentName}:
${relevantDocumentContext(JSON.stringify(input))}`;

const schemas = {
  analyze: {
    type: "object",
    properties: {
      status: { type: "string" },
      confidence: { type: "number" },
      competency_gaps: { type: "array", items: { type: "object", properties: { competency_id: { type: "string" }, severity: { type: "string" }, reason: { type: "string" }, source_ids: { type: "array", items: { type: "string" } } }, required: ["competency_id", "severity", "reason", "source_ids"] } },
      recommended_path: { type: "array", items: { type: "object", properties: { section_id: { type: "string" }, reason: { type: "string" }, estimated_minutes: { type: "integer" } }, required: ["section_id", "reason", "estimated_minutes"] } },
      next_action: { type: "string" },
      reason: { type: "string" },
    },
    required: ["status", "confidence", "competency_gaps", "recommended_path", "next_action", "reason"],
  },
  tutor: {
    type: "object",
    properties: { status: { type: "string" }, answer: { type: "string" }, confidence: { type: "number" }, source_ids: { type: "array", items: { type: "string" } }, handoff: { type: "string" } },
    required: ["status", "answer", "confidence", "source_ids", "handoff"],
  },
  remediation: {
    type: "object",
    properties: { status: { type: "string" }, explanation: { type: "string" }, micro_tasks: { type: "array", items: { type: "string" } }, transfer_question: { type: "string" }, source_ids: { type: "array", items: { type: "string" } }, confidence: { type: "number" } },
    required: ["status", "explanation", "micro_tasks", "transfer_question", "source_ids", "confidence"],
  },
};

const parseModel = (value) => JSON.parse(String(value).trim().replace(/^```json\s*/i, "").replace(/\s*```$/, ""));
const fetchJson = async (url, options) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS || 12000));
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();
    if (!response.ok) throw new Error(`provider_http_${response.status}`);
    return JSON.parse(body);
  } finally { clearTimeout(timer); }
};

const callProvider = async (name, route, input) => {
  const prompt = `Complete this bounded task using the mapped PDF evidence. Return exactly one JSON object matching this schema and field names: ${JSON.stringify(schemas[route])}. Input: ${JSON.stringify(input)}`;
  if (name === "gemini") {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const response = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelFor(name))}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(route, input) }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: schemas[route] },
      }),
    });
    const rawResponse = response.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    return { data: parseModel(rawResponse), prompt, rawResponse };
  }
  const response = await fetchJson("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      ...(process.env.OPENROUTER_HTTP_REFERER ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER } : {}),
      ...(process.env.OPENROUTER_TITLE ? { "X-Title": process.env.OPENROUTER_TITLE } : {}),
    },
    body: JSON.stringify({ model: modelFor(name), messages: [{ role: "system", content: systemPrompt(route, input) }, { role: "user", content: prompt }], temperature: 0.2, max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS || 800), response_format: { type: "json_object" } }),
  });
  const rawResponse = response.choices?.[0]?.message?.content || "";
  return { data: parseModel(rawResponse), prompt, rawResponse };
};

const sectionForCompetency = (id) => sections.find((item) => item.competencyId === id);
const validSources = (ids = []) => [...new Set((Array.isArray(ids) ? ids : []).filter((id) => sourceIds.has(id)))];
const safeAnalysis = (data) => ({
  ...data,
  confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)),
  competency_gaps: (Array.isArray(data.competency_gaps) ? data.competency_gaps : []).filter((item) => competencyIds.has(item.competency_id)).map((item) => ({ ...item, source_ids: validSources(item.source_ids) })),
  recommended_path: (Array.isArray(data.recommended_path) ? data.recommended_path : []).filter((item) => sectionIds.has(item.section_id)).map((item) => ({ ...item, estimated_minutes: Number(item.estimated_minutes) || sections.find((section) => section.id === item.section_id).duration })),
});
const safeTutor = (data) => ({ ...data, confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)), source_ids: validSources(data.source_ids) });
const safeRemediation = (data) => ({ ...data, confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)), source_ids: validSources(data.source_ids), micro_tasks: Array.isArray(data.micro_tasks) ? data.micro_tasks.slice(0, 4) : [] });

const validateProviderResult = (route, data) => {
  if (!data || typeof data !== "object") throw new Error("provider_invalid_json_object");
  if (route === "analyze" && (!Array.isArray(data.competency_gaps) || !Array.isArray(data.recommended_path) || typeof data.reason !== "string")) throw new Error("provider_invalid_analyze_schema");
  if (route === "tutor" && (typeof data.status !== "string" || typeof data.answer !== "string" || !Array.isArray(data.source_ids))) throw new Error("provider_invalid_tutor_schema");
  if (route === "remediation" && (typeof data.explanation !== "string" || !Array.isArray(data.micro_tasks) || typeof data.transfer_question !== "string" || !Array.isArray(data.source_ids))) throw new Error("provider_invalid_remediation_schema");
  return data;
};

const sourceDiscoveryPrompt = (input) => {
  const section = sections.find((item) => item.id === input.section_id);
  const topic = section ? `${section.title}. ${section.sourceIds.join(", ")}` : input.query;
  return `You are a source curator for an AI Engineer learning path. Find a small set of trustworthy, current learning sources for this section: ${topic}. Prefer official documentation, official courses, universities, standards, or original research. Do not recommend generic SEO blogs, social posts, or sources you cannot verify. Return JSON only with this shape: {"sources":[{"title":"...","publisher":"...","url":"https://...","domain":"...","type":"Official documentation|Official course|Academic paper|University material","summary":"...","why_selected":"..."}],"note":"..."}. Every URL must be https and must be on one of these preferred domains when relevant: developers.google.com, scikit-learn.org, pytorch.org, tensorflow.org, huggingface.co, docs.python.org, kaggle.com, arxiv.org, or a university domain. Query: ${JSON.stringify(input.query || "")}`;
};

const sourceDiscoverySchema = {
  type: "object",
  properties: {
    sources: { type: "array", items: { type: "object", properties: { title: { type: "string" }, publisher: { type: "string" }, url: { type: "string" }, domain: { type: "string" }, type: { type: "string" }, summary: { type: "string" }, why_selected: { type: "string" } }, required: ["title", "publisher", "url", "summary"] } },
    note: { type: "string" },
  },
  required: ["sources", "note"],
};

const learningPackageSchema = {
  type: "object",
  properties: {
    status: { type: "string" },
    objective: { type: "string" },
    concepts: { type: "array", items: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"] } },
    example: { type: "string" },
    practice_steps: { type: "array", items: { type: "string" } },
    transfer_question: { type: "string" },
    source_urls: { type: "array", items: { type: "string" } },
    estimated_minutes: { type: "integer" },
  },
  required: ["status", "objective", "concepts", "example", "practice_steps", "transfer_question", "source_urls", "estimated_minutes"],
};

const callSourceProvider = async (name, input) => {
  const prompt = sourceDiscoveryPrompt(input);
  if (name === "gemini") {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const response = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelFor(name))}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Use Google Search grounding when current public sources are needed. Do not invent URLs. Return only the requested JSON." }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: sourceDiscoverySchema },
      }),
    });
    return parseModel(response.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join(""));
  }
  const response = await fetchJson("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({
      model: modelFor(name),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS || 800),
      response_format: { type: "json_object" },
      tools: [{ type: "openrouter:web_search", parameters: { engine: "auto", max_results: 5, max_total_results: 5, search_context_size: "low" } }],
    }),
  });
  const content = response.choices?.[0]?.message?.content;
  return parseModel(Array.isArray(content) ? content.map((part) => part.text || "").join("") : content);
};

const runSourceDiscovery = async (input) => {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const attempts = [];
  const maxResults = Math.max(3, Math.min(8, Number(process.env.SOURCE_DISCOVERY_MAX_RESULTS || 5)));
  for (const candidate of providerOrder()) {
    try {
      const result = await callSourceProvider(candidate, input);
      const sourcesFound = sanitizeSources(result.sources, maxResults);
      if (!sourcesFound.length) throw new Error("provider_no_verified_sources");
      const meta = { request_id: requestId, route: "sources", provider: candidate, model: modelFor(candidate), live: true, fallback_reason: null, attempts, latency_ms: Date.now() - started };
      try { await fs.appendFile(traceFile, `${JSON.stringify({ ...meta, source_count: sourcesFound.length })}\n`); } catch {}
      return { data: { status: "ok", query: input.query || "", note: result.note || "Nguồn đã được lọc theo allowlist.", sources: sourcesFound }, meta };
    } catch (error) {
      attempts.push({ provider: candidate, reason: error.name === "AbortError" ? "timeout" : error.message });
    }
  }
  const fallbackSources = discoverCatalogSources(input.query || input.section_id, maxResults);
  const meta = { request_id: requestId, route: "sources", provider: "curated-catalog", model: null, live: false, fallback_reason: attempts[attempts.length - 1]?.reason || "no_provider_configured", attempts, latency_ms: Date.now() - started };
  try { await fs.appendFile(traceFile, `${JSON.stringify({ ...meta, source_count: fallbackSources.length })}\n`); } catch {}
  return { data: { status: "catalog", query: input.query || "", note: "Tạm dùng catalog nguồn chính thống đã kiểm duyệt; bạn có thể tìm lại khi AI provider sẵn sàng.", sources: fallbackSources }, meta };
};

const packagePrompt = (input, section, sourcesForPackage) => `You are a bounded Vietnamese instructional designer for an AI Engineer learning path. Create one concise learning package for the section below using only the provided verified sources. Do not invent facts, URLs, learner scores, or citations. The package must be practical for a ${input.level || "beginner-to-intermediate"} learner and fit about ${input.minutes || section.duration} minutes. Return JSON only matching this schema: ${JSON.stringify(learningPackageSchema)}. Section: ${JSON.stringify({ title: section.title, objective: section.objective || section.title, source_ids: section.sourceIds })}. Verified sources: ${JSON.stringify(sourcesForPackage)}. Make concepts actionable, include one ML/product example, 2-4 practice steps, one transfer question, and echo only source URLs actually used.`;

const validateLearningPackage = (data, section, sourcesForPackage) => {
  if (!data || typeof data !== "object" || !Array.isArray(data.concepts) || !Array.isArray(data.practice_steps) || !Array.isArray(data.source_urls)) throw new Error("provider_invalid_learning_package");
  const validUrls = new Set(sourcesForPackage.map((source) => source.url));
  const sourceUrls = data.source_urls.filter((url) => validUrls.has(url));
  if (!data.objective || !data.example || !data.transfer_question || !sourceUrls.length) throw new Error("provider_unverified_learning_package");
  return {
    status: "ok",
    objective: String(data.objective).slice(0, 600),
    concepts: data.concepts.slice(0, 4).map((concept) => ({ title: String(concept.title).slice(0, 140), body: String(concept.body).slice(0, 700) })),
    example: String(data.example).slice(0, 900),
    practice_steps: data.practice_steps.slice(0, 4).map((step) => String(step).slice(0, 300)),
    transfer_question: String(data.transfer_question).slice(0, 500),
    source_urls: sourceUrls,
    estimated_minutes: Math.max(5, Math.min(90, Number(data.estimated_minutes) || section.duration)),
  };
};

const fallbackLearningPackage = (section, sourcesForPackage) => ({
  status: "catalog",
  objective: `Sau section này, bạn có thể giải thích và áp dụng ${section.title} trong một bài toán AI Engineer.`,
  concepts: [
    { title: `Khái niệm cốt lõi của ${section.title}`, body: `Nắm định nghĩa, đầu vào và đầu ra của ${section.title} trước khi chọn model hoặc công cụ.` },
    { title: "Quyết định trong thực tế", body: "Liên hệ khái niệm với dữ liệu, metric và trade-off của một sản phẩm ML." },
  ],
  example: `Chọn một bài toán sản phẩm và mô tả ${section.title} ảnh hưởng thế nào đến quyết định triển khai.`,
  practice_steps: ["Viết định nghĩa bằng một câu.", "Nêu một ví dụ dữ liệu hoặc sản phẩm.", "Chọn một metric hoặc cách kiểm tra kết quả và giải thích lý do."],
  transfer_question: `Trong một bài toán AI Engineer thực tế, bạn sẽ áp dụng ${section.title} ở bước nào và đo kết quả ra sao?`,
  source_urls: sourcesForPackage.map((source) => source.url),
  estimated_minutes: section.duration,
});

const runLearningPackage = async (input) => {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const section = sections.find((item) => item.id === input.section_id);
  if (!section) return { data: { status: "no_evidence", reason: "section_not_found" }, meta: { request_id: requestId, route: "learning-package", live: false } };
  const sourcesForPackage = sanitizeSources(input.sources, 6);
  if (!sourcesForPackage.length) return { data: fallbackLearningPackage(section, discoverCatalogSources(section.title, 3)), meta: { request_id: requestId, route: "learning-package", provider: "curated-catalog", live: false, fallback_reason: "no_verified_sources", latency_ms: Date.now() - started } };
  const attempts = [];
  for (const candidate of providerOrder()) {
    try {
      const prompt = packagePrompt(input, section, sourcesForPackage);
      let response;
      if (candidate === "gemini") {
        const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        response = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelFor(candidate))}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: "Use only the verified sources in the request. Return JSON only." }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: learningPackageSchema } }),
        });
        response = parseModel(response.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join(""));
      } else {
        response = await fetchJson("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
          body: JSON.stringify({ model: modelFor(candidate), messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS || 800), response_format: { type: "json_object" } }),
        });
        const content = response.choices?.[0]?.message?.content;
        response = parseModel(Array.isArray(content) ? content.map((part) => part.text || "").join("") : content);
      }
      const data = validateLearningPackage(response, section, sourcesForPackage);
      const meta = { request_id: requestId, route: "learning-package", provider: candidate, model: modelFor(candidate), live: true, fallback_reason: null, attempts, latency_ms: Date.now() - started };
      try { await fs.appendFile(traceFile, `${JSON.stringify({ ...meta, source_count: data.source_urls.length })}\n`); } catch {}
      return { data, meta };
    } catch (error) {
      attempts.push({ provider: candidate, reason: error.name === "AbortError" ? "timeout" : error.message });
    }
  }
  const data = fallbackLearningPackage(section, sourcesForPackage);
  const meta = { request_id: requestId, route: "learning-package", provider: "curated-catalog", model: null, live: false, fallback_reason: attempts[attempts.length - 1]?.reason || "no_provider_configured", attempts, latency_ms: Date.now() - started };
  try { await fs.appendFile(traceFile, `${JSON.stringify({ ...meta, source_count: data.source_urls.length })}\n`); } catch {}
  return { data, meta };
};

const fallback = (route, input) => {
  if (route === "tutor") {
    const question = normalise(input.message);
    if (["luong", "bong da", "thoi tiet", "dat ve", "luong"].some((term) => question.includes(term))) return { status: "no_evidence", answer: "Mình chưa có căn cứ trong tài liệu Grokking Machine Learning cho câu hỏi này, nên không nên đoán. Bạn có thể hỏi về problem framing, supervised learning, regression, overfitting, classification hoặc model evaluation.", confidence: 0.08, source_ids: [], handoff: "Đổi câu hỏi về phạm vi tài liệu hoặc hỏi mentor." };
    if (question.includes("overfit") || question.includes("validation") || question.includes("regularization")) return { status: "ok", answer: "Overfitting là khi model bám quá sát dữ liệu huấn luyện nên hoạt động kém trên dữ liệu chưa thấy. Validation set và regularization là hai công cụ giúp đánh giá và kiểm soát độ phức tạp của model.", confidence: 0.88, source_ids: ["GML-CH04"], handoff: "" };
    if (question.includes("supervised") || question.includes("unsupervised") || question.includes("reinforcement") || question.includes("nhan")) return { status: "ok", answer: "Supervised learning học từ dữ liệu có nhãn; unsupervised learning tìm cấu trúc trong dữ liệu chưa có nhãn; reinforcement learning học qua tín hiệu phần thưởng từ tương tác.", confidence: 0.9, source_ids: ["GML-CH02"], handoff: "" };
    if (question.includes("regression") || question.includes("hoi quy")) return { status: "ok", answer: "Regression dùng dữ liệu để dự đoán giá trị liên tục. Linear regression tìm một quan hệ tuyến tính phù hợp và dùng error function để đo mức lệch giữa dự đoán với giá trị thực.", confidence: 0.88, source_ids: ["GML-CH03"], handoff: "" };
    if (question.includes("accuracy") || question.includes("classifier") || question.includes("classification")) return { status: "ok", answer: "Accuracy là tỷ lệ dự đoán đúng, nhưng chưa đủ trong mọi tình huống. Khi lớp mất cân bằng hoặc false positive và false negative có chi phí khác nhau, cần xem thêm metric phù hợp.", confidence: 0.86, source_ids: ["GML-CH05-08"], handoff: "" };
    if (["perceptron", "logistic", "roc", "bayes"].some((term) => question.includes(term))) return { status: "ok", answer: "Đây là các nội dung thuộc nhóm classification và evaluation. Hãy đối chiếu với loại dữ liệu, loại lỗi và metric cần theo dõi thay vì chỉ nhìn một con số accuracy.", confidence: 0.78, source_ids: ["GML-CH05-08"], handoff: "" };
    if (["decision tree", "neural", "ensemble", "support vector", "gradient", "xgboost"].some((term) => question.includes(term))) return { status: "ok", answer: "Đây là các họ model khác nhau; nên so sánh chúng bằng cùng quy trình validation, metric và trade-off triển khai phù hợp với bài toán.", confidence: 0.78, source_ids: ["GML-CH09-12"], handoff: "" };
    if (question.includes("data engineering") || question.includes("thuc te") || question.includes("practice") || question.includes("real-life")) return { status: "ok", answer: "Một hệ thống ML thực tế không chỉ có model; cần kết nối dữ liệu, quy trình xử lý và cách theo dõi chất lượng sau triển khai.", confidence: 0.76, source_ids: ["GML-CH13"], handoff: "" };
    if (question.includes("machine learning") || question.includes("rule-based")) return { status: "ok", answer: "Machine learning học một quy luật từ dữ liệu để tạo dự đoán hoặc quyết định cho trường hợp mới, thay vì chỉ chạy một tập luật cố định.", confidence: 0.86, source_ids: ["GML-CH01"], handoff: "" };
    return { status: "no_evidence", answer: "Mình chưa đủ tín hiệu để trả lời chắc từ phần tài liệu đã map. Hãy hỏi cụ thể hơn về cách đặt bài toán, loại learning, regression, overfitting hoặc đánh giá classification.", confidence: 0.35, source_ids: [], handoff: "Thu hẹp câu hỏi về một khái niệm trong tài liệu." };
  }
  if (route === "remediation") {
    const section = sections.find((item) => item.id === input.section_id) || sections[0];
    const competency = competencies.find((item) => item.id === section.competencyId);
    return { status: "ok", explanation: `Ôn lại ${competency.title} bằng định nghĩa, một ví dụ và một quyết định mô hình. Sau đó tự giải thích lại trước khi retest.`, micro_tasks: ["Viết định nghĩa khái niệm bằng một câu.", "Nêu một ví dụ dữ liệu hoặc sản phẩm.", "Chọn một cách kiểm tra model và giải thích lý do."], transfer_question: `Trong một bài toán AI Engineer thực tế, bạn sẽ áp dụng ${competency.title} ở bước nào?`, source_ids: competency.sourceIds, confidence: 0.74 };
  }
  const wrong = (input.answers || []).filter((answer) => answer.is_correct === false);
  const gapIds = [...new Set(wrong.map((answer) => answer.competency_id).filter((id) => competencyIds.has(id)))];
  const selectedSections = (gapIds.length ? gapIds : ["ml-foundations"]).map(sectionForCompetency).filter(Boolean);
  return {
    status: "ok",
    confidence: 0.78,
    competency_gaps: gapIds.map((id) => { const competency = competencies.find((item) => item.id === id); return { competency_id: id, severity: "high", reason: `Diagnostic cho thấy cần củng cố ${competency.title} trước khi học phần phụ thuộc.`, source_ids: competency.sourceIds }; }),
    recommended_path: selectedSections.map((section) => ({ section_id: section.id, reason: `Ưu tiên ${section.title} theo tín hiệu diagnostic và prerequisite.`, estimated_minutes: section.duration })),
    next_action: "study",
    reason: gapIds.length ? `Đã sắp xếp ${gapIds.length} competency cần ưu tiên từ kết quả diagnostic.` : "Diagnostic chưa chỉ ra gap rõ; bắt đầu từ nền tảng để xác nhận cách đặt bài toán.",
  };
};

const runAgent = async (route, input) => {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const attempts = [];
  let data;
  let modelTrace = null;
  let live = false;
  let selectedProvider = null;
  for (const candidate of providerOrder()) {
    try {
      const providerResult = await callProvider(candidate, route, input);
      data = validateProviderResult(route, providerResult.data);
      modelTrace = { prompt: providerResult.prompt, rawResponse: providerResult.rawResponse };
      selectedProvider = candidate;
      live = true;
      break;
    } catch (error) {
      attempts.push({ provider: candidate, reason: error.name === "AbortError" ? "timeout" : error.message });
    }
  }
  if (!data) data = fallback(route, input);
  if (route === "analyze") data = safeAnalysis(data);
  if (route === "tutor") data = safeTutor(data);
  if (route === "remediation") data = safeRemediation(data);
  const meta = { request_id: requestId, route, provider: live ? selectedProvider : "deterministic-fallback", model: live ? modelFor(selectedProvider) : null, live, fallback_reason: attempts[attempts.length - 1]?.reason || null, attempts, document_loaded: documentState.loaded, latency_ms: Date.now() - started };
  await writeTrace({
    ...meta,
    input,
    prompt: modelTrace?.prompt || null,
    raw_response: modelTrace?.rawResponse || null,
    output: data,
    status: data.status,
    source_ids: data.source_ids || [],
  });
  return { data, meta };
};

const api = async (req, res, url) => {
  const { pathname } = url;
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method === "GET" && pathname === "/api/health") return json(res, 200, {
    ok: true,
    topic: topicContext.title,
    document: { loaded: documentState.loaded, file_name: documentState.fileName, pages: documentState.pages.length, error: documentState.error },
    providers: { order: providerOrder(), gemini: configured("gemini"), openrouter: configured("openrouter") },
    database: { configured: Boolean(process.env.DATABASE_URL), ready: Boolean(dbPool && !dbInitError), error: dbInitError },
  });
  if (req.method === "GET" && pathname === "/api/session") {
    if (!dbPool) return json(res, 200, { enabled: false, state: null });
    try {
      const session = await loadSession(url.searchParams.get("session_key"));
      return json(res, 200, { enabled: true, state: session?.state || null, updated_at: session?.updated_at || null });
    } catch (error) {
      return json(res, 503, { enabled: true, error: "database_unavailable", detail: error.message });
    }
  }
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  let input;
  try { input = await bodyOf(req); } catch (error) { return json(res, 400, { error: error.message }); }
  if (pathname === "/api/session") {
    if (!dbPool) return json(res, 503, { enabled: false, error: "database_not_configured" });
    try {
      const saved = await saveSession(input.session_key, input.state);
      return saved ? json(res, 200, { enabled: true, saved: true }) : json(res, 400, { enabled: true, error: "invalid_session" });
    } catch (error) {
      return json(res, 503, { enabled: true, error: "database_unavailable", detail: error.message });
    }
  }
  const route = pathname === "/api/learning/analyze" ? "analyze" : pathname === "/api/tutor" ? "tutor" : pathname === "/api/remediation" ? "remediation" : null;
  if (pathname === "/api/sources/discover") return json(res, 200, await runSourceDiscovery(input));
  if (pathname === "/api/learning/package") return json(res, 200, await runLearningPackage(input));
  return route ? json(res, 200, await runAgent(route, input)) : json(res, 404, { error: "api_route_not_found" });
};

const serve = async (req, res, pathname) => {
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const file = path.resolve(codebaseDir, requested);
  if (!file.startsWith(`${codebaseDir}${path.sep}`)) return text(res, 403, "Forbidden");
  try {
    const data = await fs.readFile(file);
    const type = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" }[path.extname(file)] || "application/octet-stream";
    return text(res, 200, data, type);
  } catch { return text(res, 404, "Not found"); }
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) return api(req, res, url);
  if (req.method !== "GET" && req.method !== "HEAD") return text(res, 405, "Method not allowed");
  return serve(req, res, url.pathname);
});

Promise.all([loadDocument(), initDatabase()]).finally(() => server.listen(port, "0.0.0.0", () => console.log(`Pathwise server running at http://localhost:${port} · document=${documentState.loaded ? documentState.fileName : documentState.error} · providers=${providerOrder().join(",") || "fallback"} · database=${dbPool && !dbInitError ? "ready" : "disabled"}`)));
