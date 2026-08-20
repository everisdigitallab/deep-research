"""Create a SharePoint-ready PDF snapshot from a persisted Technology Radar board."""

from __future__ import annotations

import argparse
import html
import json
import math
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from weasyprint import HTML


ROOT = Path(__file__).resolve().parents[1]
BOARD_STORE = ROOT / "data" / "ic_radar_boards.json"
DEFAULT_OUTPUT = ROOT / "outputs" / "ic-technology-radar-latest.pdf"
HERO_IMAGE = ROOT / "frontend" / "assets" / "ic-radar-hero.png"

RING_ORDER = ["Adopt", "Trial", "Assess", "Caution"]
QUADRANT_ORDER = ["Techniques", "Platforms", "Tools", "Languages & Frameworks"]
RING_COLORS = {
    "Adopt": "#138a63",
    "Trial": "#087fc2",
    "Assess": "#be7912",
    "Caution": "#c63d4f",
}


def escaped(value: object) -> str:
    return html.escape(str(value or ""), quote=True)


def format_date(value: str | None) -> str:
    if not value:
        return "Not available"
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.strftime("%d %b %Y, %H:%M UTC")
    except ValueError:
        return value


def compact_text(value: object, limit: int = 62) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0] + "..."


def load_board(board_id: str | None) -> dict:
    boards = json.loads(BOARD_STORE.read_text(encoding="utf-8"))
    if board_id:
        try:
            return boards[board_id]
        except KeyError as error:
            raise SystemExit(f"Radar board not found: {board_id}") from error

    saved_boards = list(boards.values())
    if not saved_boards:
        raise SystemExit("No persisted Technology Radar boards were found.")
    return max(saved_boards, key=lambda board: board.get("updated_at", ""))


def active_trends(board: dict) -> list[dict]:
    return [trend for trend in board.get("trends", []) if not trend.get("deleted")]


def numbered_trends(trends: list[dict]) -> list[dict]:
    ordered = sorted(
        trends,
        key=lambda trend: (
            QUADRANT_ORDER.index(trend.get("quadrant")) if trend.get("quadrant") in QUADRANT_ORDER else 99,
            RING_ORDER.index(trend.get("ring")) if trend.get("ring") in RING_ORDER else 99,
            str(trend.get("name") or ""),
        ),
    )
    return [{**trend, "number": index + 1} for index, trend in enumerate(ordered)]


def score_value(trend: dict, key: str) -> str:
    scores = trend.get("scores") or {}
    return str(scores.get(key, trend.get(key, "-")))


def list_markup(items: list[str]) -> str:
    if not items:
        return "<span class=\"muted\">Not available</span>"
    return "<ul>" + "".join(f"<li>{escaped(item)}</li>" for item in items) + "</ul>"


def derive_source_name(url: str) -> str:
    parsed = urlparse(url)
    return parsed.netloc.removeprefix("www.") or url


def source_rows(board: dict, trends: list[dict]) -> str:
    sources: dict[str, str] = {}
    for source in (board.get("setup_snapshot") or {}).get("sources", []):
        url = str(source.get("url") or "").strip()
        if url:
            sources[url] = str(source.get("source_name") or derive_source_name(url))

    for trend in trends:
        names = trend.get("linked_source_names") or []
        urls = trend.get("linked_source_urls") or []
        for index, url in enumerate(urls):
            url = str(url).strip()
            if url:
                sources[url] = str(names[index] if index < len(names) else derive_source_name(url))

    rows = []
    for url, name in sources.items():
        rows.append(
            "<tr>"
            f"<td>{escaped(name)}</td>"
            f"<td class=\"source-url\">{escaped(url)}</td>"
            "</tr>"
        )
    return "".join(rows) or "<tr><td colspan=\"2\">No sources available.</td></tr>"


