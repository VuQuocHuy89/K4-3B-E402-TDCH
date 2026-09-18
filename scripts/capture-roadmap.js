"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const port = process.env.CHROME_DEBUG_PORT || "9224";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openClient() {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.type === "page");
  if (!target) throw new Error("No page target exposed by Chrome");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id);
    if (message.error) job.reject(new Error(message.error.message));
    else job.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { socket, send };
}

async function main() {
  const { socket, send } = await openClient();
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:4173/" });
  await sleep(700);
  const snapshot = {
    view: "roadmap",
    profileConfigured: true,
    pathTopic: "Machine Learning Foundations",
    pathLevel: "beginner",
    pathMinutes: 35,
    diagnosticSubmitted: true,
    diagnosticSkipped: false,
    selectedSectionId: "section-learning-types",
    timePlan: 35,
    completedSections: { "section-ml-foundations": true },
    studyChecks: [],
    tutorMessages: [],
  };
  await send("Runtime.evaluate", { expression: `localStorage.setItem('pathwise-learning-session-v5', ${JSON.stringify(JSON.stringify(snapshot))})` });
  await send("Page.navigate", { url: `http://127.0.0.1:4173/?capture=${Date.now()}#roadmap` });
  await sleep(900);

  async function inspect(label) {
    const result = await send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => ({
        label: ${JSON.stringify(label)},
        viewport: { width: innerWidth, height: innerHeight },
        documentWidth: { client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth },
        heading: document.querySelector('h1')?.textContent,
        href: location.href,
        savedState: JSON.parse(localStorage.getItem('pathwise-learning-session-v5') || 'null'),
        checkpointCount: document.querySelectorAll('.journey-checkpoint').length,
        completedFlagCount: document.querySelectorAll('.journey-micro-point.is-complete').length,
        avatarStop: document.querySelector('.journey-avatar')?.dataset.stop,
        clippedCards: [...document.querySelectorAll('.checkpoint-card')].filter((card) => { const rect = card.getBoundingClientRect(); return rect.left < 0 || rect.right > innerWidth; }).length,
        buttons: [...document.querySelectorAll('.journey-map button')].map((button) => ({ label: button.textContent.trim(), width: Math.round(button.getBoundingClientRect().width), height: Math.round(button.getBoundingClientRect().height) })),
      }))()`,
    });
    return result.result.value;
  }

  async function capture(fileName) {
    const metrics = await send("Page.getLayoutMetrics");
    const size = metrics.cssContentSize;
    const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 } });
    await fs.writeFile(path.resolve(fileName), Buffer.from(result.data, "base64"));
  }

  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await sleep(350);
  const desktop = await inspect("desktop");
  await capture("eval/roadmap-desktop.png");
  await send("Runtime.evaluate", { expression: `document.querySelector('[data-action="preview-journey"]')?.click()` });
  await sleep(250);
  const motion = await send("Runtime.evaluate", { returnByValue: true, expression: `({ activeAnimations: document.getAnimations().length, advancing: document.querySelector('.journey-avatar')?.classList.contains('is-advancing') })` });

  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await send("Page.reload", { ignoreCache: true });
  await sleep(650);
  const mobile = await inspect("mobile");
  await capture("eval/roadmap-mobile.png");

  console.log(JSON.stringify({ desktop, mobile, motion: motion.result.value }, null, 2));
  socket.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
