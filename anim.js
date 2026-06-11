/* ==========================================================================
   ANIM — extra arrival delight, layered on top of the CSS entrance system.

   Two effects, both purely additive (they never set `transform` on the
   elements the CSS already animates, so nothing conflicts):

   1. Count-up: numeric stats (.mc-fact__num, .mm-ov-big) tick up from 0
      to their value each time their slide becomes active. Prefixes and
      suffixes are preserved ("20k+", "30+"); non-numbers ("∞") are left
      alone.

   2. Confetti burst: when a content slide lands, a quick one-shot pop of
      palette particles fires from behind the content and fades out. The
      ambient drifting confetti (visuals.js) already covers the big-type
      center/quote slides, so the burst skips those to avoid doubling up.

   Respects prefers-reduced-motion (both become no-ops).
   ========================================================================== */

(() => {
  "use strict";
  const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PALETTE = ["#FF3B5C", "#FFD93D", "#C6F432", "#7BD3F7", "#FAF3E3"];

  /* ---------- 1. Count-up ---------- */
  const NUM_RE = /^(\D*?)(\d[\d,]*)(.*)$/s;     // prefix, digits, suffix
  function countUp(el, dur = 1100) {
    if (el.dataset.countDone === "running") return;
    const raw = el.dataset.countTarget || el.textContent.trim();
    const m = raw.match(NUM_RE);
    if (!m) return;                              // e.g. "∞" — leave it
    el.dataset.countTarget = raw;                // remember the real value
    const prefix = m[1], suffix = m[3];
    const target = parseInt(m[2].replace(/,/g, ""), 10);
    if (!isFinite(target)) return;
    const grouped = m[2].includes(",");
    el.dataset.countDone = "running";
    const t0 = performance.now();
    const fmt = (n) => grouped ? n.toLocaleString() : String(n);
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);      // easeOutCubic
      el.textContent = prefix + fmt(Math.round(target * eased)) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else { el.textContent = raw; el.dataset.countDone = "done"; }
    };
    requestAnimationFrame(tick);
  }

  function runCountUps(slide) {
    if (REDUCE) return;
    slide.querySelectorAll(".mc-fact__num, .mm-ov-big").forEach((el) => {
      el.dataset.countDone = "";                 // allow re-run on re-entry
      countUp(el);
    });
  }

  /* ---------- 2. Confetti burst ---------- */
  const SKIP_BURST = ".slide--center, .slide--quote";   // handled by visuals.js
  function burst(slide) {
    if (REDUCE || slide.matches(SKIP_BURST)) return;
    const canvas = document.createElement("canvas");
    canvas.className = "burst-canvas";
    canvas.setAttribute("aria-hidden", "true");
    slide.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = slide.clientWidth, H = slide.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const N = 34;
    const parts = Array.from({ length: N }, () => {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const spd = 6 + Math.random() * 12;
      return {
        x: W * (0.2 + Math.random() * 0.6),
        y: H * (0.55 + Math.random() * 0.2),
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: 4 + Math.random() * 8,
        rot: Math.random() * 7, vr: (Math.random() - 0.5) * 0.4,
        color: PALETTE[(Math.random() * PALETTE.length) | 0],
        shape: Math.random() < 0.5 ? "rect" : "circle",
      };
    });

    const t0 = performance.now();
    const LIFE = 1300;
    const draw = (now) => {
      const t = now - t0;
      if (t >= LIFE || !slide.classList.contains("is-active")) { canvas.remove(); return; }
      const fade = 1 - t / LIFE;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.35;                 // gravity
        p.vx *= 0.99;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, fade) * 0.9;
        ctx.fillStyle = p.color;
        if (p.shape === "rect") ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
        else { ctx.beginPath(); ctx.arc(0, 0, p.r / 2, 0, 7); ctx.fill(); }
        ctx.restore();
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  /* ---------- trigger on slide activation ---------- */
  function onActivate(slide) {
    runCountUps(slide);
    burst(slide);
  }

  function init() {
    document.querySelectorAll(".slide").forEach((slide) => {
      let wasActive = slide.classList.contains("is-active");
      if (wasActive) onActivate(slide);
      new MutationObserver(() => {
        const active = slide.classList.contains("is-active");
        if (active && !wasActive) onActivate(slide);
        wasActive = active;
      }).observe(slide, { attributes: true, attributeFilter: ["class"] });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
