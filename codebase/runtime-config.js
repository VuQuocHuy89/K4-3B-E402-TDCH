// Local pages always use the local backend. Never silently switch accounts
// or learning requests to an older hosted deployment on network failure.
const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
const liveServer = /^55\d\d$/.test(window.location.port) || new URLSearchParams(window.location.search).get("api") === "local";
window.PATHWISE_API_BASE = localHost
  ? (liveServer ? "http://localhost:4173" : window.location.origin)
  : "https://k4-3b-e402-tdch.onrender.com";
