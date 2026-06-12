/* ==========================================================================
   NAV-MENU — clickable section navigation.

   1. Page-1 menu buttons (data-jump="<section id>") jump to that section.
   2. A dropdown hung off the top-right slide counter mirrors those sections,
      so you can jump from anywhere by hovering (or tapping) the counter.

   Jumping works by resolving a section id to its current position among all
   .slide elements and setting the deck's URL hash, which script.js navigates
   on. The index is computed at click time, so it survives reordering.
   ========================================================================== */
(() => {
  "use strict";

  function jumpTo(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const slides = Array.from(document.querySelectorAll(".slide"));
    const i = slides.indexOf(target);
    if (i < 0) return;
    const hash = "#" + (i + 1);
    if (location.hash === hash) {
      location.hash = "#1";
      requestAnimationFrame(() => { location.hash = hash; });
    } else {
      location.hash = hash;
    }
  }

  // Any element with data-jump navigates (page-1 buttons + dropdown items).
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-jump]");
    if (!btn) return;
    e.preventDefault();
    jumpTo(btn.dataset.jump);
  });

  // ---------- top-right counter dropdown ----------
  function buildHudMenu() {
    const counter = document.querySelector(".hud__counter");
    if (!counter || document.getElementById("hud-jump")) return;
    const btns = Array.from(document.querySelectorAll(".menu-grid .menu-btn[data-jump]"));
    if (!btns.length) return;

    counter.classList.add("hud__counter--menu");
    counter.setAttribute("title", "Jump to a section");

    const dd = document.createElement("nav");
    dd.id = "hud-jump";
    dd.setAttribute("aria-label", "Jump to section");
    const hd = document.createElement("div");
    hd.className = "hud-jump__hd";
    hd.textContent = "JUMP TO SECTION";
    dd.appendChild(hd);

    btns.forEach((b, i) => {
      const label = (b.querySelector(".menu-btn__label") || b).textContent.trim();
      const item = document.createElement("button");
      item.type = "button";
      item.className = "hud-jump__item";
      item.dataset.jump = b.dataset.jump;
      item.innerHTML = `<span class="hud-jump__n">${String(i + 1).padStart(2, "0")}</span><span>${label}</span>`;
      dd.appendChild(item);
    });
    document.body.appendChild(dd);

    let hideT = null;
    const open = () => { clearTimeout(hideT); dd.classList.add("is-open"); };
    const close = () => { hideT = setTimeout(() => dd.classList.remove("is-open"), 220); };
    counter.addEventListener("mouseenter", open);
    counter.addEventListener("mouseleave", close);
    dd.addEventListener("mouseenter", open);
    dd.addEventListener("mouseleave", close);

    // Tap/click the counter to toggle (touch) — and never let it flip the slide.
    counter.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dd.classList.toggle("is-open");
    });
    // Clicking an item jumps (global handler) and closes the menu.
    dd.addEventListener("click", () => dd.classList.remove("is-open"));
    // Click elsewhere closes it.
    document.addEventListener("click", (e) => {
      if (!dd.contains(e.target) && !counter.contains(e.target)) dd.classList.remove("is-open");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildHudMenu);
  } else {
    buildHudMenu();
  }
})();
