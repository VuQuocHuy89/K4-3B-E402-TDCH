"use strict";

// Providers report small waits as "105ms", longer waits as "56.1s",
// or use the standard Retry-After header (seconds or HTTP date).
const retryDelayMs = (header, body, now = Date.now()) => {
  if (header && Number.isFinite(Number(header))) return Math.max(0, Number(header) * 1000);
  if (header && Number.isFinite(Date.parse(header))) return Math.max(0, Date.parse(header) - now);
  const match = String(body).match(/try again in ([\d.]+)(ms|s)/i);
  return match ? Number(match[1]) * (match[2].toLowerCase() === "ms" ? 1 : 1000) : 0;
};
module.exports = { retryDelayMs };
