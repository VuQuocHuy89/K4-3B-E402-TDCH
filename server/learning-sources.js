"use strict";
const { sanitizeSources } = require("./source-catalog");
const htmlText = (html) => html.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/\s+/g, " ").trim();

const selectExcerpt = (content, query = "") => {
  if (content.length <= 5000 || !query) return content.slice(0, 5000);
  const terms = [...new Set(query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((s) => s.length > 3))];
  const chunks = [];
  for (let start = 0; start < content.length; start += 1100) {
    const body = content.slice(start, start + 1600);
    const lower = body.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    chunks.push({ start, body, score: terms.reduce((score, term) => score + Math.min(3, lower.split(term).length - 1), 0) });
  }
  return chunks.sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.start - b.start).map((c) => c.body).join("\n[... excerpt ...]\n");
};
const readPage = async (source, fetchImpl = fetch, query = "") => {
  let url = source.url;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!sanitizeSources([{ url }], 1).length) throw new Error("source_redirect_not_allowed");
    const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(10000), headers: { Accept: "text/html,text/plain" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      url = new URL(response.headers.get("location"), url).href;
      continue;
    }
    if (!response.ok || !/text\/(html|plain)/i.test(response.headers.get("content-type") || "")) { await response.body?.cancel(); throw new Error("source_not_readable"); }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 750000) break;
      chunks.push(Buffer.from(chunk));
    }
    const html = Buffer.concat(chunks).toString("utf8");
    let main = html.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2] || html;
    const fragment = new URL(source.url).hash.slice(1);
    if (fragment) {
      const anchor = main.indexOf(`id="${fragment}"`);
      if (anchor >= 0) main = main.slice(Math.max(0, main.lastIndexOf("<", anchor)), anchor + 22000);
    }
    const content = htmlText(main);
    if (content.length < 180) throw new Error("source_empty_text");
    return { ...source, excerpt: selectExcerpt(content, query), retrieved_url: url, retrieved_at: new Date().toISOString(), provenance: "retrieved-page" };
  }
  throw new Error("source_too_many_redirects");
};
const retrieveEvidence = async (sources, fetchImpl = fetch, query = "") => {
  const results = await Promise.allSettled(sanitizeSources(sources, 4).map((s) => readPage(s, fetchImpl, query)));
  return results.filter((r) => r.status === "fulfilled").map((r) => r.value).slice(0, 3);
};
module.exports = { retrieveEvidence, htmlText, selectExcerpt };
