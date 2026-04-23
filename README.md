# Preso Base

This repository serves as a reference and base template for building slide decks. It integrates the robust design system from [ucberkeley-preso](https://github.com/caligarn/ucberkeley-preso) and the advanced text presentation technology from [pretext](https://github.com/chenglou/pretext).

## Overview

- **Design System (`src/design-system/`)**: Contains the core styles, layout logic, and scripts inherited from the UC Berkeley presentation template. It provides a modern, responsive, and visually appealing foundation for slide decks.
- **Presentation Technology (`src/pretext/`)**: Integrates the `pretext` library for fast, accurate, and comprehensive text measurement and layout. This ensures that typography across the slides is handled with precision.
- **Assets (`assets/`)**: A centralized directory for images, headshots, scripts, and other media used across the presentations.

## Getting Started

1. Clone this repository to start a new presentation project.
2. Customize the `index.html` file at the root to build your slide deck.
3. Utilize the CSS and JS from `src/design-system/` to style and animate your slides.
4. Leverage `pretext` features from `src/pretext/` for advanced text layouts if needed.

## Repository Structure

```
preso-base/
├── index.html                  # Main presentation file
├── README.md                   # This documentation
├── assets/                     # Images, headshots, and media assets
├── src/
│   ├── design-system/          # CSS styles, JS scripts, and layout logic
│   └── pretext/                # Pretext library source and tools
```

## Acknowledgments

- [ucberkeley-preso](https://github.com/caligarn/ucberkeley-preso) by Minh Do
- [pretext](https://github.com/chenglou/pretext) by Cheng Lou
