/* ==========================================================================
   NAV-MENU — clickable section menu (page 1).
   Each menu button carries data-jump="<section id>". On click we find that
   slide's position among all .slide elements and set the deck's URL hash,
   which the deck (script.js) already listens to for navigation. Computing
   the index at click time keeps it correct even if slides are reordered.
   ========================================================================== */
(() => {
  "use strict";
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-jump]");
    if (!btn) return;
    e.preventDefault();
    const target = document.getElementById(btn.dataset.jump);
    if (!target) return;
    const slides = Array.from(document.querySelectorAll(".slide"));
    const i = slides.indexOf(target);
    if (i < 0) return;
    const hash = "#" + (i + 1);
    if (location.hash === hash) {
      // same hash won't fire hashchange — nudge it
      location.hash = "#1";
      requestAnimationFrame(() => { location.hash = hash; });
    } else {
      location.hash = hash;
    }
  });
})();
