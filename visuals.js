/* ==========================================================================
   VISUALS — ambient JS canvas layer for big-type slides.
   Drifting geometric confetti in the deck palette behind the text on
   center/divider/beat slides. Respects prefers-reduced-motion; renders
   only on the active slide so it costs nothing elsewhere.
   ========================================================================== */

(() => {
  "use strict";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const PALETTE = ["#FF3B5C", "#FFD93D", "#C6F432", "#FAF3E3", "#7BD3F7"];
  const SHAPES = ["rect", "circle", "tri", "ring"];
  const COUNT = 26;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];

  function makeField(slide) {
    const canvas = document.createElement("canvas");
    canvas.className = "fx-canvas";
    canvas.setAttribute("aria-hidden", "true");
    slide.insertBefore(canvas, slide.firstChild);
    const ctx = canvas.getContext("2d");

    const parts = Array.from({ length: COUNT }, () => ({
      x: Math.random(), y: Math.random(),
      vx: rand(-0.012, 0.012), vy: rand(-0.02, -0.004),
      r: rand(4, 16), rot: rand(0, Math.PI * 2), vr: rand(-0.01, 0.01),
      color: pick(PALETTE), shape: pick(SHAPES), alpha: rand(0.10, 0.28),
    }));

    let running = false, raf = 0;

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = slide.clientWidth * dpr;
      canvas.height = slide.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      if (!running) return;
      const w = slide.clientWidth, h = slide.clientHeight;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx / 60; p.y += p.vy / 60; p.rot += p.vr;
        if (p.y < -0.06) { p.y = 1.06; p.x = Math.random(); }
        if (p.x < -0.06) p.x = 1.06;
        if (p.x > 1.06) p.x = -0.06;
        const x = p.x * w, y = p.y * h;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        if (p.shape === "rect") ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
        else if (p.shape === "circle") { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, 7); ctx.fill(); }
        else if (p.shape === "ring") { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, 7); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(0, -p.r); ctx.lineTo(p.r, p.r); ctx.lineTo(-p.r, p.r); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    }

    function update() {
      const active = slide.classList.contains("is-active");
      if (active && !running) { running = true; size(); raf = requestAnimationFrame(draw); }
      else if (!active && running) { running = false; cancelAnimationFrame(raf); }
    }

    new MutationObserver(update).observe(slide, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", () => { if (running) size(); });
    update();
  }

  function init() {
    document.querySelectorAll(".slide--center, .slide--quote").forEach(makeField);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
