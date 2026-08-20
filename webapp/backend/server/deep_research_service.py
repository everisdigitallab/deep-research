import json
import re
from pathlib import Path
from typing import Any, Literal

import json_repair
from langchain_core.documents import Document
from pydantic import BaseModel, Field

from backend.report_type import DetailedReport
from gpt_researcher import GPTResearcher
from gpt_researcher.config.config import Config
from gpt_researcher.document.document import DocumentLoader
from gpt_researcher.utils.enum import ReportSource, ReportType, Tone
from gpt_researcher.utils.llm import create_chat_completion


DEFAULT_STRUCTURED_OUTPUT_SCHEMA = {
    "topic": "string",
    "executive_summary": "string",
    "key_findings": ["string"],
    "recommended_actions": ["string"],
    "risks": ["string"],
    "sources": [
        {
            "url": "string",
            "type": "web | document",
            "reason": "string",
        }
    ],
}


class DeepResearchServiceRequest(BaseModel):
    task: str
    response_mode: Literal["report", "structured", "hybrid"] = "report"
    report_type: str = ReportType.DeepResearch.value
    report_source: str = ReportSource.Web.value
    tone: str = Tone.Objective.name
    source_urls: list[str] = Field(default_factory=list)
    document_urls: list[str] = Field(default_factory=list)
    local_documents: list[str] = Field(default_factory=list)
    query_domains: list[str] = Field(default_factory=list)
    headers: dict[str, Any] | None = None
    max_search_results: int | None = None
    complement_source_urls: bool = True
    structured_output_instructions: str = ""
    structured_output_schema: dict[str, Any] | list[Any] | None = None
    include_research_context: bool = True
    save_run: bool = True
    run_name: str = ""


class SimpleDeepResearchChatRequest(BaseModel):
    message: str
    save_run: bool = True


