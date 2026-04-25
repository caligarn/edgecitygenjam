/* ==========================================================================
   MM-ZOOM — populates the three stage-breakout slides with content cloned
   from the master market-map poster (slide 8). Keeps the source-of-truth
   in one place: edit the poster, the breakouts follow.
   ========================================================================== */

(() => {
  const slides = document.querySelectorAll(".slide--mm-zoom");
  if (!slides.length) return;

  slides.forEach((slide) => {
    const raw = slide.dataset.stageFor || "";
    const stages = raw.split(",").map((s) => s.trim()).filter(Boolean);

    stages.forEach((stage) => {
      const source = document.querySelector(
        `.slide--mm-poster .mm-stage-group[data-stage="${stage}"]`
      );
      if (!source) return;

      const clone = source.cloneNode(true);
      clone.removeAttribute("id"); // avoid duplicate ids in the doc
      slide.appendChild(clone);
    });
  });
})();
