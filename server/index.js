"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { URL } = require("node:url");
const vm = require("node:vm");
const {
  topicContext,
  sources,
  sections,
  competencies,
  diagnosticQuestions,
  sourceIds,
  sectionIds,
  competencyIds,
  roadmapReference,
} = require("./topic-context");
const { discoverCatalogSources, sanitizeSources } = require("./source-catalog");

const execFileAsync = promisify(execFile);
const port = Number(process.env.PORT || 4173);
const rootDir = path.resolve(__dirname, "..");
const codebaseDir = path.join(rootDir, "codebase");
const documentPdfUrl = String(process.env.DOCUMENT_PDF_URL || "").trim();
const documentCachePath = process.env.DOCUMENT_PDF_CACHE_PATH || path.join("/tmp", "pathwise-document.pdf");
const pdfImageCacheDir = path.join("/tmp", "pathwise-pdf-pages");
const pdfPath = documentPdfUrl ? documentCachePath : (process.env.DOCUMENT_PDF_PATH || path.join(rootDir, "Grokking Machine Learning-vi.pdf"));
const documentFileName = documentPdfUrl ? "Grokking Machine Learning.pdf" : path.basename(pdfPath);
// Poppler is installed through winget on Windows. An explicit override keeps
// production portable while the local fallback works before a shell restart.
const pdftotextPath = process.env.PDFTOTEXT_PATH || (process.platform === "win32"
  ? path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages", "oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe", "poppler-25.07.0", "Library", "bin", "pdftotext.exe")
  : "pdftotext");
const pdftoppmPath = process.env.PDFTOPPM_PATH || (process.platform === "win32"
  ? path.join(path.dirname(pdftotextPath), "pdftoppm.exe")
  : "pdftoppm");
const traceFile = process.env.AI_TRACE_FILE || "/tmp/pathwise-agent-trace.jsonl";

