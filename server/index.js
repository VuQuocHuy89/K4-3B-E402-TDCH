"use strict";

const http = require("node:http");
const fsSync = require("node:fs");
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
const { discoverCatalogSources, sanitizeSources, officialSources, allowedDomains } = require("./source-catalog");

const { createAdaptiveLearning } = require("./adaptive-learning");
const { retrieveEvidence } = require("./learning-sources");
const { retryDelayMs } = require("./provider-utils");
const execFileAsync = promisify(execFile);
const rootDir = path.resolve(__dirname, "..");
const codebaseDir = path.join(rootDir, "codebase");

// Local development convenience: load server/.env (or root .env) without
// overwriting variables injected by Render, Docker, or the shell.
const loadLocalEnv = () => {
  const candidates = [path.join(__dirname, ".env"), path.join(rootDir, ".env")];
  for (const file of candidates) {
    if (!fsSync.existsSync(file)) continue;
    try {
      const lines = fsSync.readFileSync(file, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match || match[1].startsWith("#") || process.env[match[1]] !== undefined) continue;
        let value = match[2];
        if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        process.env[match[1]] = value;
      }
    } catch {}
  }
};
loadLocalEnv();
const port = Number(process.env.PORT || 4173);
const documentPdfUrl = String(process.env.DOCUMENT_PDF_URL || "").trim();
const documentCachePath = process.env.DOCUMENT_PDF_CACHE_PATH || path.join("/tmp", "pathwise-document.pdf");
const pdfPath = documentPdfUrl ? documentCachePath : (process.env.DOCUMENT_PDF_PATH || path.join(rootDir, "Grokking Machine Learning.pdf"));
const documentFileName = documentPdfUrl ? "Grokking Machine Learning.pdf" : path.basename(pdfPath);
const traceFile = process.env.AI_TRACE_FILE || "/tmp/pathwise-agent-trace.jsonl";

const traceLimit = 12000;
let dbPool = null;
let dbInitError = null;
let contentCatalogReady = false;
const contentCatalogVersion = process.env.CONTENT_CATALOG_VERSION || "seed-v1";
const memoryUsers = new Map();
const memoryAuthSessions = new Map();
const localAuthFile = process.env.LOCAL_AUTH_FILE || path.join(__dirname, ".local-auth.json");

const loadLocalAuth = () => {
  if (!fsSync.existsSync(localAuthFile)) return;
  try {
    const saved = JSON.parse(fsSync.readFileSync(localAuthFile, "utf8"));
    for (const user of Array.isArray(saved.users) ? saved.users : []) {
      if (user?.id && user?.email && user?.password_hash) memoryUsers.set(user.id, user);
    }
    for (const [hash, session] of Object.entries(saved.sessions || {})) {
      if (session?.userId && session?.expiresAt && new Date(session.expiresAt) > new Date()) memoryAuthSessions.set(hash, session);
    }
  } catch {}
};

const persistLocalAuth = () => {
  if (dbPool) return;
  try {
    fsSync.mkdirSync(path.dirname(localAuthFile), { recursive: true });
    fsSync.writeFileSync(localAuthFile, JSON.stringify({ users: [...memoryUsers.values()], sessions: Object.fromEntries(memoryAuthSessions) }, null, 2), { mode: 0o600 });
  } catch {}
};

loadLocalAuth();
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
    persistLocalAuth();
  }
  return { token, expiresAt };
};
const deleteAuthSession = async (token) => {
  if (!token) return;
  const hash = tokenHash(token);
  if (dbPool) await dbPool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [hash]);
  else {
    memoryAuthSessions.delete(hash);
    persistLocalAuth();
  }
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
  persistLocalAuth();
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
  : name === "openrouter" ? Boolean(process.env.OPENROUTER_API_KEY)
    : name === "groq" ? Boolean(process.env.GROQ_API_KEY)
      : false;

const providerOrder = () => {
  const requested = String(process.env.AI_PROVIDER || "auto").toLowerCase();
  const preference = requested === "groq"
    ? ["groq", "openrouter", "gemini"]
    : requested === "openrouter"
      ? ["openrouter", "groq", "gemini"]
      : requested === "gemini"
        ? ["gemini", "groq", "openrouter"]
        : ["groq", "openrouter", "gemini"];
  return preference.filter(configured);
};

const modelFor = (name) => name === "openrouter"
  ? (process.env.OPENROUTER_MODEL || "openrouter/free")
  : name === "groq"
    ? (process.env.GROQ_MODEL || "openai/gpt-oss-120b")
    : (process.env.GEMINI_MODEL || process.env.AI_MODEL || "gemini-3.6-flash");
