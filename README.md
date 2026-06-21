# PS/NEXT Summit 26 GenJam

This repository is the presentation scaffold for **PS/NEXT Summit 26 GenJam**, built on the [preso-base](https://github.com/caligarn/preso-base) template. It integrates the robust design system from [ucberkeley-preso](https://github.com/caligarn/ucberkeley-preso) and the advanced text presentation technology from [pretext](https://github.com/chenglou/pretext).

## Overview

- **Design System (`src/design-system/`)**: Contains the core styles, layout logic, and scripts inherited from the UC Berkeley presentation template. It provides a modern, responsive, and visually appealing foundation for slide decks.
- **Presentation Technology (`src/pretext/`)**: Integrates the `pretext` library for fast, accurate, and comprehensive text measurement and layout. This ensures that typography across the slides is handled with precision.
- **Assets (`assets/`)**: A centralized directory for images, headshots, scripts, and other media used across the presentations.

## Getting Started

1. Clone this repository to start building the presentation.
2. Customize the `index.html` file at the root to build your slide deck.
3. Utilize the CSS and JS from `src/design-system/` to style and animate your slides.
4. Leverage `pretext` features from `src/pretext/` for advanced text layouts if needed.

## Repository Structure

```
edgecitygenjam/
├── index.html                  # Main presentation file
├── README.md                   # This documentation
├── assets/                     # Images, headshots, and media assets
├── src/
│   ├── design-system/          # CSS styles, JS scripts, and layout logic
│   └── pretext/                # Pretext library source and tools
```

## Acknowledgments

- [preso-base](https://github.com/caligarn/preso-base) by Minh Do
- [ucberkeley-preso](https://github.com/caligarn/ucberkeley-preso) by Minh Do
- [pretext](https://github.com/chenglou/pretext) by Cheng Lou


## Editing photos on the live site

The deck has a built-in photo editor: click **✏️ EDIT PHOTOS** (bottom-right)
or press **E**, then click any picture (or drag a file onto it) to replace it.

### Making uploads permanent (Vercel)

Out of the box, uploads are saved in your browser only. To make them
permanent on the site for every visitor:

1. In the Vercel dashboard: **Storage → Create → Blob**, and connect the
   store to this project (this auto-adds the `BLOB_READ_WRITE_TOKEN` env var).
2. **Project → Settings → Environment Variables**: add
   `DECK_EDIT_KEY` = a passphrase of your choosing.
3. Redeploy.

After that, the first upload in the deck asks for the passphrase once, and
every upload is stored in Vercel Blob via `api/media.js` — permanent across
visitors, devices, and code updates. Use the **✕ reset** chip (in edit mode)
to remove an uploaded image.

Every editable spot has a permanent `data-media-key` in `index.html`, so
reordering slides never disconnects an uploaded image.