const traceLimit = 12000;
let dbPool = null;
let dbInitError = null;
let contentCatalogReady = false;
const contentCatalogVersion = process.env.CONTENT_CATALOG_VERSION || "seed-v1";
const memoryUsers = new Map();
const memoryAuthSessions = new Map();
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
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS learning_sessions (
        session_key TEXT PRIMARY KEY,
        user_id TEXT,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS content_catalog (
        topic_id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        content JSONB NOT NULL,
        is_published BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE learning_sessions ADD COLUMN IF NOT EXISTS user_id TEXT;
      CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
      CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at)
    `);
    await seedContentCatalog();
  } catch (error) {
    dbInitError = error.message;
  }
};

const sessionKeyIsValid = (value) => typeof value === "string" && value.trim().length >= 3 && value.trim().length <= 160;
const scopedSessionKey = (userId, sessionKey) => `${userId}:${String(sessionKey).trim()}`.slice(0, 160);
const loadSession = async (userId, sessionKey) => {
  if (!dbPool || !sessionKeyIsValid(sessionKey) || !userId) return null;
  const result = await dbPool.query("SELECT state, updated_at FROM learning_sessions WHERE session_key = $1 AND user_id = $2", [scopedSessionKey(userId, sessionKey), userId]);
  return result.rows[0] || null;
};
const saveSession = async (userId, sessionKey, state) => {
  if (!dbPool || !userId || !sessionKeyIsValid(sessionKey) || !state || typeof state !== "object" || Array.isArray(state)) return false;
  await dbPool.query(
    "INSERT INTO learning_sessions (session_key, user_id, state, updated_at) VALUES ($1, $2, $3::jsonb, NOW()) ON CONFLICT (session_key) DO UPDATE SET user_id = EXCLUDED.user_id, state = EXCLUDED.state, updated_at = NOW()",
    [scopedSessionKey(userId, sessionKey), userId, JSON.stringify(state)],
  );
  return true;
};

const readContentCatalogSeed = async () => {
  const sourcePath = path.join(codebaseDir, "content-pack.js");
  const source = await fs.readFile(sourcePath, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: sourcePath, timeout: 1000 });
  const content = sandbox.window.CONTENT_PACK;
  if (!content?.topic?.id || !Array.isArray(content.sections) || !Array.isArray(content.sources)) throw new Error("content_catalog_seed_invalid");
  return content;
};

const seedContentCatalog = async () => {
  const content = await readContentCatalogSeed();
  const existing = await dbPool.query("SELECT version FROM content_catalog WHERE topic_id = $1", [content.topic.id]);
  if (!existing.rows[0] || existing.rows[0].version !== contentCatalogVersion) {
    await dbPool.query(
      "INSERT INTO content_catalog (topic_id, version, content, is_published, updated_at) VALUES ($1, $2, $3::jsonb, TRUE, NOW()) ON CONFLICT (topic_id) DO UPDATE SET version = EXCLUDED.version, content = EXCLUDED.content, is_published = TRUE, updated_at = NOW()",
      [content.topic.id, contentCatalogVersion, JSON.stringify(content)],
    );
  }
  contentCatalogReady = true;
};

const normaliseEmail = (value) => String(value || "").trim().toLowerCase();
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, created_at: user.created_at || user.createdAt });
const passwordIsValid = (value) => typeof value === "string" && value.length >= 6 && value.length <= 200;
const emailIsValid = (value) => /^\S+@\S+\.\S+$/.test(value);
const hashPassword = async (password, salt = crypto.randomBytes(16)) => {
  const derived = await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key)));
  return `scrypt$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
};
const verifyPassword = async (password, stored) => {
  const [, saltText, digestText] = String(stored || "").split("$");
  if (!saltText || !digestText) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(digestText, "base64url");
    const derived = await new Promise((resolve, reject) => crypto.scrypt(password, salt, expected.length, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key)));
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  } catch { return false; }
};
const tokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const createAccessToken = () => crypto.randomBytes(32).toString("base64url");
const authTokenFromRequest = (req) => {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
};
const saveAuthSession = async (userId) => {
  const token = createAccessToken();
  const hash = tokenHash(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (dbPool) {
    await dbPool.query("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [hash, userId, expiresAt]);
  } else {
    memoryAuthSessions.set(hash, { userId, expiresAt: expiresAt.toISOString() });
  }
  return { token, expiresAt };
};
const deleteAuthSession = async (token) => {
  if (!token) return;
  const hash = tokenHash(token);
  if (dbPool) await dbPool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [hash]);
  else memoryAuthSessions.delete(hash);
};
const userById = async (userId) => {
  if (!userId) return null;
  if (dbPool) {
    const result = await dbPool.query("SELECT id, name, email, created_at FROM users WHERE id = $1", [userId]);
    return result.rows[0] || null;
  }
  return memoryUsers.get(userId) || null;
};
const userByEmail = async (email) => {
  if (dbPool) {
    const result = await dbPool.query("SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1", [email]);
    return result.rows[0] || null;
  }
  return [...memoryUsers.values()].find((user) => user.email === email) || null;
};
const createUser = async ({ name, email, password }) => {
  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();
  if (dbPool) {
    const result = await dbPool.query("INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email, created_at", [id, name, email, passwordHash]);
    return result.rows[0];
  }
  const user = { id, name, email, password_hash: passwordHash, created_at: new Date().toISOString() };
  memoryUsers.set(id, user);
  return user;
};
const authenticatedUser = async (req) => {
  const token = authTokenFromRequest(req);
  if (!token) return null;
  const hash = tokenHash(token);
  if (dbPool) {
    const result = await dbPool.query("SELECT u.id, u.name, u.email, u.created_at FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()", [hash]);
    if (!result.rows[0]) return null;
    await dbPool.query("UPDATE auth_sessions SET last_seen_at = NOW() WHERE token_hash = $1", [hash]);
    return result.rows[0];
  }
  const session = memoryAuthSessions.get(hash);
  if (!session || new Date(session.expiresAt) <= new Date()) { memoryAuthSessions.delete(hash); return null; }
  return userById(session.userId);
};

const documentState = {
  loaded: false,
  path: pdfPath,
  fileName: documentFileName,
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
  ? (process.env.OPENROUTER_MODEL || "openrouter/free")
  : (process.env.GEMINI_MODEL || process.env.AI_MODEL || "gemini-3.6-flash");

const downloadDocument = async () => {
  if (!documentPdfUrl) return;
  let parsedUrl;
  try {
    parsedUrl = new URL(documentPdfUrl);
  } catch {
    throw new Error("document_url_invalid");
  }
  if (parsedUrl.protocol !== "https:") throw new Error("document_url_must_use_https");
  const timeoutMs = Number(process.env.DOCUMENT_PDF_TIMEOUT_MS || 20000);
  const response = await fetch(documentPdfUrl, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`document_download_http_${response.status}`);
  const content = Buffer.from(await response.arrayBuffer());
  if (content.length > 50 * 1024 * 1024) throw new Error("document_too_large");
  if (content.subarray(0, 5).toString() !== "%PDF-") throw new Error("document_not_pdf");
  await fs.mkdir(path.dirname(documentCachePath), { recursive: true });
  await fs.writeFile(documentCachePath, content);
};

const loadDocument = async () => {
  try {
    await downloadDocument();
    const { stdout } = await execFileAsync(pdftotextPath, ["-layout", pdfPath, "-"], { maxBuffer: 64 * 1024 * 1024 });
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

// The slide itself is a teaching aid. This resolver is deliberately separate
// so that the learner can inspect the original PDF page and its full text.
const relevantDocumentPages = (query, maxPages = 2) => {
  if (!documentState.loaded) return [];
  const terms = new Set(queryTerms(query));
  const scored = documentState.pages.map((page, index) => {
    const words = normalise(page);
    const score = [...terms].reduce((total, term) => total + (words.includes(term) ? 1 : 0), 0);
    return { index, score, text: page };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, maxPages);
  const selected = scored.length ? scored : documentState.pages.slice(0, maxPages).map((text, index) => ({ index, score: 0, text }));
  return selected.map((item) => ({ page: item.index + 1, text: item.text, relevance: item.score }));
};

const systemPrompt = (route, input) => `You are Pathwise, a bounded Vietnamese learning-path agent for a learner who wants to become an AI Engineer. Route: ${route}. Use only the mapped topic and PDF excerpts below. Return JSON only. Never invent learner facts, scores, IDs or citations. The deterministic application owns answer scoring, pass/fail and section unlocks. If evidence is insufficient, return no_evidence and explain the limit.

Mapped sources:
${sourceContext()}

Allowed sections:
${sectionContext()}

Document-grounded excerpts from ${topicContext.documentName}:
${relevantDocumentContext(JSON.stringify(input))}

External orientation reference (link only; do not reproduce its content): ${roadmapReference.url}`;

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
  assessment: {
    type: "object",
    properties: {
      status: { type: "string" },
      mode: { type: "string" },
      question_count: { type: "integer" },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            section_id: { type: "string" },
            competency_id: { type: "string" },
            label: { type: "string" },
            prompt: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            correct_index: { type: "integer" },
            explanation: { type: "string" },
            source_ids: { type: "array", items: { type: "string" } },
          },
          required: ["id", "section_id", "competency_id", "label", "prompt", "options", "correct_index", "explanation", "source_ids"],
        },
      },
    },
    required: ["status", "mode", "question_count", "questions"],
  },
};

const assessmentCount = (input) => {
  const mode = input.mode || "diagnostic";
  const inputSections = Array.isArray(input.sections) ? input.sections : [];
  if (mode === "mastery") {
    const section = inputSections.find((item) => item.id === input.section_id);
    return Math.max(3, Math.min(8, (section?.concepts?.length || section?.checklist?.length || 2) * 2));
  }
  const perSection = mode === "final" ? 2 : 2;
  return Math.max(mode === "final" ? 6 : 4, Math.min(mode === "final" ? 24 : 20, Math.max(1, inputSections.length) * perSection));
};

const assessmentLabel = (mode) => mode === "mastery" ? "Section mastery" : mode === "final" ? "Topic transfer" : "Diagnostic";

const fallbackAssessment = (input) => {
  const mode = input.mode || "diagnostic";
  const inputSections = (Array.isArray(input.sections) ? input.sections : []).filter((section) => section && section.id);
  const desired = assessmentCount(input);
  const sourceQuestions = Array.isArray(input.fallback_questions) ? input.fallback_questions : [];
  const questions = [];
  const addQuestion = (question, section, index) => {
    if (!section || questions.length >= desired) return;
    const sourceIds = validSources(question.source_ids || question.sourceIds || section.source_ids || section.sourceIds);
    if (!sourceIds.length) return;
    const concepts = Array.isArray(section.concepts) ? section.concepts : [];
    const concept = concepts[index % Math.max(1, concepts.length)] || { title: "mục tiêu section", body: section.objective || section.title };
    const generatedPrompt = mode === "mastery"
      ? `Trong section ${section.title}, người học cần vận dụng ${concept.title} như thế nào?`
      : mode === "final"
        ? `Khi áp dụng ${concept.title} của section ${section.title} vào bài toán thực tế, lựa chọn nào phù hợp nhất?`
        : `Trong nội dung ${section.title}, phát biểu nào mô tả đúng ${concept.title}?`;
    const generatedCorrect = String(concept.body || section.objective || section.title).slice(0, 220);
    const options = Array.isArray(question.options) && question.options.length >= 4
      ? question.options.slice(0, 4).map((option) => String(option))
      : [generatedCorrect, "Không cần xác định mục tiêu của section.", "Chỉ cần chọn model theo tên.", "Không cần dữ liệu để kiểm tra kết quả."];
    questions.push({
      id: `${mode}-fallback-${index + 1}`,
      section_id: section.id,
      competency_id: section.competency_id || section.competencyId || "ml-foundations",
      label: question.label || assessmentLabel(mode),
      prompt: question.prompt || `${generatedPrompt} (góc kiểm tra ${index + 1})`,
      options,
      correct_index: Number.isInteger(question.correct_index) ? question.correct_index : Number.isInteger(question.correctIndex) ? question.correctIndex : 0,
      explanation: question.explanation || `Câu hỏi được tạo từ mục tiêu và nội dung của section ${section.title}.`,
      source_ids: sourceIds,
    });
  };
  for (let index = 0; index < desired; index += 1) {
    const section = inputSections[index % Math.max(1, inputSections.length)] || sections[index % sections.length];
    addQuestion(sourceQuestions[index % Math.max(1, sourceQuestions.length)] || {}, section, index);
  }
  return { status: "fallback", mode, question_count: questions.length, questions };
};

const parseModel = (value) => JSON.parse(String(value).trim().replace(/^```json\s*/i, "").replace(/\s*```$/, ""));
const fetchJson = async (url, options, timeoutMs = Number(process.env.AI_TIMEOUT_MS || 12000)) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();
    if (!response.ok) throw new Error(`provider_http_${response.status}`);
    return JSON.parse(body);
  } finally { clearTimeout(timer); }
};