def radar_svg(trends: list[dict]) -> str:
    numbered = numbered_trends(trends)
    center_x, center_y = 300, 275
    radii = [74, 128, 182, 236]
    quadrant_angles = {
        "Techniques": (180, 270),
        "Platforms": (270, 360),
        "Tools": (90, 180),
        "Languages & Frameworks": (0, 90),
    }
    parts = [
        '<svg class="radar-map" viewBox="0 0 600 550" role="img" aria-label="Technology Radar map">',
        '<rect width="600" height="550" rx="24" fill="#f7fbff"/>',
    ]
    for index, radius in enumerate(radii):
        color = RING_COLORS[RING_ORDER[index]]
        parts.append(
            f'<circle cx="{center_x}" cy="{center_y}" r="{radius}" fill="none" stroke="{color}" stroke-opacity="0.34" stroke-width="1.5"/>'
        )
    parts.extend(
        [
            f'<line x1="{center_x}" y1="28" x2="{center_x}" y2="520" stroke="#b9c7d6" stroke-width="1.4"/>',
            f'<line x1="55" y1="{center_y}" x2="545" y2="{center_y}" stroke="#b9c7d6" stroke-width="1.4"/>',
            f'<circle cx="{center_x}" cy="{center_y}" r="32" fill="#ffffff" stroke="#087fc2" stroke-width="2"/>',
            f'<text x="{center_x}" y="{center_y + 6}" text-anchor="middle" class="radar-core">IC</text>',
        ]
    )

    for quadrant in QUADRANT_ORDER:
        for ring_index, ring in enumerate(RING_ORDER):
            bucket = [trend for trend in numbered if trend.get("quadrant") == quadrant and trend.get("ring") == ring]
            if not bucket:
                continue
            start_angle, end_angle = quadrant_angles[quadrant]
            start_radius = 42 if ring_index == 0 else radii[ring_index - 1] + 14
            end_radius = radii[ring_index] - 17
            radius = start_radius + (end_radius - start_radius) / 2
            angle_step = (end_angle - start_angle) / (len(bucket) + 1)
            for index, trend in enumerate(bucket, start=1):
                angle = math.radians(start_angle + angle_step * index)
                x = center_x + radius * math.cos(angle)
                y = center_y + radius * math.sin(angle)
                color = RING_COLORS[ring]
                label = escaped(f"{trend['number']}. {trend.get('name') or 'Trend'}")
                parts.extend(
                    [
                        f'<title>{label}</title>',
                        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="16" fill="#ffffff" stroke="{color}" stroke-width="3"/>',
                        f'<text x="{x:.1f}" y="{y + 4:.1f}" text-anchor="middle" class="radar-number" fill="{color}">{trend["number"]}</text>',
                    ]
                )

    captions = [
        (95, 66, "Tools"),
        (450, 66, "Languages & Frameworks"),
        (95, 500, "Techniques"),
        (450, 500, "Platforms"),
    ]
    for x, y, label in captions:
        parts.append(f'<text x="{x}" y="{y}" text-anchor="middle" class="radar-caption">{escaped(label)}</text>')
    parts.append("</svg>")
    return "".join(parts)


def trend_cards(trends: list[dict]) -> str:
    cards = []
    ordered = sorted(trends, key=lambda trend: (RING_ORDER.index(trend.get("ring")) if trend.get("ring") in RING_ORDER else 99, trend.get("name", "")))
    for index, trend in enumerate(ordered, start=1):
        ring = str(trend.get("ring") or "Assess")
        cards.append(
            "<article class=\"trend-card\">"
            "<div class=\"trend-head\">"
            f"<span class=\"trend-number\">{index}</span>"
            f"<span class=\"ring ring-{escaped(ring.lower())}\">{escaped(ring)}</span>"
            f"<span class=\"quadrant\">{escaped(trend.get('quadrant') or 'Quadrant')}</span>"
            "</div>"
            f"<h3>{escaped(trend.get('name') or 'Trend')}</h3>"
            f"<p>{escaped(trend.get('summary') or '')}</p>"
            "<div class=\"scores\">"
            f"<span>Strategic <strong>{escaped(score_value(trend, 'strategic_impact'))}/5</strong></span>"
            f"<span>Market <strong>{escaped(score_value(trend, 'market_client_potential'))}/5</strong></span>"
            f"<span>Readiness <strong>{escaped(score_value(trend, 'execution_readiness'))}/5</strong></span>"
            f"<span>Asset <strong>{escaped(score_value(trend, 'scalable_asset_potential'))}/5</strong></span>"
            "</div>"
            f"<p><strong>Recommended action:</strong> {escaped(trend.get('recommended_action') or '')}</p>"
            "</article>"
        )
    return "".join(cards)


