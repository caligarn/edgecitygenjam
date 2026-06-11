/* ==========================================================================
   EDITOR — edit any photo or text in the deck, in place.

   PHOTOS
   • Hover any picture (or empty placeholder frame): a small "✏️ edit"
     chip surfaces in its corner. Click it to choose a new file.
     Drag-and-drop from your desktop also works at any time.

   TEXT
   • Click any headline, paragraph, or list item to edit it in place
     (desktop/mouse only). Esc or click away to save.

   WHERE EDITS GO
   • On the deployed site (Vercel + Blob configured): edits upload to
     /api/media and are permanent for every visitor. The first edit asks
     once for the passphrase (DECK_EDIT_KEY on the Vercel project).
   • Otherwise edits are saved in this browser's localStorage.

   Every editable spot has a permanent key, so reordering or adding
   slides never disconnects an edit.
   ========================================================================== */

(() => {
  "use strict";

  const MEDIA_STORE = "deckMediaOverrides_v2";
  const TEXT_STORE = "deckTextOverrides_v1";
  const EDIT_KEY_KEY = "deckEditKey";
  const API = "/api/media";
  const TEXT_BLOB_KEY = "_text";
  const MAX_DIM = 2200;
  const INLINE_LIMIT = 1.5e6;
  const POINTER_FINE = window.matchMedia("(pointer: fine)").matches;

  const loadJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

  let localMedia = loadJSON(MEDIA_STORE);
  let localText = loadJSON(TEXT_STORE);
  let serverMedia = {};
  let serverText = {};
  let serverAvailable = false;

  /* ---------- stable slide slugs (from the HTML comments) ---------- */
  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "");
  function slideSlug(slide, si) {
    let n = slide.previousSibling;
    while (n && (n.nodeType === 3 && !n.textContent.trim() || n.nodeType === 8 && !n.textContent.trim())) n = n.previousSibling;
    if (n && n.nodeType === 8 && n.textContent.trim()) return slugify(n.textContent.trim());
    return "s" + si;
  }

  /* ---------- media targets ---------- */
  const targets = [];
  function collectMedia() {
    document.querySelectorAll(".slide").forEach((slide, si) => {
      let mi = 0;
      slide.querySelectorAll("img, video").forEach((el) => {
        if (el.closest(".slide__robot") || el.closest(".robot-bg")) return;
        const id = el.dataset.mediaKey || `s${si}-m${mi}`;
        mi++;
        el.dataset.mediaId = id;
        targets.push({ id, el, kind: el.tagName === "VIDEO" ? "video" : "img",
                       original: el.tagName === "VIDEO" ? el.src : el.getAttribute("src") });
      });
      slide.querySelectorAll(".mosaic__media, .philo-frame, .slide__bg").forEach((el) => {
        if (el.querySelector("img, video")) return;
        const id = el.dataset.mediaKey || `s${si}-m${mi}`;
        mi++;
        el.dataset.mediaId = id;
        targets.push({ id, el, kind: "slot", original: null });
      });
    });
  }
  const byId = (id) => targets.find((t) => t.id === id);

  /* ---------- text targets ---------- */
  const TEXT_SELECTOR = "h1, h2, h3, h4, p, li, blockquote, figcaption, .kicker, .fact__yr";
  const textOriginals = new Map(); // key -> original innerHTML
  function collectText() {
    document.querySelectorAll(".slide").forEach((slide, si) => {
      const slug = slideSlug(slide, si);
      let ti = 0;
      slide.querySelectorAll(TEXT_SELECTOR).forEach((el) => {
        if (el.closest(".media-toolbar, .hud, .slide__robot") || el.querySelector("img, video")) { return; }
        const key = `${slug}-t${ti++}`;
        el.dataset.textKey = key;
        textOriginals.set(key, el.innerHTML);
      });
    });
  }

  /* ---------- apply media / text ---------- */
  function applyMedia(t, src, name, isVideoFile) {
    if (t.kind === "video") {
      t.el.src = src;
      t.el.play && t.el.play().catch(() => {});
    } else if (t.kind === "img") {
      t.el.src = src;
    } else {
      const label = t.el.querySelector(":scope > span");
      if (label) label.style.display = "none";
      let media = t.el.querySelector("img, video");
      const wantVideo = !!isVideoFile;
      if (media && ((media.tagName === "VIDEO") !== wantVideo)) { media.remove(); media = null; }
      if (!media) {
        media = document.createElement(wantVideo ? "video" : "img");
        if (wantVideo) { media.autoplay = true; media.loop = true; media.muted = true; media.playsInline = true; }
        else media.alt = name || "";
        t.el.appendChild(media);
      }
      media.src = src;
      if (media.tagName === "VIDEO") media.play && media.play().catch(() => {});
    }
    t.el.classList.add("media-overridden");
  }

  function applyText(key, html) {
    const el = document.querySelector(`[data-text-key="${CSS.escape(key)}"]`);
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }

  /* ---------- server I/O ---------- */
  async function fetchServer() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const r = await fetch(API, { cache: "no-store" });
      if (!r.ok) return;
      serverMedia = await r.json();
      serverAvailable = true;
      if (serverMedia[TEXT_BLOB_KEY]) {
        try {
          const tr = await fetch(serverMedia[TEXT_BLOB_KEY], { cache: "no-store" });
          if (tr.ok) serverText = await tr.json();
        } catch { /* text blob unreadable — ignore */ }
        delete serverMedia[TEXT_BLOB_KEY];
      }
    } catch { /* static hosting — local mode */ }
  }

  async function ensureEditKey(forceAsk) {
    let key = localStorage.getItem(EDIT_KEY_KEY);
    if (!key || forceAsk) {
      key = prompt("Edit passphrase for this deck (DECK_EDIT_KEY on the Vercel project):", key || "");
      if (key) localStorage.setItem(EDIT_KEY_KEY, key);
    }
    return key;
  }

  async function serverPost(key, body, contentType) {
    let ek = await ensureEditKey();
    if (!ek) return { ok: false, reason: "no key" };
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch(`${API}?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "content-type": contentType, "x-edit-key": ek },
        body,
      });
      if (r.ok) return { ok: true, ...(await r.json()) };
      if (r.status === 401 && attempt === 0) {
        ek = await ensureEditKey(true);
        if (!ek) return { ok: false, reason: "no key" };
        continue;
      }
      let msg = `${r.status}`;
      try { msg = (await r.json()).error || msg; } catch {}
      return { ok: false, reason: msg };
    }
    return { ok: false, reason: "unauthorized" };
  }

  /* ---------- text persistence ---------- */
  let textSaveTimer = null;
  function persistText() {
    saveJSON(TEXT_STORE, localText);
    if (!serverAvailable) return;
    clearTimeout(textSaveTimer);
    textSaveTimer = setTimeout(async () => {
      const merged = { ...serverText, ...localText };
      const up = await serverPost(TEXT_BLOB_KEY, JSON.stringify(merged), "application/json");
      if (up.ok) {
        serverText = merged;
        localText = {};
        saveJSON(TEXT_STORE, localText);
        toast("Text saved to the site — permanent for all visitors. ✓");
      } else {
        toast(`Text kept in this browser (site save failed: ${up.reason}).`);
      }
    }, 900);
  }

  /* ---------- inline text editing ---------- */
  let editingEl = null;
  function startTextEdit(el) {
    if (editingEl === el) return;
    finishTextEdit();
    editingEl = el;
    el.classList.add("text-editing");
    el.setAttribute("contenteditable", "true");
    el.focus();
  }
  function finishTextEdit() {
    if (!editingEl) return;
    const el = editingEl;
    editingEl = null;
    el.removeAttribute("contenteditable");
    el.classList.remove("text-editing");
    const key = el.dataset.textKey;
    if (!key) return;
    const orig = textOriginals.get(key);
    const now = el.innerHTML;
    const savedBase = serverText[key] != null ? serverText[key] : orig;
    if (now === savedBase) { delete localText[key]; saveJSON(TEXT_STORE, localText); return; }
    localText[key] = now;
    persistText();
  }

  if (POINTER_FINE) {
    document.addEventListener("click", (e) => {
      if (e.target.closest("#media-chipbar, #media-toast")) return;
      if (editingEl && !editingEl.contains(e.target)) finishTextEdit();
      const tEl = e.target.closest("[data-text-key]");
      if (!tEl || e.target.closest("a, button, [data-media-id]")) return;
      e.preventDefault();
      e.stopPropagation();
      startTextEdit(tEl);
    }, true);
  }

  // While editing text, keep keystrokes away from deck navigation
  window.addEventListener("keydown", (e) => {
    const ae = document.activeElement;
    if (ae && ae.isContentEditable) {
      if (e.key === "Escape") { e.preventDefault(); ae.blur(); finishTextEdit(); }
      e.stopPropagation();
    }
  }, true);
  document.addEventListener("focusout", (e) => {
    if (editingEl && e.target === editingEl) setTimeout(() => { if (document.activeElement !== editingEl) finishTextEdit(); }, 50);
  });

  /* ---------- media file handling ---------- */
  function fileToDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  async function processImage(file) {
    const raw = await fileToDataURL(file);
    if (file.size <= INLINE_LIMIT) return raw;
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = raw; });
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  }

  async function placeFile(t, file) {
    const isVideo = file.type.startsWith("video/");
    if (!isVideo && !file.type.startsWith("image/")) { toast("Pick an image or video file"); return; }
    applyMedia(t, URL.createObjectURL(file), file.name, isVideo);
    if (serverAvailable) {
      toast("Uploading to the site…");
      const up = await serverPost(t.id, file, file.type || "application/octet-stream");
      if (up.ok) {
        serverMedia[t.id] = up.url;
        applyMedia(t, up.url, file.name, isVideo);
        delete localMedia[t.id];
        saveJSON(MEDIA_STORE, localMedia);
        toast(`${file.name} saved to the site — permanent for all visitors. ✓`);
        refreshChip();
        return;
      }
      toast(`Site upload failed (${up.reason}) — kept in this browser only.`);
    }
    if (isVideo) { toast(`${file.name} placed for this session (videos need site storage to persist).`); return; }
    const data = await processImage(file);
    localMedia[t.id] = { data, name: file.name, ts: Date.now() };
    const ok = saveJSON(MEDIA_STORE, localMedia);
    applyMedia(t, data, file.name, false);
    toast(ok ? `${file.name} placed — saved in this browser.` : `${file.name} placed for this session (storage full).`);
    refreshChip();
  }

  async function resetMedia(t) {
    delete localMedia[t.id];
    saveJSON(MEDIA_STORE, localMedia);
    if (serverMedia[t.id] && serverAvailable) {
      const ek = await ensureEditKey();
      if (ek) {
        try {
          await fetch(`${API}?key=${encodeURIComponent(t.id)}`, { method: "DELETE", headers: { "x-edit-key": ek } });
          delete serverMedia[t.id];
        } catch {}
      }
    }
    if (t.kind === "slot") {
      const media = t.el.querySelector("img, video");
      if (media) media.remove();
      const label = t.el.querySelector(":scope > span");
      if (label) label.style.display = "";
    } else if (t.original != null) {
      t.el.src = t.original;
    }
    t.el.classList.remove("media-overridden");
    toast("Restored the original.");
    refreshChip();
  }

  /* ---------- file picker ---------- */
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/*,video/*";
  picker.style.display = "none";
  let pickerTarget = null;
  picker.addEventListener("change", () => {
    if (picker.files && picker.files[0] && pickerTarget) placeFile(pickerTarget, picker.files[0]);
    picker.value = "";
  });
  const openPicker = (t) => { pickerTarget = t; picker.click(); };

  /* ---------- hover chip on media ---------- */
  const chipbar = document.createElement("div");
  chipbar.id = "media-chipbar";
  chipbar.hidden = true;
  let chipTarget = null;
  let hideTimer = null;

  function refreshChip() {
    if (!chipTarget) return;
    const t = chipTarget;
    chipbar.innerHTML = "";
    const rp = document.createElement("button");
    rp.type = "button";
    rp.textContent = "✏️ edit";
    rp.onclick = (e) => { e.stopPropagation(); openPicker(t); };
    chipbar.appendChild(rp);
    if (localMedia[t.id] || serverMedia[t.id]) {
      const rs = document.createElement("button");
      rs.type = "button";
      rs.textContent = "✕";
      rs.title = "Restore the original";
      rs.onclick = (e) => { e.stopPropagation(); resetMedia(t); };
      chipbar.appendChild(rs);
    }
    if (localMedia[t.id]) {
      const dl = document.createElement("a");
      dl.textContent = "⬇";
      dl.title = "Download this image (to commit it to the repo)";
      dl.href = localMedia[t.id].data;
      dl.download = localMedia[t.id].name || `${t.id}.jpg`;
      dl.onclick = (e) => e.stopPropagation();
      chipbar.appendChild(dl);
    }
  }

  function showChip(t) {
    chipTarget = t;
    refreshChip();
    const r = t.el.getBoundingClientRect();
    chipbar.style.left = Math.max(6, Math.min(window.innerWidth - 120, r.right - 96)) + "px";
    chipbar.style.top = Math.max(6, r.top + 8) + "px";
    chipbar.hidden = false;
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { chipbar.hidden = true; chipTarget = null; }, 350);
  }
  if (POINTER_FINE) {
    document.addEventListener("mouseover", (e) => {
      const zone = e.target.closest && e.target.closest("[data-media-id]");
      if (zone) {
        clearTimeout(hideTimer);
        const t = byId(zone.dataset.mediaId);
        if (t) showChip(t);
      } else if (e.target.closest && e.target.closest("#media-chipbar")) {
        clearTimeout(hideTimer);
      } else if (!chipbar.hidden) {
        scheduleHide();
      }
    });
  }

  /* ---------- drag & drop ---------- */
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes("Files")) return;
    dragDepth++;
    document.body.classList.add("media-dragging");
  });
  window.addEventListener("dragleave", () => {
    if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("media-dragging"); }
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove("media-dragging");
    const zone = e.target.closest("[data-media-id]");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!zone || !file) return;
    const t = byId(zone.dataset.mediaId);
    if (t) placeFile(t, file);
  });
  document.addEventListener("dragover", (e) => {
    document.querySelectorAll(".media-drop-hover").forEach((el) => el.classList.remove("media-drop-hover"));
    const zone = e.target.closest && e.target.closest("[data-media-id]");
    if (zone) zone.classList.add("media-drop-hover");
  });

  /* ---------- toast ---------- */
  let toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "media-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 4200);
  }

  /* ---------- init ---------- */
  const looksLikeVideo = (url) => /\.(mp4|webm|mov)(\?|$)/i.test(url);

  async function init() {
    collectMedia();
    collectText();
    document.body.appendChild(picker);
    document.body.appendChild(chipbar);

    Object.entries(localMedia).forEach(([id, ov]) => {
      const t = byId(id);
      if (t && ov && ov.data) applyMedia(t, ov.data, ov.name, false);
    });
    Object.entries(localText).forEach(([k, html]) => applyText(k, html));

    await fetchServer();
    Object.entries(serverMedia).forEach(([id, url]) => {
      const t = byId(id);
      if (t) applyMedia(t, url, id, looksLikeVideo(url));
    });
    Object.entries(serverText).forEach(([k, html]) => {
      if (!(k in localText)) applyText(k, html);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