const callProvider = async (name, route, input) => {
  const modelInput = route === "assessment" ? Object.fromEntries(Object.entries(input).filter(([key]) => key !== "fallback_questions")) : input;
  const prompt = `Complete this bounded task using the mapped PDF evidence. Return exactly one JSON object matching this schema and field names: ${JSON.stringify(schemas[route])}. Input: ${JSON.stringify(modelInput)}`;
  if (name === "gemini") {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const response = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelFor(name))}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(route, modelInput) }] },
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
    body: JSON.stringify({ model: modelFor(name), messages: [{ role: "system", content: systemPrompt(route, modelInput) }, { role: "user", content: prompt }], temperature: 0.2, max_tokens: route === "assessment" ? Number(process.env.ASSESSMENT_MAX_TOKENS || 5000) : Number(process.env.OPENROUTER_MAX_TOKENS || 800), response_format: { type: "json_object" } }),
  });
  const rawResponse = response.choices?.[0]?.message?.content || "";
  return { data: parseModel(rawResponse), prompt, rawResponse };
};

const sectionForCompetency = (id) => sections.find((item) => item.competencyId === id);
const validSources = (ids = []) => [...new Set((Array.isArray(ids) ? ids : []).filter((id) => sourceIds.has(id)))];
const safeAnalysis = (data) => ({
  ...data,
  roadmap_ref: roadmapReference,
  confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)),
  competency_gaps: (Array.isArray(data.competency_gaps) ? data.competency_gaps : []).filter((item) => competencyIds.has(item.competency_id)).map((item) => ({ ...item, source_ids: validSources(item.source_ids) })),
  recommended_path: (Array.isArray(data.recommended_path) ? data.recommended_path : []).filter((item) => sectionIds.has(item.section_id)).map((item) => ({ ...item, estimated_minutes: Number(item.estimated_minutes) || sections.find((section) => section.id === item.section_id).duration })),
});
const safeTutor = (data) => ({ ...data, confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)), source_ids: validSources(data.source_ids) });
const safeRemediation = (data) => ({ ...data, confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)), source_ids: validSources(data.source_ids), micro_tasks: Array.isArray(data.micro_tasks) ? data.micro_tasks.slice(0, 4) : [] });
const safeAssessment = (data, input) => {
  const inputSections = Array.isArray(input.sections) ? input.sections : [];
  const sectionMap = new Map(inputSections.filter((section) => section?.id).map((section) => [section.id, section]));
  const seen = new Set();
  const questions = (Array.isArray(data.questions) ? data.questions : []).map((question, index) => {
    const section = sectionMap.get(question.section_id) || inputSections[index % Math.max(1, inputSections.length)] || sections[index % sections.length];
    if (!section) return null;
    const options = Array.isArray(question.options) ? question.options.map((option) => String(option || "").trim()).filter(Boolean).slice(0, 4) : [];
    const prompt = String(question.prompt || "").trim();
    const sourceIds = validSources(question.source_ids).filter((id) => !(section.source_ids || section.sourceIds) || (section.source_ids || section.sourceIds).includes(id));
    const correctIndex = Number(question.correct_index);
    const promptKey = normalise(prompt);
    if (!prompt || options.length !== 4 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3 || !sourceIds.length || seen.has(promptKey)) return null;
    seen.add(promptKey);
    return {
      id: String(question.id || `${input.mode || "assessment"}-${index + 1}`),
      section_id: section.id,
      competency_id: competencyIds.has(section.competency_id || section.competencyId || question.competency_id) ? (section.competency_id || section.competencyId || question.competency_id) : "ml-foundations",
      label: String(question.label || assessmentLabel(input.mode)).slice(0, 80),
      prompt: prompt.slice(0, 500),
      options,
      correct_index: correctIndex,
      explanation: String(question.explanation || "").trim().slice(0, 600),
      source_ids: sourceIds,
    };
  }).filter(Boolean).slice(0, assessmentCount(input));
  return { status: data.status || "ok", mode: input.mode || "diagnostic", question_count: questions.length, questions };
};

