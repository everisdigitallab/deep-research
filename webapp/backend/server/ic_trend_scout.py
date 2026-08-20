import json
import re
from datetime import date
from pathlib import Path
from typing import Any

import json_repair
from pydantic import BaseModel, Field

from gpt_researcher import GPTResearcher
from gpt_researcher.document.document import DocumentLoader
from gpt_researcher.utils.enum import ReportSource, ReportType, Tone


DEFAULT_IC_CONTEXT = (
    "The Innovation Center explores emerging technologies, market signals, "
    "research, startups, tools, open-source repositories, and new disciplines "
    "to identify opportunities for PoCs, scalable assets, new offerings, "
    "client solutions, and strategic innovation initiatives."
)


IC_TREND_SCOUT_PROMPT = """Act as IC Trend Scout, an AI research assistant for the Innovation Center.

Research the topic below and transform it into a structured Innovation Radar entry plus a portfolio of project trends.

Innovation Center context:
{innovation_context}

Analyze:
- What the topic is
- Why it matters now
- Key signals and sources
- Relevant companies, tools, platforms, papers, or repositories
- Possible use cases for the Innovation Center
- Suggested PoCs or experiments
- Risks, limitations, and adoption barriers
- Strategic impact
- Market and client potential
- Execution readiness
- Scalable asset potential
- Project trends that the Innovation Center should consider pursuing

Project trend guidance:
- Generate 3 to 5 concrete project trends derived from the topic, keywords, Innovation Center context, and sources
- Each project trend must be suitable for an Innovation Center backlog, PoC funnel, offering exploration, or scalable asset idea
- Link every project trend to the specific sources that support it
- Classify every project trend into one Innovation Radar ring

Innovation Radar rings:

Adopt:
Mature, strategically relevant, and ready to be seriously used or scaled.

Trial:
Promising and ready for experimentation or PoCs, but not fully proven yet.

Assess:
Relevant and should be monitored or studied before experimentation.

Caution:
High uncertainty, low maturity, relevant risks, or weak fit for the Innovation Center.

Research topic:
{topic}

Related keywords:
{keywords}

Requested time window:
{time_window}

Requested outputs:
{output_types}

User-provided web sources:
{provided_sources}

User-provided local documents:
{provided_documents}

Return ONLY valid JSON with this exact structure:
{{
  "topic": "string",
  "executive_summary": "string",
  "why_it_matters": "string",
  "key_signals": ["string"],
  "relevant_tools_companies_repositories": ["string"],
  "possible_use_cases": ["string"],
  "suggested_pocs": ["string"],
  "risks_and_barriers": ["string"],
  "strategic_impact": 1,
  "market_client_potential": 1,
  "execution_readiness": 1,
  "scalable_asset_potential": 1,
  "recommended_radar_ring": "Adopt | Trial | Assess | Caution",
  "recommended_next_action": "string",
  "tags": ["string"],
  "sources": [
    {{
      "name": "string",
      "url": "string",
      "note": "string"
    }}
  ],
  "source_map": [
    {{
      "name": "string",
      "url": "string",
      "source_type": "web | local_pdf | local_doc | discovered",
      "relevance": "string"
    }}
  ],
  "project_trends": [
    {{
      "trend_name": "string",
      "trend_summary": "string",
      "why_now": "string",
      "innovation_center_fit": "string",
      "evidence": ["string"],
      "linked_source_names": ["string"],
      "linked_source_urls": ["string"],
      "suggested_projects": ["string"],
      "strategic_impact": 1,
      "market_client_potential": 1,
      "execution_readiness": 1,
      "scalable_asset_potential": 1,
      "recommended_radar_ring": "Adopt | Trial | Assess | Caution",
      "recommended_next_step": "string",
      "tags": ["string"]
    }}
  ]
}}"""


class TrendSource(BaseModel):
    source_name: str | None = None
    url: str