const groqSourceModel = () => process.env.GROQ_SOURCE_MODEL || "groq/compound-mini";

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
const catalogContext = (query = "") => discoverCatalogSources(query, 8).map((item) => `${item.id} | ${item.title} | ${item.publisher} | ${item.url} | ${item.summary}`).join("\n");

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

const systemPrompt = (route, input) => `You are Pathwise, a bounded Vietnamese learning-path agent for a learner who wants to become an AI Engineer. Route: ${route}. Use the learner-selected topic, verified official catalog sources, and PDF excerpts below when available. Return JSON only. Never invent learner facts, scores, IDs or citations. The deterministic application owns answer scoring, pass/fail and section unlocks. If evidence is insufficient, return no_evidence and explain the limit.

Learner-selected topic (the primary subject, even when it differs from the seeded catalog): ${String(input.topic_label || topicContext.title)}
Learner level: ${String(input.learner_level || input.learner?.level || "unspecified")}

Mapped sources:
${sourceContext()}

Relevant official catalog sources for the learner-selected topic:
${catalogContext(input.topic_label || input.topic_objective || "")}

Allowed sections:
${sectionContext()}

Document-grounded excerpts from ${topicContext.documentName}:
${relevantDocumentContext(JSON.stringify(input))}

External orientation reference (link only; do not reproduce its content): ${roadmapReference.url}`;

const schemas = {
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
const fetchJson = async (url, options, timeoutMs = Number(process.env.AI_TIMEOUT_MS || 12000), retries = 0, waited = 0) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();
    if (response.status === 429 && retries < 2) {
      const delay = retryDelayMs(response.headers.get("retry-after"), body);
      if (delay > 0 && waited + delay <= 65000) {
        clearTimeout(timer);
        await new Promise((resolve) => setTimeout(resolve, Math.ceil(delay) + 1000));
        return fetchJson(url, options, timeoutMs, retries + 1, waited + delay + 1000);
      }
    }
    if (!response.ok) {
      let detail = "";
      try { const error = JSON.parse(body).error; detail = `${error?.code || ""}: ${error?.message || ""}`; } catch {}
      for (const key of [process.env.GROQ_API_KEY, process.env.OPENROUTER_API_KEY, process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY].filter(Boolean)) detail = detail.split(key).join("[redacted]");
      throw new Error(`provider_http_${response.status} ${detail.slice(0, 500)}`.trim());
    }
    return JSON.parse(body);
  } finally { clearTimeout(timer); }
};

const callProvider = async (name, route, input, task = null) => {
  const modelInput = route === "assessment" ? Object.fromEntries(Object.entries(input).filter(([key]) => key !== "fallback_questions")) : input;
  const prompt = task ? `${task.prompt}\nWrite all titles, prompts, options, explanations and lesson content in Vietnamese, preserving code and IDs. Return JSON matching: ${JSON.stringify(task.schema)}` : `Complete this bounded task using the mapped PDF evidence. Return exactly one JSON object matching this schema and field names: ${JSON.stringify(schemas[route])}. Input: ${JSON.stringify(modelInput)}`;
  const instruction = task?.system || systemPrompt(route, modelInput);
  const schema = task?.schema || schemas[route];
  const tokens = task ? (route === "package" ? 9000 : 7000) : Number(process.env.GROQ_MAX_TOKENS || 5000);
  const timeout = task ? Number(process.env.LEARNING_AI_TIMEOUT_MS || 60000) : Number(process.env.AI_TIMEOUT_MS || 12000);
  if (name === "gemini") {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const response = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelFor(name))}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: schema },
      }),
    }, timeout);
    const rawResponse = response.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    return { data: parseModel(rawResponse), prompt, rawResponse };
  }
  if (name === "groq") {
    const response = await fetchJson("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: modelFor(name),
        messages: [{ role: "system", content: instruction }, { role: "user", content: prompt }],
        temperature: 0.2,
        max_completion_tokens: tokens,
        response_format: task && ["openai/gpt-oss-120b", "openai/gpt-oss-20b"].includes(modelFor(name))
          ? { type: "json_schema", json_schema: { name: `pathwise_${route}`, strict: true, schema } }
          : { type: "json_object" },
      }),
    }, timeout);
    const rawResponse = response.choices?.[0]?.message?.content || "";
    return { data: parseModel(Array.isArray(rawResponse) ? rawResponse.map((part) => part.text || "").join("") : rawResponse), prompt, rawResponse };
  }
  const response = await fetchJson("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      ...(process.env.OPENROUTER_HTTP_REFERER ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER } : {}),
      ...(process.env.OPENROUTER_TITLE ? { "X-Title": process.env.OPENROUTER_TITLE } : {}),
    },
    body: JSON.stringify({ model: modelFor(name), messages: [{ role: "system", content: instruction }, { role: "user", content: prompt }], temperature: 0.2, max_tokens: task ? tokens : Number(process.env.OPENROUTER_MAX_TOKENS || 800), response_format: { type: "json_object" } }),
  }, timeout);
  const rawResponse = response.choices?.[0]?.message?.content || "";
  return { data: parseModel(rawResponse), prompt, rawResponse };
};