const validateProviderResult = (route, data, input = {}) => {
  if (!data || typeof data !== "object") throw new Error("provider_invalid_json_object");
  if (route === "analyze" && (!Array.isArray(data.competency_gaps) || !Array.isArray(data.recommended_path) || typeof data.reason !== "string")) throw new Error("provider_invalid_analyze_schema");
  if (route === "tutor" && (typeof data.status !== "string" || typeof data.answer !== "string" || !Array.isArray(data.source_ids))) throw new Error("provider_invalid_tutor_schema");
  if (route === "remediation" && (typeof data.explanation !== "string" || !Array.isArray(data.micro_tasks) || typeof data.transfer_question !== "string" || !Array.isArray(data.source_ids))) throw new Error("provider_invalid_remediation_schema");
  if (route === "assessment" && (!Array.isArray(data.questions) || data.questions.length < Math.min(3, assessmentCount(input)))) throw new Error("provider_insufficient_assessment_questions");
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
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          title: { type: "string" },
          subtitle: { type: "string" },
          body: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          takeaway: { type: "string" },
          checkpoint: { type: "string" },
          source_urls: { type: "array", items: { type: "string" } },
        },
        required: ["id", "type", "title", "body", "bullets", "takeaway", "source_urls"],
      },
    },
    concepts: { type: "array", items: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"] } },
    example: { type: "string" },
    practice_steps: { type: "array", items: { type: "string" } },
    transfer_question: { type: "string" },
    source_urls: { type: "array", items: { type: "string" } },
    estimated_minutes: { type: "integer" },
  },
  required: ["status", "objective", "slides", "concepts", "example", "practice_steps", "transfer_question", "source_urls", "estimated_minutes"],
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
    }, Number(process.env.SOURCE_DISCOVERY_TIMEOUT_MS || 8000));
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
  }, Number(process.env.SOURCE_DISCOVERY_TIMEOUT_MS || 8000));
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

