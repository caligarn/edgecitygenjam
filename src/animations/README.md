# Presentation Animations & Effects

This directory contains a curated collection of the best Three.js, WebGL, and JavaScript animation libraries to enhance your slide decks in `edgecitygenjam`. These tools provide ready-to-use particle systems, 3D backgrounds, motion graphics, and typography effects.

## Included Libraries

### 3D Backgrounds & Environments
- **[Vanta.js](./vanta)**: Animated 3D backgrounds (birds, fog, waves, clouds, etc.) that can be applied to any HTML element with just a few lines of code.
- **[cobe](./cobe)**: A lightweight (5KB) WebGL globe library. Perfect for visualizing global reach or network diagrams.
- **[three-globe](./three-globe)**: A robust Three.js WebGL class to represent data visualization layers on a 3D globe using spherical projection.

### Particle Systems
- **[tsParticles](./tsparticles)**: Highly customizable JavaScript particle effects, confetti explosions, fireworks, and starry backgrounds.
- **[MisterPrada/morph-particles](./morph-particles)**: An advanced WebGL effect that morphs 3D models into particle systems with smooth animations.
- **[MisterPrada/singularity](./singularity)**: A stunning black hole / vortex simulation built with Three.js and TSL (Three.js Shader Language).

### Shaders & WebGL Tools
- **[ogl](./ogl)**: A minimal WebGL library. Great for building custom, lightweight WebGL effects without the full overhead of Three.js.
- **[curtains.js](./curtains-js)**: A lightweight WebGL library that turns HTML DOM elements (images, videos) into interactive 3D textured planes. Excellent for scroll-based image distortion and ripple effects.
- **[Shader Park](./shader-park)**: A JavaScript library for creating interactive, procedural 2D and 3D shaders easily.

### UI & Motion Graphics
- **[anime.js](./anime-js)**: A lightweight JavaScript animation library with a simple, powerful API. Great for orchestrating complex timeline animations on the DOM, SVG, and JS objects.
- **[mo.js](./mo-js)**: A motion graphics toolbelt for the web. Perfect for creating snappy, declarative UI animations, bursts, and shape transitions.
- **[cursor-effects](./cursor-effects)**: Old-school, interactive cursor trails and effects built with modern JavaScript.
- **[particle-effects-buttons](./particle-effects-buttons)**: A small library for bursting particle effects on buttons and interactive elements (from Codrops).

## How to Use

1. Include the necessary scripts from the respective library's `dist` or `build` folder in your main `index.html`.
2. Ensure you include `three.js` (available via CDN or local copy) if the library depends on it (e.g., Vanta, three-globe).
3. Initialize the effects on your slide containers (e.g., `<section class="slide" id="my-animated-slide">`).

*Note: The `.git` directories have been removed from these folders to keep them as clean source snapshots within this repository.*