const knownSourceIds = new Set([...sourceIds, ...officialSources.map((item) => item.id)]);
const validSources = (ids = []) => [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter((id) => knownSourceIds.has(id)))];
const safeTutor = (data) => ({ ...data, confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)), source_ids: validSources(data.source_ids) });
const safeRemediation = (data) => ({ ...data, confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)), source_ids: validSources(data.source_ids), micro_tasks: Array.isArray(data.micro_tasks) ? data.micro_tasks.slice(0, 4) : [] });
const sourceDiscoveryPrompt = (input) => {
  const topic = input.query || input.topic_label;
  return `You are a source curator for the learner-selected topic. Search for sources that directly teach the requested learning objectives. Use web search. Return at most 3 specific content pages, not homepage, table-of-contents or course index URLs. Keep each summary under 40 words. Find trustworthy, current learning sources for this section: ${topic}. Prefer official documentation, official courses, universities, standards, or original research. Do not recommend generic SEO blogs, social posts, or sources you cannot verify. Return JSON only with this shape: {"sources":[{"title":"...","publisher":"...","url":"https://...","domain":"...","type":"Official documentation|Official course|Academic paper|University material","summary":"...","why_selected":"..."}],"note":"..."}. Every URL must be https and must be on one of these preferred domains when relevant: ${[...allowedDomains].join(", ")}, or a university domain. Query: ${JSON.stringify(input.query || "")}`;
};

const sourceDiscoverySchema = {
  type: "object",
  properties: {
    sources: { type: "array", items: { type: "object", properties: { title: { type: "string" }, publisher: { type: "string" }, url: { type: "string" }, domain: { type: "string" }, type: { type: "string" }, summary: { type: "string" }, why_selected: { type: "string" } }, required: ["title", "publisher", "url", "summary"] } },
    note: { type: "string" },
  },
  required: ["sources", "note"],
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
  if (name === "groq") {
    const response = await fetchJson("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: groqSourceModel(),
        messages: [
          { role: "system", content: "Use the built-in web search when needed. Return only valid JSON matching the requested shape. Keep only HTTPS official or academic sources." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: Number(process.env.GROQ_SOURCE_MAX_TOKENS || 3000),
        response_format: { type: "json_object" },
        compound_custom: { tools: { enabled_tools: ["web_search", "visit_website"] } },
      }),
    }, Number(process.env.LEARNING_SOURCE_TIMEOUT_MS || 30000));
    const content = response.choices?.[0]?.message?.content || "";
    return parseModel(Array.isArray(content) ? content.map((part) => part.text || "").join("") : content);
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
      const meta = { request_id: requestId, route: "sources", provider: candidate, model: candidate === "groq" ? groqSourceModel() : modelFor(candidate), live: true, fallback_reason: null, attempts, latency_ms: Date.now() - started };
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
      data = providerResult.data;
      if (!data || (route === "tutor" ? typeof data.answer !== "string" : typeof data.explanation !== "string")) throw new Error("provider_invalid_schema");
      modelTrace = { prompt: providerResult.prompt, rawResponse: providerResult.rawResponse };
      selectedProvider = candidate;
      live = true;
      break;
    } catch (error) {
      attempts.push({ provider: candidate, reason: error.name === "AbortError" ? "timeout" : error.message });
    }
  }
  if (!data) data = fallback(route, input);
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

