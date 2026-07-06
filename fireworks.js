/* ==========================================================================
   FIREWORKS — celebratory rocket bursts for slides tagged .slide--fireworks.
   Follows the visuals.js idiom: one canvas per tagged slide, animated only
   while that slide is active (MutationObserver on `is-active`), palette
   colors, and a hard pass on prefers-reduced-motion.
   ========================================================================== */

(() => {
  "use strict";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const PALETTE = ["#FF3B5C", "#FFD93D", "#C6F432", "#FAF3E3", "#7BD3F7"];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];

  function makeShow(slide) {
    const canvas = document.createElement("canvas");
    canvas.className = "fx-fireworks";
    canvas.setAttribute("aria-hidden", "true");
    slide.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    let running = false, raf = 0, launchTimer = 0;
    const rockets = [], sparks = [];

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = slide.clientWidth * dpr;
      canvas.height = slide.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function launch() {
      const w = slide.clientWidth, h = slide.clientHeight;
      rockets.push({
        x: rand(0.15, 0.85) * w, y: h + 8,
        vx: rand(-0.6, 0.6), vy: -rand(0.0165, 0.021) * h,
        burstY: rand(0.18, 0.45) * h,
        color: pick(PALETTE),
      });
    }

    function explode(r) {
      const n = (rand(46, 74)) | 0;
      const twoTone = Math.random() < 0.5 ? pick(PALETTE) : r.color;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
        const sp = rand(1.4, 5.2);
        sparks.push({
          x: r.x, y: r.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: rand(0.55, 1), age: 0,
          color: i % 2 ? r.color : twoTone,
          r: rand(1.4, 2.8),
        });
      }
    }

    function draw() {
      if (!running) return;
      const w = slide.clientWidth, h = slide.clientHeight;
      ctx.clearRect(0, 0, w, h);

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx; r.y += r.vy; r.vy += 0.06;
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x - r.vx * 3, r.y - r.vy * 3);
        ctx.stroke();
        if (r.y <= r.burstY || r.vy > -1) { explode(r); rockets.splice(i, 1); }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.age += 1 / 60;
        if (s.age >= s.life) { sparks.splice(i, 1); continue; }
        s.x += s.vx; s.y += s.vy;
        s.vx *= 0.985; s.vy = s.vy * 0.985 + 0.05;
        const t = 1 - s.age / s.life;
        ctx.globalAlpha = 0.85 * t;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (0.5 + t * 0.5), 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    }

    function schedule() {
      launchTimer = setTimeout(() => {
        if (!running) return;
        launch();
        if (Math.random() < 0.35) launch(); // occasional double
        schedule();
      }, rand(550, 1100));
    }

    function update() {
      const active = slide.classList.contains("is-active");
      if (active && !running) {
        running = true; size();
        launch(); launch(); // opening salvo
        schedule();
        raf = requestAnimationFrame(draw);
      } else if (!active && running) {
        running = false;
        clearTimeout(launchTimer);
        cancelAnimationFrame(raf);
        rockets.length = 0; sparks.length = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    new MutationObserver(update).observe(slide, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", () => { if (running) size(); });
    update();
  }

  function init() {
    document.querySelectorAll(".slide--fireworks").forEach(makeShow);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