def build_html(board: dict) -> str:
    trends = active_trends(board)
    numbered = numbered_trends(trends)
    latest = board.get("latest_result") or {}
    setup = board.get("setup_snapshot") or {}
    ring_counts = Counter(str(trend.get("ring") or "Assess") for trend in trends)
    hero_uri = HERO_IMAGE.resolve().as_uri() if HERO_IMAGE.exists() else ""
    ring_summary = "".join(
        f'<span class="ring ring-{ring.lower()}">{escaped(ring)}: {ring_counts.get(ring, 0)}</span>'
        for ring in RING_ORDER
        if ring_counts.get(ring, 0)
    )
    key_items = "".join(
        "<div class=\"key-item\">"
        f"<strong>{trend['number']}. {escaped(trend.get('name') or 'Trend')}</strong>"
        f"<span class=\"muted\">{escaped(trend.get('quadrant') or 'Quadrant')} - {escaped(trend.get('ring') or 'Assess')}</span>"
        "</div>"
        for trend in numbered
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
@page {{ size: A4; margin: 13mm; @bottom-center {{ content: "Innovation Center Technology Radar - page " counter(page) " of " counter(pages); color: #65758a; font: 8pt sans-serif; }} }}
* {{ box-sizing: border-box; }}
body {{ color: #1d2b3a; font-family: Arial, sans-serif; font-size: 10.2pt; line-height: 1.48; }}
h1, h2, h3, p {{ margin-top: 0; }}
h1, h2, h3 {{ font-family: Arial, sans-serif; letter-spacing: -0.02em; }}
h1 {{ font-size: 29pt; line-height: 1.02; margin-bottom: 10px; }}
h2 {{ font-size: 18pt; margin-bottom: 10px; }}
h3 {{ font-size: 13.5pt; margin-bottom: 8px; }}
.kicker {{ color: #087fc2; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; }}
.hero {{ position: relative; height: 260px; overflow: hidden; border: 1px solid #d9e4ee; border-radius: 18px; background: #f7fbff; }}
.hero-copy {{ position: relative; z-index: 1; width: 58%; padding: 25px 28px; }}
.hero-image {{ position: absolute; inset: 0 0 0 auto; width: 42%; height: 100%; object-fit: cover; object-position: center; }}
.lede {{ color: #52647a; font-size: 11.2pt; max-width: 100%; }}
.meta-grid, .score-grid {{ display: table; width: 100%; border-spacing: 8px; margin: 12px -8px 16px; }}
.meta-card, .score-card {{ display: table-cell; width: 25%; padding: 12px; border: 1px solid #dce7f1; border-radius: 12px; background: #ffffff; vertical-align: top; }}
.meta-card strong, .score-card strong {{ display: block; font-size: 14pt; margin-top: 4px; }}
.muted {{ color: #65758a; }}
.section {{ margin-top: 22px; }}
.section-title {{ border-bottom: 1px solid #dce7f1; padding-bottom: 8px; margin-bottom: 12px; }}
.radar-layout {{ display: table; width: 100%; border-spacing: 14px; margin: 0 -14px; }}
.radar-frame, .radar-key {{ display: table-cell; vertical-align: top; }}
.radar-frame {{ width: 64%; }}
.radar-key {{ width: 36%; padding-top: 20px; }}
.radar-map {{ display: block; width: 100%; height: auto; }}
.radar-core {{ font: 800 18px Arial, sans-serif; fill: #1d2b3a; }}
.radar-number {{ font: 800 11px Arial, sans-serif; }}
.radar-caption {{ font: 700 11px Arial, sans-serif; fill: #52647a; }}
.ring, .quadrant {{ display: inline-block; border-radius: 999px; padding: 5px 9px; font-size: 8.5pt; font-weight: 700; margin: 0 4px 5px 0; }}
.ring-adopt {{ background: #e5f5ee; color: #08754f; }} .ring-trial {{ background: #e4f2fb; color: #0870ad; }} .ring-assess {{ background: #fff1d9; color: #9b5e05; }} .ring-caution {{ background: #fde9eb; color: #a9273a; }}
.quadrant {{ background: #eef3f8; color: #52647a; }}
.key-item {{ padding: 9px 0; border-bottom: 1px solid #e4ecf3; }}
.key-item strong {{ display: block; }}
.trend-card {{ break-inside: avoid; margin: 0 0 12px; padding: 16px; border: 1px solid #dce7f1; border-radius: 14px; background: #ffffff; }}
.trend-head {{ margin-bottom: 10px; }}
.trend-number {{ display: inline-block; width: 23px; height: 23px; border-radius: 50%; background: #087fc2; color: white; font-size: 9pt; font-weight: 700; line-height: 23px; text-align: center; margin-right: 6px; }}
.scores {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }}
.scores span {{ background: #f3f7fb; border-radius: 8px; padding: 5px 8px; font-size: 8.5pt; }}
.scores strong {{ color: #087fc2; }}
.page-break {{ break-before: page; }}
table {{ width: 100%; border-collapse: collapse; font-size: 8.8pt; }} th, td {{ padding: 8px; border: 1px solid #dce7f1; text-align: left; vertical-align: top; }} th {{ background: #edf5fb; }} .source-url {{ color: #52647a; overflow-wrap: anywhere; }}
</style>
</head>
<body>
<section class="hero">
  <div class="hero-copy">
    <div class="kicker">Innovation Center</div>
    <h1>Technology Radar</h1>
    <p class="lede">Static export of a persisted radar board for review and publication. It retains the research setup, linked evidence, trend classification, and recommended actions from the latest saved run.</p>
    <p><strong>Board:</strong> {escaped(board.get('name') or 'Technology Radar Board')}<br><span class="muted">Last updated: {escaped(format_date(board.get('updated_at')))}</span></p>
  </div>
  {f'<img class="hero-image" src="{hero_uri}" alt="Innovation Center radar visual">' if hero_uri else ''}
</section>

<div class="meta-grid">
  <div class="meta-card"><span class="muted">Research topic</span><strong>{escaped(compact_text(setup.get('topic') or latest.get('topic') or 'Not available'))}</strong></div>
  <div class="meta-card"><span class="muted">Active trends</span><strong>{len(trends)}</strong></div>
  <div class="meta-card"><span class="muted">Overall ring</span><strong>{escaped(latest.get('radar_ring') or 'Assess')}</strong></div>
  <div class="meta-card"><span class="muted">Time window</span><strong>{escaped(setup.get('time_window') or 'Not available')}</strong></div>
</div>

<section class="section">
  <div class="section-title"><div class="kicker">Executive summary</div><h2>{escaped(latest.get('topic') or setup.get('topic') or 'Technology Radar')}</h2></div>
  <p>{escaped(latest.get('executive_summary') or 'No executive summary was saved for this board.')}</p>
  <p><strong>Why it matters:</strong> {escaped(latest.get('why_it_matters') or 'Not available')}</p>
  <p><strong>Radar story:</strong> {escaped(latest.get('radar_story') or 'Not available')}</p>
</section>

<section class="section">
  <div class="section-title"><div class="kicker">Research setup</div><h2>Inputs used for this board</h2></div>
  <p><strong>Innovation Center context:</strong> {escaped(setup.get('context') or 'Not available')}</p>
  <p><strong>Keywords:</strong> {escaped(setup.get('keywords') or 'Not specified')}</p>
</section>

<section class="section page-break">
  <div class="section-title"><div class="kicker">Radar board</div><h2>Signal map and numbered trends</h2></div>
  <div class="radar-layout">
    <div class="radar-frame">{radar_svg(trends)}</div>
    <div class="radar-key"><p>{ring_summary}</p>{key_items}</div>
  </div>
</section>

<section class="section page-break">
  <div class="section-title"><div class="kicker">Trend portfolio</div><h2>Classified opportunities and actions</h2></div>
  {trend_cards(trends)}
</section>

<section class="section page-break">
  <div class="section-title"><div class="kicker">Evidence</div><h2>Sources linked to the board</h2></div>
  <table><thead><tr><th>Source</th><th>URL</th></tr></thead><tbody>{source_rows(board, trends)}</tbody></table>
  <p class="muted">This PDF is a static decision-support snapshot. Review the linked sources and validate assumptions before making investment, client, or portfolio decisions.</p>
</section>
</body>
</html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--board-id", help="Export a specific persisted board instead of the most recently updated board.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Destination PDF path.")
    args = parser.parse_args()

    board = load_board(args.board_id)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    HTML(string=build_html(board), base_url=str(ROOT)).write_pdf(args.output)
    print(args.output)


if __name__ == "__main__":
    main()
