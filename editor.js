/* ==========================================================================
   EDITOR — replace any picture in the deck, permanently.

   • Click "✏️ EDIT PHOTOS" (bottom-right) or press E, then click any
     picture (or its "⇪ replace" chip) and choose a file. Drag-and-drop
     from your desktop works too, even outside edit mode.

   WHERE UPLOADS GO
   • On the deployed site (Vercel) with Blob storage configured, uploads
     are sent to /api/media and stored permanently — every visitor sees
     them, on every device, across code updates. The first upload asks
     for the edit passphrase (DECK_EDIT_KEY on the Vercel project).
   • Without the server (local file, or Blob not set up), uploads fall
     back to this browser's localStorage: they survive reloads here but
     live only in this browser.

   STABILITY
   • Every editable spot has a permanent data-media-key in the HTML, so
     reordering or adding slides never disconnects an uploaded image.
   ========================================================================== */

(() => {
  "use strict";

  const STORE_KEY = "deckMediaOverrides_v2";
  const EDIT_KEY_KEY = "deckEditKey";
  const API = "/api/media";
  const MAX_DIM = 2200;
  const INLINE_LIMIT = 1.5e6;

  /* ---------- local persistence (fallback layer) ---------- */
  const loadLocal = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); }
    catch { return {}; }
  };
  const saveLocal = (o) => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); return true; }
    catch { return false; }
  };
  let local = loadLocal();
  let server = {};            // { key: url } from /api/media
  let serverAvailable = false;

  /* ---------- collect targets ---------- */
  const targets = [];  // { id, el, kind, original }
  function collect() {
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

  /* ---------- apply / reset ---------- */
  function apply(t, src, name, isVideoFile) {
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
    refreshToolbars();
  }

  async function reset(t) {
    delete local[t.id];
    saveLocal(local);
    if (server[t.id] && serverAvailable) {
      const key = await ensureEditKey();
      if (key) {
        try {
          await fetch(`${API}?key=${encodeURIComponent(t.id)}`, { method: "DELETE", headers: { "x-edit-key": key } });
          delete server[t.id];
        } catch { /* keep going; local reset still applies */ }
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
    refreshToolbars();
    toast("Restored the original.");
  }

  /* ---------- server I/O ---------- */
  async function fetchManifest() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const r = await fetch(API, { cache: "no-store" });
      if (!r.ok) return;
      server = await r.json();
      serverAvailable = true;
    } catch { /* static hosting without the API — local mode */ }
  }

  async function ensureEditKey(forceAsk) {
    let key = localStorage.getItem(EDIT_KEY_KEY);
    if (!key || forceAsk) {
      key = prompt("Edit passphrase for this deck (DECK_EDIT_KEY on the Vercel project):", key || "");
      if (key) localStorage.setItem(EDIT_KEY_KEY, key);
    }
    return key;
  }

  async function uploadToServer(t, file) {
    let key = await ensureEditKey();
    if (!key) return { ok: false, reason: "no key" };
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch(`${API}?key=${encodeURIComponent(t.id)}`, {
        method: "POST",
        headers: { "content-type": file.type || "application/octet-stream", "x-edit-key": key },
        body: file,
      });
      if (r.ok) {
        const { url } = await r.json();
        return { ok: true, url };
      }
      if (r.status === 401 && attempt === 0) {
        key = await ensureEditKey(true);
        if (!key) return { ok: false, reason: "no key" };
        continue;
      }
      let msg = `${r.status}`;
      try { msg = (await r.json()).error || msg; } catch {}
      return { ok: false, reason: msg };
    }
    return { ok: false, reason: "unauthorized" };
  }

  /* ---------- file handling ---------- */
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

    // show it immediately
    apply(t, URL.createObjectURL(file), file.name, isVideo);

    // permanent layer: the site's storage
    if (serverAvailable) {
      toast("Uploading to the site…");
      const up = await uploadToServer(t, file);
      if (up.ok) {
        server[t.id] = up.url;
        apply(t, up.url, file.name, isVideo);
        delete local[t.id];
        saveLocal(local);
        toast(`${file.name} saved to the site — permanent for all visitors. ✓`);
        return;
      }
      toast(`Site upload failed (${up.reason}) — kept in this browser only.`);
    }

    // fallback layer: this browser
    if (isVideo) {
      toast(`${file.name} placed for this session (videos need the site storage or the repo to persist).`);
      return;
    }
    const data = await processImage(file);
    local[t.id] = { data, name: file.name, ts: Date.now() };
    const persisted = saveLocal(local);
    apply(t, data, file.name, false);
    toast(persisted
      ? `${file.name} placed — saved in this browser. Use “⬇ save file” to download & commit it.`
      : `${file.name} placed for this session (storage full — use “⬇ save file” to keep it).`);
  }

  /* ---------- click-to-replace ---------- */
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/*,video/*";
  picker.style.display = "none";
  let pickerTarget = null;
  picker.addEventListener("change", () => {
    if (picker.files && picker.files[0] && pickerTarget) placeFile(pickerTarget, picker.files[0]);
    picker.value = "";
  });
  function openPicker(t) { pickerTarget = t; picker.click(); }

  document.addEventListener("click", (e) => {
    if (!editMode) return;
    if (e.target.closest(".media-toolbar")) return;
    const zone = e.target.closest("[data-media-id]");
    if (!zone) return;
    e.preventDefault();
    e.stopPropagation();
    const t = byId(zone.dataset.mediaId);
    if (t) openPicker(t);
  }, true);

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

  /* ---------- edit mode UI ---------- */
  let editMode = false;

  function toolbar(t) {
    const bar = document.createElement("div");
    bar.className = "media-toolbar";
    bar.dataset.for = t.id;

    const rp = document.createElement("button");
    rp.type = "button";
    rp.textContent = "⇪ replace";
    rp.title = "Choose a new image for this spot";
    rp.onclick = (e) => { e.stopPropagation(); openPicker(t); };
    bar.appendChild(rp);

    const lo = local[t.id];
    if (lo) {
      const dl = document.createElement("a");
      dl.textContent = "⬇ save file";
      dl.href = lo.data;
      dl.download = lo.name || `${t.id}.jpg`;
      dl.title = "Download this image so it can be added to the repo";
      dl.onclick = (e) => e.stopPropagation();
      bar.appendChild(dl);
    }
    if (lo || server[t.id]) {
      const rs = document.createElement("button");
      rs.type = "button";
      rs.textContent = "✕ reset";
      rs.title = "Restore the original image";
      rs.onclick = (e) => { e.stopPropagation(); reset(t); };
      bar.appendChild(rs);
    }
    return bar;
  }

  function refreshToolbars() {
    document.querySelectorAll(".media-toolbar").forEach((el) => el.remove());
    if (!editMode) return;
    targets.forEach((t) => {
      const host = t.kind === "slot" ? t.el : t.el.parentElement;
      if (!host) return;
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.appendChild(toolbar(t));
    });
  }

  function setEditMode(on) {
    editMode = on;
    document.body.classList.toggle("media-edit-mode", on);
    badge.classList.toggle("is-on", on);
    badge.textContent = on ? "✓ DONE EDITING" : "✏️ EDIT PHOTOS";
    refreshToolbars();
    if (on) {
      toast(serverAvailable
        ? "Click any picture to replace it — uploads are saved to the site for everyone."
        : "Click any picture to replace it. (Site storage not detected — uploads stay in this browser.)");
    }
  }

  const badge = document.createElement("button");
  badge.id = "media-edit-badge";
  badge.type = "button";
  badge.textContent = "✏️ EDIT PHOTOS";
  badge.title = "Replace any picture in the deck (E)";
  badge.onclick = () => setEditMode(!editMode);

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "e" && !e.metaKey && !e.ctrlKey && !e.altKey &&
        !/input|textarea|select/i.test(document.activeElement.tagName)) {
      setEditMode(!editMode);
    }
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
    collect();
    document.body.appendChild(badge);
    document.body.appendChild(picker);

    // browser-local layer first (instant)
    Object.entries(local).forEach(([id, ov]) => {
      const t = byId(id);
      if (t && ov && ov.data) apply(t, ov.data, ov.name, false);
    });

    // then the site's permanent layer (wins over local)
    await fetchManifest();
    Object.entries(server).forEach(([id, url]) => {
      const t = byId(id);
      if (t) apply(t, url, id, looksLikeVideo(url));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