def _normalize_text_list(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for item in values:
        value = str(item or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _resolve_tone(value: str) -> Tone:
    normalized = str(value or "").strip()
    for tone in Tone:
        if normalized == tone.name or normalized == tone.value:
            return tone
    supported = ", ".join(tone.name for tone in Tone)
    raise ValueError(f"Unsupported tone '{value}'. Supported values: {supported}")


def _resolve_report_source(value: str) -> str:
    normalized = str(value or "").strip().lower()
    supported = {item.value for item in ReportSource}
    if normalized not in supported:
        raise ValueError(f"Unsupported report_source '{value}'. Supported values: {', '.join(sorted(supported))}")
    return normalized


def _resolve_report_type(value: str) -> str:
    normalized = str(value or "").strip()
    supported = {item.value for item in ReportType}
    if normalized not in supported:
        raise ValueError(f"Unsupported report_type '{value}'. Supported values: {', '.join(sorted(supported))}")
    return normalized


def _resolve_local_document_paths(local_documents: list[str], document_root: str) -> list[Path]:
    base = Path(document_root).resolve()
    resolved_paths: list[Path] = []
    seen: set[Path] = set()

    for item in _normalize_text_list(local_documents):
        candidate = (base / Path(item).name).resolve()
        if not str(candidate).startswith(str(base)):
            raise ValueError(f"Local document '{item}' is outside DOC_PATH")
        if not candidate.exists():
            raise ValueError(f"Local document '{item}' was not found in {document_root}")
        if candidate in seen:
            continue
        seen.add(candidate)
        resolved_paths.append(candidate)

    return resolved_paths


async def _load_local_documents(local_paths: list[Path]) -> list[Document]:
    if not local_paths:
        return []
    loaded_documents = await DocumentLoader([str(path) for path in local_paths]).load()
    return [
        Document(page_content=item.get("raw_content", ""), metadata={"title": item.get("url", "")})
        for item in loaded_documents
        if item.get("raw_content")
    ]


def _build_local_document_context(documents: list[Document], max_documents: int = 4, max_chars: int = 3200) -> str:
    if not documents:
        return "No local documents were provided."

    snippets: list[str] = []
    for document in documents[:max_documents]:
        title = document.metadata.get("title", "document")
        content = re.sub(r"\s+", " ", document.page_content).strip()
        if len(content) > max_chars:
            content = content[:max_chars].rstrip() + "..."
        snippets.append(f"Document: {title}\n{content}")

    return "\n\n".join(snippets)


def _extract_json_payload(text: str) -> Any:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    fenced_match = re.search(r"```(?:json)?\s*(\{.*\}|\[.*\])\s*```", text, re.DOTALL)
    if fenced_match:
        return json_repair.loads(fenced_match.group(1))

    object_match = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
    if object_match:
        return json_repair.loads(object_match.group(1))

    return json_repair.loads(text)


async def _run_standard_research(
    request: DeepResearchServiceRequest,
    *,
    local_documents: list[Document],
) -> tuple[str, GPTResearcher]:
    report_type = _resolve_report_type(request.report_type)
    report_source = _resolve_report_source(request.report_source)
    tone = _resolve_tone(request.tone)

    source_urls = _normalize_text_list(request.source_urls)
    document_urls = _normalize_text_list(request.document_urls)
    query_domains = _normalize_text_list(request.query_domains)
    headers = request.headers or {}

    if report_type == ReportType.DetailedReport.value:
        if local_documents:
            raise ValueError("detailed_report with selected local_documents is not supported yet. Use report_type 'deep' or 'research_report'.")
        detailed_report = DetailedReport(
            query=request.task.strip(),
            report_type=report_type,
            report_source=report_source,
            source_urls=source_urls,
            document_urls=document_urls,
            query_domains=query_domains,
            config_path="default",
            tone=tone,
            websocket=None,
            headers=headers,
            complement_source_urls=bool(request.complement_source_urls),
            max_search_results=request.max_search_results,
        )
        report = await detailed_report.run()
        return report, detailed_report.gpt_researcher

    effective_report_source = report_source
    researcher_kwargs: dict[str, Any] = {
        "query": request.task.strip(),
        "report_type": report_type,
        "report_source": report_source,
        "tone": tone,
        "source_urls": source_urls or None,
        "document_urls": document_urls or None,
        "query_domains": query_domains,
        "headers": headers,
        "config_path": "default",
        "complement_source_urls": bool(request.complement_source_urls),
    }

    if local_documents:
        if report_source == ReportSource.Local.value:
            effective_report_source = ReportSource.LangChainDocuments.value
            researcher_kwargs["report_source"] = effective_report_source
            researcher_kwargs["documents"] = local_documents
            researcher_kwargs["source_urls"] = None
            researcher_kwargs["document_urls"] = None
        elif report_source == ReportSource.Hybrid.value and not document_urls:
            effective_report_source = ReportSource.Web.value
            researcher_kwargs["report_source"] = effective_report_source

    researcher = GPTResearcher(**researcher_kwargs)
    if request.max_search_results is not None:
        researcher.cfg.max_search_results_per_query = int(max(1, request.max_search_results))

    await researcher.conduct_research()
    report = await researcher.write_report()
    return report, researcher


async def _merge_report_with_local_documents(
    *,
    task: str,
    report: str,
    local_documents: list[Document],
) -> str:
    if not local_documents:
        return report

    cfg = Config()
    local_document_context = _build_local_document_context(local_documents)
    prompt = f"""You are preparing the final response for a reusable deep research service.

Research task:
{task}

Web or remote-source research report:
{report}

Selected local documents:
{local_document_context}

Instructions:
- Merge the local-document evidence into the final report
- Preserve the clarity and structure of the original report
- Explicitly mention when a point is supported by the local documents
- Keep the answer in markdown
- Do not invent citations or sources that are not present in the material above
"""

    return await create_chat_completion(
        messages=[
            {"role": "system", "content": "You combine deep research findings into one grounded report."},
            {"role": "user", "content": prompt},
        ],
        model=cfg.smart_llm_model,
        llm_provider=cfg.smart_llm_provider,
        llm_kwargs=cfg.llm_kwargs,
        max_tokens=cfg.smart_token_limit,
        temperature=0,
    )


async def _build_structured_output(
    request: DeepResearchServiceRequest,
    *,
    report: str,
    local_documents: list[Document],
    source_urls: list[str],
    visited_urls: list[str],
) -> Any:
    cfg = Config()
    target_schema = request.structured_output_schema or DEFAULT_STRUCTURED_OUTPUT_SCHEMA
    local_document_context = _build_local_document_context(local_documents, max_documents=3, max_chars=1800)
    formatting_instructions = request.structured_output_instructions.strip() or (
        "Keep the output concise, decision-ready, and grounded in the research findings."
    )

    prompt = f"""You are formatting the output of a deep research service for another application.

Research task:
{request.task}

Requested formatting instructions:
{formatting_instructions}

Target JSON schema or example shape:
{json.dumps(target_schema, indent=2)}

Source URLs discovered or forced into the run:
{json.dumps({"source_urls": source_urls, "visited_urls": visited_urls}, indent=2)}

Selected local documents:
{local_document_context}

Research report:
{report}

Instructions:
- Return only valid JSON
- Follow the target schema keys and nesting exactly
- If a field cannot be fully populated, return an empty string, empty list, or null as appropriate
- Do not wrap the JSON in markdown fences
"""

    structured_text = await create_chat_completion(
        messages=[
            {"role": "system", "content": "You convert research reports into strict JSON outputs."},
            {"role": "user", "content": prompt},
        ],
        model=cfg.smart_llm_model,
        llm_provider=cfg.smart_llm_provider,
        llm_kwargs=cfg.llm_kwargs,
        max_tokens=cfg.smart_token_limit,
        temperature=0,
    )
    return _extract_json_payload(structured_text)


async def run_deep_research_service(
    request: DeepResearchServiceRequest,
    *,
    document_root: str,
) -> dict[str, Any]:
    local_paths = _resolve_local_document_paths(request.local_documents, document_root)
    local_documents = await _load_local_documents(local_paths)

    report, researcher = await _run_standard_research(
        request,
        local_documents=local_documents,
    )

    if local_documents and _resolve_report_source(request.report_source) != ReportSource.Local.value:
        report = await _merge_report_with_local_documents(
            task=request.task.strip(),
            report=report,
            local_documents=local_documents,
        )

    source_urls = researcher.get_source_urls()
    visited_urls = list(researcher.visited_urls)
    structured_output = None

    if request.response_mode in {"structured", "hybrid"}:
        structured_output = await _build_structured_output(
            request,
            report=report,
            local_documents=local_documents,
            source_urls=source_urls,
            visited_urls=visited_urls,
        )

    research_context = researcher.get_research_context() if request.include_research_context else []

    return {
        "task": request.task.strip(),
        "run_name": request.run_name.strip(),
        "response_mode": request.response_mode,
        "report_type": request.report_type,
        "report_source": request.report_source,
        "output": {
            "report": report if request.response_mode in {"report", "hybrid"} else None,
            "structured_data": structured_output,
            "format": "json" if request.response_mode == "structured" else "markdown+json" if request.response_mode == "hybrid" else "markdown",
        },
        "research": {
            "source_urls": source_urls,
            "visited_urls": visited_urls,
            "research_images": researcher.get_research_images(),
            "research_costs": researcher.get_costs(),
            "context_items": research_context,
            "local_documents_used": [path.name for path in local_paths],
        },
    }


def build_simple_chat_request(request: SimpleDeepResearchChatRequest) -> DeepResearchServiceRequest:
    return DeepResearchServiceRequest(
        task=request.message.strip(),
        response_mode="report",
        report_type=ReportType.DeepResearch.value,
        report_source=ReportSource.Web.value,
        tone=Tone.Objective.name,
        source_urls=[],
        document_urls=[],
        local_documents=[],
        query_domains=[],
        headers={},
        max_search_results=5,
        complement_source_urls=True,
        structured_output_instructions="",
        structured_output_schema=None,
        include_research_context=True,
        save_run=bool(request.save_run),
        run_name="Simple chat request",
    )
