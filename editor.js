/* ==========================================================================
   EDITOR — edit any photo or text in the deck, in place.

   PHOTOS  · Drag an image (or video) from your desktop onto any picture
             or empty placeholder frame to replace it.
   TEXT    · Click any headline, paragraph, or list item to edit it in
             place (desktop). Esc or click away to save.

   WHERE EDITS ARE SAVED
   • If the site's /api/media endpoint is live (Vercel + Blob configured),
     edits upload there and are permanent for every visitor on every
     device. The first edit asks once for the passphrase (DECK_EDIT_KEY).
   • Otherwise edits are saved in this browser via IndexedDB — they
     reliably survive refresh (large quota; images and videos both).

   Every editable spot has a permanent key, so reordering or adding
   slides never disconnects an edit.
   ========================================================================== */

(() => {
  "use strict";

  const OLD_MEDIA_STORE = "deckMediaOverrides_v2"; // legacy localStorage (migrated)
  const TEXT_STORE = "deckTextOverrides_v1";
  const EDIT_KEY_KEY = "deckEditKey";
  const API = "/api/media";
  const TEXT_BLOB_KEY = "_text";
  const MAX_DIM = 3000;
  const INLINE_LIMIT = 10e6;   // store images up to ~10MB as-is; downscale larger
  const POINTER_FINE = window.matchMedia("(pointer: fine)").matches;

  const loadJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

  let localText = loadJSON(TEXT_STORE);
  let serverMedia = {};
  let serverText = {};
  let serverAvailable = false;
  const localMediaIds = new Set();  // ids with a browser-local override

  /* ---------- IndexedDB (durable local media store) ---------- */
  const DB_NAME = "deckEditor";
  const MEDIA_OS = "media";
  let dbp = null;
  function db() {
    return dbp || (dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(MEDIA_OS)) d.createObjectStore(MEDIA_OS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }
  async function idbGetAll() {
    try {
      const d = await db();
      return await new Promise((resolve, reject) => {
        const out = {};
        const req = d.transaction(MEDIA_OS, "readonly").objectStore(MEDIA_OS).openCursor();
        req.onsuccess = () => { const c = req.result; if (c) { out[c.key] = c.value; c.continue(); } else resolve(out); };
        req.onerror = () => reject(req.error);
      });
    } catch { return {}; }
  }
  async function idbPut(key, value) {
    try {
      const d = await db();
      await new Promise((resolve, reject) => {
        const tx = d.transaction(MEDIA_OS, "readwrite");
        tx.objectStore(MEDIA_OS).put(value, key);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      return true;
    } catch { return false; }
  }
  async function idbDel(key) {
    try {
      const d = await db();
      await new Promise((resolve) => {
        const tx = d.transaction(MEDIA_OS, "readwrite");
        tx.objectStore(MEDIA_OS).delete(key);
        tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve;
      });
    } catch { /* ignore */ }
  }

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
        const t = { id, el, kind: el.tagName === "VIDEO" ? "video" : "img",
                    original: el.tagName === "VIDEO" ? el.src : el.getAttribute("src") };
        targets.push(t);
        attachDropZone(el, t);
      });
      slide.querySelectorAll(".mosaic__media, .philo-frame, .poster__frame, .slide__bg").forEach((el) => {
        if (el.querySelector("img, video")) return;
        const id = el.dataset.mediaKey || `s${si}-m${mi}`;
        mi++;
        el.dataset.mediaId = id;
        const t = { id, el, kind: "slot", original: null };
        targets.push(t);
        attachDropZone(el, t);
      });
    });
  }
  const byId = (id) => targets.find((t) => t.id === id);

  /* ---------- text targets ---------- */
  // Tags that should never become contenteditable (links/buttons stay
  // clickable, media/SVG/form controls are handled elsewhere or not text).
  const TEXT_SKIP_TAGS = new Set([
    "A", "BUTTON", "SCRIPT", "STYLE", "SVG", "IMG", "VIDEO",
    "INPUT", "TEXTAREA", "SELECT", "CANVAS", "BR", "HR",
  ]);
  const hasDirectText = (el) => {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
    return false;
  };
  const textOriginals = new Map();
  // Greedy walk: key the innermost element that directly holds text, so
  // every piece of copy in the deck is editable — headings, paragraphs,
  // list items, stat numbers, tags, chips, captions, card labels, etc.
  // Elements with mixed content (text + inline emphasis like .accent-pink)
  // are keyed at the block level; pure layout containers are skipped and
  // we descend into their children.
  function collectText() {
    document.querySelectorAll(".slide").forEach((slide, si) => {
      const slug = slideSlug(slide, si);
      let ti = 0;
      const walk = (el) => {
        for (const child of el.children) {
          if (TEXT_SKIP_TAGS.has(child.tagName)) continue;
          if (child.dataset.mediaId) continue;            // a media target, not text
          if (child.closest(".slide__robot, .robot-bg, .hud, .help, .media-toolbar")) continue;
          if (hasDirectText(child)) {
            const key = `${slug}-t${ti++}`;
            child.dataset.textKey = key;
            textOriginals.set(key, child.innerHTML);
            // stop here — edit this whole element, don't double-key its children
          } else {
            walk(child);                                  // pure container — go deeper
          }
        }
      };
      walk(slide);
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
        } catch { /* text blob unreadable */ }
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
      if (e.target.closest("#media-toast")) return;
      if (editingEl && !editingEl.contains(e.target)) finishTextEdit();
      const tEl = e.target.closest("[data-text-key]");
      if (!tEl || e.target.closest("a, button, [data-media-id]")) return;
      e.preventDefault();
      e.stopPropagation();
      startTextEdit(tEl);
    }, true);
  }

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

    applyMedia(t, URL.createObjectURL(file), file.name, isVideo); // instant preview

    // permanent shared layer (the site)
    if (serverAvailable) {
      toast("Uploading to the site…");
      const up = await serverPost(t.id, file, file.type || "application/octet-stream");
      if (up.ok) {
        serverMedia[t.id] = up.url;
        applyMedia(t, up.url, file.name, isVideo);
        await idbDel(t.id); localMediaIds.delete(t.id);
        toast(`${file.name} saved to the site — permanent for all visitors. ✓`);
        return;
      }
      toast(`Site upload failed (${up.reason}) — saved in this browser instead.`);
    }

    // durable browser layer (IndexedDB) — survives refresh
    if (isVideo) {
      const ok = await idbPut(t.id, { blob: file, name: file.name, video: true, ts: Date.now() });
      if (ok) localMediaIds.add(t.id);
      toast(ok ? `${file.name} saved in this browser — stays after refresh.` : `${file.name} placed for this session only.`);
      return;
    }
    const data = await processImage(file);
    const ok = await idbPut(t.id, { data, name: file.name, ts: Date.now() });
    if (ok) localMediaIds.add(t.id);
    applyMedia(t, data, file.name, false);
    toast(ok ? `${file.name} saved in this browser — stays after refresh.` : `${file.name} placed for this session only.`);
  }

  /* ---------- click a photo / frame to replace it (reliable fallback) ---------- */
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/*,video/*";
  picker.style.display = "none";
  document.documentElement.appendChild(picker);
  let pickerTarget = null;
  picker.addEventListener("change", () => {
    const f = picker.files && picker.files[0];
    if (f && pickerTarget) placeFile(pickerTarget, f);
    picker.value = "";
    pickerTarget = null;
  });
  function openPicker(t) { pickerTarget = t; picker.click(); }

  // Pull an image URL out of a drag from another browser tab/webpage.
  function urlFromDrag(dt) {
    if (!dt) return Promise.resolve(null);
    const direct = dt.getData("text/uri-list") || dt.getData("text/plain") || "";
    let url = direct.split("\n").find((l) => /^https?:\/\//i.test(l.trim()));
    if (!url) {
      const html = dt.getData("text/html") || "";
      const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) url = m[1];
    }
    return Promise.resolve(url ? url.trim() : null);
  }

  // Fetch a dragged-in URL and reuse the normal upload path so it persists.
  async function placeFromUrl(t, url) {
    applyMedia(t, url, url, /\.(mp4|webm|mov)(\?|$)/i.test(url));   // instant preview
    toast("Fetching the image…");
    try {
      const r = await fetch(url, { mode: "cors" });
      if (!r.ok) throw new Error("fetch " + r.status);
      const blob = await r.blob();
      if (!/^(image|video)\//.test(blob.type)) throw new Error("not media");
      const ext = (blob.type.split("/")[1] || "png").split("+")[0];
      placeFile(t, new File([blob], "dropped." + ext, { type: blob.type }));
    } catch (err) {
      // Cross-origin or blocked — the preview shows, but we can't re-host it.
      toast("Showing it for now — to keep it, save the image and drag the file in (or click the frame to pick it).");
    }
  }

  // Capture-phase so it runs before slide navigation / text editing. Clicking
  // any image, video, or empty frame opens a file picker to replace it.
  document.addEventListener("click", (e) => {
    if (editingEl) return;                       // mid text-edit — leave it alone
    const zone = e.target.closest && e.target.closest("[data-media-id]");
    if (!zone) return;
    const t = byId(zone.dataset.mediaId);
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    openPicker(t);
  }, true);

  /* ---------- drag & drop ---------- */
  let dragDepth = 0;
  function dropZoneFrom(e) {
    let el = e.target && e.target.nodeType === 1 ? e.target : null;
    let zone = el && el.closest ? el.closest("[data-media-id]") : null;
    if (!zone) {
      const p = document.elementFromPoint(e.clientX, e.clientY);
      zone = p && p.closest ? p.closest("[data-media-id]") : null;
    }
    return zone;
  }
  const allowDrag = (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  // Read a dropped file OR a URL dragged from another tab, and place it.
  function handleDropPayload(t, dt) {
    const file = dt && dt.files && dt.files[0];
    if (file) { placeFile(t, file); return; }
    urlFromDrag(dt).then((url) => {
      if (url) placeFromUrl(t, url);
      else toast("Couldn’t read that — drag an image file from your computer, or click the frame to pick one.");
    });
  }

  // Per-element drop zone — a real listener directly on every image and
  // frame (the reliable pattern that the philosophy frames already use):
  // it doesn't depend on event delegation or elementFromPoint.
  function attachDropZone(el, t) {
    el.addEventListener("dragenter", (e) => { allowDrag(e); el.classList.add("media-drop-hover"); });
    el.addEventListener("dragover", allowDrag);
    el.addEventListener("dragleave", (e) => {
      if (!el.contains(e.relatedTarget)) el.classList.remove("media-drop-hover");
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove("media-drop-hover");
      document.body.classList.remove("media-dragging");
      handleDropPayload(t, e.dataTransfer);
    });
  }

  // Document layer: cancel dragenter/dragover everywhere (so the browser
  // allows the drop and shows the affordance), and a backstop drop that
  // only catches drops that missed every target.
  document.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes("Files")) { allowDrag(e); return; }
    allowDrag(e);
    dragDepth++;
    document.body.classList.add("media-dragging");
  }, true);
  document.addEventListener("dragover", allowDrag, true);
  document.addEventListener("dragleave", () => {
    if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("media-dragging"); }
  }, true);
  document.addEventListener("drop", (e) => {
    e.preventDefault();                       // never let the browser open the file
    dragDepth = 0;
    document.body.classList.remove("media-dragging");
    document.querySelectorAll(".media-drop-hover").forEach((el) => el.classList.remove("media-drop-hover"));
    // If a target handled it, it called stopPropagation and we won't see it.
    if (!dropZoneFrom(e)) toast("Drop a photo onto a picture or frame to replace it.");
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

  async function migrateLegacy() {
    const old = loadJSON(OLD_MEDIA_STORE);
    const ids = Object.keys(old);
    if (!ids.length) return;
    for (const id of ids) {
      const rec = old[id];
      if (rec && rec.data) await idbPut(id, { data: rec.data, name: rec.name, ts: rec.ts || Date.now() });
    }
    localStorage.removeItem(OLD_MEDIA_STORE);
  }

  async function init() {
    collectMedia();
    collectText();

    // durable local layer (IndexedDB), migrating any legacy localStorage first
    await migrateLegacy();
    const idbAll = await idbGetAll();
    Object.entries(idbAll).forEach(([id, rec]) => {
      const t = byId(id);
      if (!t || !rec) return;
      localMediaIds.add(id);
      if (rec.video && rec.blob) applyMedia(t, URL.createObjectURL(rec.blob), rec.name, true);
      else if (rec.data) applyMedia(t, rec.data, rec.name, false);
    });
    Object.entries(localText).forEach(([k, html]) => applyText(k, html));

    // permanent shared layer (wins over local)
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
