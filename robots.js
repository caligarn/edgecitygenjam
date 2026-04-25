/* ==========================================================================
   ROBOTS — ambient background layer, one per slide
   Each slide gets a pocket of 5-8 robots that float, drift, orbit,
   pulse, spin, or swing. Every robot is individually randomized
   (size, trajectory, rotation, duration, phase), so no composition
   repeats. A global mouse-parallax target is written to :root so
   every layer responds together.
   ========================================================================== */

(() => {
  const POOL = [
    "A_black_and_white_line_drawing_depicts_a_SePAGDzf.png",
    "A_cartoonish_red_robot_with_a_camera_for_a_head_0fy3XEu.png",
    "A_droid_with_a_camera_for_a_head_performs_a_mPkEMN0y.png",
    "A_line_drawing_depicts_a_robot_with_a_camera_for_lZzo2P7d.png",
    "A_minimalist_illustration_depicts_a_white_robot_i4HzuOCv.png",
    "A_simplified_cartoon-like_robot_with_a_camera_lQikCdqp.png",
    "A_stylized_black_robot_with_a_camera_for_a_head_ruyiJ42G.png",
    "A_stylized_illustration_depicts_a_robot_in_X_iUz7az.png",
    "A_stylized_robot_with_a_camera_for_a_head_is_gtFc3B7L.png",
    "A_stylized_robot_with_a_camera_for_a_head_is_j_nWb94F.png",
    "A_stylized_robot_with_a_camera_for_a_head_stands_vYGBsiXC.png",
    "A_stylized_robot_with_a_camera_lens_for_a_head_q_tbJ_h9.png",
    "A_white_line-drawn_robot_is_depicted_in_a_tree_jtNKF0sp.png",
    "A_white_line_drawing_depicts_a_robot_upside_down_mmPO-wMa.png",
    "A_white_line_drawing_of_a_robot_with_a_camera_for_N_Ojb17V.png",
    "In_a_graphic_illustration_style_a_stylized_robot_m-fi5Acu.png",
    "In_a_minimalist_cartoon_style_a_small_stylized_bFGOGCnx.png",
    "In_a_minimalist_graphic_style_a_white_line_IDfYvjQ6.png",
    "In_a_minimalist_line_art_style_a_white_outline_0Q_iwtpp.png",
    "In_a_stylized_illustration_a_white_line-art_1FjQxUfv.png",
    "In_a_vintage_illustration_style_a_robotic_figure_6phadamP.png",
  ];

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const IS_MOBILE = window.matchMedia("(max-width: 768px)").matches;
  const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const VARIANTS = ["drift", "bob", "orbit", "pulse", "spin", "swing", "float"];

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  // Shuffle a pool once so robots spread across slides without a single
  // robot appearing in every neighbor slide.
  function rotated(i) {
    const p = [...POOL];
    // simple deterministic rotation seeded by slide index
    return p.slice(i % p.length).concat(p.slice(0, i % p.length));
  }

  function spawn(host, slideIndex) {
    // Fewer but bigger robots — 2-4 per slide so they read as a light
    // editorial presence, not clutter. Dense slides still go lighter.
    const slide = host.parentElement;
    const dense = slide.matches(".slide--mm-poster, .slide--worldmap, .slide--connect, .slide--mm-stage, .slide--gallery");
    const count = IS_MOBILE ? (dense ? 1 : 2) : (dense ? 2 : Math.floor(rand(3, 5)));

    const deck = rotated(slideIndex);
    for (let i = 0; i < count; i++) {
      const img = document.createElement("img");
      img.src = deck[i % deck.length];
      img.alt = "";
      img.decoding = "async";
      img.loading = "lazy";
      img.className = "robot robot--" + pick(VARIANTS);

      const sz  = rand(30, 56);
      const x   = rand(-6, 106);
      const y   = rand(-4, 104);
      const r0  = rand(-35, 35);
      const dx  = rand(-14, 14);
      const dy  = rand(-12, 12);
      const sc  = rand(0.82, 1.16);
      const dur = rand(22, 48);
      const dly = -rand(0, dur);
      const depth = rand(0.5, 1.1);
      const flip = Math.random() < 0.35 ? -1 : 1;

      img.style.setProperty("--x", x + "vw");
      img.style.setProperty("--y", y + "vh");
      img.style.setProperty("--sz", sz + "vh");
      img.style.setProperty("--r0", r0 + "deg");
      img.style.setProperty("--dx", dx + "vw");
      img.style.setProperty("--dy", dy + "vh");
      img.style.setProperty("--sc", sc);
      img.style.setProperty("--dur", dur + "s");
      img.style.setProperty("--delay", dly + "s");
      img.style.setProperty("--depth", depth);
      img.style.setProperty("--flip", flip);
      host.appendChild(img);
    }

    if (REDUCED) host.classList.add("robots--reduced");
  }

  // Subtle mouse parallax — writes lerped --px/--py to :root so every
  // robot layer across every slide eases in sync.
  function parallax() {
    if (REDUCED || IS_TOUCH) return;
    const STRENGTH = 14;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    window.addEventListener("mousemove", (e) => {
      tx = (e.clientX / window.innerWidth  - 0.5) * STRENGTH;
      ty = (e.clientY / window.innerHeight - 0.5) * STRENGTH;
    }, { passive: true });
    const root = document.documentElement.style;
    const tick = () => {
      cx += (tx - cx) * 0.05;
      cy += (ty - cy) * 0.05;
      root.setProperty("--px", cx.toFixed(2) + "vw");
      root.setProperty("--py", cy.toFixed(2) + "vh");
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function init() {
    document.querySelectorAll(".slide").forEach((slide, i) => {
      const host = document.createElement("div");
      host.className = "robot-bg";
      host.setAttribute("aria-hidden", "true");
      slide.insertBefore(host, slide.firstChild);
      spawn(host, i);
    });
    parallax();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
