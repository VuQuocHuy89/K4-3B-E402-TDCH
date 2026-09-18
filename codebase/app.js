(() => {
  "use strict";

  let pack = window.CONTENT_PACK;
  const viewContainer = document.querySelector("#view-container");
  const appShell = document.querySelector("#app-shell");
  const authGate = document.querySelector("#auth-gate");
  const authContainer = document.querySelector("#auth-container");
  const toast = document.querySelector("#toast");
  const liveRegion = document.querySelector("#live-region");
  const topicSuggestions = ["Machine Learning", "Python cho AI Engineer", "LLM và RAG", "AI Agents"];
  const isValidMinutes = (value) => Number.isInteger(Number(value)) && Number(value) >= 10 && Number(value) <= 240;
  const isValidTopic = (value) => String(value || "").trim().length >= 3 && String(value || "").trim().length <= 120;
  const API_BASE = String(window.PATHWISE_API_BASE || "").trim().replace(/\/+$/, "");
  const ASSESSMENT_VERSION = 2;
  const AUTH_USERS_KEY = "pathwise-auth-users-v1";
  const AUTH_SESSION_KEY = "pathwise-auth-session-v1";
  const AUTH_TOKEN_KEY = "pathwise-auth-token-v1";
  const LEGACY_STORAGE_KEY = "pathwise-learning-session-v5";
  const LEGACY_MIGRATION_KEY = "pathwise-auth-legacy-migrated-v1";
  const USER_STORAGE_PREFIX = "pathwise-learning-session-v5:user:";
  let currentUser = null;
  let authMode = "login";
  let authNotice = "";
  let authNoticeIsError = false;
  let authToken = "";
  let cloudSessionKey = "";
  let cloudHydrated = !API_BASE;
  let cloudSaveTimer = null;
  let contentSource = API_BASE ? "static-loading" : "static-fallback";

  const state = {
    view: window.location.hash.replace("#", "") || "setup",
    profileConfigured: false,
    pathTopic: "",
    pathLevel: "new",
    pathMinutes: "",
    diagnosticIndex: 0,
    diagnosticAnswers: {},
    diagnosticConfidence: {},
    diagnosticSubmitted: false,
    diagnosticSkipped: false,
    assessmentVersion: ASSESSMENT_VERSION,
    assessmentQuestions: { diagnostic: [], mastery: {}, final: [] },
    assessmentMeta: { diagnostic: null, mastery: {}, final: null },
    aiAnalysis: null,
    agentMeta: null,
    recommendedPath: [],
    selectedSectionId: "section-ml-foundations",
    timePlan: 30,
    focusStarted: false,
    studyCompleted: false,
    studyChecks: [],
    masteryIndex: 0,
    masteryAnswers: {},
    masterySubmitted: false,
    masteryScore: null,
    masteryPassed: false,
    completedSections: {},
    roadmapAnimation: null,
    remediationData: null,
    remediationText: "",
    remediationChecked: false,
    remediationLoading: false,
    discoveredSources: {},
    sourceDiscoveryLoading: false,
    generatedPackages: {},
    packageLoading: false,
    finalStarted: false,
    finalIndex: 0,
    finalAnswers: {},
    finalSubmitted: false,
    finalScore: null,
    tutorMessages: [
      {
        role: "assistant",
        text: "Bạn có thể hỏi về problem framing, supervised learning, regression, overfitting hoặc model evaluation. Mình sẽ trả lời dựa trên Grokking Machine Learning và hiện source ID.",
        sources: [],
        confidence: "high",
      },
    ],
    tutorLoading: false,
  };

  let focusInterval = null;
  let focusRemainingSeconds = 0;
  let lastRenderedView = "";

  const cloneData = (value) => JSON.parse(JSON.stringify(value));
  const defaultState = cloneData(state);
  defaultState.view = "setup";
  const persistableState = ["view", "profileConfigured", "pathTopic", "pathLevel", "pathMinutes", "diagnosticIndex", "diagnosticAnswers", "diagnosticConfidence", "diagnosticSubmitted", "diagnosticSkipped", "assessmentVersion", "assessmentQuestions", "assessmentMeta", "aiAnalysis", "agentMeta", "recommendedPath", "selectedSectionId", "timePlan", "focusStarted", "studyCompleted", "studyChecks", "masteryIndex", "masteryAnswers", "masterySubmitted", "masteryScore", "masteryPassed", "completedSections", "remediationData", "remediationText", "remediationChecked", "discoveredSources", "generatedPackages", "finalStarted", "finalIndex", "finalAnswers", "finalSubmitted", "finalScore", "tutorMessages"];
  const stateStorageKey = () => currentUser ? `${USER_STORAGE_PREFIX}${currentUser.id}` : LEGACY_STORAGE_KEY;
  const userInitial = () => String(currentUser?.name || "H").trim().charAt(0).toUpperCase() || "H";
  const learnerName = () => currentUser?.name || pack.learner.name;
  const readUsers = () => {
    try {
      const users = JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || "[]");
      return Array.isArray(users) ? users.filter((user) => user && user.id && user.email && user.passwordHash) : [];
    } catch { return []; }
  };
  const writeUsers = (users) => {
    try { localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users)); return true; } catch { return false; }
  };
  const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
  const hashPassword = async (password) => {
    const value = String(password || "");
    if (window.crypto?.subtle && window.TextEncoder) {
      const buffer = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
      return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return value;
  };
  const randomId = () => window.crypto?.randomUUID?.() || `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const setAuthSession = (userId) => { try { localStorage.setItem(AUTH_SESSION_KEY, userId); } catch {} };
  const clearAuthSession = () => { try { localStorage.removeItem(AUTH_SESSION_KEY); } catch {} };
  const setAuthToken = (token) => { authToken = String(token || ""); try { if (authToken) localStorage.setItem(AUTH_TOKEN_KEY, authToken); else localStorage.removeItem(AUTH_TOKEN_KEY); } catch {} };
  const clearAuthToken = () => setAuthToken("");
  const readAuthToken = () => { try { return localStorage.getItem(AUTH_TOKEN_KEY) || ""; } catch { return ""; } };
  const authHeaders = (headers = {}) => authToken ? { ...headers, Authorization: `Bearer ${authToken}` } : headers;
  const hydrateContentCatalog = async () => {
    if (!API_BASE || !authToken) { contentSource = "static-fallback"; return; }
    try {
      const response = await fetch(`${API_BASE}/api/content/catalog`, { headers: authHeaders(), signal: AbortSignal.timeout(8000) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.content?.topic?.id || !Array.isArray(payload.content.sections)) throw new Error(payload.error || "content_catalog_unavailable");
      pack = payload.content;
      contentSource = "database";
    } catch {
      contentSource = "static-fallback";
    }
  };
  const getSessionUser = () => {
    try {
      const id = localStorage.getItem(AUTH_SESSION_KEY);
      return readUsers().find((user) => user.id === id) || null;
    } catch { return null; }
  };
  const migrateLegacyState = (userId) => {
    try {
      if (localStorage.getItem(LEGACY_MIGRATION_KEY)) return;
      const key = `${USER_STORAGE_PREFIX}${userId}`;
      if (!localStorage.getItem(key)) {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          localStorage.setItem(key, legacy);
          localStorage.setItem(LEGACY_MIGRATION_KEY, userId);
        }
      }
    } catch {}
  };
  const resetInMemoryState = () => Object.assign(state, cloneData(defaultState));
  const resetAssessmentState = () => {
    state.assessmentVersion = ASSESSMENT_VERSION;
    state.assessmentQuestions = { diagnostic: [], mastery: {}, final: [] };
    state.assessmentMeta = { diagnostic: null, mastery: {}, final: null };
    state.diagnosticIndex = 0;
    state.diagnosticAnswers = {};
    state.diagnosticConfidence = {};
    state.diagnosticSubmitted = false;
    state.diagnosticSkipped = false;
    state.masteryIndex = 0;
    state.masteryAnswers = {};
    state.masterySubmitted = false;
    state.finalIndex = 0;
    state.finalAnswers = {};
    state.finalSubmitted = false;
    state.aiAnalysis = null;
    state.agentMeta = null;
    state.recommendedPath = [];
  };
  const persistState = () => {
    try {
      const snapshot = Object.fromEntries(persistableState.map((key) => [key, state[key]]));
      if (currentUser) localStorage.setItem(stateStorageKey(), JSON.stringify(snapshot));
      if (currentUser && API_BASE && cloudHydrated) {
        window.clearTimeout(cloudSaveTimer);
        const sessionKey = cloudSessionKey;
        cloudSaveTimer = window.setTimeout(() => {
          fetch(`${API_BASE}/api/session`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ session_key: sessionKey, state: snapshot }) }).catch(() => {});
        }, 600);
      }
    } catch {}
  };
  const restoreState = () => {
    try {
      resetInMemoryState();
      const saved = JSON.parse(localStorage.getItem(stateStorageKey()) || "null");
      if (!saved || typeof saved !== "object") return;
      persistableState.forEach((key) => { if (saved[key] !== undefined) state[key] = saved[key]; });
      if (saved.assessmentVersion !== ASSESSMENT_VERSION) resetAssessmentState();
      if (!state.assessmentQuestions || typeof state.assessmentQuestions !== "object") state.assessmentQuestions = { diagnostic: [], mastery: {}, final: [] };
      if (!Array.isArray(state.assessmentQuestions.diagnostic)) state.assessmentQuestions.diagnostic = [];
      if (!state.assessmentQuestions.mastery || typeof state.assessmentQuestions.mastery !== "object") state.assessmentQuestions.mastery = {};
      if (!Array.isArray(state.assessmentQuestions.final)) state.assessmentQuestions.final = [];
      if (!state.assessmentMeta || typeof state.assessmentMeta !== "object") state.assessmentMeta = { mastery: {} };
      if (!state.assessmentMeta.mastery || typeof state.assessmentMeta.mastery !== "object") state.assessmentMeta.mastery = {};
      if (!pack.sections.some((section) => section.id === state.selectedSectionId)) state.selectedSectionId = pack.sections[0].id;
      // Migrate sessions that used the removed option to the diagnostic flow.
      if (state.pathLevel === "intermediate") state.pathLevel = "beginner";
      if (!["new", "beginner"].includes(state.pathLevel)) state.pathLevel = "new";
      if (!Array.isArray(state.tutorMessages)) state.tutorMessages = [];
      if (["diagnostic-loading", "assessment-loading", "mastery-loading", "remediation-loading"].includes(state.view)) state.view = "overview";
      if (!state.profileConfigured) state.view = "setup";
    } catch {}
  };

  const icons = {
    grid: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.7"/><rect x="14" y="4" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.7"/><rect x="4" y="14" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.7"/><rect x="14" y="14" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.7"/></svg>',
    pulse: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 12h3.2l2-6 4.1 12 2.2-6H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    route: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="6" cy="6" r="2.25" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="18" r="2.25" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 6H13a5 5 0 0 1 5 5v4.5M15.5 18H11a5 5 0 0 1-5-5V8.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5 5.5h9.5A4.5 4.5 0 0 1 19 10v8.5H9.5A4.5 4.5 0 0 1 5 14V5.5Z" stroke="currentColor" stroke-width="1.7"/><path d="M8 9.5h6.5M8 13h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3ZM19 16l.65 2.35L22 19l-2.35.65L19 22l-.65-2.35L16 19l2.35-.65L19 16Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M19 12H6M11 6l-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M13.5 3.5c.4 3-1.5 4.6-2.9 6.1-1.2 1.2-2.2 2.4-1.7 4.3.25.92.93 1.65 1.83 2.03-.12-1.65.65-2.76 1.62-3.67 1.45-1.36 2.55-2.55 2.19-5.38 2.39 1.84 4.05 4.55 4.05 7.42A6.58 6.58 0 0 1 12 20.9a6.58 6.58 0 0 1-6.58-6.58c0-3.23 1.95-5.88 4.26-7.97-.18 2.01.29 3.2 1.12 3.94C11.93 8.1 12.83 6.2 13.5 3.5Z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M19.5 8.5A7.5 7.5 0 0 0 6.32 6.08L4 8.5M4 4.5v4h4M4.5 15.5A7.5 7.5 0 0 0 17.68 17.92L20 15.5M20 19.5v-4h-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v5l3.2 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6.5 3.75h7l4 4v12.5h-11V3.75Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13.5 3.75v4h4M9 12h6M9 15.5h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 3.5 19 6v5.25c0 4.25-2.65 7.65-7 9.25-4.35-1.6-7-5-7-9.25V6l7-2.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m8.5 12 2.2 2.2 4.8-4.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10M14 8l4 4-4 4M18 12H9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const icon = (name) => icons[name] || icons.file;

  const journeyStops = [
    { x: 18, y: 100 },
    { x: 77, y: 340 },
    { x: 24, y: 590 },
    { x: 76, y: 850 },
    { x: 22, y: 1110 },
    { x: 76, y: 1370 },
    { x: 50, y: 1580 },
  ];
  const journeyMicroStops = [
    [{ x: 30, y: 160 }, { x: 55, y: 220 }, { x: 74, y: 285 }],
    [{ x: 66, y: 405 }, { x: 41, y: 470 }, { x: 25, y: 535 }],
    [{ x: 35, y: 655 }, { x: 60, y: 720 }, { x: 75, y: 785 }],
    [{ x: 66, y: 915 }, { x: 41, y: 980 }, { x: 23, y: 1045 }],
    [{ x: 33, y: 1175 }, { x: 60, y: 1240 }, { x: 75, y: 1305 }],
    [{ x: 70, y: 1425 }, { x: 60, y: 1485 }, { x: 51, y: 1535 }],
  ];
  const journeyRewards = [
    { name: "La bàn khai phá", note: "Nhìn đúng bài toán trước khi chọn model" },
    { name: "Bình dữ liệu", note: "Nhận diện tín hiệu và loại hình học" },
    { name: "Tinh thể sai số", note: "Biến độ lệch thành hướng cải thiện" },
    { name: "Khiên tổng quát", note: "Bảo vệ model khỏi overfitting" },
    { name: "Radar đánh giá", note: "Nhìn rõ từng loại lỗi quan trọng" },
    { name: "Tên lửa mô hình", note: "Sẵn sàng đưa lựa chọn vào thực tế" },
  ];

  const rewardArtwork = (index, unlocked = false) => {
    const tone = unlocked ? "#4F46E5" : "#94A3B8";
    const accent = unlocked ? "#F59E0B" : "#CBD5E1";
    const mint = unlocked ? "#16A34A" : "#CBD5E1";
    const drawings = [
      `<circle cx="40" cy="40" r="23" fill="#fff" stroke="${tone}" stroke-width="4"/><path d="m34 46 5-14 7-5-5 14-7 5Z" fill="${accent}" stroke="${tone}" stroke-width="2"/><circle cx="40" cy="40" r="3" fill="${tone}"/>`,
      `<path d="M29 18h22M34 18v14L23 54c-3 6 1 10 8 10h18c7 0 11-4 8-10L46 32V18" fill="#fff" stroke="${tone}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M28 50c8-5 16 5 25 0l5 10H22l6-10Z" fill="${mint}" opacity=".9"/><circle cx="35" cy="45" r="3" fill="${accent}"/>`,
      `<path d="m40 13 20 18-8 30H28l-8-30 20-18Z" fill="#fff" stroke="${tone}" stroke-width="4" stroke-linejoin="round"/><path d="m40 13 7 18-7 30-7-30 7-18ZM20 31h40" fill="${accent}" opacity=".72" stroke="${tone}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="m40 13 24 9v18c0 15-9 25-24 31-15-6-24-16-24-31V22l24-9Z" fill="#fff" stroke="${tone}" stroke-width="4" stroke-linejoin="round"/><path d="m28 40 8 8 17-18" fill="none" stroke="${mint}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<circle cx="40" cy="40" r="27" fill="#fff" stroke="${tone}" stroke-width="4"/><circle cx="40" cy="40" r="17" fill="none" stroke="${tone}" stroke-width="3" stroke-dasharray="5 5"/><path d="M40 40 58 26" stroke="${mint}" stroke-width="4" stroke-linecap="round"/><circle cx="40" cy="40" r="5" fill="${accent}"/>`,
      `<path d="M44 13c13 5 20 17 20 31L48 60 30 42c1-14 6-24 14-29Z" fill="#fff" stroke="${tone}" stroke-width="4" stroke-linejoin="round"/><circle cx="47" cy="32" r="6" fill="${accent}" stroke="${tone}" stroke-width="3"/><path d="m31 43-11 4 9 9 2-13Zm16 17-4 11-9-9 13-2Z" fill="${mint}" stroke="${tone}" stroke-width="3" stroke-linejoin="round"/>`,
    ];
    return `<svg class="reward-art" width="80" height="80" viewBox="0 0 80 80" role="img" aria-label="${escapeHtml(journeyRewards[index].name)}"><circle cx="40" cy="40" r="38" fill="${unlocked ? "#EEF2FF" : "#F1F5F9"}"/>${drawings[index]}</svg>`;
  };

  const animeAvatar = () => `<svg width="74" height="106" viewBox="0 0 74 106" role="img" aria-label="Nhân vật đại diện của bạn">
    <ellipse cx="37" cy="101" rx="25" ry="5" fill="rgba(49,46,129,.2)"/>
    <path d="M24 67c-8 8-10 21-8 31h42c2-11-1-24-9-31H24Z" fill="#4F46E5" stroke="#312E81" stroke-width="2"/>
    <path d="M29 76v22M45 76v22" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
    <path d="M22 96h13v6H20c-3 0-3-6 2-6Zm30 0H39v6h15c3 0 3-6-2-6Z" fill="#182236"/>
    <path d="M20 69 9 84M52 69l12 14" stroke="#F4C7A8" stroke-width="7" stroke-linecap="round"/>
    <path d="M31 57h12v14H31z" fill="#F4C7A8"/>
    <circle cx="37" cy="38" r="25" fill="#F4C7A8" stroke="#312E81" stroke-width="2"/>
    <path d="M14 39C12 17 24 6 41 8c16 2 22 15 18 32-5-7-11-12-18-17-5 8-14 13-27 16Z" fill="#25245B"/>
    <path d="M18 31c2-17 15-25 28-21-13-1-19 6-22 16l-6 5Z" fill="#6563D9"/>
    <path d="M27 42h6M43 42h6" stroke="#312E81" stroke-width="3" stroke-linecap="round"/>
    <path d="M32 52c3 3 7 3 10 0" fill="none" stroke="#C45C6D" stroke-width="2" stroke-linecap="round"/>
    <path d="M26 68h22l-4 13H30l-4-13Z" fill="#fff"/>
    <path d="m37 70 4 5-4 5-4-5 4-5Z" fill="#F59E0B"/>
  </svg>`;

  const journeyFlag = () => `<svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true"><path d="M5 3v20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M6 4h12l-3 5 3 5H6V4Z" fill="currentColor"/></svg>`;

  const trophyArtwork = (complete) => `<svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label="Cúp hoàn thành lộ trình"><circle cx="46" cy="46" r="44" fill="${complete ? "#FFF7D6" : "#F1F5F9"}"/><path d="M31 18h30v14c0 15-6 24-15 24s-15-9-15-24V18Z" fill="${complete ? "#FBBF24" : "#CBD5E1"}" stroke="${complete ? "#B45309" : "#94A3B8"}" stroke-width="3"/><path d="M31 24H20v7c0 9 6 15 15 15M61 24h11v7c0 9-6 15-15 15" fill="none" stroke="${complete ? "#B45309" : "#94A3B8"}" stroke-width="4" stroke-linejoin="round"/><path d="M46 56v12M33 76h26M38 68h16v8H38z" fill="none" stroke="${complete ? "#B45309" : "#94A3B8"}" stroke-width="4" stroke-linecap="round"/><path d="m46 25 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z" fill="#fff"/></svg>`;
  const getSection = (id = state.selectedSectionId) => pack.sections.find((section) => section.id === id) || pack.sections[0];
  const getCompetency = (id) => pack.competencies.find((competency) => competency.id === id) || pack.competencies[0];
  const getSource = (id) => pack.sources.find((source) => source.id === id);
  const activeTopicTitle = () => state.pathTopic || pack.topic.title;
  const topicProgress = () => Math.round((pack.sections.filter((section) => state.completedSections[section.id]).length / pack.sections.length) * 100);
  const activeDiagnosticQuestions = () => state.assessmentQuestions?.diagnostic?.length ? state.assessmentQuestions.diagnostic : pack.diagnosticQuestions;
  const activeMasteryQuestions = () => state.assessmentQuestions?.mastery?.[state.selectedSectionId]?.length ? state.assessmentQuestions.mastery[state.selectedSectionId] : getSection().masteryQuestions || pack.masteryQuestions || [];
  const activeFinalQuestions = () => state.assessmentQuestions?.final?.length ? state.assessmentQuestions.final : pack.finalQuestions;
  const plannedAssessmentCount = (mode, sectionId = state.selectedSectionId) => {
    if (mode === "mastery") return Math.max(3, Math.min(8, ((getSection(sectionId).concepts || []).length || (getSection(sectionId).checklist || []).length || 2) * 2));
    const perSection = 2;
    return Math.max(mode === "final" ? 6 : 4, Math.min(mode === "final" ? 24 : 20, pack.sections.length * perSection));
  };
  const assessmentStatus = (mode) => {
    const meta = mode === "mastery" ? state.assessmentMeta?.mastery?.[state.selectedSectionId] : state.assessmentMeta?.[mode];
    return meta?.live ? "AI sinh câu hỏi" : meta ? "Fallback theo nội dung" : "Câu hỏi đang chuẩn bị";
  };
  const nextRecommendedSection = () => {
    const recommendedIds = (state.aiAnalysis?.recommended_path || state.recommendedPath || []).map((step) => step.section_id);
    const currentSections = pack.sections.filter((section, index) => sectionState(section, index) === "current");
    return recommendedIds.map((id) => currentSections.find((section) => section.id === id)).find(Boolean) || currentSections[0] || pack.sections[0];
  };
  const sourceChips = (ids = []) => ids.map((id) => `<span class="source-chip"><span class="source-chip-dot"></span>${escapeHtml(id)}</span>`).join("");
  const sourceReferenceCards = (result) => {
    if (!result?.sources?.length) return `<div class="source-empty">Chưa có nguồn phù hợp. Hãy thử tìm lại với mục tiêu cụ thể hơn.</div>`;
    return result.sources.map((source) => `<article class="reference-card"><div class="reference-card-top"><span class="source-type">${escapeHtml(source.type || "Reference")}</span><span class="verified-mark">${icon("shield")} Đã lọc</span></div><h3>${escapeHtml(source.title)}</h3><p>${escapeHtml(source.summary)}</p><div class="reference-card-meta"><span>${escapeHtml(source.publisher)}</span><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener">Mở nguồn ${icon("arrow")}</a></div><small>${escapeHtml(source.why_selected || "Nguồn được chọn vì liên quan đến section.")}</small></article>`).join("");
  };
  const externalSourceLinks = (urls = []) => urls.map((url) => `<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(new URL(url).hostname.replace(/^www\./, ""))} ${icon("arrow")}</a>`).join("");
  const statusBadge = (label, type = "neutral") => `<span class="status-badge status-${type}"><span class="status-badge-dot"></span>${escapeHtml(label)}</span>`;
  const roadmapReferenceLink = (label = "Mở AI Engineer roadmap") => {
    const reference = pack.topic.roadmapRef || { label: "AI Engineer Roadmap · roadmap.sh", url: "https://roadmap.sh/ai-engineer" };
    return `<a class="roadmap-reference-link" href="${escapeHtml(reference.url)}" target="_blank" rel="noreferrer noopener">${icon("route")} ${escapeHtml(label)} ${icon("arrow")}</a>`;
  };

  const renderAuth = () => {
    if (!authContainer) return;
    const registerMode = authMode === "register";
    authContainer.innerHTML = `<div class="auth-heading"><h1>${registerMode ? "Tạo tài khoản Pathwise" : "Chào mừng trở lại"}</h1><p>${registerMode ? "Đăng ký để lưu riêng mục tiêu, tiến độ và lịch sử học của bạn." : "Đăng nhập để tiếp tục learning path của bạn."}</p></div><form id="auth-form" class="auth-form" novalidate>${registerMode ? `<div class="auth-field"><label for="auth-name">Tên hiển thị</label><input id="auth-name" name="name" type="text" autocomplete="name" placeholder="Ví dụ: Nguyễn Minh Anh" required /></div>` : ""}<div class="auth-field"><label for="auth-email">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required /></div><div class="auth-field"><label for="auth-password">Mật khẩu</label><input id="auth-password" name="password" type="password" autocomplete="${registerMode ? "new-password" : "current-password"}" placeholder="Tối thiểu 6 ký tự" required /></div>${registerMode ? `<div class="auth-field"><label for="auth-confirm-password">Xác nhận mật khẩu</label><input id="auth-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" placeholder="Nhập lại mật khẩu" required /></div>` : ""}<button class="primary-button auth-submit" type="submit">${registerMode ? "Đăng ký tài khoản" : "Đăng nhập"} ${icon("arrow")}</button></form>${authNotice ? `<p class="auth-message ${authNoticeIsError ? "is-error" : ""}" role="status">${escapeHtml(authNotice)}</p>` : ""}<p class="auth-switch">${registerMode ? "Đã có tài khoản?" : "Chưa có tài khoản?"} <button type="button" data-auth-action="switch">${registerMode ? "Đăng nhập" : "Đăng ký ngay"}</button></p><p class="auth-hint">${API_BASE ? "Tài khoản và tiến độ được lưu trên hệ thống." : "Dữ liệu learning path được lưu trên thiết bị này khi chạy local."}</p>`;
    const firstField = authContainer.querySelector("input");
    window.setTimeout(() => firstField?.focus({ preventScroll: true }), 0);
  };

  const showAuth = (mode = "login", notice = "", isError = false) => {
    authMode = mode;
    authNotice = notice;
    authNoticeIsError = isError;
    if (authGate) authGate.hidden = false;
    if (appShell) appShell.hidden = true;
    document.body.classList.add("is-authenticated-out");
    renderAuth();
  };

  const updateAccountUi = () => {
    if (!currentUser) return;
    document.querySelectorAll(".sidebar-account .account-details strong").forEach((element) => { element.textContent = learnerName(); });
    document.querySelectorAll(".sidebar-account .account-details small").forEach((element) => { element.textContent = currentUser.email; });
    document.querySelectorAll(".sidebar-account .avatar").forEach((element) => { element.textContent = userInitial(); });
    const account = document.querySelector(".sidebar-account");
    if (account) { account.setAttribute("aria-label", `Hồ sơ của ${learnerName()}`); account.title = `Hồ sơ của ${learnerName()}`; }
    document.querySelectorAll(".message-avatar").forEach((element) => { if (element.textContent.trim() === "H") element.textContent = userInitial(); });
  };

  const showAppForUser = async (user, token = "") => {
    currentUser = user;
    if (token) setAuthToken(token);
    cloudSessionKey = `pathwise-cloud-user-${user.id}`;
    cloudHydrated = !API_BASE;
    setAuthSession(user.id);
    migrateLegacyState(user.id);
    await hydrateContentCatalog();
    restoreState();
    if (authGate) authGate.hidden = true;
    if (appShell) appShell.hidden = false;
    document.body.classList.remove("is-authenticated-out");
    render();
    refreshEnvironmentStatus();
    if (API_BASE) await hydrateCloudState();
  };

  const logout = () => {
    persistState();
    window.clearTimeout(cloudSaveTimer);
    if (API_BASE && authToken) fetch(`${API_BASE}/api/auth/logout`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: "{}" }).catch(() => {});
    currentUser = null;
    cloudSessionKey = "";
    cloudHydrated = !API_BASE;
    clearAuthToken();
    resetInMemoryState();
    clearAuthSession();
    window.history.replaceState(null, "", "#setup");
    showAuth("login", "Bạn đã đăng xuất. Đăng nhập để tiếp tục.");
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    if (authContainer?.querySelector("button[type='submit']")?.disabled) return;
    const form = event.target;
    const data = new FormData(form);
    const email = normalizeEmail(data.get("email"));
    const password = String(data.get("password") || "");
    const name = String(data.get("name") || "").trim();
    const confirmPassword = String(data.get("confirmPassword") || "");
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { showAuth(authMode, "Hãy nhập email hợp lệ.", true); return; }
    if (password.length < 6) { showAuth(authMode, "Mật khẩu cần có ít nhất 6 ký tự.", true); return; }
    if (API_BASE) {
      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      if (authMode === "register") {
        if (name.length < 2) { showAuth("register", "Hãy nhập tên hiển thị.", true); return; }
        if (password !== confirmPassword) { showAuth("register", "Mật khẩu xác nhận chưa khớp.", true); return; }
      }
      const submitButton = authContainer?.querySelector("button[type='submit']");
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = authMode === "register" ? "Đang tạo tài khoản..." : "Đang đăng nhập..."; }
      try {
        const payload = await authRequest(endpoint, authMode === "register" ? { name, email, password } : { email, password });
        await showAppForUser(payload.user, payload.access_token);
        showToast(authMode === "register" ? "Tạo tài khoản thành công." : "Đăng nhập thành công.");
      } catch (error) {
        showAuth(authMode, error.message || "Không thể kết nối đến backend.", true);
      }
      return;
    }
    const users = readUsers();
    const passwordHash = await hashPassword(password);
    if (authMode === "register") {
      if (name.length < 2) { showAuth("register", "Hãy nhập tên hiển thị.", true); return; }
      if (password !== confirmPassword) { showAuth("register", "Mật khẩu xác nhận chưa khớp.", true); return; }
      if (users.some((user) => normalizeEmail(user.email) === email)) { showAuth("login", "Email này đã đăng ký. Hãy đăng nhập.", true); document.querySelector("#auth-email")?.setAttribute("value", email); return; }
      const user = { id: randomId(), name, email, passwordHash, createdAt: new Date().toISOString() };
      if (!writeUsers([...users, user])) { showAuth("register", "Không thể lưu tài khoản trên thiết bị này.", true); return; }
      migrateLegacyState(user.id);
      showAuth("login", "Đăng ký thành công. Hãy đăng nhập để tiếp tục.");
      return;
    }
    const user = users.find((candidate) => normalizeEmail(candidate.email) === email);
    if (!user) { showAuth("login", "Tài khoản chưa đăng ký. Hãy tạo tài khoản trước.", true); return; }
    if (user.passwordHash !== passwordHash) { showAuth("login", "Email hoặc mật khẩu không đúng.", true); return; }
    await showAppForUser(user);
  };

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add("is-visible");
    liveRegion.textContent = message;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  };

  const authRequest = async (endpoint, payload) => {
    const response = await fetch(`${API_BASE}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Không thể kết nối đến backend.");
    return result;
  };

  const apiRequest = async (endpoint, payload) => {
    const response = await fetch(`${API_BASE}${endpoint}`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) { clearAuthToken(); clearAuthSession(); currentUser = null; showAuth("login", "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.", true); }
      throw new Error(result.message || `api_${response.status}`);
    }
    return result;
  };

  const assessmentSections = () => pack.sections.map((section) => ({
    id: section.id,
    title: section.title,
    competency_id: section.competencyId,
    objective: section.objective,
    concepts: (section.concepts || []).map((concept) => ({ title: concept.title, body: concept.body })),
    checklist: section.checklist || [],
    source_ids: section.sourceIds || [],
  }));

  const fallbackQuestionsFor = (mode, sectionId = state.selectedSectionId) => {
    if (mode === "diagnostic") return pack.diagnosticQuestions;
    if (mode === "mastery") return getSection(sectionId).masteryQuestions || [];
    return pack.finalQuestions;
  };

  const assessmentSeed = (value) => [...String(value || "")].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
  const shuffleAssessmentQuestion = (question) => {
    if (question.optionsShuffled || !Array.isArray(question.options) || question.options.length !== 4) return question;
    const correctIndex = Number(question.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return question;
    const entries = question.options.map((option, index) => ({ option, originalIndex: index }));
    let seed = assessmentSeed(question.id || question.prompt);
    for (let index = entries.length - 1; index > 0; index -= 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const swapIndex = seed % (index + 1);
      [entries[index], entries[swapIndex]] = [entries[swapIndex], entries[index]];
    }
    return {
      ...question,
      options: entries.map((entry) => entry.option),
      correctIndex: entries.findIndex((entry) => entry.originalIndex === correctIndex),
      optionsShuffled: true,
    };
  };
  const normalizeAssessmentQuestions = (questions) => (Array.isArray(questions) ? questions : []).map((question) => shuffleAssessmentQuestion({
    ...question,
    competencyId: question.competencyId || question.competency_id,
    sectionId: question.sectionId || question.section_id,
    correctIndex: question.correctIndex ?? question.correct_index,
    sourceIds: question.sourceIds || question.source_ids || [],
  }));

  const loadAssessment = async (mode, sectionId = state.selectedSectionId) => {
    const loadingView = mode === "diagnostic" ? "diagnostic-loading" : mode === "mastery" ? "mastery-loading" : "assessment-loading";
    const targetView = mode === "diagnostic" ? "diagnostic" : mode === "mastery" ? "mastery" : "assessment";
    state.view = loadingView;
    render();
    const fallbackQuestions = normalizeAssessmentQuestions(fallbackQuestionsFor(mode, sectionId));
    try {
      const response = await apiRequest("/api/learning/assessment", {
        mode,
        topic_id: pack.topic.id,
        topic_label: state.pathTopic || pack.topic.title,
        topic_objective: pack.topic.objective,
        section_id: sectionId,
        learner_level: state.pathLevel,
        available_time_minutes: state.timePlan,
        sections: assessmentSections(),
        fallback_questions: fallbackQuestions,
      });
      const questions = normalizeAssessmentQuestions(response.data?.questions || []);
      if (!questions.length) throw new Error("assessment_empty");
      if (mode === "diagnostic") state.assessmentQuestions.diagnostic = questions;
      if (mode === "mastery") state.assessmentQuestions.mastery[sectionId] = questions;
      if (mode === "final") state.assessmentQuestions.final = questions;
      if (mode === "mastery") state.assessmentMeta.mastery[sectionId] = response.meta;
      else state.assessmentMeta[mode] = response.meta;
    } catch {
      if (mode === "diagnostic") state.assessmentQuestions.diagnostic = fallbackQuestions;
      if (mode === "mastery") state.assessmentQuestions.mastery[sectionId] = fallbackQuestions;
      if (mode === "final") state.assessmentQuestions.final = fallbackQuestions;
      const fallbackMeta = { live: false, provider: "content-fallback", fallback_reason: "assessment_backend_unavailable" };
      if (mode === "mastery") state.assessmentMeta.mastery[sectionId] = fallbackMeta;
      else state.assessmentMeta[mode] = fallbackMeta;
    }
    state.diagnosticIndex = mode === "diagnostic" ? 0 : state.diagnosticIndex;
    state.masteryIndex = mode === "mastery" ? 0 : state.masteryIndex;
    state.finalIndex = mode === "final" ? 0 : state.finalIndex;
    state.view = targetView;
    window.history.replaceState(null, "", `#${state.view}`);
    render();
  };

  const refreshEnvironmentStatus = async () => {
    const badge = document.querySelector("#environment-badge");
    const label = badge?.querySelector(".environment-label");
    if (!badge || !label) return;
    try {
      const response = await fetch(`${API_BASE}/api/health`);
      if (!response.ok) throw new Error("health_unavailable");
      const health = await response.json();
      const databaseReady = Boolean(health.database?.ready && contentSource === "database");
      const documentReady = Boolean(health.document?.loaded);
      label.textContent = databaseReady && documentReady ? "Production live" : databaseReady ? "DB live · PDF cần cấu hình" : "Backend fallback";
      badge.dataset.live = String(databaseReady && documentReady);
      badge.title = databaseReady && documentReady ? "Nội dung và tiến độ đang lấy từ production backend." : databaseReady ? "Database đã sẵn sàng nhưng tài liệu grounding chưa được nạp." : "Đang dùng fallback; kiểm tra kết nối backend.";
    } catch {
      label.textContent = "Static demo";
      badge.dataset.live = "false";
    }
  };

  const hydrateCloudState = async () => {
    if (!API_BASE || !currentUser || !cloudSessionKey) return;
    const userId = currentUser.id;
    try {
      const response = await fetch(`${API_BASE}/api/session?session_key=${encodeURIComponent(cloudSessionKey)}`, { headers: authHeaders() });
      if (!response.ok) throw new Error("session_unavailable");
      const payload = await response.json();
      if (currentUser?.id === userId && payload.state && typeof payload.state === "object") {
        Object.assign(state, payload.state);
        if (payload.state.assessmentVersion !== ASSESSMENT_VERSION) resetAssessmentState();
      }
    } catch {}
    cloudHydrated = true;
    render();
  };

  const confidenceTier = (value) => value >= 0.8 ? "high" : value >= 0.5 ? "medium" : "low";

  const localAnalysis = () => {
    const gaps = activeDiagnosticQuestions().filter((question) => state.diagnosticAnswers[question.id] !== question.correctIndex);
    const gapCompetencies = [...new Set(gaps.map((question) => question.competencyId))];
    const selected = gapCompetencies.length ? gapCompetencies : ["ml-foundations"];
    const competencyGaps = selected.map((id) => {
      const competency = getCompetency(id);
      return { competency_id: id, severity: gapCompetencies.includes(id) ? "high" : "medium", reason: `Ưu tiên ${competency.title} dựa trên tín hiệu diagnostic và prerequisite.`, source_ids: competency.sourceIds };
    });
    return { status: "ok", confidence: 0.72, competency_gaps: competencyGaps, recommended_path: selected.map((id) => pack.sections.find((section) => section.competencyId === id)).filter(Boolean).map((section) => ({ section_id: section.id, reason: `Xử lý gap ${section.title} trước khi mở nội dung phụ thuộc.`, estimated_minutes: Number.parseInt(section.duration, 10) || 10 })), next_action: "study", reason: "Đã có đủ tín hiệu tối thiểu để tạo lộ trình local an toàn." };
  };

  const baselineAnalysis = () => ({
    status: "baseline",
    confidence: 0.55,
    competency_gaps: [{ competency_id: "ml-foundations", severity: "unknown", reason: "Bạn chọn bắt đầu từ số 0 nên hệ thống ưu tiên nền tảng trước khi đánh giá chi tiết.", source_ids: ["GML-CH01"] }],
    recommended_path: pack.sections.map((section, index) => ({ section_id: section.id, reason: index === 0 ? "Bắt đầu từ nền tảng để tạo ngữ cảnh chung." : `Học sau khi hoàn thành prerequisite của ${pack.sections[index - 1].title}.`, estimated_minutes: Number.parseInt(section.duration, 10) || 10 })),
    next_action: "study",
    reason: "Bạn đã chọn bắt đầu từ số 0. Hệ thống bỏ qua bài test đầu vào và dựng roadmap nền tảng theo mục tiêu cùng thời lượng của bạn.",
  });

  const formatFocusTimer = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };
  const stopFocusTimer = () => {
    if (focusInterval) { window.clearInterval(focusInterval); focusInterval = null; }
  };
  const tickFocusTimer = () => {
    focusRemainingSeconds = Math.max(0, focusRemainingSeconds - 1);
    const timerEl = document.querySelector(".focus-timer strong");
    if (timerEl) timerEl.textContent = formatFocusTimer(focusRemainingSeconds);
    if (focusRemainingSeconds <= 0) { stopFocusTimer(); showToast("Đã hết thời gian phiên học đề xuất."); }
  };
  const startFocusTimer = () => {
    stopFocusTimer();
    const minutes = Number.parseInt(getSection().duration, 10) || 10;
    focusRemainingSeconds = minutes * 60;
    state.focusStarted = true;
    focusInterval = window.setInterval(tickFocusTimer, 1000);
  };
  const ensureFocusTimerRunning = () => {
    const section = getSection();
    const index = pack.sections.findIndex((item) => item.id === section.id);
    if (sectionState(section, index) === "locked") { stopFocusTimer(); return; }
    if (!focusInterval) startFocusTimer();
  };

  const sidebarMedia = window.matchMedia("(max-width: 760px)");
  let sidebarCollapsed = false;
  try { sidebarCollapsed = localStorage.getItem("pathwise-sidebar-collapsed") === "true"; } catch {}
  const syncSidebar = () => {
    const sidebar = document.querySelector(".sidebar");
    const expanded = sidebarMedia.matches ? sidebar.classList.contains("is-open") : !sidebarCollapsed;
    document.body.classList.toggle("sidebar-collapsed", sidebarCollapsed);
    sidebar.inert = sidebarMedia.matches && !expanded;
    document.querySelectorAll('[data-action="toggle-sidebar"]').forEach((button) => {
      const label = expanded ? (sidebarMedia.matches ? "Đóng thanh bên" : "Thu gọn thanh bên") : "Mở rộng thanh bên";
      button.setAttribute("aria-expanded", String(expanded));
      button.setAttribute("aria-controls", "workspace-sidebar");
      button.setAttribute("aria-label", label);
      button.title = label;
    });
  };
  const closeSidebar = () => {
    const sidebar = document.querySelector(".sidebar");
    if (sidebarMedia.matches && sidebar.contains(document.activeElement)) document.querySelector(".mobile-menu")?.focus();
    sidebar.classList.remove("is-open");
    syncSidebar();
  };
  sidebarMedia.addEventListener("change", closeSidebar);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSidebar(); });
  document.querySelectorAll(".nav-item, .sidebar-link").forEach((item) => {
    const label = item.querySelector("span:nth-child(2)")?.textContent || item.textContent.trim();
    item.setAttribute("aria-label", label);
    item.title = label;
  });
  syncSidebar();

  const setView = (view, options = {}) => {
    state.view = view;
    if (options.hash !== false) window.history.replaceState(null, "", `#${view}`);
    if (view === "study") ensureFocusTimerRunning(); else stopFocusTimer();
    render();
    if (options.scroll !== false) document.querySelector("#main-content")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pageHeader = (eyebrow, title, description, action = "") => `
    <div class="page-header">
      <div><p class="page-eyebrow">${escapeHtml(eyebrow)}</p><h1>${title}</h1>${description ? `<p class="page-description">${description}</p>` : ""}</div>
      ${action}
    </div>`;

  const metrics = () => `
    <section class="metric-grid" aria-label="Chỉ số học tập">
      <article class="metric-card"><div class="metric-icon metric-icon-indigo">${icon("pulse")}</div><div><span>Topic mastery</span><strong>${topicProgress()}<span class="metric-unit">%</span></strong><small>${topicProgress() ? "Cập nhật theo section đã pass" : "Bắt đầu từ diagnostic đầu vào"}</small></div></article>
      <article class="metric-card"><div class="metric-icon metric-icon-mint">${icon("clock")}</div><div><span>Thời gian tuần này</span><strong>0<span class="metric-unit">m</span></strong><small>Chưa có phiên học trong path này</small></div></article>
      <article class="metric-card"><div class="metric-icon metric-icon-coral">${icon("flame")}</div><div><span>Learning streak</span><strong>0<span class="metric-unit"> ngày</span></strong><small>Bắt đầu sau phiên học đầu tiên</small></div></article>
      <article class="metric-card"><div class="metric-icon metric-icon-slate">${icon("check")}</div><div><span>Điểm cần pass</span><strong>80<span class="metric-unit">%</span></strong><small>áp dụng cho mỗi section</small></div></article>
    </section>`;

  const renderSetup = () => `
    ${pageHeader("PERSONALIZE YOUR PATH", "Bắt đầu từ mục tiêu của bạn", "Nhập điều bạn muốn học. Pathwise sẽ dùng mục tiêu, nền tảng và quỹ thời gian của bạn để tạo lộ trình — không tự chọn chủ đề thay bạn.", "")}
    <div class="setup-layout">
      <section class="setup-main panel-card">
        <div class="setup-step"><span>01</span><div><span class="panel-kicker">MỤC TIÊU HỌC</span><h2>Bạn muốn học chủ đề gì?</h2><p>Viết theo cách bạn thường nói. Ví dụ: “Machine Learning để trở thành AI Engineer” hoặc “LLM và RAG cho người mới”.</p></div></div>
        <div class="topic-input-card">
          <label class="field-label" for="path-topic">Chủ đề hoặc kỹ năng muốn học</label>
          <textarea id="path-topic" name="path_topic" rows="2" maxlength="120" placeholder="Ví dụ: Machine Learning cho AI Engineer">${escapeHtml(state.pathTopic)}</textarea>
          <div class="topic-input-footer"><small>Chủ đề này sẽ trở thành đầu vào của diagnostic và roadmap.</small><span>${state.pathTopic.trim().length}/120</span></div>
          <div class="topic-suggestions" aria-label="Gợi ý chủ đề"><span>Gợi ý:</span>${topicSuggestions.map((topic) => `<button type="button" class="topic-suggestion" data-action="fill-topic" data-topic="${escapeHtml(topic)}">${escapeHtml(topic)}</button>`).join("")}</div>
        </div>
        <div class="setup-step"><span>02</span><div><span class="panel-kicker">ĐIỂM BẮT ĐẦU</span><h2>Bạn đang ở đâu với chủ đề này?</h2><p>Chọn “biết sơ qua” để làm diagnostic ngay, hoặc “chưa biết gì” để bắt đầu từ roadmap nền tảng.</p></div></div>
        <div class="segmented-choice" role="group" aria-label="Trình độ hiện tại">
          ${[["new", "Chưa biết gì", "Đi thẳng tới roadmap nền tảng"], ["beginner", "Biết sơ qua", "Vào diagnostic ngay"]].map(([value, label, help]) => `<button class="level-choice ${state.pathLevel === value ? "is-selected" : ""}" type="button" data-action="select-path-level" data-level="${value}" aria-pressed="${state.pathLevel === value}"><strong>${label}</strong><small>${help}</small></button>`).join("")}
        </div>
        <div class="setup-step"><span>03</span><div><span class="panel-kicker">THỜI GIAN</span><h2>Mỗi ngày bạn có bao nhiêu thời gian?</h2><p>Tự nhập số phút bạn thực sự có; Pathwise sẽ dùng con số này để chia nhỏ session.</p></div></div>
        <div class="minutes-field"><label class="field-label" for="path-minutes">Thời gian học mỗi ngày</label><div class="minutes-input-wrap"><input id="path-minutes" name="path_minutes" type="number" min="10" max="240" step="1" inputmode="numeric" value="${state.pathMinutes === "" ? "" : escapeHtml(state.pathMinutes)}" placeholder="Ví dụ: 35" aria-describedby="path-minutes-help path-minutes-error" /><span>phút / ngày</span></div><small id="path-minutes-help">Nhập từ 10 đến 240 phút. Bạn có thể điều chỉnh lại sau.</small><small id="path-minutes-error" class="field-error" ${state.pathMinutes === "" || isValidMinutes(state.pathMinutes) ? "hidden" : ""}>Thời gian phải nằm trong khoảng 10–240 phút.</small></div>
        <div class="setup-footer"><span>${!isValidTopic(state.pathTopic) ? "Nhập một chủ đề để tiếp tục." : !isValidMinutes(state.pathMinutes) ? "Nhập thời gian học để tiếp tục." : state.pathLevel === "new" ? "Sẽ bỏ qua diagnostic và tạo roadmap nền tảng." : "Đã đủ thông tin để vào diagnostic."}</span><button class="primary-button" type="button" data-action="create-path" ${isValidTopic(state.pathTopic) && isValidMinutes(state.pathMinutes) ? "" : "disabled"}>${state.pathLevel === "new" ? "Tạo roadmap nền tảng" : "Bắt đầu diagnostic"} ${icon("arrow")}</button></div>
      </section>
      <aside class="setup-aside"><div class="setup-preview panel-card"><span class="panel-kicker">SAU KHI THIẾT LẬP</span><h3>Pathwise sẽ làm gì?</h3><div class="setup-preview-row"><span>01</span><p>${state.pathLevel === "new" ? "Dựng roadmap nền tảng từ mục tiêu của bạn" : "Mở diagnostic ngay để đánh giá mức độ bao phủ"}</p></div><div class="setup-preview-row"><span>02</span><p>Ưu tiên competency và section cần học</p></div><div class="setup-preview-row"><span>03</span><p>Đưa nội dung, ví dụ và bài thực hành theo section</p></div><div class="setup-preview-row"><span>04</span><p>Kiểm tra mastery bao quát trước khi mở bước tiếp</p></div></div><div class="setup-note panel-card"><span class="application-icon">${icon("shield")}</span><div><strong>Bạn luôn kiểm soát lộ trình</strong><p>Chủ đề do bạn nhập. Nội dung demo hiện có được map đầy đủ cho Machine Learning; chủ đề khác được giữ làm mục tiêu để mở rộng nội dung.</p></div></div></aside>
    </div>`;

  const renderOverview = () => {
    const firstSection = getSection();
    const diagnosticDone = state.diagnosticSubmitted || state.diagnosticSkipped;
    const nextTitle = diagnosticDone ? firstSection.title : "Làm diagnostic đầu vào";
    const nextCopy = diagnosticDone ? (state.diagnosticSkipped ? "Bắt đầu từ nền tảng đã được sắp theo mục tiêu của bạn." : "Bắt đầu section được ưu tiên từ kết quả đánh giá của bạn.") : `${plannedAssessmentCount("diagnostic")} câu hỏi dự kiến · số lượng theo phạm vi nội dung · bao phủ ${pack.competencies.length} competency`;
    const nextAction = diagnosticDone ? "Tiếp tục section" : "Bắt đầu diagnostic";
    const nextActionName = diagnosticDone ? "go-study" : "start-diagnostic";
    return `
      ${pageHeader("LEARNING PATH · AI ENGINEER", `Chào ${escapeHtml(learnerName())}, bắt đầu đúng nền tảng.`, `Mục tiêu của bạn: <strong>${escapeHtml(activeTopicTitle())}</strong>. Pathwise dùng mục tiêu, ${state.diagnosticSkipped ? "mức bắt đầu từ số 0" : "diagnostic"} và tài liệu ${escapeHtml(pack.topic.documentName)} để sắp xếp bước học phù hợp.`, `<button class="secondary-button compact-button" type="button" data-action="topic-menu">${icon("route")} Sửa mục tiêu <span class="chevron">⌄</span></button>`)}
      <div class="overview-top-grid">
          <article class="mastery-hero panel-card">
          <div class="panel-kicker-row"><span class="panel-kicker">TIẾN ĐỘ CHỦ ĐỀ</span>${statusBadge("Đang học", "success")}</div>
          <div class="mastery-hero-main"><div class="progress-ring" style="--progress:${topicProgress()}"><div><strong>${topicProgress()}</strong><span>%</span></div></div><div><h2>${escapeHtml(activeTopicTitle())}</h2><p>${pack.topic.objective}</p><div class="inline-meta"><span>${icon("file")} ${pack.competencies.length} competencies mapped</span><span>${icon("clock")} ${pack.topic.duration}</span></div></div></div>
          <div class="hero-progress-line"><div><span>Mastery hiện tại</span><strong>${topicProgress()} / 100</strong></div><div class="progress-bar"><i style="width:${topicProgress()}%"></i></div></div>
        </article>
        <article class="next-action-card panel-card"><div class="panel-kicker-row"><span class="panel-kicker">NEXT BEST ACTION</span><span class="action-spark">${icon("spark")}</span></div><div class="next-action-number">01</div><h2>${nextTitle}</h2><p>${nextCopy}</p><div class="next-action-footer"><span class="time-label">${icon("clock")} ${diagnosticDone ? firstSection.duration : "5 phút"}</span><button class="primary-button compact-button" type="button" data-action="${nextActionName}">${nextAction} ${icon("arrow")}</button></div></article>
      </div>
      ${metrics()}
      <div class="section-heading"><div><p class="section-eyebrow">COMPETENCY MAP</p><h2>Bản đồ năng lực</h2></div><button class="link-button" type="button" data-view="roadmap">Xem roadmap ${icon("arrow")}</button></div>
      <section class="competency-grid" aria-label="Bản đồ năng lực">
        ${pack.competencies.map((competency) => `<article class="competency-card ${competency.status === "locked" ? "is-locked" : ""}"><div class="competency-top"><span class="competency-index">${String(pack.competencies.indexOf(competency) + 1).padStart(2, "0")}</span>${statusBadge(competency.statusLabel, competency.status === "gap" ? "warning" : competency.status === "progress" ? "info" : competency.status === "locked" ? "locked" : "success")}</div><h3>${escapeHtml(competency.title)}</h3><p>${escapeHtml(competency.summary)}</p><div class="competency-progress"><div class="progress-bar"><i class="bar-${competency.color}" style="width:${competency.mastery}%"></i></div><strong>${competency.mastery}%</strong></div><span class="competency-foot">${competency.status === "gap" ? "Ưu tiên trong lộ trình" : competency.status === "locked" ? "Pass section trước để mở" : "Tín hiệu đang tốt"}</span></article>`).join("")}
      </section>
      <div class="overview-bottom-grid">
        <article class="roadmap-preview panel-card"><div class="section-heading compact-heading"><div><p class="section-eyebrow">YOUR PATH</p><h2>Lộ trình cá nhân</h2></div><button class="link-button" type="button" data-view="roadmap">Mở đầy đủ ${icon("arrow")}</button></div><div class="mini-timeline">${pack.sections.map((section, index) => { const status = sectionState(section, index); return `<button class="mini-timeline-item ${status}" type="button" data-action="go-section" data-section-id="${section.id}"><span class="timeline-node">${status === "complete" ? icon("check") : section.number}</span><span><strong>${escapeHtml(section.title)}</strong><small>${status === "complete" ? "Đã hoàn thành" : status === "current" ? "Bước tiếp theo · " + section.duration : status === "next" ? "Sau khi pass section 01" : "Đang khóa"}</small></span>${status === "current" ? `<span class="mini-arrow">${icon("arrow")}</span>` : ""}</button>`; }).join("")}</div></article>
        <article class="evidence-preview panel-card"><div class="panel-kicker-row"><span class="panel-kicker">SOURCE-GROUNDED</span>${statusBadge(`${pack.sources.length} sources mapped`, "info")}</div><h2>Quyết định học có căn cứ</h2><p>Pathwise dùng tài liệu có sẵn hoặc tìm thêm nguồn chính thống khi section chưa có học liệu phù hợp.</p><div class="source-list-compact">${pack.sources.slice(0, 3).map((source) => `<div class="source-row"><span class="source-row-icon">${icon("file")}</span><span><strong>${source.id}</strong><small>${escapeHtml(source.label)}</small></span></div>`).join("")}</div><button class="outline-button full-button" type="button" data-action="go-study">Mở learning package ${icon("arrow")}</button>${roadmapReferenceLink("Xem khung AI Engineer trên roadmap.sh")}</article>
      </div>`;
  };

  const sectionState = (section, index) => {
    if (state.completedSections[section.id]) return "complete";
    if (index === 0) return "current";
    if (state.completedSections[pack.sections[index - 1].id]) return "current";
    return section.status === "next" ? "next" : "locked";
  };

  const diagnosticCoverage = () => {
    const covered = new Set(activeDiagnosticQuestions().filter((question) => state.diagnosticAnswers[question.id] !== undefined).map((question) => question.competencyId));
    return { covered: covered.size, total: pack.competencies.length };
  };

  const renderDiagnostic = () => {
    if (state.diagnosticSkipped) {
      return `${pageHeader("DIAGNOSTIC · ĐÃ BỎ QUA", "Bạn đang bắt đầu từ nền tảng", "Vì bạn chọn chưa biết gì, Pathwise đi thẳng vào roadmap prerequisite và sẽ kiểm tra mastery sau từng section.", `<button class="outline-button compact-button" type="button" data-view="roadmap">Mở roadmap ${icon("arrow")}</button>`)}<div class="locked-state panel-card"><span class="locked-state-icon">${icon("route")}</span><h2>Roadmap nền tảng đã sẵn sàng</h2><p>Diagnostic đầu vào được bỏ qua để bạn bắt đầu ngay từ section đầu tiên. Bạn vẫn có mastery test và remediation ở mỗi chặng.</p><button class="primary-button" type="button" data-view="roadmap">Xem lộ trình ${icon("arrow")}</button></div>`;
    }
    const questions = activeDiagnosticQuestions();
    const question = questions[state.diagnosticIndex] || questions[0];
    const selected = state.diagnosticAnswers[question.id];
    const confidence = state.diagnosticConfidence[question.id];
    const isLast = state.diagnosticIndex === questions.length - 1;
    return `
      ${pageHeader("DIAGNOSTIC · ĐÁNH GIÁ ĐẦU VÀO", "Đọc tín hiệu trước khi xếp lộ trình", `${questions.length} câu hỏi được sinh theo các competency và nội dung của topic. Kết quả dùng để chọn section ưu tiên, không thay thế mastery test.`, `<span class="assessment-rule"><span class="rule-icon">${icon("shield")}</span><span><strong>${escapeHtml(assessmentStatus("diagnostic"))}</strong><small>Pass mark chỉ áp dụng ở mastery test</small></span></span>`)}
      <div class="assessment-progress"><div><span>DIAGNOSTIC PROGRESS</span><strong>${state.diagnosticIndex + 1} <em>/ ${questions.length}</em></strong></div><div class="segmented-progress">${questions.map((item, index) => `<i class="${index < state.diagnosticIndex ? "is-done" : index === state.diagnosticIndex ? "is-current" : ""}"></i>`).join("")}</div></div>
      <div class="assessment-layout"><section class="assessment-card panel-card"><div class="question-meta"><span class="question-label">CÂU ${String(state.diagnosticIndex + 1).padStart(2, "0")}</span>${statusBadge(question.label, "info")}</div><h2 class="assessment-question">${escapeHtml(question.prompt)}</h2><div class="option-list" role="radiogroup" aria-label="Các lựa chọn trả lời">${question.options.map((option, index) => `<button class="option-button ${selected === index ? "is-selected" : ""}" type="button" role="radio" aria-checked="${selected === index}" data-action="answer-diagnostic" data-index="${index}"><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span>${selected === index ? `<span class="selected-check">${icon("check")}</span>` : ""}</button>`).join("")}</div><div class="confidence-block"><div><span class="field-label">Bạn chắc đến đâu?</span><small>Đây là tín hiệu cho lộ trình, không phải điểm số.</small></div><div class="confidence-options" role="group" aria-label="Mức độ tự tin">${[["high", "Chắc chắn", "Hiểu và giải thích được"], ["medium", "Phân vân", "Nhớ một phần"], ["low", "Đang đoán", "Chưa có cơ sở rõ"]].map(([value, label, help]) => `<button class="confidence-option ${confidence === value ? "is-selected" : ""}" type="button" data-action="diagnostic-confidence" data-value="${value}" aria-pressed="${confidence === value}"><strong>${label}</strong><small>${help}</small></button>`).join("")}</div></div><div class="assessment-footer"><button class="quiet-button" type="button" data-action="diagnostic-prev" ${state.diagnosticIndex === 0 ? "disabled" : ""}>${icon("back")} Câu trước</button><button class="primary-button" type="button" data-action="diagnostic-next" ${selected === undefined ? "disabled" : ""}>${isLast ? "Xem kết quả" : "Câu tiếp theo"} ${icon("arrow")}</button></div></section><aside class="assessment-aside"><div class="aside-card aside-note"><span class="aside-icon">${icon("spark")}</span><h3>Đo lỗ hổng, không đo trí nhớ</h3><p>Các câu hỏi đi qua nhiều competency để tạo tín hiệu ban đầu. Sai một câu không làm bạn quay về vạch xuất phát.</p></div><div class="aside-card"><span class="aside-label">COVERAGE MAP</span><div class="diagnostic-coverage"><strong>${diagnosticCoverage().covered}/${diagnosticCoverage().total}</strong><span>competency đã chạm tới</span></div><div class="plan-line"><span class="plan-dot is-active"></span><span><strong>Diagnostic</strong><small>${questions.length} câu · theo phạm vi nội dung</small></span></div><div class="plan-line"><span class="plan-dot"></span><span><strong>Personal roadmap</strong><small>Được tạo sau kết quả</small></span></div><div class="plan-line"><span class="plan-dot"></span><span><strong>Mastery test</strong><small>Pass từ 80% ở từng section</small></span></div></div></aside></div>`;
  };

  const diagnosticScore = () => {
    const questions = activeDiagnosticQuestions();
    const answered = questions.filter((question) => state.diagnosticAnswers[question.id] !== undefined);
    const correct = answered.filter((question) => state.diagnosticAnswers[question.id] === question.correctIndex).length;
    return { answered: answered.length, correct, total: questions.length, percent: Math.round((correct / questions.length) * 100) };
  };

  const submitDiagnostic = async (skip = false) => {
    const questions = activeDiagnosticQuestions();
    const payload = {
      topic_id: pack.topic.id,
      topic_label: state.pathTopic,
      assessment_mode: skip ? "baseline" : "diagnostic",
      learner: { name: learnerName(), cohort: pack.learner.cohort, target_role: pack.learner.targetRole, level: state.pathLevel },
      available_time_minutes: state.timePlan,
      answers: skip ? [] : questions.map((question) => ({
        question_id: question.id,
        competency_id: question.competencyId,
        answer_index: state.diagnosticAnswers[question.id],
        is_correct: state.diagnosticAnswers[question.id] === question.correctIndex,
        confidence: state.diagnosticConfidence[question.id] || "unset",
        source_ids: question.sourceIds,
      })),
    };
    try {
      const response = await apiRequest("/api/learning/analyze", payload);
      const baseline = baselineAnalysis();
      state.aiAnalysis = skip ? { ...baseline, status: response.data?.status || baseline.status } : response.data;
      state.agentMeta = response.meta;
      state.recommendedPath = state.aiAnalysis.recommended_path || [];
    } catch {
      state.aiAnalysis = skip ? baselineAnalysis() : localAnalysis();
      state.agentMeta = { live: false, provider: "local-fallback", fallback_reason: "backend_unavailable" };
      state.recommendedPath = state.aiAnalysis.recommended_path || [];
    }
    state.selectedSectionId = nextRecommendedSection().id;
    state.diagnosticSubmitted = !skip;
    state.diagnosticSkipped = skip;
    state.view = skip ? "roadmap" : "diagnostic-result";
    window.history.replaceState(null, "", `#${state.view}`);
    render();
    showToast(skip ? "Đã tạo roadmap nền tảng từ mục tiêu của bạn." : state.agentMeta?.live ? "Agent đã tạo learning profile có căn cứ." : "Đã tạo learning profile bằng fallback an toàn.");
  };

  const renderDiagnosticResult = () => {
    const score = diagnosticScore();
    const questions = activeDiagnosticQuestions();
    const analysis = state.aiAnalysis || localAnalysis();
    const gaps = questions.filter((question) => state.diagnosticAnswers[question.id] !== question.correctIndex);
    const nextSection = nextRecommendedSection();
    const agentStatus = state.agentMeta?.live ? statusBadge("AI agent live", "success") : statusBadge("Fallback an toàn", "neutral");
    return `
      ${pageHeader("DIAGNOSTIC · KẾT QUẢ", "Đây là điểm bắt đầu của lộ trình", "Kết quả được dùng để chọn thứ tự section. Bạn chưa cần học lại phần đã nắm được.", `<button class="outline-button compact-button" type="button" data-action="redo-diagnostic">Làm lại</button>`)}
      <div class="diagnostic-result-grid"><article class="score-card panel-card"><div class="score-card-top"><div class="score-circle"><strong>${score.percent}</strong><span>%</span></div><div><span class="panel-kicker">INITIAL SIGNAL</span><h2>${score.percent >= 80 ? "Nền tảng đang khá chắc" : "Đã tìm thấy điểm cần ưu tiên"}</h2><p>${score.correct}/${score.total} câu đúng · confidence được thu thập theo từng câu.</p></div></div><div class="result-meter"><div class="progress-bar"><i style="width:${score.percent}%"></i></div><span>Diagnostic không phải mastery test</span></div></article><article class="profile-card panel-card"><div class="panel-kicker-row"><span class="panel-kicker">LEARNING PROFILE</span>${agentStatus}</div><h2>Ưu tiên theo gap</h2><p>${escapeHtml(analysis.reason || (gaps.length ? `Hệ thống đưa ${gaps.length} tín hiệu cần ôn lên trước.` : "Bạn có thể đi thẳng tới section tiếp theo."))}</p><div class="profile-tags">${analysis.competency_gaps.slice(0, 3).map((gap) => `<span>${escapeHtml(getCompetency(gap.competency_id).title)}</span>`).join("")}</div>${roadmapReferenceLink("Đối chiếu với AI Engineer roadmap")}</article></div>
      <div class="section-heading result-heading"><div><p class="section-eyebrow">WHAT WE FOUND</p><h2>Tín hiệu từ bài làm</h2></div><span class="muted-label">Source-linked · ${gaps.length} gap cần xử lý</span></div>
      <div class="finding-list">${questions.map((question, index) => { const isCorrect = state.diagnosticAnswers[question.id] === question.correctIndex; return `<article class="finding-item"><span class="finding-number ${isCorrect ? "is-good" : "is-gap"}">${isCorrect ? icon("check") : String(index + 1).padStart(2, "0")}</span><div><div class="finding-title"><strong>${escapeHtml(question.label)}</strong>${statusBadge(isCorrect ? "Đã nắm tín hiệu" : "Cần ôn", isCorrect ? "success" : "warning")}</div><p>${isCorrect ? "Câu trả lời đang phù hợp với competency. Không đưa vào phần ưu tiên đầu tiên." : escapeHtml(question.explanation)}</p><div class="source-row-inline">${sourceChips(question.sourceIds)}</div></div></article>`; }).join("")}</div>
      <div class="result-cta panel-card"><div><span class="panel-kicker">NEXT BEST ACTION</span><h2>Đi vào lộ trình cá nhân</h2><p>Ưu tiên kế tiếp: ${escapeHtml(nextSection.title)}. Mỗi section có mastery test riêng với ngưỡng pass 80%.</p></div><button class="primary-button" type="button" data-view="roadmap">Xem roadmap ${icon("arrow")}</button></div>`;
  };

  const renderRoadmap = () => {
    const completedCount = pack.sections.filter((section) => state.completedSections[section.id]).length;
    const allSectionsComplete = completedCount === pack.sections.length;
    const prioritySection = allSectionsComplete ? pack.sections[pack.sections.length - 1] : nextRecommendedSection();
    const gapCount = state.diagnosticSkipped ? 0 : (state.aiAnalysis?.competency_gaps?.length || 2);
    const planSource = state.diagnosticSkipped ? `Bạn bắt đầu từ số 0 nên roadmap đi theo prerequisite, không ép bạn làm diagnostic trước.` : state.diagnosticSubmitted ? `Kết quả diagnostic đã được dùng để ưu tiên ${escapeHtml(prioritySection.title)}.` : "Làm diagnostic để tạo lộ trình sát với kiến thức hiện tại.";
    const progress = Math.round((completedCount / pack.sections.length) * 100);
    const avatarStop = journeyStops[Math.min(completedCount, journeyStops.length - 1)];
    const allComplete = completedCount === pack.sections.length;
    const microLabels = ["Nắm khái niệm", "Luyện tình huống", "Vượt mastery test"];
    const roadmapPath = "M180 100 C180 220 770 220 770 340 S240 470 240 590 S760 720 760 850 S220 980 220 1110 S760 1240 760 1370 C760 1480 500 1480 500 1580";
    return `
    ${pageHeader("LEARNING ROADMAP", "Hành trình AI Engineer của bạn", "Mỗi mastery test là một bước tiến thật. Hoàn thành ba điểm nhỏ để mở phần thưởng ở cột mốc tiếp theo.", `<div class="journey-header-actions"><button class="outline-button compact-button" type="button" data-action="preview-journey">${icon("route")} Xem chuyển động</button><div class="time-plan-control"><label for="time-plan-input">Thời gian hôm nay</label><div class="time-plan-input"><input id="time-plan-input" type="number" min="10" max="240" step="1" inputmode="numeric" value="${escapeHtml(state.timePlan)}" aria-label="Số phút học hôm nay" /><span>phút</span><button type="button" data-action="save-time-plan">Lưu</button></div><small>10–240 phút</small></div></div>`)}
    <section class="journey-overview" aria-label="Tóm tắt tiến độ">
      <div class="journey-overview-copy"><span class="summary-label">PERSONALISED QUEST</span><h2>${state.diagnosticSkipped ? "Khởi hành từ nền tảng" : "Đi theo đúng khoảng trống kiến thức"}</h2><p>${planSource}</p></div>
      <div class="journey-progress" role="progressbar" aria-label="Tiến độ lộ trình" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><div class="journey-progress-ring" style="--journey-progress:${progress}"><strong>${progress}%</strong><span>hoàn thành</span></div></div>
      <dl class="journey-facts"><div><dt>Đã pass</dt><dd>${completedCount}/${pack.sections.length}</dd></div><div><dt>Phiên hôm nay</dt><dd>${state.timePlan} phút</dd></div><div><dt>Mastery gate</dt><dd>80%</dd></div><div><dt>Gap ưu tiên</dt><dd>${gapCount}</dd></div></dl>
    </section>
    <div class="journey-legend" aria-label="Chú thích trạng thái"><span><i class="legend-swatch is-complete">${icon("check")}</i>Đã hoàn thành</span><span><i class="legend-swatch is-current"></i>Đang đứng</span><span><i class="legend-swatch"></i>Chưa đi qua</span></div>
    <section class="journey-map" aria-label="Bản đồ lộ trình học tập" style="--journey-progress:${progress}">
      <div class="journey-sky" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      <svg class="journey-road" width="1000" height="1660" viewBox="0 0 1000 1660" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="journey-road-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7775EE"/><stop offset=".55" stop-color="#4F46E5"/><stop offset="1" stop-color="#312E81"/></linearGradient></defs>
        <path class="road-shadow" d="${roadmapPath}"/>
        <path class="road-base" d="${roadmapPath}"/>
        <path class="road-center" d="${roadmapPath}"/>
        <path class="road-progress" pathLength="100" d="${roadmapPath}" style="stroke-dasharray:${progress} 100"/>
      </svg>
      ${journeyMicroStops.map((group, segmentIndex) => group.map((point, pointIndex) => { const isDone = Boolean(state.completedSections[pack.sections[segmentIndex].id]); return `<span class="journey-micro-point ${isDone ? "is-complete" : ""}" data-segment="${segmentIndex}" style="--point-x:${point.x}%;--point-y:${point.y}px" role="listitem" aria-label="${microLabels[pointIndex]}: ${isDone ? "đã hoàn thành" : "chưa hoàn thành"}">${isDone ? journeyFlag() : `<i>${pointIndex + 1}</i>`}<b>${escapeHtml(microLabels[pointIndex])}</b></span>`; }).join("")).join("")}
      ${pack.sections.map((section, index) => { const status = sectionState(section, index); const point = journeyStops[index]; const canOpen = status === "current" || status === "complete"; const unlocked = status !== "locked" && status !== "next"; const isRecommended = section.id === prioritySection.id && status === "current"; return `<article class="journey-checkpoint ${point.x < 50 ? "is-left" : "is-right"} ${status}" style="--point-x:${point.x}%;--point-y:${point.y}px;--mobile-y:${80 + index * 260}px" aria-labelledby="journey-title-${index}"><span class="checkpoint-pin"><span>${status === "complete" ? icon("check") : section.number}</span></span><div class="checkpoint-card"><div class="checkpoint-card-top">${rewardArtwork(index, unlocked || status === "complete")}<div><span class="item-eyebrow">CỘT MỐC ${section.number} · ${escapeHtml(section.eyebrow)}</span><h2 id="journey-title-${index}">${escapeHtml(section.title)}</h2></div></div><p>${escapeHtml(section.description)}</p><div class="checkpoint-reward"><span>PHẦN THƯỞNG</span><strong>${escapeHtml(journeyRewards[index].name)}</strong><small>${escapeHtml(journeyRewards[index].note)}</small></div><div class="checkpoint-meta"><span>${icon("clock")} ${section.duration}</span><span>${status === "complete" ? icon("check") + " Đã pass" : status === "current" ? icon("route") + " Đang chờ bạn" : icon("shield") + " Chưa mở"}</span></div>${canOpen ? `<button class="${status === "current" ? "primary-button" : "outline-button"} compact-button" type="button" data-action="go-section" data-section-id="${section.id}">${status === "complete" ? "Xem lại chặng" : "Bắt đầu chặng này"} ${icon("arrow")}</button>` : `<span class="checkpoint-locked">${icon("shield")} Pass cột mốc trước để mở</span>`}${isRecommended ? `<span class="recommended-ribbon">AI ƯU TIÊN</span>` : ""}</div></article>`; }).join("")}
      <article class="journey-checkpoint is-finish ${allComplete ? "complete" : "locked"}" style="--point-x:${journeyStops[6].x}%;--point-y:${journeyStops[6].y}px;--mobile-y:1640px" aria-labelledby="journey-finish-title"><span class="checkpoint-pin finish-pin">${icon(allComplete ? "check" : "shield")}</span><div class="checkpoint-card finish-card">${trophyArtwork(allComplete)}<div><span class="item-eyebrow">FINAL TOPIC GATE</span><h2 id="journey-finish-title">Cúp Machine Learning Foundations</h2><p>${allComplete ? "Bạn đã đi qua toàn bộ các cột mốc. Final assessment đang chờ để xác nhận chiến thắng." : "Hoàn thành đủ 6 cột mốc để chạm tới chiếc cúp cuối hành trình."}</p>${allComplete ? `<button class="primary-button compact-button" type="button" data-action="start-final">Chinh phục bài cuối ${icon("arrow")}</button>` : `<span class="checkpoint-locked">${icon("shield")} ${pack.sections.length - completedCount} cột mốc còn lại</span>`}</div></div></article>
      <div class="journey-avatar ${state.roadmapAnimation ? "is-advancing" : ""}" style="--point-x:${avatarStop.x}%;--point-y:${avatarStop.y}px;--mobile-y:${80 + completedCount * 260}px" data-stop="${completedCount}">${animeAvatar()}<span>Bạn đang ở đây</span></div>
    </section>
    <aside class="journey-note"><span class="rationale-icon indigo">${icon("route")}</span><div><strong>Vì sao đi theo thứ tự này?</strong><p>Prerequisite giữ cho mỗi bước vừa sức; mastery test xác nhận bạn thật sự có thể áp dụng trước khi avatar tiến lên. Trạng thái luôn có nhãn và biểu tượng, không chỉ dựa vào màu.</p>${roadmapReferenceLink("Mở tham chiếu AI Engineer")}</div><button class="link-button" type="button" data-view="tutor">Hỏi AI tutor ${icon("arrow")}</button></aside>`;
  };

  const renderLessonDepth = (section, studyPackage) => {
    const lessonSections = studyPackage.lessonSections || section.lessonSections || [];
    const commonMistakes = studyPackage.commonMistakes || section.commonMistakes || [];
    const decisionCase = studyPackage.decisionCase || section.decisionCase;
    if (!lessonSections.length && !commonMistakes.length && !decisionCase) return "";
    return `<section class="lesson-deep-dive"><div class="lesson-deep-dive-header"><div><span class="content-label">HỌC KỸ HƠN</span><h2>Từ khái niệm đến quyết định</h2><p>Đọc theo ba lớp: hiểu khái niệm, nhận diện lỗi thường gặp và thử áp dụng vào một tình huống gần với công việc AI Engineer.</p></div><span class="depth-badge">${lessonSections.length + commonMistakes.length + (decisionCase ? 1 : 0)} điểm nội dung</span></div><div class="lesson-detail-grid">${lessonSections.map((item, index) => `<article class="lesson-detail-card"><span class="lesson-detail-number">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p>${item.checkpoint ? `<div class="detail-checkpoint"><strong>Tự kiểm:</strong> ${escapeHtml(item.checkpoint)}</div>` : ""}</div></article>`).join("")}</div>${decisionCase ? `<article class="decision-case"><div class="application-heading"><span class="application-icon">${icon("route")}</span><div><span class="content-label">CASE STUDY</span><h3>${escapeHtml(decisionCase.title)}</h3></div></div><p><strong>Bối cảnh:</strong> ${escapeHtml(decisionCase.context)}</p><p><strong>Quyết định cần đưa ra:</strong> ${escapeHtml(decisionCase.decision)}</p><div class="decision-case-answer"><strong>Cách suy nghĩ:</strong> ${escapeHtml(decisionCase.answer)}</div></article>` : ""}${commonMistakes.length ? `<div class="common-mistakes"><span class="content-label">DỄ NHẦM Ở ĐÂY</span>${commonMistakes.map((mistake) => `<div class="mistake-row"><span>${icon("close")}</span><p>${escapeHtml(mistake)}</p></div>`).join("")}</div>` : ""}</section>`;
  };

  const renderStudy = () => {
    const generatedMasteryQuestions = state.assessmentQuestions?.mastery?.[state.selectedSectionId] || [];
    const section = { ...getSection(), masteryQuestions: generatedMasteryQuestions.length ? generatedMasteryQuestions : Array.from({ length: plannedAssessmentCount("mastery") }) };
    const index = pack.sections.findIndex((item) => item.id === section.id);
    const status = sectionState(section, index);
    const sourceResult = state.discoveredSources[section.id];
    const studyPackage = state.generatedPackages[section.id] || section;
    if (status === "locked") {
      return `${pageHeader("STUDY SESSION", "Section đang được khóa", "Hoàn thành section trước đó với ít nhất 80% để mở nội dung này.", `<button class="outline-button compact-button" type="button" data-view="roadmap">Về roadmap ${icon("back")}</button>`)}<div class="locked-state panel-card"><span class="locked-state-icon">${icon("shield")}</span><h2>Chưa đến bước này</h2><p>Pathwise giữ thứ tự học theo prerequisite để bạn không phải nhảy qua phần nền tảng.</p><button class="primary-button" type="button" data-action="go-section" data-section-id="${escapeHtml(nextRecommendedSection().id)}">Mở section đang ưu tiên ${icon("arrow")}</button></div>`;
    }
    const checkedCount = state.studyChecks.length;
    return `${pageHeader(`${section.number} · STUDY SESSION`, escapeHtml(section.title), escapeHtml(section.description), `<span class="session-time">${icon("clock")} ${studyPackage.estimated_minutes || Number.parseInt(section.duration, 10)} phút</span>`)}
      <div class="study-progress-row"><div><span>SECTION PROGRESS</span><strong>${state.studyCompleted ? "100" : checkedCount ? "66" : "24"}%</strong></div><div class="progress-bar"><i style="width:${state.studyCompleted ? 100 : checkedCount ? 66 : 24}%"></i></div><span class="study-progress-note">${state.studyCompleted ? "Sẵn sàng làm mastery test" : "Đọc · kiểm tra · áp dụng"}</span></div>
      <div class="study-layout"><article class="lesson-content"><div class="lesson-intro"><span class="content-label">LEARNING PACKAGE · MỤC TIÊU SECTION</span><h2>${escapeHtml(studyPackage.objective)}</h2><div class="package-facts"><span>${icon("book")} ${studyPackage.concepts.length} learning cards</span><span>${icon("spark")} 1 ví dụ transfer</span><span>${icon("check")} ${section.masteryQuestions.length} câu mastery</span></div><div class="source-row-inline">${sourceChips(section.sourceIds)}</div></div><div class="concept-list">${studyPackage.concepts.map((concept, index) => `<article class="concept-card"><span class="concept-number">0${index + 1}</span><div><h3>${escapeHtml(concept.title)}</h3><p>${escapeHtml(concept.body)}</p></div></article>`).join("")}</div>${renderLessonDepth(section, studyPackage)}<div class="application-card"><div class="application-heading"><span class="application-icon">${icon("spark")}</span><div><span class="content-label">VÍ DỤ ÁP DỤNG</span><h3>Đưa vào quyết định sản phẩm</h3></div></div><p>${escapeHtml(studyPackage.example)}</p></div><div class="practice-card"><div class="application-heading"><span class="application-icon">${icon("check")}</span><div><span class="content-label">BÀI THỰC HÀNH NGẮN</span><h3>Biến kiến thức thành một quyết định</h3></div></div><ol>${(studyPackage.practice_steps || section.checklist).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol><div class="transfer-callout"><span class="application-icon">${icon("spark")}</span><div><span class="content-label">TRANSFER CHECK</span><h3>${escapeHtml(studyPackage.transfer_question || `Bạn sẽ áp dụng ${section.title} ở bước nào?`)}</h3></div></div></div><section class="source-discovery panel-card"><div class="source-discovery-header"><div><span class="content-label">REFERENCE DESK</span><h2>Nguồn học thêm cho section này</h2><p>${sourceResult?.note ? escapeHtml(sourceResult.note) : "Nếu tài liệu hiện có chưa đủ, Pathwise sẽ tìm thêm nguồn chính thống và hiển thị rõ lý do lựa chọn."}</p></div><div class="source-actions"><button class="outline-button compact-button" type="button" data-action="discover-sources" ${state.sourceDiscoveryLoading ? "disabled" : ""}>${state.sourceDiscoveryLoading ? "Đang tìm..." : "Tìm nguồn chính thống"} ${icon("arrow")}</button>${sourceResult?.sources?.length ? `<button class="secondary-button compact-button" type="button" data-action="generate-package" ${state.packageLoading ? "disabled" : ""}>${state.packageLoading ? "Đang tạo bài..." : "Tạo bài học từ nguồn"} ${icon("spark")}</button>` : ""}</div></div><div class="reference-grid">${sourceReferenceCards(sourceResult)}</div></section></article><aside class="study-aside"><div class="study-control panel-card"><div class="panel-kicker-row"><span class="panel-kicker">FOCUS SESSION</span>${state.focusStarted ? statusBadge("Đang ghi nhận", "success") : statusBadge("Chưa bắt đầu", "neutral")}</div><div class="focus-timer"><strong>${formatFocusTimer(state.focusStarted && focusRemainingSeconds > 0 ? focusRemainingSeconds : (Number.parseInt(section.duration, 10) || 10) * 60)}</strong><span>thời lượng đề xuất</span></div><p>${state.focusStarted ? "Timer đang chạy khi bạn vào section. Bạn có thể đọc và đánh dấu từng mục tiêu; phiên học không khóa cứng nếu cần tạm dừng." : "Bắt đầu timer để ghi nhận một phiên học có chủ đích."}</p></div><div class="checklist-card panel-card"><div class="panel-kicker-row"><span class="panel-kicker">LEARNING CHECKLIST</span><span class="checklist-count">${checkedCount}/${section.checklist.length}</span></div>${section.checklist.map((item, index) => `<button class="checklist-item ${state.studyChecks.includes(index) ? "is-checked" : ""}" type="button" data-action="toggle-check" data-index="${index}" aria-pressed="${state.studyChecks.includes(index)}"><span class="checklist-box">${state.studyChecks.includes(index) ? icon("check") : ""}</span><span>${escapeHtml(item)}</span></button>`).join("")}</div></aside></div><div class="study-footer"><button class="quiet-button" type="button" data-view="roadmap">${icon("back")} Về roadmap</button><div><button class="primary-button" type="button" data-action="complete-study">${state.studyCompleted ? "Đã hoàn thành section" : "Đánh dấu đã học"} ${icon("check")}</button><button class="secondary-button" type="button" data-action="start-mastery" ${state.studyCompleted ? "" : "disabled"}>Làm mastery test ${icon("arrow")}</button></div></div>`;
  };

  const assessmentQuestion = (question, index, total, kind) => {
    const answerMap = kind === "mastery" ? state.masteryAnswers : state.finalAnswers;
    const selected = answerMap[question.id];
    const label = kind === "mastery" ? "SECTION MASTERY" : "TOPIC ASSESSMENT";
    const assessmentTopic = kind === "mastery" ? getSection().title : activeTopicTitle();
    const action = kind === "mastery" ? "answer-mastery" : "answer-final";
    const nextAction = kind === "mastery" ? "mastery-next" : "final-next";
    const isLast = index === total - 1;
    return `<div class="assessment-progress"><div><span>${label}</span><strong>${index + 1} <em>/ ${total}</em></strong></div><div class="segmented-progress">${Array.from({ length: total }, (_, itemIndex) => `<i class="${itemIndex < index ? "is-done" : itemIndex === index ? "is-current" : ""}"></i>`).join("")}</div></div><section class="assessment-card panel-card"><div class="question-meta"><span class="question-label">CÂU ${String(index + 1).padStart(2, "0")}</span>${statusBadge(assessmentTopic, "info")}</div><h2 class="assessment-question">${escapeHtml(question.prompt)}</h2><div class="option-list" role="radiogroup" aria-label="Các lựa chọn trả lời">${question.options.map((option, optionIndex) => `<button class="option-button ${selected === optionIndex ? "is-selected" : ""}" type="button" role="radio" aria-checked="${selected === optionIndex}" data-action="${action}" data-index="${optionIndex}"><span class="option-letter">${String.fromCharCode(65 + optionIndex)}</span><span>${escapeHtml(option)}</span>${selected === optionIndex ? `<span class="selected-check">${icon("check")}</span>` : ""}</button>`).join("")}</div><div class="assessment-footer"><span class="microcopy">${kind === "mastery" ? `Pass khi đạt từ 80% · ${total} câu hỏi` : `Bài test cuối topic · ${total} câu hỏi bao quát các competency`}</span><button class="primary-button" type="button" data-action="${nextAction}" ${selected === undefined ? "disabled" : ""}>${isLast ? "Nộp bài" : "Câu tiếp theo"} ${icon("arrow")}</button></div></section>`;
  };

  const renderMastery = () => {
    if (!state.studyCompleted) {
      return `${pageHeader("SECTION MASTERY", "Mastery test chưa mở", "Học xong section rồi mới làm test cuối section.", `<button class="outline-button compact-button" type="button" data-view="study">Về study session ${icon("back")}</button>`)}<div class="locked-state panel-card"><span class="locked-state-icon">${icon("book")}</span><h2>Hoàn thành checklist trước</h2><p>Đánh dấu đã học để mở ${activeMasteryQuestions().length} câu hỏi mastery. Mục tiêu của test là chứng minh khả năng áp dụng, không phải nhớ nguyên văn slide.</p><button class="primary-button" type="button" data-view="study">Tiếp tục học ${icon("arrow")}</button></div>`;
    }
    const questions = activeMasteryQuestions();
    const question = questions[state.masteryIndex];
    return `${pageHeader("SECTION MASTERY", "Kiểm tra để mở section tiếp", "Bạn cần đạt ít nhất 80%. Nếu chưa đạt, hệ thống sẽ chỉ ra gap và cho retest sau một vòng remediation.", `<span class="pass-rule"><strong>80%</strong><small>pass mark</small></span>`)}${assessmentQuestion(question, state.masteryIndex, questions.length, "mastery")}`;
  };

  const masteryResult = () => {
    const questions = activeMasteryQuestions();
    const correct = questions.filter((question) => state.masteryAnswers[question.id] === question.correctIndex).length;
    return { correct, total: questions.length, percent: Math.round((correct / questions.length) * 100) };
  };

  const renderMasteryResult = () => {
    const score = masteryResult();
    state.masteryScore = score.percent;
    const passed = score.percent >= pack.topic.passMark;
    state.masteryPassed = passed;
    if (passed) state.completedSections[getSection().id] = true;
    const section = getSection();
    return `${pageHeader("SECTION MASTERY · KẾT QUẢ", passed ? "Section đã được mở khóa" : "Cần thêm một vòng remediation", passed ? `Bạn đã chứng minh có thể dùng kiến thức ${escapeHtml(section.title)} trong các câu hỏi mới.` : "Không sao — hệ thống giữ lại đúng phần gap để bạn ôn rồi thử lại.", `<span class="pass-rule ${passed ? "is-passed" : "is-retry"}"><strong>${score.percent}%</strong><small>${passed ? "passed" : "chưa đạt"}</small></span>`)}<div class="mastery-result-card ${passed ? "is-pass" : "is-fail"}><div class="result-symbol">${passed ? icon("check") : icon("refresh")}</div><div><span class="panel-kicker">${passed ? "MASTERY PASSED" : "TARGETED RETEST"}</span><h2>${passed ? "Bạn có thể đi tiếp" : "Gap vẫn còn ở phần ứng dụng"}</h2><p>${passed ? "Section tiếp theo đã sẵn sàng mở. Lộ trình được cập nhật theo tiến độ mới." : "Ôn lại ví dụ, viết explain-back ngắn và làm lại test. Chỉ câu sai mới được đưa vào vòng ôn tiếp theo."}</p></div></div><div class="mastery-score-grid"><div><strong>${score.correct}/${score.total}</strong><span>câu đúng</span></div><div><strong>${score.percent}%</strong><span>kết quả</span></div><div><strong>80%</strong><span>ngưỡng pass</span></div></div><div class="result-cta panel-card"><div><span class="panel-kicker">${passed ? "NEXT STEP" : "RECOVERY PATH"}</span><h2>${passed ? "Tiếp tục lộ trình" : "Ôn lại đúng điểm chưa chắc"}</h2><p>${passed ? "Section tiếp theo được mở trong roadmap. Bạn vẫn có thể quay lại xem lại section này." : "Khi retest đạt 80%, section tiếp theo mới được mở."}</p></div><div>${passed ? `<button class="primary-button" type="button" data-action="next-section">Mở section tiếp theo ${icon("arrow")}</button>` : `<button class="primary-button" type="button" data-action="start-remediation">Mở remediation ${icon("arrow")}</button>`}</div></div>`;
  };

  const localRemediation = () => {
    const section = getSection();
    const competency = getCompetency(section.competencyId);
    return {
      status: "ok",
      explanation: `Ôn lại ${competency.title} bằng định nghĩa, một ví dụ và một quyết định model. Sau đó tự giải thích lại trước khi retest.`,
      micro_tasks: ["Viết định nghĩa khái niệm bằng một câu.", "Nêu một ví dụ dữ liệu hoặc sản phẩm.", "Chọn một cách kiểm tra model và giải thích lý do."],
      transfer_question: `Trong một bài toán AI Engineer thực tế, bạn sẽ áp dụng ${competency.title} ở bước nào?`,
      source_ids: section.sourceIds,
      confidence: 0.74,
    };
  };

  const renderRemediationLoading = () => `${pageHeader("RECOVERY PATH", "Đang tạo remediation mục tiêu", "Agent đang đọc những câu sai để chọn lại đúng phần cần ôn.", "")}<div class="loading-state panel-card"><div class="loading-orbit">${icon("spark")}</div><h2>Không bắt bạn học lại tất cả</h2><p>Đang tạo một vòng ôn ngắn và một câu transfer mới.</p><div class="loading-lines"><i></i><i></i><i></i></div></div>`;

  const renderRemediation = () => {
    const data = state.remediationData || localRemediation();
    const feedback = state.remediationChecked ? `<div class="remediation-feedback ${state.remediationText.trim().length > 10 ? "is-good" : "is-warning"}">${state.remediationText.trim().length > 10 ? "Đã ghi nhận explain-back. Bạn có thể làm lại mastery test với câu hỏi mới." : "Phần giải thích còn ngắn. Bạn vẫn có thể sửa lại trước khi retest."}</div>` : "";
    return `${pageHeader("RECOVERY PATH · REMEDIATION", "Ôn đúng phần còn thiếu", "Một vòng ôn ngắn sau khi chưa đạt 80%. Nội dung chỉ tập trung vào section đang bị hổng.", `<span class="pass-rule is-retry"><strong>2–4m</strong><small>đề xuất</small></span>`)}<div class="remediation-grid"><article class="remediation-card panel-card"><div class="panel-kicker-row"><span class="panel-kicker">TARGETED EXPLANATION</span>${state.agentMeta?.live ? statusBadge("AI grounded", "success") : statusBadge("Local fallback", "neutral")}</div><h2>${escapeHtml(getSection().title)}</h2><p class="remediation-explanation">${escapeHtml(data.explanation)}</p><div class="source-row-inline">${sourceChips(data.source_ids)}</div><div class="micro-task-list"><span class="content-label">MICRO TASKS</span>${data.micro_tasks.map((task, index) => `<div class="micro-task"><span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(task)}</p></div>`).join("")}</div><div class="transfer-callout"><span class="application-icon">${icon("spark")}</span><div><span class="content-label">TRANSFER CHECK</span><h3>${escapeHtml(data.transfer_question)}</h3></div></div></article><aside class="explain-back-card panel-card"><div class="panel-kicker-row"><span class="panel-kicker">EXPLAIN-BACK</span><span class="muted-label">Không tính điểm</span></div><h3>Nói lại bằng cách của bạn</h3><p>Viết 1–2 câu để kiểm tra bạn đã hiểu ý chính trước khi retest.</p><label for="remediation-input">Bạn đã hiểu gì?</label><textarea id="remediation-input" placeholder="Overfitting là..., validation dùng để...">${escapeHtml(state.remediationText)}</textarea><button class="secondary-button full-button" type="button" data-action="check-remediation">Kiểm tra explain-back ${icon("check")}</button>${feedback}<button class="primary-button full-button" type="button" data-action="retry-mastery" ${state.remediationChecked ? "" : "disabled"}>Làm lại mastery test ${icon("arrow")}</button></aside></div>`;
  };

  const loadRemediation = async () => {
    state.remediationLoading = true;
    state.view = "remediation-loading";
    render();
    const questions = activeMasteryQuestions();
    const failedQuestions = questions.filter((question) => state.masteryAnswers[question.id] !== question.correctIndex).map((question) => ({ id: question.id, prompt: question.prompt, source_ids: question.sourceIds }));
    try {
      const response = await apiRequest("/api/remediation", { section_id: state.selectedSectionId, score: state.masteryScore, failed_questions: failedQuestions });
      state.remediationData = response.data;
      state.agentMeta = response.meta;
    } catch {
      state.remediationData = localRemediation();
      state.agentMeta = { live: false, provider: "local-fallback", fallback_reason: "backend_unavailable" };
    }
    state.remediationLoading = false;
    state.remediationChecked = false;
    state.remediationText = "";
    state.view = "remediation";
    render();
  };

  const renderAssessment = () => {
    const questions = activeFinalQuestions();
    const displayQuestionCount = state.assessmentQuestions?.final?.length ? questions.length : plannedAssessmentCount("final");
    const allSectionsDone = pack.sections.every((section) => state.completedSections[section.id]);
    if (!allSectionsDone && !state.finalStarted) return `${pageHeader("ASSESSMENTS", "Final topic assessment chưa mở", "Hoàn thành tất cả section với ít nhất 80% trước khi làm bài test cuối topic.", `<span class="pass-rule"><strong>80%</strong><small>pass mark</small></span>`)}<div class="locked-state panel-card"><span class="locked-state-icon">${icon("shield")}</span><h2>Còn section chưa pass</h2><p>Final assessment sẽ tổng hợp toàn bộ topic. Hãy quay lại roadmap để tiếp tục section đang được ưu tiên.</p><button class="primary-button" type="button" data-view="roadmap">Mở learning roadmap ${icon("arrow")}</button></div>`;
    if (!state.finalStarted) return `${pageHeader("ASSESSMENTS", "Final learning path assessment", `Một bài test tổng hợp sau khi hoàn thành tất cả section của ${escapeHtml(activeTopicTitle())}.`, `<span class="pass-rule"><strong>80%</strong><small>pass mark</small></span>`)}<div class="final-intro-grid"><article class="final-intro panel-card"><div class="final-icon">${icon("shield")}</div><span class="panel-kicker">TOPIC GATE</span><h2>Chứng minh bạn đã nối được các phần</h2><p>${displayQuestionCount} câu hỏi transfer được phân bổ theo ${pack.sections.length} section và sinh lại theo nội dung đã học.</p><div class="final-facts"><span>${icon("file")} ${displayQuestionCount} câu hỏi dự kiến</span><span>${icon("clock")} khoảng ${Math.max(6, Math.round(displayQuestionCount * 1.2))} phút</span><span>${icon("check")} pass từ 80%</span></div><button class="primary-button" type="button" data-action="start-final">Bắt đầu final assessment ${icon("arrow")}</button></article><aside class="coverage-card panel-card"><span class="panel-kicker">COVERAGE MAP</span><h3>Bài test bao phủ</h3>${pack.competencies.map((competency) => `<div class="coverage-row"><span>${escapeHtml(competency.title)}</span><i><b style="width:${Math.max(20, competency.mastery)}%"></b></i><strong>${competency.mastery}%</strong></div>`).join("")}<div class="coverage-note">${icon("spark")} ${escapeHtml(assessmentStatus("final"))}; điểm yếu sẽ được đưa vào lộ trình sau kết quả.</div></aside></div>`;
    if (state.finalSubmitted) {
      const score = finalScore();
      return `${pageHeader("ASSESSMENTS · KẾT QUẢ", score.percent >= 80 ? "Learning path đã hoàn thành" : "Cần ôn bổ sung", score.percent >= 80 ? "Bạn đã đạt ngưỡng để chuyển sang topic kế tiếp." : "Các competency chưa chắc sẽ được đưa trở lại roadmap.", `<span class="pass-rule ${score.percent >= 80 ? "is-passed" : "is-retry"}"><strong>${score.percent}%</strong><small>${score.percent >= 80 ? "passed" : "retry"}</small></span>`)}<div class="final-result ${score.percent >= 80 ? "is-pass" : "is-fail"} panel-card"><div class="result-symbol">${score.percent >= 80 ? icon("check") : icon("refresh")}</div><div><span class="panel-kicker">${score.percent >= 80 ? "TOPIC PASSED" : "PERSONALISED RECOVERY"}</span><h2>${score.percent >= 80 ? "Sẵn sàng sang bài tiếp theo" : "Chưa đủ chắc để mở bài mới"}</h2><p>${score.percent >= 80 ? `Kết quả được ghi nhận cho ${escapeHtml(activeTopicTitle())}.` : "Pathwise sẽ ưu tiên lại đúng competency có câu trả lời sai trước khi cho thử lại."}</p></div></div><div class="result-cta panel-card"><div><span class="panel-kicker">NEXT ACTION</span><h2>${score.percent >= 80 ? "Xem lại learning profile" : "Quay lại lộ trình"}</h2><p>${score.percent >= 80 ? "Bạn có thể xem lại evidence và các câu đã làm." : "Roadmap vẫn giữ tiến độ section, không bắt đầu lại toàn bộ."}</p></div><button class="primary-button" type="button" data-view="${score.percent >= 80 ? "overview" : "roadmap"}">${score.percent >= 80 ? "Về tổng quan" : "Mở roadmap"} ${icon("arrow")}</button></div>`;
    }
    const question = questions[state.finalIndex];
    return `${pageHeader("FINAL TOPIC ASSESSMENT", "Tổng hợp và áp dụng", "Chọn phương án phù hợp nhất với một quyết định sản phẩm. Bạn có thể xem lại mục tiêu topic trước khi nộp.", `<span class="pass-rule"><strong>80%</strong><small>pass mark</small></span>`)}${assessmentQuestion(question, state.finalIndex, questions.length, "final")}`;
  };

  const finalScore = () => {
    const questions = activeFinalQuestions();
    const correct = questions.filter((question) => state.finalAnswers[question.id] === question.correctIndex).length;
    return { correct, total: questions.length, percent: Math.round((correct / questions.length) * 100) };
  };

  const tutorResponse = (text) => {
    const normalized = text.toLowerCase();
    if (["lương", "bóng đá", "du lịch", "đặt vé", "thời tiết"].some((term) => normalized.includes(term))) {
      return { text: "Mình chưa có căn cứ trong tài liệu Grokking Machine Learning cho câu hỏi này, nên không nên đoán. Hãy hỏi về problem framing, learning types, regression, overfitting, classification hoặc model evaluation.", sources: [], confidence: "low" };
    }
    if (normalized.includes("supervised") || normalized.includes("unsupervised") || normalized.includes("reinforcement") || normalized.includes("nhãn")) {
      return { text: "Supervised learning học từ dữ liệu có nhãn; unsupervised learning tìm cấu trúc trong dữ liệu chưa có nhãn; reinforcement learning học qua tín hiệu phần thưởng từ tương tác.", sources: ["GML-CH02"], confidence: "high" };
    }
    if (normalized.includes("regression") || normalized.includes("hồi quy")) {
      return { text: "Regression dùng dữ liệu để dự đoán giá trị liên tục. Linear regression tìm quan hệ tuyến tính phù hợp và dùng error function để đo mức lệch giữa dự đoán với giá trị thực.", sources: ["GML-CH03"], confidence: "high" };
    }
    if (normalized.includes("overfit") || normalized.includes("validation") || normalized.includes("regularization")) {
      return { text: "Overfitting là khi model bám quá sát dữ liệu huấn luyện nên hoạt động kém trên dữ liệu chưa thấy. Validation set và regularization giúp đánh giá và kiểm soát độ phức tạp của model.", sources: ["GML-CH04"], confidence: "high" };
    }
    if (normalized.includes("accuracy") || normalized.includes("classifier") || normalized.includes("classification")) {
      return { text: "Accuracy là tỷ lệ dự đoán đúng, nhưng chưa đủ trong mọi tình huống. Khi lớp mất cân bằng hoặc false positive và false negative có chi phí khác nhau, cần xem thêm metric phù hợp.", sources: ["GML-CH05-08"], confidence: "high" };
    }
    return { text: "Mình chưa đủ tín hiệu để trả lời chắc từ phần tài liệu đã map. Hãy thu hẹp câu hỏi về cách đặt bài toán, loại learning, regression, overfitting hoặc đánh giá classification.", sources: [], confidence: "medium" };
  };

  const confidenceLabel = (level) => level === "high" ? "Grounded · confidence cao" : level === "medium" ? "Cần kiểm tra thêm" : "Ngoài phạm vi nguồn";

  const renderTutor = () => `${pageHeader("AI TUTOR · DOCUMENT GROUNDED", "Hỏi để hiểu, không hỏi để đoán", `Tutor dùng các chapter đã map trong ${escapeHtml(pack.topic.documentName)}. Khi không có căn cứ, hệ thống sẽ nói rõ và đề xuất thu hẹp câu hỏi.`, `<span class="grounded-badge">${icon("shield")} Source-grounded</span>`)}<div class="tutor-layout"><section class="tutor-chat panel-card"><div class="chat-header"><div><span class="panel-kicker">PATHWISE TUTOR</span><h2>Giải thích theo ngữ cảnh học của bạn</h2></div><button class="icon-button small" type="button" data-action="tutor-clear" aria-label="Xóa hội thoại" title="Xóa hội thoại">${icon("refresh")}</button></div><div class="chat-messages" aria-live="polite">${state.tutorMessages.map((message) => `<div class="chat-message ${message.role === "user" ? "is-user" : "is-assistant"}"><div class="message-avatar">${message.role === "user" ? escapeHtml(userInitial()) : icon("spark")}</div><div class="message-body"><span class="message-role">${message.role === "user" ? "Bạn" : "Pathwise tutor"}</span><p>${escapeHtml(message.text)}</p>${message.role === "assistant" ? `<div class="message-status"><span class="confidence-pill confidence-${message.confidence}">${confidenceLabel(message.confidence)}</span>${message.sources.length ? `<div class="source-row-inline">${sourceChips(message.sources)}</div>` : ""}</div>` : ""}</div></div>`).join("")}${state.tutorLoading ? `<div class="typing-indicator"><span></span><span></span><span></span><em>Đang đối chiếu PDF...</em></div>` : ""}</div><div class="quick-prompts"><span>Thử hỏi</span><button type="button" data-action="tutor-demo" data-prompt="Supervised và unsupervised learning khác nhau thế nào?">Learning types</button><button type="button" data-action="tutor-demo" data-prompt="Overfitting nên xử lý thế nào?">Overfitting</button><button type="button" data-action="tutor-demo" data-prompt="Accuracy có đủ để đánh giá classifier không?">Model evaluation</button></div><form class="chat-form" data-action="tutor-submit"><label class="sr-only" for="tutor-input">Câu hỏi cho AI tutor</label><input id="tutor-input" name="tutor" type="text" placeholder="Hỏi về regression, overfitting, classification..." autocomplete="off" /><button class="primary-button" type="submit" aria-label="Gửi câu hỏi">${icon("arrow")}</button></form><p class="chat-disclaimer">Agent có source ID · nếu API hết quota, hệ thống thử provider còn lại trước khi fallback.</p></section><aside class="tutor-aside"><div class="aside-card tutor-guardrail"><span class="aside-label">TUTOR GUARDRAIL</span><div class="guardrail-row"><span class="guardrail-check">${icon("check")}</span><span>Chỉ trích dẫn chapter có trong PDF</span></div><div class="guardrail-row"><span class="guardrail-check">${icon("check")}</span><span>Không bịa khi không tìm thấy căn cứ</span></div><div class="guardrail-row"><span class="guardrail-check">${icon("check")}</span><span>Cho biết confidence và đường chuyển tiếp</span></div></div><div class="aside-card source-reference"><span class="aside-label">PDF SOURCES</span>${pack.sources.map((source) => `<div class="reference-row"><strong>${source.id}</strong><span>${escapeHtml(source.label)}</span></div>`).join("")}</div></aside></div>`;

  const renderLoading = () => state.diagnosticSkipped
    ? `${pageHeader("LEARNING PATH · BASELINE", "Đang dựng roadmap nền tảng", "Bạn đã chọn bắt đầu từ số 0 nên hệ thống bỏ qua diagnostic và sắp thứ tự theo prerequisite cùng thời gian bạn đã nhập.", "")}<div class="loading-state panel-card"><div class="loading-orbit">${icon("route")}</div><h2>Đang tạo roadmap từ mục tiêu...</h2><p>Chọn section nền tảng, chia thời lượng và chuẩn bị learning package đầu tiên.</p><div class="loading-lines"><i></i><i></i><i></i></div></div>`
    : `${pageHeader("DIAGNOSTIC · ANALYZING", "Đang đọc cách bạn hiểu", "Đối chiếu câu trả lời với competency map và source ID của topic.", "")}<div class="loading-state panel-card"><div class="loading-orbit">${icon("spark")}</div><h2>Đang tạo learning profile...</h2><p>Phân loại tín hiệu đúng, sai và confidence để chọn next best action.</p><div class="loading-lines"><i></i><i></i><i></i></div></div>`;

  const renderAssessmentLoading = () => {
    const isMastery = state.view === "mastery-loading";
    const isFinal = state.view === "assessment-loading";
    return `${pageHeader(isMastery ? "SECTION MASTERY" : isFinal ? "TOPIC ASSESSMENT" : "DIAGNOSTIC", "Đang sinh bộ câu hỏi theo nội dung", "Hệ thống đang phân bổ câu hỏi theo số section, competency và learning cards thay vì dùng một số lượng cố định.", "")}<div class="loading-state panel-card"><div class="loading-orbit">${icon("spark")}</div><h2>Đang tạo bài test phù hợp...</h2><p>LLM chỉ được dùng nội dung đã map và source ID hợp lệ; nếu provider lỗi, hệ thống chuyển sang fallback theo nội dung.</p><div class="loading-lines"><i></i><i></i><i></i></div></div>`;
  };

  const playRoadmapAnimation = () => {
    const animation = state.roadmapAnimation;
    const map = document.querySelector(".journey-map");
    const avatar = document.querySelector(".journey-avatar");
    if (!animation || !map || !avatar) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      avatar.classList.remove("is-advancing");
      state.roadmapAnimation = null;
      liveRegion.textContent = "Tiến độ lộ trình đã được cập nhật.";
      return;
    }
    const from = journeyStops[animation.from];
    const to = journeyStops[animation.to];
    const segment = journeyMicroStops[Math.min(animation.from, journeyMicroStops.length - 1)] || [];
    const route = [from, ...segment, to];
    const points = animation.preview ? [...route, ...route.slice(0, -1).reverse()] : route;
    const finalPoint = animation.preview ? from : to;
    const width = map.clientWidth;
    const frames = points.map((point, index) => ({
      transform: `translate(-50%, -91%) translate(${((point.x - finalPoint.x) / 100) * width}px, ${point.y - finalPoint.y}px)`,
      offset: index / (points.length - 1),
    }));
    const motion = avatar.animate(frames, { duration: animation.preview ? 3000 : 2100, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
    document.querySelectorAll(`.journey-micro-point[data-segment="${animation.from}"]`).forEach((point, index) => {
      point.animate([{ transform: "translate(-50%, -50%) scale(.72)", opacity: .45 }, { transform: "translate(-50%, -50%) scale(1.22)", opacity: 1 }, { transform: "translate(-50%, -50%) scale(1)", opacity: 1 }], { duration: 520, delay: 420 + index * 360, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
    motion.finished.then(() => {
      avatar.classList.remove("is-advancing");
      state.roadmapAnimation = null;
      liveRegion.textContent = animation.preview ? "Đã phát thử chuyển động trên lộ trình." : "Avatar đã tới cột mốc mới. Ba cờ của chặng vừa qua đã hoàn thành.";
      document.querySelector(`.journey-checkpoint:nth-of-type(${animation.to + 1}) .reward-art`)?.animate([{ transform: "scale(.75) rotate(-8deg)" }, { transform: "scale(1.12) rotate(4deg)" }, { transform: "scale(1) rotate(0)" }], { duration: 680, easing: "cubic-bezier(.2,.9,.2,1)" });
    }).catch(() => {});
  };

  const render = () => {
    const viewChanged = Boolean(lastRenderedView) && lastRenderedView !== state.view;
    persistState();
    const view = ["diagnostic-result"].includes(state.view) ? renderDiagnosticResult : state.view === "setup" ? renderSetup : state.view === "overview" ? renderOverview : state.view === "diagnostic" ? renderDiagnostic : state.view === "diagnostic-loading" ? renderLoading : ["assessment-loading", "mastery-loading"].includes(state.view) ? renderAssessmentLoading : state.view === "roadmap" ? renderRoadmap : state.view === "study" ? renderStudy : state.view === "mastery" ? (state.masterySubmitted ? renderMasteryResult : renderMastery) : state.view === "remediation-loading" ? renderRemediationLoading : state.view === "remediation" ? renderRemediation : state.view === "tutor" ? renderTutor : state.view === "assessment" ? renderAssessment : renderSetup;
    viewContainer.innerHTML = view();
    if (viewChanged) {
      viewContainer.classList.remove("view-enter");
      void viewContainer.offsetWidth;
      viewContainer.classList.add("view-enter");
    }
    lastRenderedView = state.view;
    updateAccountUi();
    document.body.classList.toggle("is-onboarding", state.view === "setup");
    const topicSwitcher = document.querySelector(".topic-switcher");
    if (topicSwitcher) {
      topicSwitcher.querySelector(".topic-switcher-icon").textContent = state.profileConfigured ? "01" : "—";
      topicSwitcher.querySelector("small").textContent = state.profileConfigured ? "ĐANG HỌC" : "CHƯA THIẾT LẬP";
      topicSwitcher.querySelector("strong").textContent = state.profileConfigured ? activeTopicTitle() : "Thiết lập learning path";
    }
    const mobileContext = document.querySelector(".mobile-context > span");
    if (mobileContext) mobileContext.textContent = state.profileConfigured ? activeTopicTitle() : "Thiết lập learning path";
    document.querySelectorAll("[data-icon]").forEach((element) => { if (!element.innerHTML) element.innerHTML = icon(element.dataset.icon); });
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === state.view || (state.view === "diagnostic-result" && item.dataset.view === "diagnostic")));
    if (state.sidebarOpen) document.querySelector(".sidebar")?.classList.add("is-open");
    if (state.view === "mastery" && state.masterySubmitted && state.masteryPassed) {
      const nextButton = document.querySelector('[data-action="next-section"]');
      if (nextButton) nextButton.innerHTML = `Xem hành trình mới ${icon("arrow")}`;
    }
    if (state.view === "roadmap" && state.roadmapAnimation) window.requestAnimationFrame(playRoadmapAnimation);
  };

  const reset = () => {
    Object.assign(state, { view: "setup", profileConfigured: false, pathTopic: "", pathLevel: "new", pathMinutes: "", diagnosticIndex: 0, diagnosticAnswers: {}, diagnosticConfidence: {}, diagnosticSubmitted: false, diagnosticSkipped: false, assessmentQuestions: { diagnostic: [], mastery: {}, final: [] }, assessmentMeta: { diagnostic: null, mastery: {}, final: null }, aiAnalysis: null, agentMeta: null, recommendedPath: [], selectedSectionId: "section-ml-foundations", timePlan: 30, focusStarted: false, studyCompleted: false, studyChecks: [], masteryIndex: 0, masteryAnswers: {}, masterySubmitted: false, masteryScore: null, masteryPassed: false, completedSections: {}, roadmapAnimation: null, remediationData: null, remediationText: "", remediationChecked: false, remediationLoading: false, discoveredSources: {}, sourceDiscoveryLoading: false, generatedPackages: {}, packageLoading: false, finalStarted: false, finalIndex: 0, finalAnswers: {}, finalSubmitted: false, finalScore: null, tutorLoading: false, tutorMessages: [{ role: "assistant", text: "Bạn có thể hỏi về problem framing, supervised learning, regression, overfitting hoặc model evaluation. Mình sẽ trả lời dựa trên tài liệu đã được gắn nguồn.", sources: [], confidence: "high" }] });
    try { localStorage.removeItem(stateStorageKey()); } catch {}
    window.history.replaceState(null, "", "#setup");
    render();
    showToast("Đã đặt lại toàn bộ phiên demo.");
  };

  const chooseDiagnosticAnswer = (index) => {
    const question = activeDiagnosticQuestions()[state.diagnosticIndex];
    state.diagnosticAnswers[question.id] = index;
    render();
  };

  const chooseMasteryAnswer = (index) => {
    state.masteryAnswers[activeMasteryQuestions()[state.masteryIndex].id] = index;
    render();
  };

  const chooseFinalAnswer = (index) => {
    state.finalAnswers[activeFinalQuestions()[state.finalIndex].id] = index;
    render();
  };

  const sendTutor = async (text) => {
    const cleanText = String(text || "").trim();
    if (!cleanText) { showToast("Hãy nhập câu hỏi trước."); return; }
    state.tutorMessages.push({ role: "user", text: cleanText, sources: [], confidence: "high" });
    state.tutorLoading = true;
    render();
    let assistant;
    try {
      const response = await apiRequest("/api/tutor", { topic_id: pack.topic.id, section_id: state.selectedSectionId, message: cleanText });
      assistant = { role: "assistant", text: response.data.answer, sources: response.data.source_ids, confidence: confidenceTier(response.data.confidence) };
      state.agentMeta = response.meta;
    } catch {
      const fallback = tutorResponse(cleanText);
      assistant = { role: "assistant", text: fallback.text, sources: fallback.sources, confidence: fallback.confidence };
      state.agentMeta = { live: false, provider: "local-fallback", fallback_reason: "backend_unavailable" };
    }
    state.tutorLoading = false;
    state.tutorMessages.push(assistant);
    render();
    window.setTimeout(() => document.querySelector(".chat-messages")?.scrollTo({ top: 1000, behavior: "smooth" }), 20);
  };

  const discoverSources = async () => {
    const section = getSection();
    state.sourceDiscoveryLoading = true;
    render();
    try {
      const response = await apiRequest("/api/sources/discover", {
        topic_id: pack.topic.id,
        section_id: section.id,
        query: `${section.title}. ${section.objective}`,
      });
      state.discoveredSources[section.id] = response.data;
      state.agentMeta = response.meta;
      showToast(response.meta?.live ? "Đã tìm và lọc nguồn chính thống." : "Đang dùng catalog nguồn chính thống đã kiểm duyệt.");
    } catch {
      state.discoveredSources[section.id] = { status: "error", sources: [], note: "Không thể kết nối dịch vụ tìm nguồn trong phiên này." };
      showToast("Chưa tìm được nguồn. Bạn có thể thử lại sau.");
    }
    state.sourceDiscoveryLoading = false;
    render();
  };

  const generateLearningPackage = async () => {
    const section = getSection();
    const sourceResult = state.discoveredSources[section.id];
    if (!sourceResult?.sources?.length) { showToast("Hãy tìm nguồn chính thống trước."); return; }
    state.packageLoading = true;
    render();
    try {
      const response = await apiRequest("/api/learning/package", {
        topic_id: pack.topic.id,
        section_id: section.id,
        level: "beginner-to-intermediate",
        minutes: state.timePlan,
        sources: sourceResult.sources,
      });
      state.generatedPackages[section.id] = response.data;
      state.agentMeta = response.meta;
      showToast(response.meta?.live ? "Đã tạo learning package từ nguồn đã kiểm chứng." : "Đã dùng learning package dự phòng an toàn.");
    } catch {
      showToast("Chưa tạo được bài học mới; nội dung section hiện tại vẫn được giữ nguyên.");
    }
    state.packageLoading = false;
    render();
  };

  document.addEventListener("click", (event) => {
    const authAction = event.target.closest("[data-auth-action]");
    if (authAction) {
      if (authAction.dataset.authAction === "switch") showAuth(authMode === "login" ? "register" : "login");
      return;
    }
    if (!currentUser) return;
    const nav = event.target.closest("[data-view]");
    if (nav) {
      if (!state.profileConfigured && nav.dataset.view !== "setup") {
        showToast("Hãy thiết lập mục tiêu học tập trước khi mở workspace.");
        closeSidebar();
        return;
      }
      setView(nav.dataset.view);
      closeSidebar();
      return;
    }
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "reset") reset();
    if (action === "toggle-sidebar") {
      if (sidebarMedia.matches) {
        if (document.querySelector(".sidebar").classList.contains("is-open")) closeSidebar();
        else document.querySelector(".sidebar").classList.add("is-open");
      }
      else {
        sidebarCollapsed = !sidebarCollapsed;
        try { localStorage.setItem("pathwise-sidebar-collapsed", String(sidebarCollapsed)); } catch {}
      }
      syncSidebar();
      if (sidebarMedia.matches && document.querySelector(".sidebar").classList.contains("is-open")) document.querySelector(".sidebar-toggle").focus();
    }
    if (action === "close-sidebar") closeSidebar();
    if (action === "logout") { logout(); return; }
    if (action === "topic-menu") { setView("setup"); closeSidebar(); }
    if (action === "notification") showToast("Bạn có thể chỉnh thời gian học trong learning roadmap.");
    if (action === "profile") showToast(`Hồ sơ học tập của ${learnerName()} · ${pack.learner.cohort} · Learner.`);
    if (action === "fill-topic") { state.pathTopic = target.dataset.topic; persistState(); render(); document.querySelector("#path-topic")?.focus(); }
    if (action === "select-path-level") { state.pathLevel = target.dataset.level; render(); }
    if (action === "save-time-plan") { const input = document.querySelector("#time-plan-input"); const minutes = input ? Number(input.value) : NaN; if (!isValidMinutes(minutes)) { showToast("Thời gian phải nằm trong khoảng 10–240 phút."); input?.focus(); return; } state.timePlan = minutes; state.pathMinutes = minutes; render(); showToast(`Đã cập nhật plan ${minutes} phút cho hôm nay.`); }
    if (action === "preview-journey") {
      const completedCount = pack.sections.filter((section) => state.completedSections[section.id]).length;
      state.roadmapAnimation = completedCount > 0 ? { from: completedCount - 1, to: completedCount, preview: true } : { from: 0, to: 1, preview: true };
      render();
      showToast("Đang phát thử chuyển động của avatar trên lộ trình.");
    }
    if (action === "create-path") {
      if (!isValidTopic(state.pathTopic)) { showToast("Hãy nhập chủ đề bạn muốn học."); document.querySelector("#path-topic")?.focus(); return; }
      if (!isValidMinutes(state.pathMinutes)) { showToast("Hãy nhập thời gian học từ 10 đến 240 phút."); document.querySelector("#path-minutes")?.focus(); return; }
      state.profileConfigured = true;
      state.timePlan = Number(state.pathMinutes);
      state.diagnosticSkipped = state.pathLevel === "new";
      state.diagnosticSubmitted = false;
      state.aiAnalysis = null;
      state.recommendedPath = [];
      // New learners keep the baseline roadmap flow. Learners who know the
      // topic already enter the diagnostic test immediately.
      state.diagnosticIndex = 0;
      state.diagnosticAnswers = {};
      state.diagnosticConfidence = {};
      state.assessmentQuestions = { diagnostic: [], mastery: {}, final: [] };
      state.assessmentMeta = { diagnostic: null, mastery: {}, final: null };
      state.view = "diagnostic-loading";
      window.history.replaceState(null, "", `#${state.view}`);
      render();
      if (state.diagnosticSkipped) {
        showToast("Đang tạo roadmap nền tảng từ mục tiêu của bạn.");
        window.setTimeout(() => submitDiagnostic(true), 720);
      } else {
        showToast("Đã ghi nhận mục tiêu. Đang sinh diagnostic theo nội dung.");
        loadAssessment("diagnostic");
      }
    }
    if (action === "start-diagnostic") { state.diagnosticSkipped = false; state.diagnosticIndex = 0; if (state.assessmentQuestions.diagnostic.length) setView("diagnostic"); else loadAssessment("diagnostic"); }
    if (action === "answer-diagnostic") chooseDiagnosticAnswer(Number(target.dataset.index));
    if (action === "diagnostic-confidence") { const question = activeDiagnosticQuestions()[state.diagnosticIndex]; state.diagnosticConfidence[question.id] = target.dataset.value; render(); }
    if (action === "diagnostic-prev" && state.diagnosticIndex > 0) { state.diagnosticIndex -= 1; render(); }
    if (action === "diagnostic-next") {
      const questions = activeDiagnosticQuestions();
      const question = questions[state.diagnosticIndex];
      if (state.diagnosticAnswers[question.id] === undefined) { showToast("Hãy chọn một phương án trước."); return; }
      if (state.diagnosticIndex < questions.length - 1) { state.diagnosticIndex += 1; render(); } else { state.view = "diagnostic-loading"; render(); window.setTimeout(submitDiagnostic, 720); }
    }
    if (action === "redo-diagnostic") { state.diagnosticIndex = 0; state.diagnosticAnswers = {}; state.diagnosticConfidence = {}; state.diagnosticSubmitted = false; state.diagnosticSkipped = false; state.aiAnalysis = null; state.agentMeta = null; state.assessmentQuestions.diagnostic = []; state.assessmentMeta.diagnostic = null; loadAssessment("diagnostic"); }
    if (action === "go-study") { state.selectedSectionId = nextRecommendedSection().id; setView("study"); }
    if (action === "go-section") {
      const selectedSection = getSection(target.dataset.sectionId);
      const selectedIndex = pack.sections.findIndex((section) => section.id === selectedSection.id);
      const alreadyComplete = Boolean(state.completedSections[selectedSection.id]);
      if (selectedIndex > 0 && !state.completedSections[pack.sections[selectedIndex - 1].id] && !alreadyComplete) { showToast("Hãy pass section trước để mở chặng này."); return; }
      state.selectedSectionId = selectedSection.id;
      state.studyChecks = alreadyComplete ? selectedSection.checklist.map((_, index) => index) : [];
      state.studyCompleted = alreadyComplete;
      state.focusStarted = false;
      setView("study");
    }
    if (action === "discover-sources") discoverSources();
    if (action === "generate-package") generateLearningPackage();
    if (action === "toggle-check") { const item = Number(target.dataset.index); state.studyChecks = state.studyChecks.includes(item) ? state.studyChecks.filter((index) => index !== item) : [...state.studyChecks, item]; render(); }
    if (action === "complete-study") { const section = getSection(); if (state.studyChecks.length < section.checklist.length) { showToast(`Hãy hoàn thành ${section.checklist.length - state.studyChecks.length} mục checklist trước khi mở mastery test.`); return; } state.studyCompleted = true; render(); showToast("Section đã được đánh dấu hoàn thành. Mastery test đã mở."); }
    if (action === "start-mastery") { if (!state.studyCompleted) { showToast("Hãy hoàn thành section trước khi làm mastery test."); return; } state.masteryIndex = 0; state.masteryAnswers = {}; state.masterySubmitted = false; state.remediationData = null; state.remediationText = ""; state.remediationChecked = false; loadAssessment("mastery", state.selectedSectionId); }
    if (action === "answer-mastery") chooseMasteryAnswer(Number(target.dataset.index));
    if (action === "mastery-next") { const questions = activeMasteryQuestions(); const question = questions[state.masteryIndex]; if (state.masteryAnswers[question.id] === undefined) { showToast("Hãy chọn một phương án trước."); return; } if (state.masteryIndex < questions.length - 1) { state.masteryIndex += 1; render(); } else { state.masterySubmitted = true; render(); } }
    if (action === "start-remediation") loadRemediation();
    if (action === "check-remediation") { const input = document.querySelector("#remediation-input"); state.remediationText = input ? input.value : ""; state.remediationChecked = state.remediationText.trim().length > 10; render(); showToast(state.remediationChecked ? "Đã ghi nhận explain-back." : "Hãy viết ít nhất một câu giải thích."); }
    if (action === "retry-mastery") { state.masteryIndex = 0; state.masteryAnswers = {}; state.masterySubmitted = false; state.studyCompleted = true; state.remediationChecked = false; state.remediationText = ""; loadAssessment("mastery", state.selectedSectionId); }
    if (action === "next-section") {
      const completedCount = pack.sections.filter((section) => state.completedSections[section.id]).length;
      state.roadmapAnimation = { from: Math.max(0, completedCount - 1), to: completedCount, preview: false };
      const nextSection = pack.sections[completedCount];
      if (nextSection) state.selectedSectionId = nextSection.id;
      state.studyChecks = [];
      state.studyCompleted = false;
      state.focusStarted = false;
      setView("roadmap");
      showToast(nextSection ? `Đã mở cột mốc ${nextSection.title}.` : "Bạn đã tới chiếc cúp cuối lộ trình.");
    }
    if (action === "start-final") { const allSectionsDone = pack.sections.every((section) => state.completedSections[section.id]); if (!allSectionsDone) { showToast("Hãy pass tất cả section trước khi mở final assessment."); return; } state.finalStarted = true; state.finalSubmitted = false; state.finalAnswers = {}; state.finalIndex = 0; loadAssessment("final"); }
    if (action === "answer-final") chooseFinalAnswer(Number(target.dataset.index));
    if (action === "final-next") { const questions = activeFinalQuestions(); const question = questions[state.finalIndex]; if (state.finalAnswers[question.id] === undefined) { showToast("Hãy chọn một phương án trước."); return; } if (state.finalIndex < questions.length - 1) { state.finalIndex += 1; render(); } else { state.finalSubmitted = true; state.finalScore = finalScore().percent; render(); } }
    if (action === "tutor-demo") sendTutor(target.dataset.prompt);
    if (action === "tutor-clear") { state.tutorLoading = false; state.tutorMessages = [{ role: "assistant", text: "Bạn có thể hỏi về problem framing, supervised learning, regression, overfitting hoặc model evaluation. Mình sẽ trả lời dựa trên Grokking Machine Learning và hiện source ID.", sources: [], confidence: "high" }]; render(); }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.matches("#auth-form")) { handleAuthSubmit(event); return; }
    if (event.target.matches("[data-action='tutor-submit']")) { event.preventDefault(); const input = event.target.querySelector("input"); sendTutor(input.value); }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "remediation-input") state.remediationText = event.target.value;
    if (event.target.id === "path-topic") {
      state.pathTopic = event.target.value;
      persistState();
      const validTopic = isValidTopic(state.pathTopic);
      const validMinutes = isValidMinutes(state.pathMinutes);
      const createButton = document.querySelector("[data-action='create-path']");
      const footerMessage = document.querySelector(".setup-footer > span");
      const counter = document.querySelector(".topic-input-footer > span");
      if (createButton) createButton.disabled = !validTopic || !validMinutes;
      if (footerMessage) footerMessage.textContent = !validTopic ? "Nhập một chủ đề để tiếp tục." : !validMinutes ? "Nhập thời gian học để tiếp tục." : state.pathLevel === "new" ? "Sẽ bỏ qua diagnostic và tạo roadmap nền tảng." : "Đã đủ thông tin để vào diagnostic.";
      if (counter) counter.textContent = `${state.pathTopic.trim().length}/120`;
    }
    if (event.target.id === "path-minutes") {
      state.pathMinutes = event.target.value === "" ? "" : Number(event.target.value);
      persistState();
      const valid = isValidMinutes(state.pathMinutes);
      const createButton = document.querySelector("[data-action='create-path']");
      const footerMessage = document.querySelector(".setup-footer > span");
      const errorMessage = document.querySelector("#path-minutes-error");
      if (createButton) createButton.disabled = !isValidTopic(state.pathTopic) || !valid;
      if (footerMessage) footerMessage.textContent = !isValidTopic(state.pathTopic) ? "Nhập một chủ đề để tiếp tục." : !valid ? "Nhập thời gian học để tiếp tục." : state.pathLevel === "new" ? "Sẽ bỏ qua diagnostic và tạo roadmap nền tảng." : "Đã đủ thông tin để vào diagnostic.";
      if (errorMessage) errorMessage.hidden = state.pathMinutes === "" || valid;
    }
  });

  window.addEventListener("hashchange", () => { const view = window.location.hash.replace("#", ""); if (view) { state.view = view; render(); } });
  const bootstrapAuth = async () => {
    if (API_BASE) {
      const token = readAuthToken();
      if (!token) { showAuth("login"); return; }
      setAuthToken(token);
      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.user) throw new Error("auth_session_invalid");
        await showAppForUser(payload.user);
      } catch {
        clearAuthToken();
        clearAuthSession();
        showAuth("login", "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.", true);
      }
      return;
    }
    const existingUser = getSessionUser();
    if (existingUser) showAppForUser(existingUser);
    else showAuth("login");
  };
  bootstrapAuth();
})();