const packagePrompt = (input, section, sourcesForPackage) => `You are a bounded Vietnamese instructional designer for an AI Engineer learning path. Create a substantial, beginner-friendly learning package for the section below using only the provided verified sources. Do not invent facts, URLs, learner scores, or citations. The package should fit about ${input.minutes || section.duration} minutes and be readable as an interactive slide deck, not as a short summary. Return JSON only matching this schema: ${JSON.stringify(learningPackageSchema)}.

Section: ${JSON.stringify({ title: section.title, objective: section.objective || section.title, source_ids: section.sourceIds })}
Verified sources: ${JSON.stringify(sourcesForPackage)}

Create 7 to 9 slides in Vietnamese, in this order when relevant: orientation, core idea, mental model or process, worked example, common mistake, practical decision/checklist, self-check, recap. Every slide must have a clear title, a body of 2-4 useful sentences, 2-4 concrete bullets, one memorable takeaway, and at least one source_urls entry copied exactly from the verified sources. Use source_urls only for URLs provided above. Keep the writing explanatory and specific: define terms, connect them to an AI Engineer decision, and use one realistic product/data example. Avoid filler, generic motivational text, and unexplained jargon. Keep concepts, example, practice_steps, and transfer_question as a compact summary of the deck.`;

const validateLearningPackage = (data, section, sourcesForPackage) => {
  if (!data || typeof data !== "object" || !Array.isArray(data.slides) || !Array.isArray(data.concepts) || !Array.isArray(data.practice_steps) || !Array.isArray(data.source_urls)) throw new Error("provider_invalid_learning_package");
  const validUrls = new Set(sourcesForPackage.map((source) => source.url));
  const sourceUrls = data.source_urls.filter((url) => validUrls.has(url));
  const slides = data.slides.slice(0, 10).map((slide, index) => {
    const slideSources = (Array.isArray(slide.source_urls) ? slide.source_urls : []).filter((url) => validUrls.has(url));
    return {
      id: String(slide.id || `slide-${index + 1}`).slice(0, 80),
      type: String(slide.type || "concept").slice(0, 40),
      title: String(slide.title || "").slice(0, 180),
      subtitle: String(slide.subtitle || "").slice(0, 240),
      body: String(slide.body || "").slice(0, 1400),
      bullets: (Array.isArray(slide.bullets) ? slide.bullets : []).slice(0, 5).map((item) => String(item).slice(0, 360)).filter(Boolean),
      takeaway: String(slide.takeaway || "").slice(0, 360),
      checkpoint: String(slide.checkpoint || "").slice(0, 500),
      source_urls: slideSources,
    };
  }).filter((slide) => slide.title && slide.body && slide.bullets.length && slide.takeaway && slide.source_urls.length);
  if (!data.objective || !data.example || !data.transfer_question || !sourceUrls.length || slides.length < 6) throw new Error("provider_unverified_learning_package");
  const allSourceUrls = [...new Set([...sourceUrls, ...slides.flatMap((slide) => slide.source_urls)])];
  return {
    status: "ok",
    objective: String(data.objective).slice(0, 600),
    slides,
    concepts: data.concepts.slice(0, 4).map((concept) => ({ title: String(concept.title).slice(0, 140), body: String(concept.body).slice(0, 700) })),
    example: String(data.example).slice(0, 900),
    practice_steps: data.practice_steps.slice(0, 4).map((step) => String(step).slice(0, 300)),
    transfer_question: String(data.transfer_question).slice(0, 500),
    source_urls: allSourceUrls,
    estimated_minutes: Math.max(5, Math.min(90, Number(data.estimated_minutes) || section.duration)),
  };
};

