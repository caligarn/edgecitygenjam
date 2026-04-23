/* ==========================================================================
   PITCH DECK — navigation
   Keyboard & presentation-clicker friendly.
   Most clickers emit PageDown/PageUp, Right/Left arrows, or F5/Esc.
   ========================================================================== */

(() => {
  const deck    = document.getElementById('deck');
  const slides  = Array.from(document.querySelectorAll('.slide'));
  const bar     = document.getElementById('progress');
  const curEl   = document.getElementById('current');
  const totEl   = document.getElementById('total');
  const help    = document.getElementById('help');

  let index = 0;
  const total = slides.length;
  totEl.textContent = total;

  // Read starting slide from URL hash (#3 → slide 3)
  const fromHash = () => {
    const n = parseInt(location.hash.replace('#', ''), 10);
    return Number.isFinite(n) && n >= 1 && n <= total ? n - 1 : 0;
  };

  const render = () => {
    deck.style.transform = `translate3d(${-index * 100}vw, 0, 0)`;
    bar.style.height = `${((index + 1) / total) * 100}%`;
    curEl.textContent = index + 1;

    const bg = slides[index].getAttribute('data-bg') || 'cream';
    document.body.setAttribute('data-bg', bg);

    slides.forEach((s, i) => {
      s.classList.toggle('is-active', i === index);
      // Always reset scroll position on scrollable slides — whether we're
      // leaving them or entering them — so each visit starts at the top.
      if (s.matches('.slide--mm-poster, .slide--bio, .slide--hypo, .slide--quotes, .slide--history, .slide--inflect, .slide--left, [data-scroll]')) {
        s.scrollTop = 0;
      }
    });

    history.replaceState(null, '', `#${index + 1}`);
    document.dispatchEvent(new CustomEvent('slide:change', { detail: { index, slide: slides[index] } }));
  };

  const go = (i) => {
    index = Math.max(0, Math.min(total - 1, i));
    render();
  };

  const next = () => go(index + 1);
  const prev = () => go(index - 1);

  // ---------- Keyboard / clicker ----------
  // Common clicker mappings:
  //   Forward: PageDown, Right, Down, Space, Enter
  //   Back:    PageUp,   Left,  Up,   Backspace
  //   Start:   F5  (we treat as fullscreen toggle)
  //   Stop:    Escape  (exit fullscreen / close help)
  const NEXT_KEYS = new Set([
    'ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Spacebar', 'Enter'
  ]);
  const PREV_KEYS = new Set([
    'ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'
  ]);

  document.addEventListener('keydown', (e) => {
    // never intercept modifier combos (lets browser shortcuts work)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (NEXT_KEYS.has(e.key)) { e.preventDefault(); next(); return; }
    if (PREV_KEYS.has(e.key)) { e.preventDefault(); prev(); return; }

    switch (e.key) {
      case 'Home':     e.preventDefault(); go(0); break;
      case 'End':      e.preventDefault(); go(total - 1); break;
      case 'f': case 'F':
        e.preventDefault(); toggleFullscreen(); break;
      case 'F5':
        e.preventDefault(); toggleFullscreen(); break;
      case '?': case '/':
        e.preventDefault(); toggleHelp(); break;
      case 'Escape':
        if (!help.hidden) { help.hidden = true; break; }
        if (document.fullscreenElement) document.exitFullscreen();
        break;
      default:
        // number keys 1-9 jump to that slide
        if (/^[1-9]$/.test(e.key)) {
          e.preventDefault();
          go(parseInt(e.key, 10) - 1);
        }
    }
  });

  // ---------- Click to advance (but not on links/buttons) ----------
  // On touch devices, don't use click-to-advance (swipe handles it)
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isTouchDevice) {
    document.addEventListener('click', (e) => {
      if (e.target.closest('a, button, .help, kbd')) return;
      // left half → prev, right half → next
      if (e.clientX < window.innerWidth * 0.25) prev();
      else next();
    });
  }

  // ---------- Touch swipe ----------
  let tStartX = 0, tStartY = 0;
  document.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    tStartX = t.clientX; tStartY = t.clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - tStartX;
    const dy = t.clientY - tStartY;
    const threshold = window.innerWidth < 768 ? 30 : 50;
    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next(); else prev();
    }
  });

  // ---------- Wheel / trackpad ----------
  // Wheel events inside a scrollable slide pane (e.g. the market-map
  // poster) scroll the pane; only advance the deck when the pane has
  // reached its scroll boundary.
  let wheelLock = false;
  document.addEventListener('wheel', (e) => {
    const scroller = e.target.closest('.slide--mm-poster, .slide--bio, .slide--hypo, .slide--quotes, .slide--history, .slide--inflect, .slide--left, [data-scroll]');
    if (scroller) {
      const atTop = scroller.scrollTop <= 0;
      const atBot = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      if (e.deltaY < 0 && !atTop) return;     // scrolling up, not at top — let pane scroll
      if (e.deltaY > 0 && !atBot) return;     // scrolling down, not at bottom — let pane scroll
    }
    if (wheelLock) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 30) return;
    wheelLock = true;
    setTimeout(() => (wheelLock = false), 450);
    if (delta > 0) next(); else prev();
  }, { passive: true });

  // ---------- Fullscreen ----------
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }

  // ---------- Help ----------
  function toggleHelp() { help.hidden = !help.hidden; }
  help.addEventListener('click', () => (help.hidden = true));

  // ---------- Hash sync (back/forward buttons) ----------
  window.addEventListener('hashchange', () => go(fromHash()));

  // ---------- Init ----------
  index = fromHash();
  render();
})();
