/* ------------------------------------------------------------------ *
 * Shared comment storage for the feedback overlay.
 * Backed by Vercel KV / Upstash Redis over the REST API (no npm deps).
 *
 * Set up: Vercel dashboard -> Storage -> create a KV / Upstash Redis
 * database -> connect it to this project. That injects the env vars
 * below automatically. Redeploy and the feedback tool goes "shared".
 *
 *   GET  /api/comments?page=/some/path      -> { configured, threads }
 *   POST /api/comments  { page, threads }   -> { configured, threads }  (server-merged)
 *
 * Until a store is connected, GET/POST return { configured:false } and
 * the frontend stays in local-only mode.
 * ------------------------------------------------------------------ */

var REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
var REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
var CONFIGURED = !!(REST_URL && REST_TOKEN);

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

function pageFrom(req) {
  try { return new URL(req.url, "http://x").searchParams.get("page") || ""; }
  catch (e) { return ""; }
}

function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === "object") { resolve(req.body); return; }
    if (req.body && typeof req.body === "string") { try { resolve(JSON.parse(req.body)); return; } catch (e) {} }
    var d = "";
    req.on("data", function (c) { d += c; });
    req.on("end", function () { try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({}); } });
    req.on("error", function () { resolve({}); });
  });
}

async function kv(cmd) {
  var r = await fetch(REST_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + REST_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error("kv " + r.status);
  var j = await r.json();
  return j.result;
}
async function getThreads(key) {
  var v = await kv(["GET", key]);
  if (!v) return [];
  try { return JSON.parse(v); } catch (e) { return []; }
}
async function setThreads(key, threads) {
  await kv(["SET", key, JSON.stringify(threads)]);
}

/* union threads by id; union comments by id; last-writer-wins on resolved; sticky delete */
function merge(existing, incoming) {
  var map = {};
  (existing || []).forEach(function (t) { map[t.id] = t; });
  (incoming || []).forEach(function (t) {
    if (!t || !t.id) return;
    var e = map[t.id];
    if (!e) { map[t.id] = t; return; }
    var seen = {};
    (e.comments || []).forEach(function (c) { seen[c.id] = 1; });
    (t.comments || []).forEach(function (c) { if (c && !seen[c.id]) { e.comments.push(c); } });
    e.comments.sort(function (a, b) { return a.ts - b.ts; });
    if (typeof t.resolved !== "undefined") e.resolved = !!t.resolved;
    if (t.deleted) e.deleted = true;
    if (t.anchor && !e.anchor) e.anchor = t.anchor;
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}

module.exports = async function (req, res) {
  if (req.method === "OPTIONS") { send(res, 200, {}); return; }
  if (!CONFIGURED) { send(res, 200, { configured: false, threads: [] }); return; }

  try {
    if (req.method === "GET") {
      var page = pageFrom(req);
      if (!page) { send(res, 400, { error: "page required" }); return; }
      var threads = await getThreads("fb:" + page);
      send(res, 200, { configured: true, threads: threads });
      return;
    }
    if (req.method === "POST") {
      var body = await readBody(req);
      var p = String(body.page || "");
      if (!p) { send(res, 400, { error: "page required" }); return; }
      var key = "fb:" + p;
      var current = await getThreads(key);
      var merged = merge(current, body.threads || []);
      await setThreads(key, merged);
      send(res, 200, { configured: true, threads: merged });
      return;
    }
    send(res, 405, { error: "method not allowed" });
  } catch (e) {
    send(res, 500, { configured: true, error: String((e && e.message) || e) });
  }
};
