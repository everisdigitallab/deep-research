from pathlib import Path
from typing import Any

from gpt_researcher import GPTResearcher
from gpt_researcher.utils.enum import ReportSource, ReportType, Tone

from server.ic_trend_scout import (
    DEFAULT_IC_CONTEXT,
    ICTrendScoutRequest,
    _build_research_query,
    _build_discovered_sources,
    _extract_json_payload,
    _load_local_document_context,
    _merge_source_map,
    _merge_sources,
    _normalize_score,
    _normalize_source_rows,
    _resolve_top_level_scores,
    _split_text_list,
    _unwrap_embedded_json_result,
    calculate_final_score,
    determine_radar_ring,
)


IC_TECHNOLOGY_RADAR_PROMPT = """Act as Innovation Center Technology Radar, inspired by the Thoughtworks Technology Radar format.

Your job is to study the research topic, the Innovation Center context, the curated sources, and the local documents, then produce a radar of trends the Innovation Center should monitor.

Innovation Center context:
{innovation_context}

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

Instructions:
- Generate 6 to 12 radar entries
- Each entry may represent a trend, technology, capability, discipline, platform, or emerging topic
- Every entry must be relevant to the Innovation Center and tied to evidence from sources
- Link each entry to the supporting sources by name and URL
- Assign each entry to one radar ring:
  - Adopt
  - Trial
  - Assess
  - Caution
- Assign each entry to one quadrant:
  - Techniques
  - Tools
  - Platforms
  - Languages & Frameworks
- Translate each radar entry into concrete project opportunities or experiments the Innovation Center could pursue

Scoring dimensions:
- Strategic Impact
- Market & Client Potential
- Execution Readiness
- Scalable Asset Potential

Return ONLY valid JSON with this exact structure:
{{
  "topic": "string",
  "executive_summary": "string",
  "why_it_matters": "string",
  "radar_story": "string",
  "key_signals": ["string"],
  "priority_moves": ["string"],
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
  "radar_entries": [
    {{
      "name": "string",
      "entry_type": "trend | technology | capability | discipline | platform | topic",
      "quadrant": "Techniques | Tools | Platforms | Languages & Frameworks",
      "ring": "Adopt | Trial | Assess | Caution",
      "summary": "string",
      "why_relevant": "string",
      "innovation_center_relevance": "string",
      "project_opportunities": ["string"],
      "signals": ["string"],
      "linked_source_names": ["string"],
      "linked_source_urls": ["string"],
      "strategic_impact": 1,
      "market_client_potential": 1,
      "execution_readiness": 1,
      "scalable_asset_potential": 1,
      "recommended_action": "string",
      "risks": ["string"],
      "tags": ["string"]
    }}
  ]
}}"""


def _provided_sources_text(sources: list[dict[str, str]]) -> str:
    if not sources:
        return "No user-provided sources."
    return "\n".join(f"- {source['name'] or 'Unnamed source'}: {source['url']}" for source in sources)


def _provided_documents_text(documents: list[str]) -> str:
    if not documents:
        return "No user-provided local documents."
    return "\n".join(f"- {document}" for document in documents)


def _human_time_window(request: ICTrendScoutRequest) -> str:
    if request.time_window != "Custom date range":
        return request.time_window
    if request.custom_date_start and request.custom_date_end:
        return f"Custom date range: {request.custom_date_start.isoformat()} to {request.custom_date_end.isoformat()}"
    return "Custom date range"


def _output_types_text(output_types: list[str]) -> str:
    if not output_types:
        return "Technology radar"
    return ", ".join(output_types)


def _build_custom_prompt(
    request: ICTrendScoutRequest,
    normalized_sources: list[dict[str, str]],
    normalized_documents: list[str],
) -> str:
    return IC_TECHNOLOGY_RADAR_PROMPT.format(
        innovation_context=request.context.strip() or DEFAULT_IC_CONTEXT,
        topic=request.topic.strip(),
        keywords=request.keywords.strip() or "None provided",
        time_window=_human_time_window(request),
        output_types=_output_types_text(request.output_types),
        provided_sources=_provided_sources_text(normalized_sources),
        provided_documents=_provided_documents_text(normalized_documents),
    )


def _normalize_quadrant(value: Any) -> str:
    allowed = {
        "techniques": "Techniques",
        "tools": "Tools",
        "platforms": "Platforms",
        "languages & frameworks": "Languages & Frameworks",
        "languages and frameworks": "Languages & Frameworks",
        "frameworks": "Languages & Frameworks",
    }
    normalized = str(value or "").strip().lower()
    return allowed.get(normalized, "Techniques")