const generateLearning = async (route, task) => {
  const started = Date.now();
  const attempts = [];
  for (const candidate of providerOrder()) {
    let feedback = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await callProvider(candidate, route, {}, { ...task, prompt: task.prompt + feedback });
        let data;
        try { data = task.validate(response.data); }
        catch (validationError) {
          await writeTrace({ route, status: "validation_error", provider: candidate, reason: validationError.message, output: response.data });
          throw validationError;
        }
        const meta = { request_id: crypto.randomUUID(), route, provider: candidate, model: modelFor(candidate), live: true, attempts, latency_ms: Date.now() - started };
        await writeTrace({ ...meta, output: data });
        return { data, meta };
      } catch (error) {
        attempts.push({ provider: candidate, reason: error.name === "AbortError" ? "timeout" : error.message });
        if (!/json_validate_failed/.test(error.message) && (/provider_http|fetch failed|timeout|abort/i.test(error.message) || error.name === "AbortError")) break;
        feedback = `\nThe last output failed validation: ${error.message}. Regenerate the entire JSON fixing this issue; follow the exact coverage and schema.`;
      }
    }
  }
  const reason = attempts.at(-1)?.reason || "";
  const message = /provider_http_429/.test(reason) ? "LLM đang giới hạn lượt hoặc token. Vui lòng đợi khoảng một phút rồi thử lại; bài làm vẫn được giữ." : /provider_http_404/.test(reason) ? "Model đã cấu hình không còn khả dụng. Kiểm tra GROQ_MODEL trong server/.env rồi khởi động lại server." : "Chưa tạo được nội dung hợp lệ từ LLM. Hãy thử lại; bài làm của bạn vẫn được giữ.";
  const error = new Error(providerOrder().length ? message : "Chưa cấu hình LLM. Điền GROQ_API_KEY trong server/.env rồi khởi động lại server.");
  error.code = providerOrder().length ? "learning_generation_failed" : "llm_not_configured";
  await writeTrace({ route, status: "error", attempts });
  throw error;
};

const adaptiveLearning = createAdaptiveLearning({
  generate: generateLearning,
  research: async (input) => {
    const result = await runSourceDiscovery(input);
    return retrieveEvidence(result.data.sources, fetch, input.focus);
  },
});

const api = async (req, res, url) => {
  const { pathname } = url;
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method === "GET" && pathname === "/api/health") return json(res, 200, {
    ok: true,
    ready: Boolean(dbPool && !dbInitError && contentCatalogReady && documentState.loaded),
    topic: topicContext.title,
    document: { loaded: documentState.loaded, source: documentPdfUrl ? "remote-url" : "local-path", url_configured: Boolean(documentPdfUrl), file_name: documentState.fileName, pages: documentState.pages.length, error: documentState.error },
    providers: {
      order: providerOrder(),
      groq: configured("groq"),
      groq_model: modelFor("groq"),
      groq_source_model: groqSourceModel(),
      gemini: configured("gemini"),
      openrouter: configured("openrouter"),
    },
    database: { configured: Boolean(process.env.DATABASE_URL), ready: Boolean(dbPool && !dbInitError), content_catalog_ready: contentCatalogReady, error: dbInitError },
  });
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
  const learningRoute = { "/api/learning/assessment": "assessment", "/api/learning/analyze": "analyze", "/api/learning/package": "package" }[pathname];
  if (learningRoute) {
    const user = await authenticatedUser(req);
    if (!user) return json(res, 401, { error: "unauthorized", message: "Vui lòng đăng nhập lại." });
    try { return json(res, 200, await adaptiveLearning[learningRoute](input)); }
    catch (error) {
      const messages = { no_retrieved_sources: "Chưa đọc được nguồn phù hợp cho section này. Hãy thử tìm nguồn lại.", diagnostic_topic_mismatch: "Bài diagnostic thuộc lộ trình cũ. Hãy tạo lại test theo chủ đề hiện tại.", study_lesson_before_assessment: "Hãy tạo và học nội dung section trước khi làm bài test." };
      return json(res, 503, { error: error.code || error.message, message: messages[error.message] || (error.code ? error.message : "Nội dung chưa đủ hoặc không khớp chủ đề. Hãy thử lại."), retryable: true });
    }
  }
  const route = pathname === "/api/tutor" ? "tutor" : pathname === "/api/remediation" ? "remediation" : null;
  if (pathname === "/api/sources/discover") return json(res, 200, await runSourceDiscovery(input));
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
  if (url.pathname.startsWith("/api/")) return api(req, res, url).catch(() => { if (!res.headersSent) json(res, 500, { error: "server_error", message: "Không thể xử lý yêu cầu lúc này." }); });
  if (req.method !== "GET" && req.method !== "HEAD") return text(res, 405, "Method not allowed");
  return serve(req, res, url.pathname);
});

Promise.all([loadDocument(), initDatabase()]).finally(() => server.listen(port, "0.0.0.0", () => console.log(`Pathwise server running at http://localhost:${port} · document=${documentState.loaded ? documentState.fileName : documentState.error} · providers=${providerOrder().join(",") || "fallback"} · database=${dbPool && !dbInitError ? "ready" : "disabled"} · content=${contentCatalogReady ? "ready" : "fallback"}`)));