class ICTrendScoutRequest(BaseModel):
    topic: str
    context: str = DEFAULT_IC_CONTEXT
    keywords: str = ""
    research_setup_id: str = ""
    research_setup_name: str = ""
    time_window: str = "Last 30 days"
    custom_date_start: date | None = None
    custom_date_end: date | None = None
    output_types: list[str] = Field(default_factory=list)
    sources: list[TrendSource] = Field(default_factory=list)
    local_documents: list[str] = Field(default_factory=list)
    strategic_impact: int | None = None
    market_client_potential: int | None = None
    execution_readiness: int | None = None
    scalable_asset_potential: int | None = None
    max_search_results: int = 5
    schedule_enabled: bool = False
    schedule_interval_days: int = 3
    monitor_name: str = ""


def _normalize_url(url: str) -> str:
    return (url or "").strip()


def _normalize_source_rows(sources: list[TrendSource]) -> list[dict[str, str]]:
    normalized_sources: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    for source in sources:
        url = _normalize_url(source.url)
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        normalized_sources.append(
            {
                "name": (source.source_name or "").strip(),
                "url": url,
            }
        )

    return normalized_sources


def _normalize_local_document_names(documents: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()

    for item in documents:
        name = Path(str(item or "").strip()).name
        if not name or name in seen:
            continue
        seen.add(name)
        normalized.append(name)

    return normalized


def _split_text_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        parts = re.split(r"\n+|;\s*|,\s*(?=[A-Z0-9])", value)
        return [part.strip("- ").strip() for part in parts if part.strip("- ").strip()]
    return []


def _normalize_score(value: Any, fallback: int = 3) -> int:
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        return fallback
    return max(1, min(5, score))


def calculate_final_score(
    strategic_impact: int,
    market_client_potential: int,
    execution_readiness: int,
    scalable_asset_potential: int,
) -> int:
    weighted_score = (
        strategic_impact * 1.5
        + market_client_potential * 2
        + execution_readiness * 2
        + scalable_asset_potential * 1
    )
    final_score = round(((weighted_score - 6.5) / 26) * 100, 0)
    return int(max(0, min(100, final_score)))


def determine_radar_ring(final_score: int) -> str:
    if final_score >= 80:
        return "Adopt"
    if final_score >= 60:
        return "Trial"
    if final_score >= 40:
        return "Assess"
    return "Caution"


def _extract_json_payload(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return json_repair.loads(match.group(0))
        return json_repair.loads(text)


def _unwrap_embedded_json_result(parsed: dict[str, Any], raw_text: str) -> dict[str, Any]:
    executive_summary = str(parsed.get("executive_summary", "")).strip()
    if executive_summary.startswith("{") and '"topic"' in executive_summary:
        try:
            embedded = _extract_json_payload(executive_summary)
            if isinstance(embedded, dict) and embedded.get("topic"):
                return embedded
        except Exception:
            pass

    if len(parsed.keys()) <= 2 and raw_text.strip().startswith("{"):
        try:
            embedded = _extract_json_payload(raw_text)
            if isinstance(embedded, dict) and embedded.get("topic"):
                return embedded
        except Exception:
            pass

    return parsed


def _human_time_window(request: ICTrendScoutRequest) -> str:
    if request.time_window != "Custom date range":
        return request.time_window

    if request.custom_date_start and request.custom_date_end:
        return f"Custom date range: {request.custom_date_start.isoformat()} to {request.custom_date_end.isoformat()}"

    return "Custom date range"


def _provided_sources_text(sources: list[dict[str, str]]) -> str:
    if not sources:
        return "No user-provided sources."

    lines = []
    for source in sources:
        name = source["name"] or "Unnamed source"
        lines.append(f"- {name}: {source['url']}")
    return "\n".join(lines)


def _provided_documents_text(documents: list[str]) -> str:
    if not documents:
        return "No user-provided local documents."
    return "\n".join(f"- {document}" for document in documents)


def _output_types_text(output_types: list[str]) -> str:
    if not output_types:
        return "Radar entry"
    return ", ".join(output_types)


def _build_research_query(request: ICTrendScoutRequest) -> str:
    query_parts = [
        request.topic.strip(),
        "Innovation Center trend scouting analysis",
    ]

    if request.keywords.strip():
        query_parts.append(f"Keywords: {request.keywords.strip()}")

    query_parts.append(f"Time window: {_human_time_window(request)}")
    query_parts.append(f"Output focus: {_output_types_text(request.output_types)}")
    return " | ".join(query_parts)


def _build_custom_prompt(
    request: ICTrendScoutRequest,
    normalized_sources: list[dict[str, str]],
    normalized_documents: list[str],
) -> str:
    return IC_TREND_SCOUT_PROMPT.format(
        innovation_context=request.context.strip() or DEFAULT_IC_CONTEXT,
        topic=request.topic.strip(),
        keywords=request.keywords.strip() or "None provided",
        time_window=_human_time_window(request),
        output_types=_output_types_text(request.output_types),
        provided_sources=_provided_sources_text(normalized_sources),
        provided_documents=_provided_documents_text(normalized_documents),
    )


def _merge_sources(
    parsed_sources: Any,
    provided_sources: list[dict[str, str]],
    discovered_sources: list[dict[str, str]],
) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    def add_source(name: str, url: str, note: str = "") -> None:
        normalized_url = _normalize_url(url)
        if not normalized_url or normalized_url in seen_urls:
            return
        merged.append(
            {
                "name": name.strip() or "Source",
                "url": normalized_url,
                "note": note.strip(),
            }
        )
        seen_urls.add(normalized_url)

    if isinstance(parsed_sources, list):
        for item in parsed_sources:
            if isinstance(item, dict):
                add_source(
                    str(item.get("name", "")),
                    str(item.get("url", "")),
                    str(item.get("note", "")),
                )
            elif isinstance(item, str):
                add_source("Source", item)

    for source in provided_sources:
        add_source(source["name"] or "User source", source["url"], "User-provided source")

    for source in discovered_sources:
        add_source(source.get("name", "Discovered source"), source.get("url", ""), source.get("note", ""))

    return merged


def _build_discovered_sources(research_sources: list[dict[str, Any]], discovered_urls: list[str]) -> list[dict[str, str]]:
    sources_by_url: dict[str, dict[str, str]] = {}

    for item in research_sources or []:
        url = _normalize_url(str(item.get("url", "")))
        if not url:
            continue
        title = str(item.get("title") or item.get("name") or "").strip()
        if url not in sources_by_url:
            sources_by_url[url] = {
                "name": title or "Discovered source",
                "url": url,
                "note": "",
            }

    discovered: list[dict[str, str]] = []
    seen: set[str] = set()
    for url in discovered_urls:
        normalized_url = _normalize_url(url)
        if not normalized_url or normalized_url in seen:
            continue
        seen.add(normalized_url)
        discovered.append(
            sources_by_url.get(
                normalized_url,
                {
                    "name": "Discovered source",
                    "url": normalized_url,
                    "note": "",
                },
            )
        )

    return discovered


def _merge_source_map(
    parsed_source_map: Any,
    merged_sources: list[dict[str, str]],
    local_documents: list[str],
) -> list[dict[str, str]]:
    source_map: list[dict[str, str]] = []
    seen_keys: set[str] = set()

    def add_entry(name: str, url: str, source_type: str, relevance: str = "") -> None:
        normalized_name = str(name or "").strip() or "Source"
        normalized_url = str(url or "").strip()
        key = f"{normalized_name}|{normalized_url}|{source_type}"
        if key in seen_keys:
            return
        seen_keys.add(key)
        source_map.append(
            {
                "name": normalized_name,
                "url": normalized_url,
                "source_type": source_type,
                "relevance": str(relevance or "").strip(),
            }
        )

    if isinstance(parsed_source_map, list):
        for item in parsed_source_map:
            if not isinstance(item, dict):
                continue
            add_entry(
                str(item.get("name", "")),
                str(item.get("url", "")),
                str(item.get("source_type", "web")),
                str(item.get("relevance", "")),
            )

    for source in merged_sources:
        add_entry(source["name"], source["url"], "web", source.get("note", ""))

    for document_name in local_documents:
        add_entry(document_name, document_name, "local_pdf", "User-provided local document")

    return source_map


def _average_int(values: list[int], fallback: int = 3) -> int:
    filtered = [value for value in values if isinstance(value, int)]
    if not filtered:
        return fallback
    return _normalize_score(round(sum(filtered) / len(filtered)), fallback=fallback)


def _normalize_project_trends(
    parsed_trends: Any,
    request: ICTrendScoutRequest,
    merged_sources: list[dict[str, str]],
) -> list[dict[str, Any]]:
    normalized_trends: list[dict[str, Any]] = []

    default_source_names = [source["name"] or source["url"] for source in merged_sources[:3]]
    default_source_urls = [source["url"] for source in merged_sources[:3]]

    if not isinstance(parsed_trends, list):
        parsed_trends = []

    for index, item in enumerate(parsed_trends):
        if not isinstance(item, dict):
            continue

        strategic_impact = _normalize_score(item.get("strategic_impact"), fallback=3)
        market_client_potential = _normalize_score(item.get("market_client_potential"), fallback=3)
        execution_readiness = _normalize_score(item.get("execution_readiness"), fallback=3)
        scalable_asset_potential = _normalize_score(item.get("scalable_asset_potential"), fallback=3)
        final_score = calculate_final_score(
            strategic_impact,
            market_client_potential,
            execution_readiness,
            scalable_asset_potential,
        )

        normalized_trends.append(
            {
                "trend_name": str(item.get("trend_name") or f"Trend opportunity {index + 1}").strip(),
                "trend_summary": str(item.get("trend_summary", "")).strip(),
                "why_now": str(item.get("why_now", "")).strip(),
                "innovation_center_fit": str(item.get("innovation_center_fit", "")).strip(),
                "evidence": _split_text_list(item.get("evidence")),
                "linked_source_names": _split_text_list(item.get("linked_source_names")) or default_source_names,
                "linked_source_urls": _split_text_list(item.get("linked_source_urls")) or default_source_urls,
                "suggested_projects": _split_text_list(item.get("suggested_projects")),
                "scores": {
                    "strategic_impact": strategic_impact,
                    "market_client_potential": market_client_potential,
                    "execution_readiness": execution_readiness,
                    "scalable_asset_potential": scalable_asset_potential,
                    "final_score": final_score,
                },
                "radar_ring": determine_radar_ring(final_score),
                "recommended_next_step": str(item.get("recommended_next_step", "")).strip(),
                "tags": _split_text_list(item.get("tags") or request.keywords),
            }
        )

    if normalized_trends:
        return normalized_trends

    strategic_impact = _normalize_score(request.strategic_impact, fallback=3)
    market_client_potential = _normalize_score(request.market_client_potential, fallback=3)
    execution_readiness = _normalize_score(request.execution_readiness, fallback=3)
    scalable_asset_potential = _normalize_score(request.scalable_asset_potential, fallback=3)
    final_score = calculate_final_score(
        strategic_impact,
        market_client_potential,
        execution_readiness,
        scalable_asset_potential,
    )

    return [
        {
            "trend_name": request.topic.strip(),
            "trend_summary": "Fallback trend generated from the top-level analysis.",
            "why_now": request.context.strip() or DEFAULT_IC_CONTEXT,
            "innovation_center_fit": "Requires manual review because structured trend extraction was not returned.",
            "evidence": [],
            "linked_source_names": default_source_names,
            "linked_source_urls": default_source_urls,
            "suggested_projects": [],
            "scores": {
                "strategic_impact": strategic_impact,
                "market_client_potential": market_client_potential,
                "execution_readiness": execution_readiness,
                "scalable_asset_potential": scalable_asset_potential,
                "final_score": final_score,
            },
            "radar_ring": determine_radar_ring(final_score),
            "recommended_next_step": "Review the raw report and run a second pass with tighter source selection.",
            "tags": _split_text_list(request.keywords),
        }
    ]


def _resolve_top_level_scores(
    request: ICTrendScoutRequest,
    parsed: dict[str, Any],
    project_trends: list[dict[str, Any]],
) -> dict[str, int]:
    trend_scores = [trend["scores"] for trend in project_trends]

    strategic_impact = _normalize_score(
        request.strategic_impact
        if request.strategic_impact is not None
        else parsed.get("strategic_impact"),
        fallback=_average_int([score["strategic_impact"] for score in trend_scores], fallback=3),
    )
    market_client_potential = _normalize_score(
        request.market_client_potential
        if request.market_client_potential is not None
        else parsed.get("market_client_potential"),
        fallback=_average_int([score["market_client_potential"] for score in trend_scores], fallback=3),
    )
    execution_readiness = _normalize_score(
        request.execution_readiness
        if request.execution_readiness is not None
        else parsed.get("execution_readiness"),
        fallback=_average_int([score["execution_readiness"] for score in trend_scores], fallback=3),
    )
    scalable_asset_potential = _normalize_score(
        request.scalable_asset_potential
        if request.scalable_asset_potential is not None
        else parsed.get("scalable_asset_potential"),
        fallback=_average_int([score["scalable_asset_potential"] for score in trend_scores], fallback=3),
    )

    return {
        "strategic_impact": strategic_impact,
        "market_client_potential": market_client_potential,
        "execution_readiness": execution_readiness,
        "scalable_asset_potential": scalable_asset_potential,
    }


def _truncate_document_text(value: str, limit: int = 6000) -> str:
    normalized = re.sub(r"\s+", " ", value or "").strip()
    return normalized[:limit]


async def _load_local_document_context(
    document_root: str | Path | None,
    documents: list[str],
) -> tuple[list[str], str]:
    normalized_documents = _normalize_local_document_names(documents)
    if not document_root or not normalized_documents:
        return normalized_documents, ""

    root = Path(document_root).expanduser().resolve()
    selected_paths: list[str] = []

    for document_name in normalized_documents:
        candidate = (root / document_name).resolve()
        if root not in candidate.parents and candidate != root:
            continue
        if candidate.exists() and candidate.is_file():
            selected_paths.append(str(candidate))

    if not selected_paths:
        return normalized_documents, ""

    try:
        loaded_documents = await DocumentLoader(selected_paths).load()
    except Exception:
        return normalized_documents, ""

    snippets: list[str] = []
    for item in loaded_documents[:12]:
        doc_name = str(item.get("url", "document")).strip()
        raw_content = _truncate_document_text(str(item.get("raw_content", "")))
        if raw_content:
            snippets.append(f"Document: {doc_name}\n{raw_content}")

    if not snippets:
        return normalized_documents, ""

    return normalized_documents, "\n\n".join(snippets)


def _fallback_result(
    request: ICTrendScoutRequest,
    raw_report: str,
    provided_sources: list[dict[str, str]],
    discovered_sources: list[dict[str, str]],
    local_documents: list[str],
) -> dict[str, Any]:
    strategic_impact = _normalize_score(request.strategic_impact, fallback=3)
    market_client_potential = _normalize_score(request.market_client_potential, fallback=3)
    execution_readiness = _normalize_score(request.execution_readiness, fallback=3)
    scalable_asset_potential = _normalize_score(request.scalable_asset_potential, fallback=3)
    final_score = calculate_final_score(
        strategic_impact,
        market_client_potential,
        execution_readiness,
        scalable_asset_potential,
    )
    radar_ring = determine_radar_ring(final_score)
    merged_sources = _merge_sources([], provided_sources, discovered_sources)
    project_trends = _normalize_project_trends([], request, merged_sources)

    return {
        "topic": request.topic.strip(),
        "executive_summary": raw_report.strip(),
        "why_it_matters": request.context.strip() or DEFAULT_IC_CONTEXT,
        "key_signals": [],
        "relevant_tools_companies_repositories": [],
        "possible_use_cases": [],
        "suggested_pocs": [],
        "risks_and_barriers": [],
        "scores": {
            "strategic_impact": strategic_impact,
            "market_client_potential": market_client_potential,
            "execution_readiness": execution_readiness,
            "scalable_asset_potential": scalable_asset_potential,
            "final_score": final_score,
        },
        "radar_ring": radar_ring,
        "recommended_next_action": "Review the generated analysis and refine the source set for a second pass.",
        "tags": _split_text_list(request.keywords),
        "sources": merged_sources,
        "source_map": _merge_source_map([], merged_sources, local_documents),
        "project_trends": project_trends,
        "local_documents": local_documents,
        "raw_report": raw_report,
    }


async def run_ic_trend_scout_research(
    request: ICTrendScoutRequest,
    document_root: str | Path | None = None,
) -> dict[str, Any]:
    normalized_sources = _normalize_source_rows(request.sources)
    source_urls = [source["url"] for source in normalized_sources]
    normalized_documents, local_documents_context = await _load_local_document_context(
        document_root,
        request.local_documents,
    )
    custom_prompt = _build_custom_prompt(request, normalized_sources, normalized_documents)
    query = _build_research_query(request)

    researcher = GPTResearcher(
        query=query,
        report_type=ReportType.DeepResearch.value,
        report_source=ReportSource.Web.value,
        tone=Tone.Analytical,
        source_urls=source_urls or None,
        complement_source_urls=True,
        verbose=False,
    )
    researcher.cfg.max_search_results_per_query = int(max(1, min(20, request.max_search_results)))

    await researcher.conduct_research()
    research_context = researcher.get_research_context()
    combined_context = "\n\n".join(research_context) if isinstance(research_context, list) else str(research_context)
    if local_documents_context:
        combined_context = f"{combined_context}\n\n{local_documents_context}".strip()
    raw_report = await researcher.write_report(
        custom_prompt=custom_prompt,
        ext_context=combined_context or None,
    )
    discovered_urls = researcher.get_source_urls()
    discovered_sources = _build_discovered_sources(researcher.get_research_sources(), discovered_urls)

    try:
        parsed = _unwrap_embedded_json_result(_extract_json_payload(raw_report), raw_report)
    except Exception:
        return _fallback_result(
            request,
            raw_report,
            normalized_sources,
            discovered_sources,
            normalized_documents,
        )

    merged_sources = _merge_sources(parsed.get("sources"), normalized_sources, discovered_sources)
    project_trends = _normalize_project_trends(parsed.get("project_trends"), request, merged_sources)
    top_level_scores = _resolve_top_level_scores(request, parsed, project_trends)
    final_score = calculate_final_score(
        top_level_scores["strategic_impact"],
        top_level_scores["market_client_potential"],
        top_level_scores["execution_readiness"],
        top_level_scores["scalable_asset_potential"],
    )
    radar_ring = determine_radar_ring(final_score)

    return {
        "topic": str(parsed.get("topic") or request.topic).strip(),
        "executive_summary": str(parsed.get("executive_summary", "")).strip(),
        "why_it_matters": str(parsed.get("why_it_matters", "")).strip(),
        "key_signals": _split_text_list(parsed.get("key_signals")),
        "relevant_tools_companies_repositories": _split_text_list(
            parsed.get("relevant_tools_companies_repositories")
        ),
        "possible_use_cases": _split_text_list(parsed.get("possible_use_cases")),
        "suggested_pocs": _split_text_list(parsed.get("suggested_pocs")),
        "risks_and_barriers": _split_text_list(parsed.get("risks_and_barriers")),
        "scores": {
            **top_level_scores,
            "final_score": final_score,
        },
        "radar_ring": radar_ring,
        "recommended_next_action": str(parsed.get("recommended_next_action", "")).strip(),
        "tags": _split_text_list(parsed.get("tags") or request.keywords),
        "sources": merged_sources,
        "source_map": _merge_source_map(parsed.get("source_map"), merged_sources, normalized_documents),
        "project_trends": project_trends,
        "local_documents": normalized_documents,
        "raw_report": raw_report,
    }
