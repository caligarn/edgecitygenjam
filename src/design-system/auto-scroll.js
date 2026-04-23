/* ==========================================================================
   AUTO-SCROLL — animates the market-map poster's scroll position so the
   viewer sees the full content without interaction. Listens for the
   slide:change custom event dispatched by script.js.

   • When the market-map slide becomes active, smooth-cycle the scroll
     position top → bottom → top on a slow loop.
   • Any user scroll/touch/key interaction pauses the loop; after a
     short idle the loop resumes from wherever the user left off.
   • Stops cold when we leave the slide.
   ========================================================================== */

const MM_IDLE_AFTER_JUMP = 6000;  // ms — how long the auto-scroll pauses after a legend jump

(() => {
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (REDUCED) return;

  const SPEED = 40;                     // px per second
  const PAUSE_AT_ENDS = 1400;           // ms lingering at top / bottom
  const IDLE_AFTER_INTERACTION = 2800;  // ms before resuming after user input

  let target = null;
  let raf = 0;
  let dir = 1;
  let lingerUntil = 0;
  let interactionUntil = 0;
  let lastT = 0;

  const onInteract = () => { interactionUntil = performance.now() + IDLE_AFTER_INTERACTION; };

  const detach = () => {
    if (!target) return;
    cancelAnimationFrame(raf);
    ["wheel", "touchstart", "mousedown", "keydown", "pointerdown"].forEach(ev =>
      target.removeEventListener(ev, onInteract, true)
    );
    target = null;
    raf = 0;
  };

  const tick = (t) => {
    if (!target) return;
    if (!lastT) lastT = t;
    const dt = t - lastT;
    lastT = t;

    const max = target.scrollHeight - target.clientHeight;
    if (max <= 0) { raf = requestAnimationFrame(tick); return; }

    const now = performance.now();
    const idle = now > interactionUntil;
    const linger = now < lingerUntil;

    if (idle && !linger) {
      target.scrollTop = Math.max(0, Math.min(max, target.scrollTop + dir * SPEED * (dt / 1000)));
      if (dir > 0 && target.scrollTop >= max - 0.5) { dir = -1; lingerUntil = now + PAUSE_AT_ENDS; }
      else if (dir < 0 && target.scrollTop <= 0.5)  { dir =  1; lingerUntil = now + PAUSE_AT_ENDS; }
    }

    raf = requestAnimationFrame(tick);
  };

  const forceTop = (el) => {
    if (!el) return;
    el.scrollTop = 0;
    try { el.scrollTo({ top: 0, left: 0, behavior: "instant" }); } catch { /* old browsers */ }
  };

  const attach = (slide) => {
    detach();
    target = slide;
    dir = 1;
    lastT = 0;
    // Belt-and-suspenders: reset immediately, at two rAFs, and again
    // after the entrance animation is safely done. The slide-enter
    // keyframes transform direct children, which can mess with
    // position:sticky math; by the time these last resets run the
    // transforms are gone.
    forceTop(target);
    requestAnimationFrame(() => { forceTop(target); });
    requestAnimationFrame(() => { requestAnimationFrame(() => { forceTop(target); }); });
    setTimeout(() => { if (target === slide) forceTop(target); }, 1400);
    setTimeout(() => { if (target === slide) forceTop(target); }, 2400);

    // Linger at top long enough for the viewer to register "here's the
    // first stage" before the loop starts moving.
    lingerUntil = performance.now() + 2800;
    interactionUntil = 0;
    ["wheel", "touchstart", "mousedown", "keydown", "pointerdown"].forEach(ev =>
      target.addEventListener(ev, onInteract, { passive: true, capture: true })
    );
    raf = requestAnimationFrame(tick);
  };

  document.addEventListener("slide:change", (e) => {
    const slide = e.detail?.slide;
    if (!slide) return;
    if (slide.matches(".slide--mm-poster")) {
      attach(slide);
    } else {
      detach();
    }
  });

  // Exposed for the legend-jump handler below so an explicit jump can
  // pause the auto-scroll long enough for the viewer to read the section.
  window.__mmPosterPause = (container) => {
    if (target === container) {
      interactionUntil = performance.now() + MM_IDLE_AFTER_JUMP;
    }
  };
})();

/* Legend jump: clicking a legend button on the market-map poster scrolls
   the poster to the matching stage group. Runs independently of the
   auto-scroll loop so reduced-motion users still get the jump behavior. */
(() => {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".mm-legend__link");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const container = btn.closest(".slide--mm-poster");
    const id = btn.getAttribute("data-scroll-to");
    const stage = container && id ? container.querySelector(`#${CSS.escape(id)}`) : null;
    if (!container || !stage) return;

    const header = container.querySelector(".mm-poster__hd");
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const containerTop = container.getBoundingClientRect().top;
    const stageTop = stage.getBoundingClientRect().top;
    const top = container.scrollTop + (stageTop - containerTop) - headerH - 8;

    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });

    if (typeof window.__mmPosterPause === "function") {
      window.__mmPosterPause(container);
    }
  }, true);
})();
