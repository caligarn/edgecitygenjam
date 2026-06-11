/* ==========================================================================
   EDITOR — drag-and-drop image replacement for every picture in the deck.

   How it works (no build step, no server):
   • Drag an image file from your desktop anywhere over the deck — every
     replaceable picture and empty placeholder frame lights up.
   • Drop onto one: it swaps in instantly and is saved to localStorage,
     so it survives reloads in this browser.
   • Press "E" (or click the IMAGES badge, bottom-left) to toggle edit
     mode: replaced pictures get a toolbar to download the file (so you
     can commit it to the repo) or reset to the original.
   • Overrides are browser-local. To make a change permanent for everyone,
     download the image, add it to the repo, and point the <img> at it.

   Drop targets: every <img>/<video> in a slide, plus the empty media
   frames (.mosaic__media, .philo-frame, .slide__bg full-bleed slots).
   Ambient robot art (.slide__robot, .robot-bg) is left alone.
   ========================================================================== */

(() => {
  "use strict";

  const STORE_KEY = "deckMediaOverrides_v1";
  const MAX_DIM = 2200;          // resize very large drops before storing
  const INLINE_LIMIT = 1.5e6;    // files under ~1.5MB stored as-is

  /* ---------- persistence ---------- */
  const load = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); }
    catch { return {}; }
  };
  const save = (overrides) => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(overrides)); return true; }
    catch (e) { console.warn("editor: localStorage full — override kept for this session only", e); return false; }
  };
  let overrides = load();

  /* ---------- collect drop targets, give each a stable id ---------- */
  const targets = [];  // { id, el, kind: "img" | "video" | "slot", original }
  function collect() {
    document.querySelectorAll(".slide").forEach((slide, si) => {
      let mi = 0;
      // replaceable media elements
      slide.querySelectorAll("img, video").forEach((el) => {
        if (el.closest(".slide__robot") || el.closest(".robot-bg")) return;
        const id = `s${si}-m${mi++}`;
        el.dataset.mediaId = id;
        targets.push({ id, el, kind: el.tagName === "VIDEO" ? "video" : "img",
                       original: el.tagName === "VIDEO" ? el.src : el.getAttribute("src") });
      });
      // empty placeholder frames (no img/video inside yet)
      slide.querySelectorAll(".mosaic__media, .philo-frame, .slide__bg").forEach((el) => {
        if (el.querySelector("img, video")) return;
        const id = `s${si}-m${mi++}`;
        el.dataset.mediaId = id;
        targets.push({ id, el, kind: "slot", original: null });
      });
    });
  }

  const byId = (id) => targets.find((t) => t.id === id);

  /* ---------- apply an override to the DOM ---------- */
  function apply(t, src, name) {
    if (t.kind === "video") {
      t.el.src = src;
      t.el.play && t.el.play().catch(() => {});
    } else if (t.kind === "img") {
      t.el.src = src;
    } else { // empty slot: create the img, hide placeholder label
      let img = t.el.querySelector("img");
      if (!img) {
        img = document.createElement("img");
        img.alt = name || "";
        const label = t.el.querySelector("span");
        if (label) label.style.display = "none";
        t.el.appendChild(img);
      }
      img.src = src;
    }
    t.el.classList.add("media-overridden");
    refreshToolbars();
  }

  function reset(t) {
    delete overrides[t.id];
    save(overrides);
    if (t.kind === "slot") {
      const img = t.el.querySelector("img");
      if (img) img.remove();
      const label = t.el.querySelector("span");
      if (label) label.style.display = "";
    } else if (t.original != null) {
      t.el.src = t.original;
    }
    t.el.classList.remove("media-overridden");
    refreshToolbars();
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
    // downscale large images so localStorage can hold them
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = raw; });
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  }

  async function handleDrop(t, file) {
    if (file.type.startsWith("video/")) {
      // videos are session-only (too large for localStorage)
      apply(t, URL.createObjectURL(file), file.name);
      toast(`${file.name} placed (videos aren’t saved across reloads — add the file to the repo to keep it)`);
      return;
    }
    if (!file.type.startsWith("image/")) { toast("Drop an image or video file"); return; }
    const data = await processImage(file);
    apply(t, data, file.name);
    overrides[t.id] = { data, name: file.name, ts: Date.now() };
    const persisted = save(overrides);
    toast(persisted
      ? `${file.name} placed — saved in this browser. Press E to download/commit it.`
      : `${file.name} placed for this session (storage full — download via E mode to keep it)`);
  }

  /* ---------- drag & drop wiring ---------- */
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
    if (t) handleDrop(t, file);
  });
  // highlight the zone under the cursor while dragging
  document.addEventListener("dragover", (e) => {
    document.querySelectorAll(".media-drop-hover").forEach((el) => el.classList.remove("media-drop-hover"));
    const zone = e.target.closest && e.target.closest("[data-media-id]");
    if (zone) zone.classList.add("media-drop-hover");
  });

  /* ---------- edit mode: badge, toolbars, download ---------- */
  let editMode = false;

  function toolbar(t) {
    const bar = document.createElement("div");
    bar.className = "media-toolbar";
    bar.dataset.for = t.id;
    const ov = overrides[t.id];
    if (ov) {
      const dl = document.createElement("a");
      dl.textContent = "⬇ save file";
      dl.href = ov.data;
      dl.download = ov.name || `${t.id}.jpg`;
      dl.title = "Download this image so you can add it to the repo";
      bar.appendChild(dl);
      const rs = document.createElement("button");
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
      if (!overrides[t.id]) return;
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
    badge.textContent = on ? "🖼 EDITING — drop images on any picture (E to exit)" : "🖼 IMAGES";
    refreshToolbars();
  }

  const badge = document.createElement("button");
  badge.id = "media-edit-badge";
  badge.type = "button";
  badge.textContent = "🖼 IMAGES";
  badge.title = "Toggle image edit mode (E) — drag & drop photos onto any picture";
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
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3500);
  }

  /* ---------- init ---------- */
  function init() {
    collect();
    document.body.appendChild(badge);
    // restore saved overrides
    Object.entries(overrides).forEach(([id, ov]) => {
      const t = byId(id);
      if (t && ov && ov.data) apply(t, ov.data, ov.name);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