def _normalize_radar_entries(
    parsed_entries: Any,
    request: ICTrendScoutRequest,
    merged_sources: list[dict[str, str]],
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    default_source_names = [source["name"] or source["url"] for source in merged_sources[:3]]
    default_source_urls = [source["url"] for source in merged_sources[:3]]

    if not isinstance(parsed_entries, list):
        parsed_entries = []

    for index, item in enumerate(parsed_entries):
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
        ring = str(item.get("ring") or "").strip() or determine_radar_ring(final_score)
        if ring not in {"Adopt", "Trial", "Assess", "Caution"}:
            ring = determine_radar_ring(final_score)

        entries.append(
            {
                "name": str(item.get("name") or f"Radar entry {index + 1}").strip(),
                "entry_type": str(item.get("entry_type") or "trend").strip(),
                "quadrant": _normalize_quadrant(item.get("quadrant")),
                "ring": ring,
                "summary": str(item.get("summary", "")).strip(),
                "why_relevant": str(item.get("why_relevant", "")).strip(),
                "innovation_center_relevance": str(item.get("innovation_center_relevance", "")).strip(),
                "project_opportunities": _split_text_list(item.get("project_opportunities")),
                "signals": _split_text_list(item.get("signals")),
                "linked_source_names": _split_text_list(item.get("linked_source_names")) or default_source_names,
                "linked_source_urls": _split_text_list(item.get("linked_source_urls")) or default_source_urls,
                "scores": {
                    "strategic_impact": strategic_impact,
                    "market_client_potential": market_client_potential,
                    "execution_readiness": execution_readiness,
                    "scalable_asset_potential": scalable_asset_potential,
                    "final_score": final_score,
                },
                "recommended_action": str(item.get("recommended_action", "")).strip(),
                "risks": _split_text_list(item.get("risks")),
                "tags": _split_text_list(item.get("tags") or request.keywords),
            }
        )

    if entries:
        return entries

    return [
        {
            "name": request.topic.strip(),
            "entry_type": "trend",
            "quadrant": "Techniques",
            "ring": determine_radar_ring(calculate_final_score(3, 3, 3, 3)),
            "summary": "Fallback radar entry generated from the top-level analysis.",
            "why_relevant": request.context.strip() or DEFAULT_IC_CONTEXT,
            "innovation_center_relevance": "Requires manual review because structured radar entries were not returned.",
            "project_opportunities": [],
            "signals": [],
            "linked_source_names": default_source_names,
            "linked_source_urls": default_source_urls,
            "scores": {
                "strategic_impact": 3,
                "market_client_potential": 3,
                "execution_readiness": 3,
                "scalable_asset_potential": 3,
                "final_score": calculate_final_score(3, 3, 3, 3),
            },
            "recommended_action": "Review the source set and run another pass with narrower criteria.",
            "risks": [],
            "tags": _split_text_list(request.keywords),
        }
    ]


def _group_counts(entries: list[dict[str, Any]], field: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for entry in entries:
        key = str(entry.get(field) or "Unknown")
        counts[key] = counts.get(key, 0) + 1
    return counts


def _fallback_result(
    request: ICTrendScoutRequest,
    raw_report: str,
    provided_sources: list[dict[str, str]],
    discovered_sources: list[dict[str, str]],
    local_documents: list[str],
) -> dict[str, Any]:
    merged_sources = _merge_sources([], provided_sources, discovered_sources)
    entries = _normalize_radar_entries([], request, merged_sources)
    top_level_scores = _resolve_top_level_scores(request, {}, entries)
    final_score = calculate_final_score(
        top_level_scores["strategic_impact"],
        top_level_scores["market_client_potential"],
        top_level_scores["execution_readiness"],
        top_level_scores["scalable_asset_potential"],
    )
    return {
        "topic": request.topic.strip(),
        "executive_summary": raw_report.strip(),
        "why_it_matters": request.context.strip() or DEFAULT_IC_CONTEXT,
        "radar_story": raw_report.strip(),
        "key_signals": [],
        "priority_moves": [],
        "scores": {**top_level_scores, "final_score": final_score},
        "radar_ring": determine_radar_ring(final_score),
        "radar_entries": entries,
        "sources": merged_sources,
        "source_map": _merge_source_map([], merged_sources, local_documents),
        "ring_counts": _group_counts(entries, "ring"),
        "quadrant_counts": _group_counts(entries, "quadrant"),
        "raw_report": raw_report,
    }


async def run_ic_technology_radar_research(
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
        query=f"{query} | Technology radar mapping",
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
    radar_entries = _normalize_radar_entries(parsed.get("radar_entries"), request, merged_sources)
    top_level_scores = _resolve_top_level_scores(request, parsed, radar_entries)
    final_score = calculate_final_score(
        top_level_scores["strategic_impact"],
        top_level_scores["market_client_potential"],
        top_level_scores["execution_readiness"],
        top_level_scores["scalable_asset_potential"],
    )

    return {
        "topic": str(parsed.get("topic") or request.topic).strip(),
        "executive_summary": str(parsed.get("executive_summary", "")).strip(),
        "why_it_matters": str(parsed.get("why_it_matters", "")).strip(),
        "radar_story": str(parsed.get("radar_story", "")).strip(),
        "key_signals": _split_text_list(parsed.get("key_signals")),
        "priority_moves": _split_text_list(parsed.get("priority_moves")),
        "scores": {**top_level_scores, "final_score": final_score},
        "radar_ring": determine_radar_ring(final_score),
        "radar_entries": radar_entries,
        "sources": merged_sources,
        "source_map": _merge_source_map(parsed.get("source_map"), merged_sources, normalized_documents),
        "ring_counts": _group_counts(radar_entries, "ring"),
        "quadrant_counts": _group_counts(radar_entries, "quadrant"),
        "raw_report": raw_report,
    }
