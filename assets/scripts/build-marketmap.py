#!/usr/bin/env python3
"""
Regenerate the single dense Market Map poster slide from
ai_storytelling_market_map.json and splice it into index.html.

Output: one <section class="slide slide--mm-poster"> with
  • header — title + stage legend
  • four mm-stage-group cards, one per stage, stacked via CSS grid;
    each contains its subsections and every company tile with logo
    and description (company description rendered as a native title
    tooltip via `title="<desc>"` on the tile <a>).
  • no hover-to-expand — everything is visible at once, packed as
    tightly as the viewport allows.

Usage:
    python3 scripts/build-marketmap.py

Splice markers in index.html: <!-- MM-START -->  ...  <!-- MM-END -->
"""
from __future__ import annotations
import html
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "ai_storytelling_market_map.json"
HTML_PATH = ROOT / "index.html"
START = "<!-- MM-START -->"
END = "<!-- MM-END -->"

STAGE_CLASS = {
    "development": "mm-stage--sky",
    "production": "mm-stage--orange",
    "post-production": "mm-stage--purple",
    "dev-tools": "mm-stage--green",
}


def esc(s: str | None) -> str:
    return html.escape(s or "")


def tile(company: dict) -> str:
    name = esc(company.get("name"))
    url = esc(company.get("url") or "#")
    logo = esc(company.get("logoUrl") or "")
    desc = esc(company.get("description") or "")
    # `title` attr gives a native browser tooltip with the description.
    tip = f"{name}" + (f" — {desc}" if desc else "")
    if logo:
        return (
            f'<li class="mm-tile" title="{tip}">'
            f'<a href="{url}" aria-label="{tip}"><img src="{logo}" alt="{name} logo" loading="lazy"/>'
            f'<span>{name}</span></a></li>'
        )
    return (
        f'<li class="mm-tile mm-tile--text" title="{tip}">'
        f'<a href="{url}" aria-label="{tip}"><span>{name}</span></a></li>'
    )


def subsection_html(sub: dict, stage_cls: str) -> str:
    tiles = "".join(tile(c) for c in sub["companies"])
    return (
        f'<div class="mm-sub {stage_cls}">\n'
        f'  <h4 class="mm-sub__h">{esc(sub["label"])} <em>{len(sub["companies"])}</em></h4>\n'
        f'  <ul class="mm-tiles">{tiles}</ul>\n'
        "</div>"
    )


def render(data: dict) -> str:
    meta = data["meta"]
    sections = data["sections"]

    legend = []
    for s in sections:
        total = sum(len(sub["companies"]) for sub in s["subsections"])
        legend.append(
            f'<li class="mm-legend__item {STAGE_CLASS[s["id"]]}">'
            f'<span class="mm-legend__swatch"></span>'
            f'<span class="mm-legend__label">{esc(s["label"])}</span>'
            f'<span class="mm-legend__n">{total}</span>'
            "</li>"
        )

    groups = []
    for s in sections:
        stage_cls = STAGE_CLASS[s["id"]]
        total = sum(len(sub["companies"]) for sub in s["subsections"])
        subs = "\n          ".join(
            subsection_html(sub, stage_cls).replace("\n", "\n          ")
            for sub in s["subsections"]
        )
        groups.append(
            f'<section class="mm-stage-group {stage_cls}" data-stage="{s["id"]}">\n'
            "  <header class=\"mm-stage-group__head\">\n"
            f'    <h3 class="mm-stage-group__title">{esc(s["label"])}</h3>\n'
            f'    <span class="mm-stage-group__n">{total}</span>\n'
            "  </header>\n"
            f'  <div class="mm-stage-group__body">\n          {subs}\n  </div>\n'
            "</section>"
        )

    return (
        '<section class="slide slide--mm-poster" data-bg="cream">\n'
        '  <header class="mm-poster__hd">\n'
        f'    <span class="kicker">MARKET MAP · {esc(meta.get("version",""))}</span>\n'
        '    <h2 class="h-xl mm-poster__title">\n'
        f'      <span class="mm-ov-big">{meta["totalCompanies"]}</span> companies · '
        f'<span class="mm-ov-big">{meta["totalSections"]}</span> stages · '
        f'<span class="mm-ov-big">{sum(len(s["subsections"]) for s in sections)}</span> categories.\n'
        "    </h2>\n"
        '    <ul class="mm-legend">\n      '
        + "\n      ".join(legend)
        + "\n    </ul>\n"
        "  </header>\n"
        '  <div class="mm-stages">\n    '
        + "\n    ".join(groups).replace("\n", "\n    ")
        + "\n  </div>\n"
        f'  <p class="mm-poster__foot mono">HOVER A LOGO FOR DETAIL · SOURCE {esc(meta.get("source",""))}</p>\n'
        "</section>"
    )


def splice(html_src: str, block: str) -> str:
    if START not in html_src or END not in html_src:
        raise SystemExit(
            f"Could not find {START!r} / {END!r} markers in index.html."
        )
    pre, _, rest = html_src.partition(START)
    _, _, post = rest.partition(END)
    return f"{pre}{START}\n  {block.replace(chr(10), chr(10) + '  ')}\n  {END}{post}"


def main() -> int:
    data = json.loads(JSON_PATH.read_text())
    block = render(data)
    html_src = HTML_PATH.read_text()
    new = splice(html_src, block)
    HTML_PATH.write_text(new)
    print(
        f"Regenerated market map: {data['meta']['totalCompanies']} companies "
        f"across {sum(len(s['subsections']) for s in data['sections'])} categories."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