const fallbackLearningPackage = (section, sourcesForPackage) => ({
  status: "catalog",
  objective: `Sau section này, bạn có thể giải thích và áp dụng ${section.title} trong một bài toán AI Engineer.`,
  slides: [
    { id: "slide-orientation", type: "title", title: section.title, subtitle: "Một bài học có nguồn, có ví dụ và có điểm tự kiểm.", body: `Section này giúp bạn đi từ khái niệm ${section.title} đến một quyết định có thể giải thích trong quy trình AI Engineer. Hãy đọc từng slide, sau đó dùng checklist để kiểm tra xem bạn đã biến kiến thức thành hành động chưa.`, bullets: ["Biết section này giải quyết câu hỏi nào", "Nối khái niệm với dữ liệu và quyết định", "Kết thúc bằng một bài tập chuyển giao"], takeaway: "Hiểu một khái niệm có nghĩa là bạn biết dùng nó để đưa ra quyết định.", source_urls: sourcesForPackage.slice(0, 2).map((source) => source.url) },
    { id: "slide-core", type: "concept", title: `Ý chính: ${section.title}`, subtitle: "Định nghĩa trước, chọn công cụ sau.", body: `Bắt đầu bằng việc nói rõ ${section.title} là gì, đầu vào là gì và đầu ra cần quan sát là gì. Khi mục tiêu chưa rõ, việc chọn model hoặc metric dễ biến thành thử công cụ theo cảm tính.`, bullets: ["Xác định đối tượng hoặc output cần tạo", "Tách dữ liệu quan sát khỏi mục tiêu dự đoán", "Nêu tiêu chí để biết kết quả có ích"], takeaway: "Problem framing quyết định phần lớn chất lượng của solution.", source_urls: sourcesForPackage.slice(0, 2).map((source) => source.url) },
    { id: "slide-process", type: "process", title: "Khung suy nghĩ 3 bước", subtitle: "Từ câu hỏi sản phẩm đến kiểm chứng.", body: "Một cách làm bền vững là mô tả bài toán, chọn cách đo, rồi kiểm tra trên dữ liệu phù hợp. Ba bước này giúp bạn phát hiện sớm việc dữ liệu không đủ, nhãn không đáng tin hoặc metric không phản ánh chi phí thật.", bullets: ["Mô tả input, target và bối cảnh sử dụng", "Chọn metric gắn với loại lỗi quan trọng", "Giữ tập validation/test tách khỏi dữ liệu dùng để fit"], takeaway: "Đừng để model trả lời một câu hỏi mà sản phẩm chưa từng định nghĩa.", source_urls: sourcesForPackage.slice(0, 2).map((source) => source.url) },
    { id: "slide-example", type: "example", title: "Ví dụ xuyên suốt", subtitle: "Biến một nhu cầu sản phẩm thành bài toán học được.", body: `Giả sử sản phẩm muốn ${section.title.toLowerCase()} để hỗ trợ đội vận hành. Trước khi xây model, hãy viết một mẫu input, output mong muốn và lỗi nào sẽ gây hậu quả lớn nhất; đó là điểm bắt đầu để chọn dữ liệu và cách đánh giá.`, bullets: ["Input: thông tin có sẵn tại thời điểm dự đoán", "Output: dự đoán hoặc quyết định cần trả về", "Success: một ngưỡng đo có thể kiểm tra lại"], takeaway: "Một ví dụ cụ thể tốt hơn một mô tả chung chung về AI.", source_urls: sourcesForPackage.map((source) => source.url).slice(0, 3) },
    { id: "slide-pitfall", type: "pitfall", title: "Lỗi thường gặp", subtitle: "Đừng nhầm điểm số với giá trị sản phẩm.", body: "Một kết quả đẹp trên dữ liệu huấn luyện hoặc một metric duy nhất chưa đủ để kết luận hệ thống sẵn sàng. Hãy kiểm tra dữ liệu chưa thấy, các nhóm người dùng khác nhau và chi phí của từng loại lỗi.", bullets: ["Không đánh giá trên đúng dữ liệu đã dùng để fit", "Không chọn metric chỉ vì nó dễ báo cáo", "Không bỏ qua dữ liệu lệch hoặc label không đáng tin"], takeaway: "Điểm số chỉ có ý nghĩa khi gắn với cách dữ liệu được tạo và cách sản phẩm dùng dự đoán.", source_urls: sourcesForPackage.slice(0, 2).map((source) => source.url) },
    { id: "slide-decision", type: "decision", title: "Checklist ra quyết định", subtitle: "Trước khi chuyển sang model hoặc code.", body: "Hãy thử giải thích lựa chọn của bạn như đang viết một note cho teammate. Nếu chưa trả lời được câu hỏi nào, đó là tín hiệu cần quay lại problem framing hoặc tìm thêm nguồn.", bullets: ["Tôi đang dự đoán gì và cho ai dùng?", "Loại lỗi nào đắt giá hơn trong bối cảnh này?", "Dữ liệu nào kiểm chứng được khả năng tổng quát hóa?", "Kết quả sẽ được theo dõi lại sau triển khai ra sao?"], takeaway: "Một quyết định tốt phải nói được cả lợi ích, giới hạn và cách kiểm chứng.", source_urls: sourcesForPackage.map((source) => source.url).slice(0, 3) },
    { id: "slide-check", type: "checkpoint", title: "Tự kiểm tra trước khi rời section", subtitle: "Nói lại bằng ngôn ngữ của chính bạn.", body: `Nếu bạn có thể giải thích ${section.title} cho một teammate bằng một ví dụ dữ liệu, một tiêu chí đo và một rủi ro, bạn đã sẵn sàng làm mastery test. Nếu chưa, hãy quay lại slide có điểm còn mơ hồ và hỏi tutor theo source ID.`, bullets: ["Viết định nghĩa trong một câu", "Nêu một ví dụ input → output", "Chọn cách đo và giải thích vì sao", "Nói một điều có thể làm kết quả sai"], takeaway: "Explain-back là bằng chứng tốt hơn việc đọc lướt qua slide.", checkpoint: `Bạn sẽ dùng ${section.title} ở bước nào trong một hệ thống AI Engineer?`, source_urls: sourcesForPackage.slice(0, 2).map((source) => source.url) },
    { id: "slide-recap", type: "recap", title: "Chốt lại", subtitle: "Từ hiểu → thử → kiểm chứng.", body: `Bạn vừa đi qua một khung học cho ${section.title}: hiểu khái niệm, nhìn ví dụ, nhận diện lỗi và chuẩn bị một quyết định có thể kiểm tra. Hãy hoàn thành checklist rồi chuyển sang mastery test để chứng minh khả năng áp dụng.`, bullets: ["Hiểu khái niệm cốt lõi", "Liên hệ với một bài toán sản phẩm", "Biết nguồn để đọc sâu hơn", "Sẵn sàng transfer sang tình huống mới"], takeaway: "Học xong là khi bạn có thể giải thích lựa chọn và chỉ ra cách kiểm chứng.", source_urls: sourcesForPackage.map((source) => source.url).slice(0, 3) },
  ],
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
          body: JSON.stringify({ model: modelFor(candidate), messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: Number(process.env.LEARNING_PACKAGE_MAX_TOKENS || 3200), response_format: { type: "json_object" } }),
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
  if (route === "assessment") return fallbackAssessment(input);
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
    const mlRelated = ["model", "data", "du lieu", "feature", "target", "train", "test", "machine", "learning", "hoc may"].some((term) => question.includes(term));
    return { status: "no_evidence", answer: mlRelated ? "Mình chưa tìm được đoạn đủ cụ thể để trả lời chắc câu hỏi này. Hãy đối chiếu phần định nghĩa và cách đặt bài toán trước, rồi hỏi lại với tên model hoặc khái niệm cụ thể để mình trích đúng chương." : "Mình chưa đủ tín hiệu để trả lời chắc từ phần tài liệu đã map. Hãy hỏi cụ thể hơn về cách đặt bài toán, loại learning, regression, overfitting hoặc đánh giá classification.", confidence: 0.35, source_ids: mlRelated ? ["GML-CH01"] : [], handoff: "Thu hẹp câu hỏi về một khái niệm trong tài liệu." };
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
  if (route === "assessment") data = safeAssessment(data, input);
  if (route === "assessment" && data.questions.length < assessmentCount(input)) {
    data = fallbackAssessment(input);
    live = false;
    selectedProvider = null;
    attempts.push({ provider: "application", reason: "provider_output_did_not_cover_requested_content" });
  }
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
    ready: Boolean(dbPool && !dbInitError && contentCatalogReady && documentState.loaded),
    topic: topicContext.title,
    document: { loaded: documentState.loaded, source: documentPdfUrl ? "remote-url" : "local-path", url_configured: Boolean(documentPdfUrl), file_name: documentState.fileName, pages: documentState.pages.length, error: documentState.error },
    providers: { order: providerOrder(), gemini: configured("gemini"), openrouter: configured("openrouter") },
    database: { configured: Boolean(process.env.DATABASE_URL), ready: Boolean(dbPool && !dbInitError), content_catalog_ready: contentCatalogReady, error: dbInitError },
  });
  if (req.method === "GET" && pathname === "/api/pdf/evidence") {
    if (!documentState.loaded) return json(res, 503, { error: "document_unavailable", message: "PDF chưa sẵn sàng để trích dẫn." });
    const section = sections.find((item) => item.id === String(url.searchParams.get("section_id") || ""));
    const slideTitle = String(url.searchParams.get("slide_title") || "").slice(0, 240);
    if (!section) return json(res, 400, { error: "invalid_section" });
    const concepts = (section.concepts || []).map((item) => `${item.title} ${item.body}`).join(" ");
    const query = `${section.title} ${section.description || ""} ${section.objective || ""} ${slideTitle} ${concepts}`;
    return json(res, 200, { document: documentState.fileName, section_id: section.id, slide_title: slideTitle, excerpts: relevantDocumentPages(query) });
  }
  if (req.method === "GET" && pathname === "/api/pdf/page") {
    if (!documentState.loaded) return json(res, 503, { error: "document_unavailable" });
    const page = Number(url.searchParams.get("page"));
    if (!Number.isInteger(page) || page < 1 || page > documentState.pages.length) return json(res, 400, { error: "invalid_page" });
    try {
      const outputRoot = path.join(pdfImageCacheDir, `page-${page}`);
      const pngPath = `${outputRoot}.png`;
      let png;
      try { png = await fs.readFile(pngPath); }
      catch {
        await fs.mkdir(pdfImageCacheDir, { recursive: true });
        await execFileAsync(pdftoppmPath, ["-f", String(page), "-l", String(page), "-png", "-singlefile", "-r", "120", pdfPath, outputRoot], { maxBuffer: 32 * 1024 * 1024 });
        png = await fs.readFile(pngPath);
      }
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png.length, "Cache-Control": "public, max-age=86400" });
      return res.end(png);
    } catch (error) {
      return json(res, 503, { error: "pdf_render_unavailable", message: "Không thể render trang PDF.", detail: error.code || error.message });
    }
  }
  if (pathname === "/api/auth/me" && req.method === "GET") {
    try {
      const user = await authenticatedUser(req);
      return user ? json(res, 200, { user: publicUser(user) }) : json(res, 401, { error: "unauthorized", message: "Phiên đăng nhập không còn hợp lệ." });
    } catch (error) {
      return json(res, 503, { error: "database_unavailable", message: "Không thể kiểm tra phiên đăng nhập.", detail: error.message });
    }
  }
  if (pathname === "/api/auth/register" || pathname === "/api/auth/login" || pathname === "/api/auth/logout") {
    let input;
    try { input = await bodyOf(req); } catch (error) { return json(res, 400, { error: error.message }); }
    try {
      if (pathname === "/api/auth/logout") {
        await deleteAuthSession(authTokenFromRequest(req));
        return json(res, 200, { logged_out: true });
      }
      if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
      const email = normaliseEmail(input.email);
      const password = String(input.password || "");
      if (!emailIsValid(email)) return json(res, 400, { error: "invalid_email", message: "Hãy nhập email hợp lệ." });
      if (!passwordIsValid(password)) return json(res, 400, { error: "invalid_password", message: "Mật khẩu cần có ít nhất 6 ký tự." });
      if (pathname === "/api/auth/register") {
        const name = String(input.name || "").trim();
        if (name.length < 2 || name.length > 80) return json(res, 400, { error: "invalid_name", message: "Tên hiển thị cần có từ 2 đến 80 ký tự." });
        if (await userByEmail(email)) return json(res, 409, { error: "email_exists", message: "Email này đã được đăng ký." });
        const user = await createUser({ name, email, password });
        const session = await saveAuthSession(user.id);
        return json(res, 201, { user: publicUser(user), access_token: session.token, expires_at: session.expiresAt.toISOString() });
      }
      const user = await userByEmail(email);
      if (!user || !(await verifyPassword(password, user.password_hash))) return json(res, 401, { error: "invalid_credentials", message: "Email hoặc mật khẩu không đúng." });
      const session = await saveAuthSession(user.id);
      return json(res, 200, { user: publicUser(user), access_token: session.token, expires_at: session.expiresAt.toISOString() });
    } catch (error) {
      if (error.code === "23505") return json(res, 409, { error: "email_exists", message: "Email này đã được đăng ký." });
      return json(res, 503, { error: "auth_unavailable", message: "Dịch vụ tài khoản tạm thời chưa sẵn sàng.", detail: error.message });
    }
  }
  if (req.method === "GET" && pathname === "/api/content/catalog") {
    const user = await authenticatedUser(req);
    if (!user) return json(res, 401, { error: "unauthorized", message: "Vui lòng đăng nhập để tải learning content." });
    if (!dbPool || dbInitError || !contentCatalogReady) return json(res, 503, { error: "content_catalog_unavailable", message: "Learning content chưa sẵn sàng." });
    try {
      const result = await dbPool.query("SELECT topic_id, version, content, updated_at FROM content_catalog WHERE is_published = TRUE ORDER BY updated_at DESC LIMIT 1");
      const catalog = result.rows[0];
      return catalog ? json(res, 200, { source: "database", topic_id: catalog.topic_id, version: catalog.version, content: catalog.content, updated_at: catalog.updated_at }) : json(res, 404, { error: "content_catalog_empty" });
    } catch (error) {
      return json(res, 503, { error: "content_catalog_unavailable", detail: error.message });
    }
  }
  if (req.method === "GET" && pathname === "/api/session") {
    const user = await authenticatedUser(req);
    if (!user) return json(res, 401, { error: "unauthorized", message: "Vui lòng đăng nhập lại." });
    if (!dbPool || dbInitError) return json(res, 200, { enabled: false, state: null });
    try {
      const session = await loadSession(user.id, url.searchParams.get("session_key"));
      return json(res, 200, { enabled: true, state: session?.state || null, updated_at: session?.updated_at || null });
    } catch (error) {
      return json(res, 503, { enabled: true, error: "database_unavailable", detail: error.message });
    }
  }
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  let input;
  try { input = await bodyOf(req); } catch (error) { return json(res, 400, { error: error.message }); }
  if (pathname === "/api/session") {
    const user = await authenticatedUser(req);
    if (!user) return json(res, 401, { error: "unauthorized", message: "Vui lòng đăng nhập lại." });
    if (!dbPool || dbInitError) return json(res, 503, { enabled: false, error: "database_not_configured" });
    try {
      const saved = await saveSession(user.id, input.session_key, input.state);
      return saved ? json(res, 200, { enabled: true, saved: true }) : json(res, 400, { enabled: true, error: "invalid_session" });
    } catch (error) {
      return json(res, 503, { enabled: true, error: "database_unavailable", detail: error.message });
    }
  }
  const route = pathname === "/api/learning/analyze" ? "analyze" : pathname === "/api/tutor" ? "tutor" : pathname === "/api/remediation" ? "remediation" : null;
  if (pathname === "/api/learning/assessment") return json(res, 200, await runAgent("assessment", input));
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

Promise.all([loadDocument(), initDatabase()]).finally(() => server.listen(port, "0.0.0.0", () => console.log(`Pathwise server running at http://localhost:${port} · document=${documentState.loaded ? documentState.fileName : documentState.error} · providers=${providerOrder().join(",") || "fallback"} · database=${dbPool && !dbInitError ? "ready" : "disabled"} · content=${contentCatalogReady ? "ready" : "fallback"}`)));
