/* ==========================================================================
   PIZZAZZ — small ambient interactions on top of the entrance animations.

   1. Mouse parallax: tracks the cursor and writes --robot-px / --robot-py
      onto :root, which the .slide__robot CSS reads to drift its decorative
      robots a few pixels in the opposite direction. Idle/no-mouse devices
      get a slow auto-drift instead.
   2. Accent pop: when a slide becomes active, briefly highlights every
      .accent-pink element on it with a CSS class so the user sees the
      colored words "land" after the rest of the type animates in.

   Respects prefers-reduced-motion: the parallax and accent pop both
   short-circuit to no-op when the user has reduced motion enabled.
   ========================================================================== */
(() => {
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Robot parallax ----------
  if (!reduce) {
    let mx = 0, my = 0, raf = null;

    const apply = () => {
      raf = null;
      // Range: ~ -14..14 horizontal, -10..10 vertical. Inverted so robots drift
      // *away* from the cursor (more natural-feeling parallax).
      const px = (-mx * 14).toFixed(1);
      const py = (-my * 10).toFixed(1);
      root.style.setProperty('--robot-px', `${px}px`);
      root.style.setProperty('--robot-py', `${py}px`);
    };

    document.addEventListener('mousemove', (e) => {
      mx = (e.clientX / window.innerWidth)  - 0.5;
      my = (e.clientY / window.innerHeight) - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });

    // Slow ambient drift on touch devices / when the cursor sits still — keeps
    // the robots feeling alive without anyone needing to wiggle the mouse.
    let t = 0;
    const drift = () => {
      t += 0.006;
      if (mx === 0 && my === 0) {
        const px = Math.sin(t)        * 6;
        const py = Math.cos(t * 0.7) * 4;
        root.style.setProperty('--robot-px', `${px.toFixed(1)}px`);
        root.style.setProperty('--robot-py', `${py.toFixed(1)}px`);
      }
      requestAnimationFrame(drift);
    };
    requestAnimationFrame(drift);
  }

  // ---------- Page-31 fan diagram SVG cascade ----------
  // Index every direct child of .pfn-svg with a CSS variable so the
  // CSS animation can stagger pop-ins left-to-right. We sort children
  // by their bbox center-x so the cascade reads as a wave even though
  // the SVG declares them grouped by row.
  const pfnSvg = document.querySelector('.pfn-svg');
  if (pfnSvg) {
    const kids = Array.from(pfnSvg.children).filter(el => /^(rect|line|text|polyline|path)$/i.test(el.tagName));
    const xOf = (el) => {
      const a = (n) => parseFloat(el.getAttribute(n)) || 0;
      switch (el.tagName.toLowerCase()) {
        case 'rect': return a('x') + a('width') / 2;
        case 'line': return (a('x1') + a('x2')) / 2;
        case 'text': return a('x');
        default:     return 0;
      }
    };
    kids
      .map((el) => ({ el, x: xOf(el) }))
      .sort((a, b) => a.x - b.x)
      .forEach(({ el }, i) => el.style.setProperty('--pfn-i', i));
  }

  // ---------- Accent pop on slide change ----------
  // Watches for the global slide:change event (dispatched from script.js) and
  // marks the new slide's .accent-pink spans with .accent-pink--pop for one
  // animation cycle, then peels the class off so it can fire again next time.
  const popMs = 1100;
  document.addEventListener('slide:change', (ev) => {
    if (reduce) return;
    const slide = ev.detail && ev.detail.slide;
    if (!slide) return;
    const accents = slide.querySelectorAll('.accent-pink');
    accents.forEach((el, i) => {
      // remove first so re-adding always re-triggers
      el.classList.remove('accent-pink--pop');
      // tiny stagger so multiple accents don't fire at the exact same instant
      setTimeout(() => {
        el.classList.add('accent-pink--pop');
        setTimeout(() => el.classList.remove('accent-pink--pop'), popMs);
      }, 80 * i + 320);
    });
  });
})();
