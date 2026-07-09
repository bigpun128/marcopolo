/* ------------------------------------------------------------------ *
 * Exhbt feedback overlay — Figma-style pin comments.
 * Storage: shared via /api/comments (Vercel KV) when a store is
 * connected; otherwise local-only (localStorage per page) with
 * share-link / JSON export so notes can still be passed around.
 * Drop in with: <script src="../feedback.js" defer></script>
 * ------------------------------------------------------------------ */
(function () {
  "use strict";
  if (window.__exhbtFeedback) return;
  window.__exhbtFeedback = true;

  var Z = { catch: 2147482000, pin: 2147483000, ui: 2147483600 };
  var KEY = "exhbt-fb:" + location.pathname;
  var state = { me: "", threads: [] };
  var mode = false;         // comment placing mode
  var openId = null;        // currently open thread

  /* remote */
  var API = null, remoteOn = false, pushT = 0, pushing = false, statusDot = null;

  /* ---------- storage ---------- */
  function load() {
    try { var r = JSON.parse(localStorage.getItem(KEY)); if (r) state = r; } catch (e) {}
    try { var n = localStorage.getItem("exhbt-fb-name"); if (n && !state.me) state.me = n; } catch (e) {}
    if (!state.threads) state.threads = [];
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    if (state.me) { try { localStorage.setItem("exhbt-fb-name", state.me); } catch (e) {} }
  }
  function save() { saveLocal(); pushSoon(); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function visible() { return state.threads.filter(function (t) { return !t.deleted; }); }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ago(ts) {
    var s = (Date.now() - ts) / 1000;
    if (s < 60) return "just now";
    var m = s / 60; if (m < 60) return Math.floor(m) + "m ago";
    var h = m / 60; if (h < 24) return Math.floor(h) + "h ago";
    var d = h / 24; if (d < 7) return Math.floor(d) + "d ago";
    return new Date(ts).toLocaleDateString();
  }
  function selectorFor(el) {
    if (!el || el === document.body || el.nodeType !== 1) return "body";
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      var p = el.tagName.toLowerCase();
      if (el.id) { p += "#" + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id); parts.unshift(p); break; }
      var i = 1, sib = el;
      while ((sib = sib.previousElementSibling)) { if (sib.tagName === el.tagName) i++; }
      p += ":nth-of-type(" + i + ")";
      parts.unshift(p);
      el = el.parentElement;
    }
    return parts.join(">");
  }
  function anchorPoint(a) {
    var sw = document.documentElement.scrollWidth, sh = document.documentElement.scrollHeight, el = null;
    if (a.selector) { try { el = document.querySelector(a.selector); } catch (e) {} }
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.width || r.height) return { x: r.left + scrollX + a.nx * r.width, y: r.top + scrollY + a.ny * r.height };
    }
    return { x: (a.xf || 0) * sw, y: (a.yf || 0) * sh };
  }

  /* ---------- styles ---------- */
  function injectCss() {
    var css = "" +
    ".fb-ui,.fb-ui *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
    ".fb-bar{position:fixed;right:18px;bottom:18px;z-index:" + Z.ui + ";display:flex;align-items:center;gap:4px;background:#141317;color:#fff;border-radius:100px;padding:6px 6px 6px 4px;box-shadow:0 10px 34px rgba(0,0,0,.4)}" +
    ".fb-bar .fb-dot{width:8px;height:8px;border-radius:50%;background:#7a7580;margin:0 4px 0 8px;flex:0 0 8px}" +
    ".fb-bar button{border:0;background:transparent;color:#e9e7ee;font-size:13px;font-weight:600;padding:9px 13px;border-radius:100px;cursor:pointer;display:flex;align-items:center;gap:7px;line-height:1}" +
    ".fb-bar button:hover{background:rgba(255,255,255,.1)}" +
    ".fb-bar .fb-primary{background:#6d4bd6;color:#fff}" +
    ".fb-bar .fb-primary.on{background:#c8ff4d;color:#141317}" +
    ".fb-bar .fb-count{background:#2a2830;color:#c8ff4d;font-size:12px;min-width:20px;justify-content:center;padding:9px 10px}" +
    ".fb-bar .sep{width:1px;height:20px;background:rgba(255,255,255,.14)}" +
    ".fb-catch{position:fixed;inset:0;z-index:" + Z.catch + ";cursor:crosshair;background:rgba(109,75,214,.04)}" +
    ".fb-hint{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:" + Z.ui + ";background:#141317;color:#fff;font-size:13px;font-weight:600;padding:9px 16px;border-radius:100px;box-shadow:0 8px 24px rgba(0,0,0,.35);pointer-events:none}" +
    ".fb-pin{position:absolute;z-index:" + Z.pin + ";width:30px;height:30px;margin:-30px 0 0 0;transform:translateX(-2px);cursor:pointer;border:0;background:0;padding:0}" +
    ".fb-pin i{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50% 50% 50% 2px;background:#6d4bd6;color:#fff;font-size:12px;font-weight:700;font-style:normal;box-shadow:0 3px 10px rgba(0,0,0,.34);border:2px solid #fff;transition:transform .12s}" +
    ".fb-pin:hover i{transform:scale(1.12)}" +
    ".fb-pin.resolved i{background:#7a8; opacity:.6}" +
    ".fb-pin.active i{background:#c8ff4d;color:#141317}" +
    ".fb-pop{position:absolute;z-index:" + Z.ui + ";width:300px;max-width:calc(100vw - 24px);background:#fff;color:#1a1622;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden;border:1px solid #e6e2ee}" +
    ".fb-pop .hd{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #eee7f5;font-size:12px;color:#8a839a;font-weight:600}" +
    ".fb-pop .hd .x{cursor:pointer;font-size:16px;color:#b3adc0;background:0;border:0;padding:0 2px}" +
    ".fb-pop .body{max-height:280px;overflow:auto;padding:4px 0}" +
    ".fb-cmt{padding:10px 14px}" +
    ".fb-cmt+.fb-cmt{border-top:1px solid #f2eef9}" +
    ".fb-cmt .who{font-size:12.5px;font-weight:700;color:#2a2436}" +
    ".fb-cmt .when{font-weight:400;color:#a49db5;font-size:11px;margin-left:6px}" +
    ".fb-cmt .txt{font-size:14px;line-height:1.45;color:#3a3348;margin-top:3px;white-space:pre-wrap;word-wrap:break-word}" +
    ".fb-foot{padding:10px 12px;border-top:1px solid #eee7f5;background:#faf8fe}" +
    ".fb-foot input,.fb-foot textarea{width:100%;border:1px solid #ddd5ea;border-radius:9px;padding:9px 10px;font-size:13.5px;font-family:inherit;color:#1a1622;resize:vertical}" +
    ".fb-foot textarea{min-height:52px}" +
    ".fb-foot input{margin-bottom:7px}" +
    ".fb-foot .row{display:flex;gap:7px;margin-top:8px;align-items:center}" +
    ".fb-foot button{border:0;border-radius:8px;font-size:13px;font-weight:700;padding:9px 14px;cursor:pointer}" +
    ".fb-send{background:#6d4bd6;color:#fff}.fb-send:hover{background:#5b3bc4}" +
    ".fb-ghost{background:transparent;color:#8a839a;padding:9px 8px!important}.fb-ghost:hover{color:#e0396b}" +
    ".fb-spacer{flex:1}" +
    ".fb-panel{position:fixed;top:0;right:0;bottom:0;width:320px;max-width:88vw;z-index:" + Z.ui + ";background:#fff;box-shadow:-14px 0 40px rgba(0,0,0,.2);transform:translateX(103%);transition:transform .24s cubic-bezier(.2,.7,.2,1);display:flex;flex-direction:column}" +
    ".fb-panel.open{transform:none}" +
    ".fb-panel .ph{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #eee7f5}" +
    ".fb-panel .ph b{font-size:15px;color:#1a1622}" +
    ".fb-panel .ph .x{cursor:pointer;border:0;background:0;font-size:20px;color:#b3adc0}" +
    ".fb-list{flex:1;overflow:auto;padding:6px 0}" +
    ".fb-item{padding:13px 18px;cursor:pointer;border-bottom:1px solid #f4f0fb;display:flex;gap:11px}" +
    ".fb-item:hover{background:#faf8fe}" +
    ".fb-item .num{flex:0 0 24px;height:24px;border-radius:50% 50% 50% 2px;background:#6d4bd6;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}" +
    ".fb-item.res .num{background:#7a8;opacity:.6}" +
    ".fb-item .who{font-size:12.5px;font-weight:700;color:#2a2436}" +
    ".fb-item .prev{font-size:13px;color:#6a6379;margin-top:2px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
    ".fb-item .meta{font-size:11px;color:#a49db5;margin-top:4px}" +
    ".fb-empty{padding:40px 24px;text-align:center;color:#9a93ab;font-size:13.5px;line-height:1.6}" +
    ".fb-toast{position:fixed;left:50%;bottom:74px;transform:translateX(-50%);z-index:" + (Z.ui + 1) + ";background:#141317;color:#fff;font-size:13px;padding:11px 20px;border-radius:100px;opacity:0;transition:opacity .2s;pointer-events:none;max-width:90vw;text-align:center}" +
    ".fb-toast.show{opacity:1}" +
    "@media(max-width:560px){.fb-bar button span{display:none}.fb-bar .fb-primary span{display:inline}}";
    var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  }

  /* ---------- toast ---------- */
  var toastEl, toastT;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "fb-toast fb-ui"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 2400);
  }

  /* ---------- pins ---------- */
  var pinEls = {};
  function renderPins() {
    var vis = visible(), ids = {};
    vis.forEach(function (t) { ids[t.id] = 1; });
    Object.keys(pinEls).forEach(function (id) { if (!ids[id]) { pinEls[id].remove(); delete pinEls[id]; } });
    vis.forEach(function (t, i) {
      var el = pinEls[t.id];
      if (!el) {
        el = document.createElement("button");
        el.className = "fb-pin fb-ui";
        el.innerHTML = "<i></i>";
        el.addEventListener("click", (function (id) { return function (e) { e.stopPropagation(); openThread(id); }; })(t.id));
        document.body.appendChild(el);
        pinEls[t.id] = el;
      }
      el.querySelector("i").textContent = String(i + 1);
      el.classList.toggle("resolved", !!t.resolved);
      el.classList.toggle("active", openId === t.id);
      var p = anchorPoint(t.anchor);
      el.style.left = p.x + "px";
      el.style.top = p.y + "px";
    });
    updateCount();
  }
  function reposition() { renderPins(); if (openId) positionPop(); }

  /* ---------- popover / thread ---------- */
  var popEl;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; } openId = null; renderPins(); }
  function positionPop() {
    if (!popEl || !openId) return;
    var t = threadById(openId); if (!t) return;
    var p = anchorPoint(t.anchor);
    var left = Math.min(p.x + 18, Math.max(8, (scrollX + innerWidth) - 312));
    left = Math.max(scrollX + 8, left);
    popEl.style.left = left + "px";
    popEl.style.top = Math.max(scrollY + 8, p.y - 8) + "px";
  }
  function threadById(id) { for (var i = 0; i < state.threads.length; i++) if (state.threads[i].id === id) return state.threads[i]; return null; }

  function openThread(id) {
    closePop();
    openId = id;
    var t = threadById(id); if (!t || t.deleted) { openId = null; return; }
    popEl = document.createElement("div");
    popEl.className = "fb-pop fb-ui";
    popEl.addEventListener("click", function (e) { e.stopPropagation(); });
    draw();
    document.body.appendChild(popEl);
    positionPop();
    renderPins();
    var ta = popEl.querySelector("textarea"); if (ta) ta.focus();

    function draw() {
      var idx = visible().indexOf(t) + 1;
      var isNew = t.comments.length === 0;
      var html = '<div class="hd"><span>Comment #' + (idx || "?") + (t.resolved ? " · resolved" : "") + '</span><button class="x" data-x>&times;</button></div>';
      if (!isNew) {
        html += '<div class="body">';
        t.comments.forEach(function (c) {
          html += '<div class="fb-cmt"><div class="who">' + esc(c.author || "Anonymous") + '<span class="when">' + ago(c.ts) + '</span></div><div class="txt">' + esc(c.text) + '</div></div>';
        });
        html += '</div>';
      }
      html += '<div class="fb-foot">';
      if (!state.me) html += '<input data-name placeholder="Your name" value="">';
      html += '<textarea data-text placeholder="' + (isNew ? "Leave a comment" : "Reply") + '"></textarea>';
      html += '<div class="row"><button class="fb-send" data-send>' + (isNew ? "Comment" : "Reply") + '</button>';
      if (!isNew) html += '<button class="fb-send" style="background:#efeaf9;color:#5b3bc4" data-resolve>' + (t.resolved ? "Reopen" : "Resolve") + '</button>';
      html += '<span class="fb-spacer"></span><button class="fb-ghost" data-del>Delete</button></div>';
      html += '</div>';
      popEl.innerHTML = html;

      popEl.querySelector("[data-x]").onclick = closePop;
      var send = popEl.querySelector("[data-send]");
      send.onclick = function () {
        var txt = popEl.querySelector("[data-text]").value.trim();
        var nameInp = popEl.querySelector("[data-name]");
        if (nameInp) { var nm = nameInp.value.trim(); if (nm) state.me = nm; }
        if (!txt) { popEl.querySelector("[data-text]").focus(); return; }
        t.comments.push({ id: uid(), author: state.me || "Anonymous", text: txt, ts: Date.now() });
        save(); draw(); positionPop(); renderPins();
        var ta2 = popEl.querySelector("textarea"); if (ta2) ta2.focus();
      };
      popEl.querySelector("[data-text]").addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send.click();
      });
      var res = popEl.querySelector("[data-resolve]");
      if (res) res.onclick = function () { t.resolved = !t.resolved; save(); draw(); renderPins(); };
      popEl.querySelector("[data-del]").onclick = function () {
        if (t.comments.length && !confirm("Delete this comment thread?")) return;
        t.deleted = true; save(); closePop(); drawPanel();
      };
    }
  }

  /* ---------- comment mode ---------- */
  var catcher, hint, barBtn;
  function setMode(on) {
    mode = on;
    if (barBtn) barBtn.classList.toggle("on", on);
    if (on) {
      closePop();
      catcher = document.createElement("div"); catcher.className = "fb-catch fb-ui";
      catcher.addEventListener("click", place);
      document.body.appendChild(catcher);
      hint = document.createElement("div"); hint.className = "fb-hint fb-ui"; hint.textContent = "Click anywhere to drop a comment · Esc to stop";
      document.body.appendChild(hint);
    } else {
      if (catcher) { catcher.remove(); catcher = null; }
      if (hint) { hint.remove(); hint = null; }
    }
  }
  function place(e) {
    var cx = e.clientX, cy = e.clientY;
    catcher.style.display = "none";
    var target = document.elementFromPoint(cx, cy);
    catcher.style.display = "";
    if (target && target.closest && target.closest(".fb-ui")) return;
    var docX = cx + scrollX, docY = cy + scrollY;
    var sw = document.documentElement.scrollWidth, sh = document.documentElement.scrollHeight;
    var anchor = { xf: docX / sw, yf: docY / sh, nx: 0.5, ny: 0.5, selector: "" };
    if (target) {
      var r = target.getBoundingClientRect();
      if (r.width && r.height) {
        anchor.selector = selectorFor(target);
        anchor.nx = (docX - (r.left + scrollX)) / r.width;
        anchor.ny = (docY - (r.top + scrollY)) / r.height;
      }
    }
    var t = { id: uid(), anchor: anchor, resolved: false, comments: [] };
    state.threads.push(t);
    save();
    setMode(false);
    renderPins();
    openThread(t.id);
  }

  /* ---------- panel ---------- */
  var panel;
  function togglePanel(force) {
    if (!panel) return;
    var open = force != null ? force : !panel.classList.contains("open");
    panel.classList.toggle("open", open);
    if (open) drawPanel();
  }
  function drawPanel() {
    if (!panel) return;
    var list = panel.querySelector(".fb-list");
    var vis = visible();
    if (!vis.length) {
      list.innerHTML = '<div class="fb-empty">No comments yet.<br>Click <b>Comment</b>, then click anywhere on the page to leave one.</div>';
      return;
    }
    list.innerHTML = "";
    vis.forEach(function (t, i) {
      var last = t.comments[t.comments.length - 1];
      var first = t.comments[0];
      var item = document.createElement("div");
      item.className = "fb-item" + (t.resolved ? " res" : "");
      item.innerHTML = '<div class="num">' + (i + 1) + '</div><div style="min-width:0"><div class="who">' + esc(first ? first.author : "New") + '</div>' +
        '<div class="prev">' + esc(first ? first.text : "(empty)") + '</div>' +
        '<div class="meta">' + t.comments.length + ' message' + (t.comments.length === 1 ? "" : "s") + (last ? " · " + ago(last.ts) : "") + (t.resolved ? " · resolved" : "") + '</div></div>';
      item.onclick = function () {
        var p = anchorPoint(t.anchor);
        scrollTo({ top: Math.max(0, p.y - innerHeight / 2), behavior: "smooth" });
        togglePanel(false);
        setTimeout(function () { openThread(t.id); }, 260);
      };
      list.appendChild(item);
    });
  }

  /* ---------- remote (shared) storage ---------- */
  function apiUrl(base) { return base + "?page=" + encodeURIComponent(location.pathname); }
  function detectBase() {
    var cands = ["/api/comments", "/api/comments/"];
    return (function next(i) {
      if (i >= cands.length) return Promise.resolve(null);
      return fetch(apiUrl(cands[i]), { cache: "no-store" }).then(function (r) {
        if (!r.ok) return next(i + 1);
        return r.json().then(function (j) {
          if (j && typeof j.configured !== "undefined") { API = cands[i]; return j; }
          return next(i + 1);
        }).catch(function () { return next(i + 1); });
      }).catch(function () { return next(i + 1); });
    })(0);
  }
  function apiGet() {
    if (!API) return Promise.resolve(null);
    return fetch(apiUrl(API), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function apiPush() {
    if (!API) return;
    pushing = true;
    fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: location.pathname, threads: state.threads }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { pushing = false; if (d && d.configured && d.threads) { state.threads = d.threads; saveLocal(); renderAll(true); } })
      .catch(function () { pushing = false; });
  }
  function pushSoon() { if (!remoteOn) return; clearTimeout(pushT); pushT = setTimeout(apiPush, 450); }
  function poll() { if (!remoteOn || pushing) return; apiGet().then(function (d) { if (d && d.configured && d.threads) { state.threads = d.threads; saveLocal(); renderAll(true); } }); }
  function setStatus(on) {
    remoteOn = on;
    if (statusDot) {
      statusDot.style.background = on ? "#38d39f" : "#7a7580";
      statusDot.title = on ? "Shared — everyone sees these comments" : "Local only — comments stay in this browser";
    }
  }
  function grabInputs() { if (!popEl) return null; var ta = popEl.querySelector("[data-text]"), nm = popEl.querySelector("[data-name]"); return { text: ta ? ta.value : "", name: nm ? nm.value : "" }; }
  function putInputs(v) { if (!v || !popEl) return; var ta = popEl.querySelector("[data-text]"), nm = popEl.querySelector("[data-name]"); if (ta && v.text) ta.value = v.text; if (nm && v.name) nm.value = v.name; }
  function renderAll(soft) {
    renderPins();
    if (panel && panel.classList.contains("open")) drawPanel();
    if (popEl && openId) {
      var t = threadById(openId);
      if (!t || t.deleted) { closePop(); return; }
      var active = document.activeElement && popEl.contains(document.activeElement);
      if (!(soft && active)) { var vals = grabInputs(); openThread(openId); putInputs(vals); }
    }
  }

  /* ---------- share / import / export (offline + fallback) ---------- */
  function encode(obj) { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
  function decode(str) { return JSON.parse(decodeURIComponent(escape(atob(str)))); }
  function mergeThreads(incoming) {
    if (!incoming || !incoming.length) return 0;
    var added = 0;
    incoming.forEach(function (it) {
      var mine = threadById(it.id);
      if (!mine) { state.threads.push(it); added += (it.comments ? it.comments.length : 0) || 1; return; }
      var seen = {}; mine.comments.forEach(function (c) { seen[c.id] = 1; });
      (it.comments || []).forEach(function (c) { if (!seen[c.id]) { mine.comments.push(c); added++; } });
      mine.comments.sort(function (a, b) { return a.ts - b.ts; });
      if (typeof it.resolved !== "undefined") mine.resolved = it.resolved;
      if (it.deleted) mine.deleted = true;
    });
    return added;
  }
  function shareLink() {
    if (!visible().length) { toast("No comments to share yet"); return; }
    var url = location.origin + location.pathname + "#fb=" + encode({ threads: state.threads });
    var done = function () { toast("Share link copied. Send it back to keep the thread going."); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); });
    else prompt("Copy this link:", url);
  }
  function exportJson() {
    var blob = new Blob([JSON.stringify({ page: location.pathname, threads: state.threads }, null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "feedback" + location.pathname.replace(/\//g, "-") + ".json"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function importJson() {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json";
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { try { var d = JSON.parse(rd.result); var n = mergeThreads(d.threads || d); save(); renderPins(); drawPanel(); toast(n + " comment" + (n === 1 ? "" : "s") + " imported"); } catch (e) { toast("Could not read that file"); } };
      rd.readAsText(f);
    };
    inp.click();
  }
  function checkHashImport() {
    var m = location.hash.match(/[#&]fb=([^&]+)/);
    if (!m) return;
    try {
      var data = decode(m[1]);
      var n = mergeThreads(data.threads || []);
      saveLocal();
      history.replaceState(null, "", location.pathname + location.search);
      if (n) setTimeout(function () { toast(n + " shared comment" + (n === 1 ? "" : "s") + " loaded"); }, 400);
    } catch (e) {}
  }

  /* ---------- bar ---------- */
  function updateCount() {
    var c = document.querySelector(".fb-count");
    if (c) { var vis = visible(); var open = vis.filter(function (t) { return !t.resolved; }).length; c.textContent = open; c.style.display = vis.length ? "flex" : "none"; }
  }
  function buildBar() {
    var bar = document.createElement("div"); bar.className = "fb-bar fb-ui";
    bar.innerHTML =
      '<span class="fb-dot" data-dot title="Local only"></span>' +
      '<button class="fb-primary" data-comment>💬 <span>Comment</span></button>' +
      '<button class="fb-count" data-list style="display:none"></button>' +
      '<span class="sep"></span>' +
      '<button data-menu title="Share &amp; export">Share ▾</button>';
    document.body.appendChild(bar);
    statusDot = bar.querySelector("[data-dot]");
    barBtn = bar.querySelector("[data-comment]");
    barBtn.onclick = function () { setMode(!mode); };
    bar.querySelector("[data-list]").onclick = function () { togglePanel(); };
    bar.querySelector("[data-menu]").onclick = function (e) { openMenu(e.currentTarget); };
  }
  function openMenu(anchorBtn) {
    var existing = document.querySelector(".fb-menu"); if (existing) { existing.remove(); return; }
    var m = document.createElement("div"); m.className = "fb-menu fb-ui";
    m.style.cssText = "position:fixed;right:18px;bottom:64px;z-index:" + (Z.ui + 2) + ";background:#141317;border-radius:12px;padding:6px;box-shadow:0 12px 34px rgba(0,0,0,.4);min-width:190px";
    var items = [["Copy share link", shareLink], ["Export as JSON", exportJson], ["Import comments…", importJson], ["Clear all on this page", clearAll]];
    items.forEach(function (it) {
      var b = document.createElement("button");
      b.textContent = it[0];
      b.style.cssText = "display:block;width:100%;text-align:left;border:0;background:0;color:#e9e7ee;font-size:13px;font-weight:600;padding:10px 12px;border-radius:8px;cursor:pointer";
      b.onmouseenter = function () { b.style.background = "rgba(255,255,255,.1)"; };
      b.onmouseleave = function () { b.style.background = "transparent"; };
      if (it[0].indexOf("Clear") === 0) b.style.color = "#ff7597";
      b.onclick = function () { m.remove(); it[1](); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    setTimeout(function () {
      document.addEventListener("click", function h(ev) { if (!m.contains(ev.target) && ev.target !== anchorBtn) { m.remove(); document.removeEventListener("click", h); } });
    }, 0);
  }
  function clearAll() {
    var vis = visible();
    if (!vis.length) { toast("Nothing to clear"); return; }
    if (!confirm("Delete all " + vis.length + " comment threads on this page? This cannot be undone.")) return;
    vis.forEach(function (t) { t.deleted = true; }); save(); closePop(); renderPins(); drawPanel(); toast("Cleared");
  }

  function buildPanel() {
    panel = document.createElement("div"); panel.className = "fb-panel fb-ui";
    panel.innerHTML = '<div class="ph"><b>Comments</b><button class="x" data-close>&times;</button></div><div class="fb-list"></div>';
    document.body.appendChild(panel);
    panel.querySelector("[data-close]").onclick = function () { togglePanel(false); };
  }

  /* ---------- init ---------- */
  function init() {
    load();
    injectCss();
    buildBar();
    buildPanel();
    checkHashImport();
    renderPins();
    drawPanel();
    addEventListener("resize", reposition);
    addEventListener("keydown", function (e) { if (e.key === "Escape") { if (mode) setMode(false); else if (openId) closePop(); } });
    setTimeout(reposition, 600); setTimeout(reposition, 1600);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reposition);

    // remote bootstrap: adopt shared store if one is connected
    detectBase().then(function (d) {
      if (d && d.configured) {
        setStatus(true);
        if (state.threads.length) apiPush();               // merge local up, adopt merged result
        else if (d.threads) { state.threads = d.threads; saveLocal(); renderAll(true); }
        setInterval(poll, 12000);
      } else {
        setStatus(false);
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
