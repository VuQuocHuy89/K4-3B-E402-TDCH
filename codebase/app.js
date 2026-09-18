(() => {
  "use strict";

  const pack = window.CONTENT_PACK;
  const viewContainer = document.querySelector("#view-container");
  const toast = document.querySelector("#toast");
  const liveRegion = document.querySelector("#live-region");
  const topicSuggestions = ["Machine Learning", "Python cho AI Engineer", "LLM và RAG", "AI Agents"];
  const isValidMinutes = (value) => Number.isInteger(Number(value)) && Number(value) >= 10 && Number(value) <= 240;
  const isValidTopic = (value) => String(value || "").trim().length >= 3 && String(value || "").trim().length <= 120;

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

  const STORAGE_KEY = "pathwise-learning-session-v5";
  const persistableState = ["view", "profileConfigured", "pathTopic", "pathLevel", "pathMinutes", "diagnosticIndex", "diagnosticAnswers", "diagnosticConfidence", "diagnosticSubmitted", "diagnosticSkipped", "aiAnalysis", "agentMeta", "recommendedPath", "selectedSectionId", "timePlan", "focusStarted", "studyCompleted", "studyChecks", "masteryIndex", "masteryAnswers", "masterySubmitted", "masteryScore", "masteryPassed", "completedSections", "remediationData", "remediationText", "remediationChecked", "discoveredSources", "generatedPackages", "finalStarted", "finalIndex", "finalAnswers", "finalSubmitted", "finalScore", "tutorMessages"];
  const persistState = () => {
    try {
      const snapshot = Object.fromEntries(persistableState.map((key) => [key, state[key]]));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {}
  };
  const restoreState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object") return;
      persistableState.forEach((key) => { if (saved[key] !== undefined) state[key] = saved[key]; });
      if (!pack.sections.some((section) => section.id === state.selectedSectionId)) state.selectedSectionId = pack.sections[0].id;
      if (!["new", "beginner", "intermediate"].includes(state.pathLevel)) state.pathLevel = "new";
      if (!Array.isArray(state.tutorMessages)) state.tutorMessages = [];
      if (["diagnostic-loading", "remediation-loading"].includes(state.view)) state.view = "overview";
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
  };

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const icon = (name) => icons[name] || icons.file;
  const getSection = (id = state.selectedSectionId) => pack.sections.find((section) => section.id === id) || pack.sections[0];
  const getCompetency = (id) => pack.competencies.find((competency) => competency.id === id) || pack.competencies[0];
  const getSource = (id) => pack.sources.find((source) => source.id === id);
  const activeTopicTitle = () => state.pathTopic || pack.topic.title;
  const topicProgress = () => Math.round((pack.sections.filter((section) => state.completedSections[section.id]).length / pack.sections.length) * 100);
  const activeMasteryQuestions = () => getSection().masteryQuestions || pack.masteryQuestions || [];
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

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add("is-visible");
    liveRegion.textContent = message;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  };

  const apiRequest = async (endpoint, payload) => {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`api_${response.status}`);
    return response.json();
  };

  const refreshEnvironmentStatus = async () => {
    const badge = document.querySelector("#environment-badge");
    const label = badge?.querySelector(".environment-label");
    if (!badge || !label) return;
    try {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error("health_unavailable");
      const health = await response.json();
      label.textContent = health.providers?.order?.length ? `AI live · ${health.providers.order[0]}` : "Local fallback";
      badge.dataset.live = String(Boolean(health.providers?.order?.length));
    } catch {
      label.textContent = "Static demo";
      badge.dataset.live = "false";
    }
  };

  const confidenceTier = (value) => value >= 0.8 ? "high" : value >= 0.5 ? "medium" : "low";

  const localAnalysis = () => {
    const gaps = pack.diagnosticQuestions.filter((question) => state.diagnosticAnswers[question.id] !== question.correctIndex);
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
        <div class="setup-step"><span>02</span><div><span class="panel-kicker">ĐIỂM BẮT ĐẦU</span><h2>Bạn đang ở đâu với chủ đề này?</h2><p>Chọn “chưa biết gì” nếu muốn đi thẳng tới roadmap nền tảng, không phải làm bài test không cần thiết.</p></div></div>
        <div class="segmented-choice" role="group" aria-label="Trình độ hiện tại">
          ${[["new", "Chưa biết gì", "Đi thẳng tới roadmap nền tảng"], ["beginner", "Biết sơ qua", "Làm diagnostic bao quát các phần"], ["intermediate", "Đã học một phần", "Tìm gap để học đúng thứ tự"]].map(([value, label, help]) => `<button class="level-choice ${state.pathLevel === value ? "is-selected" : ""}" type="button" data-action="select-path-level" data-level="${value}" aria-pressed="${state.pathLevel === value}"><strong>${label}</strong><small>${help}</small></button>`).join("")}
        </div>
        <div class="setup-step"><span>03</span><div><span class="panel-kicker">THỜI GIAN</span><h2>Mỗi ngày bạn có bao nhiêu thời gian?</h2><p>Tự nhập số phút bạn thực sự có; Pathwise sẽ dùng con số này để chia nhỏ session.</p></div></div>
        <div class="minutes-field"><label class="field-label" for="path-minutes">Thời gian học mỗi ngày</label><div class="minutes-input-wrap"><input id="path-minutes" name="path_minutes" type="number" min="10" max="240" step="1" inputmode="numeric" value="${state.pathMinutes === "" ? "" : escapeHtml(state.pathMinutes)}" placeholder="Ví dụ: 35" aria-describedby="path-minutes-help path-minutes-error" /><span>phút / ngày</span></div><small id="path-minutes-help">Nhập từ 10 đến 240 phút. Bạn có thể điều chỉnh lại sau.</small><small id="path-minutes-error" class="field-error" ${state.pathMinutes === "" || isValidMinutes(state.pathMinutes) ? "hidden" : ""}>Thời gian phải nằm trong khoảng 10–240 phút.</small></div>
        <div class="setup-footer"><span>${!isValidTopic(state.pathTopic) ? "Nhập một chủ đề để tiếp tục." : !isValidMinutes(state.pathMinutes) ? "Nhập thời gian học để tiếp tục." : state.pathLevel === "new" ? "Sẽ bỏ qua diagnostic và tạo roadmap nền tảng." : "Đã đủ thông tin để tạo learning path."}</span><button class="primary-button" type="button" data-action="create-path" ${isValidTopic(state.pathTopic) && isValidMinutes(state.pathMinutes) ? "" : "disabled"}>${state.pathLevel === "new" ? "Tạo roadmap nền tảng" : "Tạo learning path"} ${icon("arrow")}</button></div>
      </section>
      <aside class="setup-aside"><div class="setup-preview panel-card"><span class="panel-kicker">SAU KHI THIẾT LẬP</span><h3>Pathwise sẽ làm gì?</h3><div class="setup-preview-row"><span>01</span><p>${state.pathLevel === "new" ? "Dựng roadmap nền tảng từ mục tiêu của bạn" : "Đánh giá mức độ bao phủ bằng diagnostic"}</p></div><div class="setup-preview-row"><span>02</span><p>Ưu tiên competency và section cần học</p></div><div class="setup-preview-row"><span>03</span><p>Đưa nội dung, ví dụ và bài thực hành theo section</p></div><div class="setup-preview-row"><span>04</span><p>Kiểm tra mastery bao quát trước khi mở bước tiếp</p></div></div><div class="setup-note panel-card"><span class="application-icon">${icon("shield")}</span><div><strong>Bạn luôn kiểm soát lộ trình</strong><p>Chủ đề do bạn nhập. Nội dung demo hiện có được map đầy đủ cho Machine Learning; chủ đề khác được giữ làm mục tiêu để mở rộng nội dung.</p></div></div></aside>
    </div>`;

  const renderOverview = () => {
    const firstSection = getSection();
    const diagnosticDone = state.diagnosticSubmitted || state.diagnosticSkipped;
    const nextTitle = diagnosticDone ? firstSection.title : "Làm diagnostic đầu vào";
    const nextCopy = diagnosticDone ? (state.diagnosticSkipped ? "Bắt đầu từ nền tảng đã được sắp theo mục tiêu của bạn." : "Bắt đầu section được ưu tiên từ kết quả đánh giá của bạn.") : `${pack.diagnosticQuestions.length} câu hỏi · khoảng 8 phút · bao phủ ${pack.competencies.length} competency`;
    const nextAction = diagnosticDone ? "Tiếp tục section" : "Bắt đầu diagnostic";
    const nextActionName = diagnosticDone ? "go-study" : "start-diagnostic";
    return `
      ${pageHeader("LEARNING PATH · AI ENGINEER", `Chào ${escapeHtml(pack.learner.name)}, bắt đầu đúng nền tảng.`, `Mục tiêu của bạn: <strong>${escapeHtml(activeTopicTitle())}</strong>. Pathwise dùng mục tiêu, ${state.diagnosticSkipped ? "mức bắt đầu từ số 0" : "diagnostic"} và tài liệu ${escapeHtml(pack.topic.documentName)} để sắp xếp bước học phù hợp.`, `<button class="secondary-button compact-button" type="button" data-action="topic-menu">${icon("route")} Sửa mục tiêu <span class="chevron">⌄</span></button>`)}
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
        <article class="evidence-preview panel-card"><div class="panel-kicker-row"><span class="panel-kicker">SOURCE-GROUNDED</span>${statusBadge(`${pack.sources.length} sources mapped`, "info")}</div><h2>Quyết định học có căn cứ</h2><p>Pathwise dùng tài liệu có sẵn hoặc tìm thêm nguồn chính thống khi section chưa có học liệu phù hợp.</p><div class="source-list-compact">${pack.sources.slice(0, 3).map((source) => `<div class="source-row"><span class="source-row-icon">${icon("file")}</span><span><strong>${source.id}</strong><small>${escapeHtml(source.label)}</small></span></div>`).join("")}</div><button class="outline-button full-button" type="button" data-action="go-study">Mở learning package ${icon("arrow")}</button></article>
      </div>`;
  };

  const sectionState = (section, index) => {
    if (state.completedSections[section.id]) return "complete";
    if (index === 0) return "current";
    if (state.completedSections[pack.sections[index - 1].id]) return "current";
    return section.status === "next" ? "next" : "locked";
  };

  const diagnosticCoverage = () => {
    const covered = new Set(pack.diagnosticQuestions.filter((question) => state.diagnosticAnswers[question.id] !== undefined).map((question) => question.competencyId));
    return { covered: covered.size, total: pack.competencies.length };
  };

  const renderDiagnostic = () => {
    const question = pack.diagnosticQuestions[state.diagnosticIndex];
    const selected = state.diagnosticAnswers[question.id];
    const confidence = state.diagnosticConfidence[question.id];
    const isLast = state.diagnosticIndex === pack.diagnosticQuestions.length - 1;
    return `
      ${pageHeader("DIAGNOSTIC · ĐÁNH GIÁ ĐẦU VÀO", "Đọc tín hiệu trước khi xếp lộ trình", `${pack.diagnosticQuestions.length} câu hỏi đi qua các competency nền tảng của topic. Kết quả dùng để chọn section ưu tiên, không thay thế mastery test.`, `<span class="assessment-rule"><span class="rule-icon">${icon("shield")}</span><span><strong>Không trừ điểm</strong><small>Pass mark chỉ áp dụng ở mastery test</small></span></span>`)}
      <div class="assessment-progress"><div><span>DIAGNOSTIC PROGRESS</span><strong>${state.diagnosticIndex + 1} <em>/ ${pack.diagnosticQuestions.length}</em></strong></div><div class="segmented-progress">${pack.diagnosticQuestions.map((item, index) => `<i class="${index < state.diagnosticIndex ? "is-done" : index === state.diagnosticIndex ? "is-current" : ""}"></i>`).join("")}</div></div>
      <div class="assessment-layout"><section class="assessment-card panel-card"><div class="question-meta"><span class="question-label">CÂU ${String(state.diagnosticIndex + 1).padStart(2, "0")}</span>${statusBadge(question.label, "info")}</div><h2 class="assessment-question">${escapeHtml(question.prompt)}</h2><div class="option-list" role="radiogroup" aria-label="Các lựa chọn trả lời">${question.options.map((option, index) => `<button class="option-button ${selected === index ? "is-selected" : ""}" type="button" role="radio" aria-checked="${selected === index}" data-action="answer-diagnostic" data-index="${index}"><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span>${selected === index ? `<span class="selected-check">${icon("check")}</span>` : ""}</button>`).join("")}</div><div class="confidence-block"><div><span class="field-label">Bạn chắc đến đâu?</span><small>Đây là tín hiệu cho lộ trình, không phải điểm số.</small></div><div class="confidence-options" role="group" aria-label="Mức độ tự tin">${[["high", "Chắc chắn", "Hiểu và giải thích được"], ["medium", "Phân vân", "Nhớ một phần"], ["low", "Đang đoán", "Chưa có cơ sở rõ"]].map(([value, label, help]) => `<button class="confidence-option ${confidence === value ? "is-selected" : ""}" type="button" data-action="diagnostic-confidence" data-value="${value}" aria-pressed="${confidence === value}"><strong>${label}</strong><small>${help}</small></button>`).join("")}</div></div><div class="assessment-footer"><button class="quiet-button" type="button" data-action="diagnostic-prev" ${state.diagnosticIndex === 0 ? "disabled" : ""}>${icon("back")} Câu trước</button><button class="primary-button" type="button" data-action="diagnostic-next" ${selected === undefined ? "disabled" : ""}>${isLast ? "Xem kết quả" : "Câu tiếp theo"} ${icon("arrow")}</button></div></section><aside class="assessment-aside"><div class="aside-card aside-note"><span class="aside-icon">${icon("spark")}</span><h3>Đo lỗ hổng, không đo trí nhớ</h3><p>Các câu hỏi đi qua nhiều competency để tạo tín hiệu ban đầu. Sai một câu không làm bạn quay về vạch xuất phát.</p></div><div class="aside-card"><span class="aside-label">COVERAGE MAP</span><div class="diagnostic-coverage"><strong>${diagnosticCoverage().covered}/${diagnosticCoverage().total}</strong><span>competency đã chạm tới</span></div><div class="plan-line"><span class="plan-dot is-active"></span><span><strong>Diagnostic</strong><small>${pack.diagnosticQuestions.length} câu · khoảng 8 phút</small></span></div><div class="plan-line"><span class="plan-dot"></span><span><strong>Personal roadmap</strong><small>Được tạo sau kết quả</small></span></div><div class="plan-line"><span class="plan-dot"></span><span><strong>Mastery test</strong><small>Pass từ 80% ở từng section</small></span></div></div></aside></div>`;
  };

  const diagnosticScore = () => {
    const answered = pack.diagnosticQuestions.filter((question) => state.diagnosticAnswers[question.id] !== undefined);
    const correct = answered.filter((question) => state.diagnosticAnswers[question.id] === question.correctIndex).length;
    return { answered: answered.length, correct, total: pack.diagnosticQuestions.length, percent: Math.round((correct / pack.diagnosticQuestions.length) * 100) };
  };

  const submitDiagnostic = async (skip = false) => {
    const payload = {
      topic_id: pack.topic.id,
      topic_label: state.pathTopic,
      assessment_mode: skip ? "baseline" : "diagnostic",
      learner: { name: pack.learner.name, cohort: pack.learner.cohort, target_role: pack.learner.targetRole, level: state.pathLevel },
      available_time_minutes: state.timePlan,
      answers: skip ? [] : pack.diagnosticQuestions.map((question) => ({
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
    const analysis = state.aiAnalysis || localAnalysis();
    const gaps = pack.diagnosticQuestions.filter((question) => state.diagnosticAnswers[question.id] !== question.correctIndex);
    const nextSection = nextRecommendedSection();
    const agentStatus = state.agentMeta?.live ? statusBadge("AI agent live", "success") : statusBadge("Fallback an toàn", "neutral");
    return `
      ${pageHeader("DIAGNOSTIC · KẾT QUẢ", "Đây là điểm bắt đầu của lộ trình", "Kết quả được dùng để chọn thứ tự section. Bạn chưa cần học lại phần đã nắm được.", `<button class="outline-button compact-button" type="button" data-action="redo-diagnostic">Làm lại</button>`)}
      <div class="diagnostic-result-grid"><article class="score-card panel-card"><div class="score-card-top"><div class="score-circle"><strong>${score.percent}</strong><span>%</span></div><div><span class="panel-kicker">INITIAL SIGNAL</span><h2>${score.percent >= 80 ? "Nền tảng đang khá chắc" : "Đã tìm thấy điểm cần ưu tiên"}</h2><p>${score.correct}/${score.total} câu đúng · confidence được thu thập theo từng câu.</p></div></div><div class="result-meter"><div class="progress-bar"><i style="width:${score.percent}%"></i></div><span>Diagnostic không phải mastery test</span></div></article><article class="profile-card panel-card"><div class="panel-kicker-row"><span class="panel-kicker">LEARNING PROFILE</span>${agentStatus}</div><h2>Ưu tiên theo gap</h2><p>${escapeHtml(analysis.reason || (gaps.length ? `Hệ thống đưa ${gaps.length} tín hiệu cần ôn lên trước.` : "Bạn có thể đi thẳng tới section tiếp theo."))}</p><div class="profile-tags">${analysis.competency_gaps.slice(0, 3).map((gap) => `<span>${escapeHtml(getCompetency(gap.competency_id).title)}</span>`).join("")}</div></article></div>
      <div class="section-heading result-heading"><div><p class="section-eyebrow">WHAT WE FOUND</p><h2>Tín hiệu từ bài làm</h2></div><span class="muted-label">Source-linked · ${gaps.length} gap cần xử lý</span></div>
      <div class="finding-list">${pack.diagnosticQuestions.map((question, index) => { const isCorrect = state.diagnosticAnswers[question.id] === question.correctIndex; return `<article class="finding-item"><span class="finding-number ${isCorrect ? "is-good" : "is-gap"}">${isCorrect ? icon("check") : String(index + 1).padStart(2, "0")}</span><div><div class="finding-title"><strong>${escapeHtml(question.label)}</strong>${statusBadge(isCorrect ? "Đã nắm tín hiệu" : "Cần ôn", isCorrect ? "success" : "warning")}</div><p>${isCorrect ? "Câu trả lời đang phù hợp với competency. Không đưa vào phần ưu tiên đầu tiên." : escapeHtml(question.explanation)}</p><div class="source-row-inline">${sourceChips(question.sourceIds)}</div></div></article>`; }).join("")}</div>
      <div class="result-cta panel-card"><div><span class="panel-kicker">NEXT BEST ACTION</span><h2>Đi vào lộ trình cá nhân</h2><p>Ưu tiên kế tiếp: ${escapeHtml(nextSection.title)}. Mỗi section có mastery test riêng với ngưỡng pass 80%.</p></div><button class="primary-button" type="button" data-view="roadmap">Xem roadmap ${icon("arrow")}</button></div>`;
  };

  const renderRoadmap = () => {
    const prioritySection = nextRecommendedSection();
    const gapCount = state.diagnosticSkipped ? 0 : (state.aiAnalysis?.competency_gaps?.length || 2);
    const planSource = state.diagnosticSkipped ? `Bạn bắt đầu từ số 0 nên roadmap đi theo prerequisite, không ép bạn làm diagnostic trước.` : state.diagnosticSubmitted ? `Kết quả diagnostic đã được dùng để ưu tiên ${escapeHtml(prioritySection.title)}.` : "Làm diagnostic để tạo lộ trình sát với kiến thức hiện tại.";
    return `
    ${pageHeader("LEARNING ROADMAP", "Lộ trình của bạn", "Thứ tự học được sắp theo gap hiện tại. Sau mỗi mastery test, Pathwise sẽ cập nhật section tiếp theo.", `<div class="time-plan-control"><label for="time-plan-input">Thời gian hôm nay</label><div class="time-plan-input"><input id="time-plan-input" type="number" min="10" max="240" step="1" inputmode="numeric" value="${escapeHtml(state.timePlan)}" aria-label="Số phút học hôm nay" /><span>phút</span><button type="button" data-action="save-time-plan">Lưu</button></div><small>10–240 phút</small></div>`)}
    <div class="roadmap-summary"><div><span class="summary-label">PERSONALISED PLAN</span><h2>${state.diagnosticSkipped ? "Bắt đầu từ nền tảng" : "Ôn gap trước, học mới sau"}</h2><p>${planSource}</p></div><div class="summary-stats"><div><strong>${gapCount}</strong><span>${state.diagnosticSkipped ? "gap chưa đánh giá" : "gap ưu tiên"}</span></div><div><strong>${state.timePlan}</strong><span>phút dự kiến</span></div><div><strong>80%</strong><span>ngưỡng pass</span></div></div></div>
    <div class="roadmap-layout"><section class="roadmap-timeline"><div class="timeline-header"><div><p class="section-eyebrow">YOUR SEQUENCE</p><h2>Thứ tự section</h2></div><span class="muted-label">Cập nhật sau mỗi test</span></div>${pack.sections.map((section, index) => { const status = sectionState(section, index); const comp = getCompetency(section.competencyId); const canOpen = status === "current" || status === "complete"; const isRecommended = section.id === prioritySection.id && status === "current"; return `<article class="roadmap-item ${status}"><div class="roadmap-rail"><span class="roadmap-node">${status === "complete" ? icon("check") : section.number}</span>${index < pack.sections.length - 1 ? "<i></i>" : ""}</div><div class="roadmap-content"><div class="roadmap-item-top"><div><span class="item-eyebrow">${escapeHtml(section.eyebrow)}</span><h3>${escapeHtml(section.title)} ${isRecommended ? statusBadge("AI ưu tiên", "warning") : ""}</h3></div>${statusBadge(status === "complete" ? "Đã pass" : status === "current" ? "Đang ưu tiên" : status === "next" ? "Tiếp theo" : "Đang khóa", status === "complete" ? "success" : status === "current" ? "warning" : status === "next" ? "info" : "locked")}</div><p>${escapeHtml(section.description)}</p><div class="roadmap-item-meta"><span>${icon("clock")} ${section.duration}</span><span>${icon("pulse")} ${comp.mastery}% mastery hiện tại</span><span>${icon("file")} ${section.sourceIds.length} sources</span></div>${canOpen ? `<button class="outline-button compact-button" type="button" data-action="go-section" data-section-id="${section.id}">${status === "complete" ? "Xem lại section" : "Bắt đầu section"} ${icon("arrow")}</button>` : `<span class="locked-note">${icon("shield")} Pass section trước để mở</span>`}</div></article>`; }).join("")}</section><aside class="roadmap-aside"><div class="aside-card rationale-card"><span class="aside-label">WHY THIS ORDER?</span><h3>Hệ thống đang ưu tiên gì?</h3><div class="rationale-row"><span class="rationale-icon coral">${icon("pulse")}</span><span><strong>${escapeHtml(prioritySection.title)}</strong><small>Được chọn từ gap và prerequisite hiện tại.</small></span></div><div class="rationale-row"><span class="rationale-icon indigo">${icon("route")}</span><span><strong>Mastery gate</strong><small>Chỉ mở section tiếp theo khi đạt 80%.</small></span></div><div class="rationale-row"><span class="rationale-icon mint">${icon("clock")}</span><span><strong>Time-boxed session</strong><small>Plan hôm nay: ${state.timePlan} phút, có thể tạm dừng.</small></span></div></div><div class="aside-card evidence-card-small"><span class="aside-label">EVIDENCE BASIS</span><p>Điểm hổng được đối chiếu với chapter trong PDF đã nạp.</p><div class="source-row-inline">${sourceChips(pack.sources.slice(0, 3).map((source) => source.id))}</div><button class="link-button" type="button" data-view="tutor">Kiểm tra với tutor ${icon("arrow")}</button></div></aside></div>`;
  };

  const renderLessonDepth = (section, studyPackage) => {
    const lessonSections = studyPackage.lessonSections || section.lessonSections || [];
    const commonMistakes = studyPackage.commonMistakes || section.commonMistakes || [];
    const decisionCase = studyPackage.decisionCase || section.decisionCase;
    if (!lessonSections.length && !commonMistakes.length && !decisionCase) return "";
    return `<section class="lesson-deep-dive"><div class="lesson-deep-dive-header"><div><span class="content-label">HỌC KỸ HƠN</span><h2>Từ khái niệm đến quyết định</h2><p>Đọc theo ba lớp: hiểu khái niệm, nhận diện lỗi thường gặp và thử áp dụng vào một tình huống gần với công việc AI Engineer.</p></div><span class="depth-badge">${lessonSections.length + commonMistakes.length + (decisionCase ? 1 : 0)} điểm nội dung</span></div><div class="lesson-detail-grid">${lessonSections.map((item, index) => `<article class="lesson-detail-card"><span class="lesson-detail-number">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p>${item.checkpoint ? `<div class="detail-checkpoint"><strong>Tự kiểm:</strong> ${escapeHtml(item.checkpoint)}</div>` : ""}</div></article>`).join("")}</div>${decisionCase ? `<article class="decision-case"><div class="application-heading"><span class="application-icon">${icon("route")}</span><div><span class="content-label">CASE STUDY</span><h3>${escapeHtml(decisionCase.title)}</h3></div></div><p><strong>Bối cảnh:</strong> ${escapeHtml(decisionCase.context)}</p><p><strong>Quyết định cần đưa ra:</strong> ${escapeHtml(decisionCase.decision)}</p><div class="decision-case-answer"><strong>Cách suy nghĩ:</strong> ${escapeHtml(decisionCase.answer)}</div></article>` : ""}${commonMistakes.length ? `<div class="common-mistakes"><span class="content-label">DỄ NHẦM Ở ĐÂY</span>${commonMistakes.map((mistake) => `<div class="mistake-row"><span>${icon("close")}</span><p>${escapeHtml(mistake)}</p></div>`).join("")}</div>` : ""}</section>`;
  };

  const renderStudy = () => {
    const section = getSection();
    const index = pack.sections.findIndex((item) => item.id === section.id);
    const status = sectionState(section, index);
    const sourceResult = state.discoveredSources[section.id];
    const studyPackage = state.generatedPackages[section.id] || section;
    if (status === "locked") {
      return `${pageHeader("STUDY SESSION", "Section đang được khóa", "Hoàn thành section trước đó với ít nhất 80% để mở nội dung này.", `<button class="outline-button compact-button" type="button" data-view="roadmap">Về roadmap ${icon("back")}</button>`)}<div class="locked-state panel-card"><span class="locked-state-icon">${icon("shield")}</span><h2>Chưa đến bước này</h2><p>Pathwise giữ thứ tự học theo prerequisite để bạn không phải nhảy qua phần nền tảng.</p><button class="primary-button" type="button" data-action="go-section" data-section-id="${escapeHtml(nextRecommendedSection().id)}">Mở section đang ưu tiên ${icon("arrow")}</button></div>`;
    }
    const checkedCount = state.studyChecks.length;
    return `${pageHeader(`${section.number} · STUDY SESSION`, escapeHtml(section.title), escapeHtml(section.description), `<span class="session-time">${icon("clock")} ${studyPackage.estimated_minutes || section.duration} phút</span>`)}
      <div class="study-progress-row"><div><span>SECTION PROGRESS</span><strong>${state.studyCompleted ? "100" : checkedCount ? "66" : "24"}%</strong></div><div class="progress-bar"><i style="width:${state.studyCompleted ? 100 : checkedCount ? 66 : 24}%"></i></div><span class="study-progress-note">${state.studyCompleted ? "Sẵn sàng làm mastery test" : "Đọc · kiểm tra · áp dụng"}</span></div>
      <div class="study-layout"><article class="lesson-content"><div class="lesson-intro"><span class="content-label">LEARNING PACKAGE · MỤC TIÊU SECTION</span><h2>${escapeHtml(studyPackage.objective)}</h2><div class="package-facts"><span>${icon("book")} ${studyPackage.concepts.length} learning cards</span><span>${icon("spark")} 1 ví dụ transfer</span><span>${icon("check")} ${section.masteryQuestions.length} câu mastery</span></div><div class="source-row-inline">${sourceChips(section.sourceIds)}</div></div><div class="concept-list">${studyPackage.concepts.map((concept, index) => `<article class="concept-card"><span class="concept-number">0${index + 1}</span><div><h3>${escapeHtml(concept.title)}</h3><p>${escapeHtml(concept.body)}</p></div></article>`).join("")}</div>${renderLessonDepth(section, studyPackage)}<div class="application-card"><div class="application-heading"><span class="application-icon">${icon("spark")}</span><div><span class="content-label">VÍ DỤ ÁP DỤNG</span><h3>Đưa vào quyết định sản phẩm</h3></div></div><p>${escapeHtml(studyPackage.example)}</p></div><div class="practice-card"><div class="application-heading"><span class="application-icon">${icon("check")}</span><div><span class="content-label">BÀI THỰC HÀNH NGẮN</span><h3>Biến kiến thức thành một quyết định</h3></div></div><ol>${(studyPackage.practice_steps || section.checklist).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol><div class="transfer-callout"><span class="application-icon">${icon("spark")}</span><div><span class="content-label">TRANSFER CHECK</span><h3>${escapeHtml(studyPackage.transfer_question || `Bạn sẽ áp dụng ${section.title} ở bước nào?`)}</h3></div></div></div><section class="source-discovery panel-card"><div class="source-discovery-header"><div><span class="content-label">REFERENCE DESK</span><h2>Nguồn học thêm cho section này</h2><p>${sourceResult?.note ? escapeHtml(sourceResult.note) : "Nếu tài liệu hiện có chưa đủ, Pathwise sẽ tìm thêm nguồn chính thống và hiển thị rõ lý do lựa chọn."}</p></div><div class="source-actions"><button class="outline-button compact-button" type="button" data-action="discover-sources" ${state.sourceDiscoveryLoading ? "disabled" : ""}>${state.sourceDiscoveryLoading ? "Đang tìm..." : "Tìm nguồn chính thống"} ${icon("arrow")}</button>${sourceResult?.sources?.length ? `<button class="secondary-button compact-button" type="button" data-action="generate-package" ${state.packageLoading ? "disabled" : ""}>${state.packageLoading ? "Đang tạo bài..." : "Tạo bài học từ nguồn"} ${icon("spark")}</button>` : ""}</div></div><div class="reference-grid">${sourceReferenceCards(sourceResult)}</div></section></article><aside class="study-aside"><div class="study-control panel-card"><div class="panel-kicker-row"><span class="panel-kicker">FOCUS SESSION</span>${state.focusStarted ? statusBadge("Đang ghi nhận", "success") : statusBadge("Chưa bắt đầu", "neutral")}</div><div class="focus-timer"><strong>${section.duration}:00</strong><span>thời lượng đề xuất</span></div><p>${state.focusStarted ? "Bạn có thể đọc và đánh dấu từng mục tiêu. Phiên học được time-box nhưng không khóa cứng nếu cần tạm dừng." : "Bắt đầu timer để ghi nhận một phiên học có chủ đích."}</p><button class="outline-button full-button" type="button" data-action="start-focus">${state.focusStarted ? "Tiếp tục phiên học" : "Bắt đầu focus timer"} ${icon("arrow")}</button></div><div class="checklist-card panel-card"><div class="panel-kicker-row"><span class="panel-kicker">LEARNING CHECKLIST</span><span class="checklist-count">${checkedCount}/${section.checklist.length}</span></div>${section.checklist.map((item, index) => `<button class="checklist-item ${state.studyChecks.includes(index) ? "is-checked" : ""}" type="button" data-action="toggle-check" data-index="${index}" aria-pressed="${state.studyChecks.includes(index)}"><span class="checklist-box">${state.studyChecks.includes(index) ? icon("check") : ""}</span><span>${escapeHtml(item)}</span></button>`).join("")}</div></aside></div><div class="study-footer"><button class="quiet-button" type="button" data-view="roadmap">${icon("back")} Về roadmap</button><div><button class="primary-button" type="button" data-action="complete-study">${state.studyCompleted ? "Đã hoàn thành section" : "Đánh dấu đã học"} ${icon("check")}</button><button class="secondary-button" type="button" data-action="start-mastery" ${state.studyCompleted ? "" : "disabled"}>Làm mastery test ${icon("arrow")}</button></div></div>`;
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
    const allSectionsDone = pack.sections.every((section) => state.completedSections[section.id]);
    if (!allSectionsDone && !state.finalStarted) return `${pageHeader("ASSESSMENTS", "Final topic assessment chưa mở", "Hoàn thành tất cả section với ít nhất 80% trước khi làm bài test cuối topic.", `<span class="pass-rule"><strong>80%</strong><small>pass mark</small></span>`)}<div class="locked-state panel-card"><span class="locked-state-icon">${icon("shield")}</span><h2>Còn section chưa pass</h2><p>Final assessment sẽ tổng hợp toàn bộ topic. Hãy quay lại roadmap để tiếp tục section đang được ưu tiên.</p><button class="primary-button" type="button" data-view="roadmap">Mở learning roadmap ${icon("arrow")}</button></div>`;
    if (!state.finalStarted) return `${pageHeader("ASSESSMENTS", "Final learning path assessment", `Một bài test tổng hợp sau khi hoàn thành tất cả section của ${escapeHtml(activeTopicTitle())}.`, `<span class="pass-rule"><strong>80%</strong><small>pass mark</small></span>`)}<div class="final-intro-grid"><article class="final-intro panel-card"><div class="final-icon">${icon("shield")}</div><span class="panel-kicker">TOPIC GATE</span><h2>Chứng minh bạn đã nối được các phần</h2><p>${pack.finalQuestions.length} câu hỏi transfer bao quát các competency của topic. Câu hỏi không lặp nguyên văn phần học.</p><div class="final-facts"><span>${icon("file")} ${pack.finalQuestions.length} câu hỏi</span><span>${icon("clock")} khoảng ${Math.max(6, Math.round(pack.finalQuestions.length * 1.2))} phút</span><span>${icon("check")} pass từ 80%</span></div><button class="primary-button" type="button" data-action="start-final">Bắt đầu final assessment ${icon("arrow")}</button></article><aside class="coverage-card panel-card"><span class="panel-kicker">COVERAGE MAP</span><h3>Bài test bao phủ</h3>${pack.competencies.map((competency) => `<div class="coverage-row"><span>${escapeHtml(competency.title)}</span><i><b style="width:${Math.max(20, competency.mastery)}%"></b></i><strong>${competency.mastery}%</strong></div>`).join("")}<div class="coverage-note">${icon("spark")} Điểm yếu sẽ được đưa vào lộ trình sau kết quả.</div></aside></div>`;
    if (state.finalSubmitted) {
      const score = finalScore();
      return `${pageHeader("ASSESSMENTS · KẾT QUẢ", score.percent >= 80 ? "Learning path đã hoàn thành" : "Cần ôn bổ sung", score.percent >= 80 ? "Bạn đã đạt ngưỡng để chuyển sang topic kế tiếp." : "Các competency chưa chắc sẽ được đưa trở lại roadmap.", `<span class="pass-rule ${score.percent >= 80 ? "is-passed" : "is-retry"}"><strong>${score.percent}%</strong><small>${score.percent >= 80 ? "passed" : "retry"}</small></span>`)}<div class="final-result ${score.percent >= 80 ? "is-pass" : "is-fail"} panel-card"><div class="result-symbol">${score.percent >= 80 ? icon("check") : icon("refresh")}</div><div><span class="panel-kicker">${score.percent >= 80 ? "TOPIC PASSED" : "PERSONALISED RECOVERY"}</span><h2>${score.percent >= 80 ? "Sẵn sàng sang bài tiếp theo" : "Chưa đủ chắc để mở bài mới"}</h2><p>${score.percent >= 80 ? `Kết quả được ghi nhận cho ${escapeHtml(activeTopicTitle())}.` : "Pathwise sẽ ưu tiên lại đúng competency có câu trả lời sai trước khi cho thử lại."}</p></div></div><div class="result-cta panel-card"><div><span class="panel-kicker">NEXT ACTION</span><h2>${score.percent >= 80 ? "Xem lại learning profile" : "Quay lại lộ trình"}</h2><p>${score.percent >= 80 ? "Bạn có thể xem lại evidence và các câu đã làm." : "Roadmap vẫn giữ tiến độ section, không bắt đầu lại toàn bộ."}</p></div><button class="primary-button" type="button" data-view="${score.percent >= 80 ? "overview" : "roadmap"}">${score.percent >= 80 ? "Về tổng quan" : "Mở roadmap"} ${icon("arrow")}</button></div>`;
    }
    const question = pack.finalQuestions[state.finalIndex];
    return `${pageHeader("FINAL TOPIC ASSESSMENT", "Tổng hợp và áp dụng", "Chọn phương án phù hợp nhất với một quyết định sản phẩm. Bạn có thể xem lại mục tiêu topic trước khi nộp.", `<span class="pass-rule"><strong>80%</strong><small>pass mark</small></span>`)}${assessmentQuestion(question, state.finalIndex, pack.finalQuestions.length, "final")}`;
  };

  const finalScore = () => {
    const correct = pack.finalQuestions.filter((question) => state.finalAnswers[question.id] === question.correctIndex).length;
    return { correct, total: pack.finalQuestions.length, percent: Math.round((correct / pack.finalQuestions.length) * 100) };
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

  const renderTutor = () => `${pageHeader("AI TUTOR · DOCUMENT GROUNDED", "Hỏi để hiểu, không hỏi để đoán", `Tutor dùng các chapter đã map trong ${escapeHtml(pack.topic.documentName)}. Khi không có căn cứ, hệ thống sẽ nói rõ và đề xuất thu hẹp câu hỏi.`, `<span class="grounded-badge">${icon("shield")} Source-grounded</span>`)}<div class="tutor-layout"><section class="tutor-chat panel-card"><div class="chat-header"><div><span class="panel-kicker">PATHWISE TUTOR</span><h2>Giải thích theo ngữ cảnh học của bạn</h2></div><button class="icon-button small" type="button" data-action="tutor-clear" aria-label="Xóa hội thoại" title="Xóa hội thoại">${icon("refresh")}</button></div><div class="chat-messages" aria-live="polite">${state.tutorMessages.map((message) => `<div class="chat-message ${message.role === "user" ? "is-user" : "is-assistant"}"><div class="message-avatar">${message.role === "user" ? "H" : icon("spark")}</div><div class="message-body"><span class="message-role">${message.role === "user" ? "Bạn" : "Pathwise tutor"}</span><p>${escapeHtml(message.text)}</p>${message.role === "assistant" ? `<div class="message-status"><span class="confidence-pill confidence-${message.confidence}">${confidenceLabel(message.confidence)}</span>${message.sources.length ? `<div class="source-row-inline">${sourceChips(message.sources)}</div>` : ""}</div>` : ""}</div></div>`).join("")}${state.tutorLoading ? `<div class="typing-indicator"><span></span><span></span><span></span><em>Đang đối chiếu PDF...</em></div>` : ""}</div><div class="quick-prompts"><span>Thử hỏi</span><button type="button" data-action="tutor-demo" data-prompt="Supervised và unsupervised learning khác nhau thế nào?">Learning types</button><button type="button" data-action="tutor-demo" data-prompt="Overfitting nên xử lý thế nào?">Overfitting</button><button type="button" data-action="tutor-demo" data-prompt="Accuracy có đủ để đánh giá classifier không?">Model evaluation</button></div><form class="chat-form" data-action="tutor-submit"><label class="sr-only" for="tutor-input">Câu hỏi cho AI tutor</label><input id="tutor-input" name="tutor" type="text" placeholder="Hỏi về regression, overfitting, classification..." autocomplete="off" /><button class="primary-button" type="submit" aria-label="Gửi câu hỏi">${icon("arrow")}</button></form><p class="chat-disclaimer">Agent có source ID · nếu API hết quota, hệ thống thử provider còn lại trước khi fallback.</p></section><aside class="tutor-aside"><div class="aside-card tutor-guardrail"><span class="aside-label">TUTOR GUARDRAIL</span><div class="guardrail-row"><span class="guardrail-check">${icon("check")}</span><span>Chỉ trích dẫn chapter có trong PDF</span></div><div class="guardrail-row"><span class="guardrail-check">${icon("check")}</span><span>Không bịa khi không tìm thấy căn cứ</span></div><div class="guardrail-row"><span class="guardrail-check">${icon("check")}</span><span>Cho biết confidence và đường chuyển tiếp</span></div></div><div class="aside-card source-reference"><span class="aside-label">PDF SOURCES</span>${pack.sources.map((source) => `<div class="reference-row"><strong>${source.id}</strong><span>${escapeHtml(source.label)}</span></div>`).join("")}</div></aside></div>`;

  const renderLoading = () => state.diagnosticSkipped
    ? `${pageHeader("LEARNING PATH · BASELINE", "Đang dựng roadmap nền tảng", "Bạn đã chọn bắt đầu từ số 0 nên hệ thống bỏ qua diagnostic và sắp thứ tự theo prerequisite cùng thời gian bạn đã nhập.", "")}<div class="loading-state panel-card"><div class="loading-orbit">${icon("route")}</div><h2>Đang tạo roadmap từ mục tiêu...</h2><p>Chọn section nền tảng, chia thời lượng và chuẩn bị learning package đầu tiên.</p><div class="loading-lines"><i></i><i></i><i></i></div></div>`
    : `${pageHeader("DIAGNOSTIC · ANALYZING", "Đang đọc cách bạn hiểu", "Đối chiếu câu trả lời với competency map và source ID của topic.", "")}<div class="loading-state panel-card"><div class="loading-orbit">${icon("spark")}</div><h2>Đang tạo learning profile...</h2><p>Phân loại tín hiệu đúng, sai và confidence để chọn next best action.</p><div class="loading-lines"><i></i><i></i><i></i></div></div>`;

  const render = () => {
    persistState();
    const view = ["diagnostic-result"].includes(state.view) ? renderDiagnosticResult : state.view === "setup" ? renderSetup : state.view === "overview" ? renderOverview : state.view === "diagnostic" ? renderDiagnostic : state.view === "diagnostic-loading" ? renderLoading : state.view === "roadmap" ? renderRoadmap : state.view === "study" ? renderStudy : state.view === "mastery" ? (state.masterySubmitted ? renderMasteryResult : renderMastery) : state.view === "remediation-loading" ? renderRemediationLoading : state.view === "remediation" ? renderRemediation : state.view === "tutor" ? renderTutor : state.view === "assessment" ? renderAssessment : renderSetup;
    viewContainer.innerHTML = view();
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
  };

  const reset = () => {
    Object.assign(state, { view: "setup", profileConfigured: false, pathTopic: "", pathLevel: "new", pathMinutes: "", diagnosticIndex: 0, diagnosticAnswers: {}, diagnosticConfidence: {}, diagnosticSubmitted: false, diagnosticSkipped: false, aiAnalysis: null, agentMeta: null, recommendedPath: [], selectedSectionId: "section-ml-foundations", timePlan: 30, focusStarted: false, studyCompleted: false, studyChecks: [], masteryIndex: 0, masteryAnswers: {}, masterySubmitted: false, masteryScore: null, masteryPassed: false, completedSections: {}, remediationData: null, remediationText: "", remediationChecked: false, remediationLoading: false, discoveredSources: {}, sourceDiscoveryLoading: false, generatedPackages: {}, packageLoading: false, finalStarted: false, finalIndex: 0, finalAnswers: {}, finalSubmitted: false, finalScore: null, tutorLoading: false, tutorMessages: [{ role: "assistant", text: "Bạn có thể hỏi về problem framing, supervised learning, regression, overfitting hoặc model evaluation. Mình sẽ trả lời dựa trên tài liệu đã được gắn nguồn.", sources: [], confidence: "high" }] });
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    window.history.replaceState(null, "", "#setup");
    render();
    showToast("Đã đặt lại toàn bộ phiên demo.");
  };

  const chooseDiagnosticAnswer = (index) => {
    const question = pack.diagnosticQuestions[state.diagnosticIndex];
    state.diagnosticAnswers[question.id] = index;
    render();
  };

  const chooseMasteryAnswer = (index) => {
    state.masteryAnswers[activeMasteryQuestions()[state.masteryIndex].id] = index;
    render();
  };

  const chooseFinalAnswer = (index) => {
    state.finalAnswers[pack.finalQuestions[state.finalIndex].id] = index;
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
    if (action === "topic-menu") { setView("setup"); closeSidebar(); }
    if (action === "notification") showToast("Bạn có thể chỉnh thời gian học trong learning roadmap.");
    if (action === "profile") showToast("Hồ sơ học tập của Vũ Quốc Huy · K4 · 3B.");
    if (action === "fill-topic") { state.pathTopic = target.dataset.topic; persistState(); render(); document.querySelector("#path-topic")?.focus(); }
    if (action === "select-path-level") { state.pathLevel = target.dataset.level; render(); }
    if (action === "save-time-plan") { const input = document.querySelector("#time-plan-input"); const minutes = input ? Number(input.value) : NaN; if (!isValidMinutes(minutes)) { showToast("Thời gian phải nằm trong khoảng 10–240 phút."); input?.focus(); return; } state.timePlan = minutes; state.pathMinutes = minutes; render(); showToast(`Đã cập nhật plan ${minutes} phút cho hôm nay.`); }
    if (action === "create-path") {
      if (!isValidTopic(state.pathTopic)) { showToast("Hãy nhập chủ đề bạn muốn học."); document.querySelector("#path-topic")?.focus(); return; }
      if (!isValidMinutes(state.pathMinutes)) { showToast("Hãy nhập thời gian học từ 10 đến 240 phút."); document.querySelector("#path-minutes")?.focus(); return; }
      state.profileConfigured = true;
      state.timePlan = Number(state.pathMinutes);
      state.diagnosticSkipped = state.pathLevel === "new";
      state.diagnosticSubmitted = false;
      state.aiAnalysis = null;
      state.recommendedPath = [];
      state.view = state.diagnosticSkipped ? "diagnostic-loading" : "overview";
      window.history.replaceState(null, "", `#${state.view}`);
      render();
      if (state.diagnosticSkipped) {
        showToast("Đang tạo roadmap nền tảng từ mục tiêu của bạn.");
        window.setTimeout(() => submitDiagnostic(true), 720);
      } else {
        showToast("Đã ghi nhận mục tiêu. Bước tiếp theo là diagnostic bao quát.");
      }
    }
    if (action === "start-diagnostic") { state.diagnosticSkipped = false; state.diagnosticIndex = 0; setView("diagnostic"); }
    if (action === "answer-diagnostic") chooseDiagnosticAnswer(Number(target.dataset.index));
    if (action === "diagnostic-confidence") { const question = pack.diagnosticQuestions[state.diagnosticIndex]; state.diagnosticConfidence[question.id] = target.dataset.value; render(); }
    if (action === "diagnostic-prev" && state.diagnosticIndex > 0) { state.diagnosticIndex -= 1; render(); }
    if (action === "diagnostic-next") {
      const question = pack.diagnosticQuestions[state.diagnosticIndex];
      if (state.diagnosticAnswers[question.id] === undefined) { showToast("Hãy chọn một phương án trước."); return; }
      if (state.diagnosticIndex < pack.diagnosticQuestions.length - 1) { state.diagnosticIndex += 1; render(); } else { state.view = "diagnostic-loading"; render(); window.setTimeout(submitDiagnostic, 720); }
    }
    if (action === "redo-diagnostic") { state.diagnosticIndex = 0; state.diagnosticAnswers = {}; state.diagnosticConfidence = {}; state.diagnosticSubmitted = false; state.diagnosticSkipped = false; state.aiAnalysis = null; state.agentMeta = null; setView("diagnostic"); }
    if (action === "go-study") { state.selectedSectionId = nextRecommendedSection().id; setView("study"); }
    if (action === "go-section") { state.selectedSectionId = target.dataset.sectionId; state.studyChecks = []; state.studyCompleted = false; state.focusStarted = false; setView("study"); }
    if (action === "start-focus") { state.focusStarted = true; render(); showToast("Đã bắt đầu focus session."); }
    if (action === "discover-sources") discoverSources();
    if (action === "generate-package") generateLearningPackage();
    if (action === "toggle-check") { const item = Number(target.dataset.index); state.studyChecks = state.studyChecks.includes(item) ? state.studyChecks.filter((index) => index !== item) : [...state.studyChecks, item]; render(); }
    if (action === "complete-study") { const section = getSection(); if (state.studyChecks.length < section.checklist.length) { showToast(`Hãy hoàn thành ${section.checklist.length - state.studyChecks.length} mục checklist trước khi mở mastery test.`); return; } state.studyCompleted = true; render(); showToast("Section đã được đánh dấu hoàn thành. Mastery test đã mở."); }
    if (action === "start-mastery") { if (!state.studyCompleted) { showToast("Hãy hoàn thành section trước khi làm mastery test."); return; } state.masteryIndex = 0; state.masteryAnswers = {}; state.masterySubmitted = false; state.remediationData = null; state.remediationText = ""; state.remediationChecked = false; setView("mastery"); }
    if (action === "answer-mastery") chooseMasteryAnswer(Number(target.dataset.index));
    if (action === "mastery-next") { const questions = activeMasteryQuestions(); const question = questions[state.masteryIndex]; if (state.masteryAnswers[question.id] === undefined) { showToast("Hãy chọn một phương án trước."); return; } if (state.masteryIndex < questions.length - 1) { state.masteryIndex += 1; render(); } else { state.masterySubmitted = true; render(); } }
    if (action === "start-remediation") loadRemediation();
    if (action === "check-remediation") { const input = document.querySelector("#remediation-input"); state.remediationText = input ? input.value : ""; state.remediationChecked = state.remediationText.trim().length > 10; render(); showToast(state.remediationChecked ? "Đã ghi nhận explain-back." : "Hãy viết ít nhất một câu giải thích."); }
    if (action === "retry-mastery") { state.masteryIndex = 0; state.masteryAnswers = {}; state.masterySubmitted = false; state.studyCompleted = true; state.remediationChecked = false; state.remediationText = ""; setView("mastery"); }
    if (action === "next-section") { const currentIndex = pack.sections.findIndex((section) => section.id === state.selectedSectionId); const nextSection = pack.sections[currentIndex + 1]; if (nextSection) { state.selectedSectionId = nextSection.id; state.studyChecks = []; state.studyCompleted = false; state.focusStarted = false; setView("study"); showToast(`Section ${nextSection.title} đã được mở.`); } else { setView("assessment"); } }
    if (action === "start-final") { const allSectionsDone = pack.sections.every((section) => state.completedSections[section.id]); if (!allSectionsDone) { showToast("Hãy pass tất cả section trước khi mở final assessment."); return; } state.finalStarted = true; state.finalIndex = 0; setView("assessment"); }
    if (action === "answer-final") chooseFinalAnswer(Number(target.dataset.index));
    if (action === "final-next") { const question = pack.finalQuestions[state.finalIndex]; if (state.finalAnswers[question.id] === undefined) { showToast("Hãy chọn một phương án trước."); return; } if (state.finalIndex < pack.finalQuestions.length - 1) { state.finalIndex += 1; render(); } else { state.finalSubmitted = true; state.finalScore = finalScore().percent; render(); } }
    if (action === "tutor-demo") sendTutor(target.dataset.prompt);
    if (action === "tutor-clear") { state.tutorLoading = false; state.tutorMessages = [{ role: "assistant", text: "Bạn có thể hỏi về problem framing, supervised learning, regression, overfitting hoặc model evaluation. Mình sẽ trả lời dựa trên Grokking Machine Learning và hiện source ID.", sources: [], confidence: "high" }]; render(); }
  });

  document.addEventListener("submit", (event) => {
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
      if (footerMessage) footerMessage.textContent = !validTopic ? "Nhập một chủ đề để tiếp tục." : !validMinutes ? "Nhập thời gian học để tiếp tục." : state.pathLevel === "new" ? "Sẽ bỏ qua diagnostic và tạo roadmap nền tảng." : "Đã đủ thông tin để tạo learning path.";
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
      if (footerMessage) footerMessage.textContent = !isValidTopic(state.pathTopic) ? "Nhập một chủ đề để tiếp tục." : !valid ? "Nhập thời gian học để tiếp tục." : state.pathLevel === "new" ? "Sẽ bỏ qua diagnostic và tạo roadmap nền tảng." : "Đã đủ thông tin để tạo learning path.";
      if (errorMessage) errorMessage.hidden = state.pathMinutes === "" || valid;
    }
  });

  window.addEventListener("hashchange", () => { const view = window.location.hash.replace("#", ""); if (view) { state.view = view; render(); } });
  restoreState();
  render();
  refreshEnvironmentStatus();
})();
