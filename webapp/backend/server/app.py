import asyncio
import hashlib
import json
import os
from typing import Dict, List, Any
import time
import logging
import sys
import warnings
from pathlib import Path
from datetime import datetime, timedelta, timezone

# Suppress Pydantic V2 migration warnings
warnings.filterwarnings("ignore", message="Valid config keys have changed in V2")
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, File, UploadFile, BackgroundTasks, HTTPException
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from pydantic import BaseModel, ConfigDict

# Add the parent directory to sys.path to make sure we can import from server
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from server.websocket_manager import WebSocketManager
from server.server_utils import (
    get_config_dict, sanitize_filename,
    update_environment_variables, handle_file_upload, handle_file_deletion,
    execute_multi_agents, handle_websocket_communication
)
from server.agent_discovery import build_agent_discovery_document
from server.deep_research_service import (
    DeepResearchServiceRequest,
    SimpleDeepResearchChatRequest,
    build_simple_chat_request,
    run_deep_research_service,
)
from server.ic_technology_radar import run_ic_technology_radar_research
from server.ic_trend_scout import ICTrendScoutRequest, run_ic_trend_scout_research

from server.websocket_manager import run_agent
from utils import write_md_to_word, write_md_to_pdf
from gpt_researcher.utils.enum import Tone
from chat.chat import ChatAgentWithMemory

from server.report_store import ReportStore

# MongoDB services removed - no database persistence needed

# Setup logging
logger = logging.getLogger(__name__)

# Don't override parent logger settings
logger.propagate = True

# Silence uvicorn reload logs
logging.getLogger("uvicorn.supervisors.ChangeReload").setLevel(logging.WARNING)

# Models


class ResearchRequest(BaseModel):
    task: str
    report_type: str
    report_source: str
    tone: str
    headers: dict | None = None
    repo_name: str
    branch_name: str
    generate_in_background: bool = True


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="allow")  # Allow extra fields in the request
    
    report: str
    messages: List[Dict[str, Any]]


class RadarSetupRequest(BaseModel):
    name: str
    topic: str
    context: str = ""
    keywords: str = ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs("outputs", exist_ok=True)
    os.makedirs(DOC_PATH, exist_ok=True)
    app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")
    
    # Mount frontend static files
    frontend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")
    if os.path.exists(frontend_path):
        app.mount("/site", StaticFiles(directory=frontend_path), name="frontend")
        logger.debug(f"Frontend mounted from: {frontend_path}")
        
        # Also mount the static directory directly for assets referenced as /static/
        static_path = os.path.join(frontend_path, "static")
        if os.path.exists(static_path):
            app.mount("/static", StaticFiles(directory=static_path), name="static")
            logger.debug(f"Static assets mounted from: {static_path}")
    else:
        logger.warning(f"Frontend directory not found: {frontend_path}")
    
    app.state.ic_trend_scheduler_task = asyncio.create_task(_run_ic_trend_scheduler())
    logger.info("GPT Researcher API ready - local mode (no database persistence)")
    yield
    # Shutdown
    scheduler_task = getattr(app.state, "ic_trend_scheduler_task", None)
    if scheduler_task:
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass
    logger.info("Research API shutting down")

# App initialization
app = FastAPI(lifespan=lifespan)

# Configure allowed origins for CORS
allowed_origins_env = os.getenv("CORS_ALLOW_ORIGINS")
ALLOWED_ORIGINS = (
    [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
    if allowed_origins_env
    else [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://app.gptr.dev",
    ]
)

# Standard JSON response - no custom MongoDB encoding needed

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Use default JSON response class

# Mount static files for frontend
# Get the absolute path to the frontend directory
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))

# Mount static directories
app.mount("/static", StaticFiles(directory=os.path.join(frontend_dir, "static")), name="static")
app.mount("/site", StaticFiles(directory=frontend_dir), name="site")

# WebSocket manager
manager = WebSocketManager()

report_store = ReportStore(Path(os.getenv('REPORT_STORE_PATH', os.path.join('data', 'reports.json'))))
trend_monitor_store = ReportStore(
    Path(os.getenv("IC_TREND_MONITOR_STORE_PATH", os.path.join("data", "ic_trend_monitors.json")))
)
radar_setup_store = ReportStore(
    Path(os.getenv("IC_RADAR_SETUP_STORE_PATH", os.path.join("data", "ic_radar_setups.json")))
)
radar_board_store = ReportStore(
    Path(os.getenv("IC_RADAR_BOARD_STORE_PATH", os.path.join("data", "ic_radar_boards.json")))
)

# Constants
DOC_PATH = os.getenv("DOC_PATH", "./my-docs")
IC_TREND_SCHEDULER_POLL_SECONDS = int(os.getenv("IC_TREND_SCHEDULER_POLL_SECONDS", "300"))


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _isoformat_utc(value: datetime | None = None) -> str:
    return (value or _utc_now()).isoformat().replace("+00:00", "Z")


def _parse_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _build_monitor_name(request: ICTrendScoutRequest) -> str:
    return (request.monitor_name or "").strip() or f"{request.topic.strip()} monitor"


def _build_next_run_at(interval_days: int, base_time: datetime | None = None) -> str:
    now = base_time or _utc_now()
    safe_days = max(1, int(interval_days))
    return _isoformat_utc(now + timedelta(days=safe_days))


def _normalize_setup_text(value: str) -> str:
    return " ".join(str(value or "").strip().split())


def _build_radar_setup_snapshot(request: ICTrendScoutRequest) -> dict[str, Any]:
    return {
        "research_setup_id": (request.research_setup_id or "").strip(),
        "research_setup_name": (request.research_setup_name or "").strip(),
        "topic": request.topic.strip(),
        "context": request.context.strip(),
        "keywords": request.keywords.strip(),
        "time_window": request.time_window,
        "custom_date_start": request.custom_date_start.isoformat() if request.custom_date_start else None,
        "custom_date_end": request.custom_date_end.isoformat() if request.custom_date_end else None,
        "sources": request.model_dump(mode="json").get("sources", []),
        "local_documents": request.local_documents,
        "output_types": request.output_types,
        "max_search_results": request.max_search_results,
    }


def _build_radar_setup_fingerprint(setup_snapshot: dict[str, Any]) -> str:
    fingerprint_payload = {
        "topic": _normalize_setup_text(setup_snapshot.get("topic", "")),
        "context": _normalize_setup_text(setup_snapshot.get("context", "")),
        "keywords": _normalize_setup_text(setup_snapshot.get("keywords", "")),
        "time_window": setup_snapshot.get("time_window"),
        "custom_date_start": setup_snapshot.get("custom_date_start"),
        "custom_date_end": setup_snapshot.get("custom_date_end"),
        "sources": sorted(
            [
                {
                    "source_name": _normalize_setup_text(source.get("source_name", "")),
                    "url": source.get("url", "").strip(),
                }
                for source in setup_snapshot.get("sources", [])
                if source.get("url")
            ],
            key=lambda item: item["url"],
        ),
        "local_documents": sorted(str(item).strip() for item in setup_snapshot.get("local_documents", []) if str(item).strip()),
        "output_types": sorted(str(item).strip() for item in setup_snapshot.get("output_types", []) if str(item).strip()),
    }
    return hashlib.md5(json.dumps(fingerprint_payload, sort_keys=True).encode("utf-8")).hexdigest()[:12]


def _build_board_name(setup_snapshot: dict[str, Any]) -> str:
    explicit_name = (setup_snapshot.get("research_setup_name") or "").strip()
    if explicit_name:
        return explicit_name
    topic = (setup_snapshot.get("topic") or "").strip() or "Technology Radar"
    return f"{topic} Radar Board"


def _slugify_name(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in value)
    cleaned = "-".join(part for part in cleaned.split("-") if part)
    return cleaned or "item"


def _build_trend_id(entry: dict[str, Any]) -> str:
    base = f"{entry.get('name', '')}|{entry.get('quadrant', '')}|{entry.get('ring', '')}"
    return hashlib.md5(base.encode("utf-8")).hexdigest()[:12]


def _merge_board_trends(
    existing_trends: list[dict[str, Any]],
    radar_entries: list[dict[str, Any]],
    *,
    research_id: str,
    timestamp: int,
) -> list[dict[str, Any]]:
    trend_map: dict[str, dict[str, Any]] = {}
    for trend in existing_trends or []:
        trend_map[trend["trend_id"]] = trend

    for entry in radar_entries:
        trend_id = _build_trend_id(entry)
        existing = trend_map.get(trend_id)
        history_item = {
            "research_id": research_id,
            "timestamp": timestamp,
            "ring": entry.get("ring"),
            "quadrant": entry.get("quadrant"),
            "scores": entry.get("scores", {}),
        }

        if existing:
            updated_history = existing.get("history", [])
            updated_history.append(history_item)
            trend_map[trend_id] = {
                **existing,
                **entry,
                "trend_id": trend_id,
                "first_seen_at": existing.get("first_seen_at", timestamp),
                "last_seen_at": timestamp,
                "last_research_id": research_id,
                "history": updated_history[-20:],
                "run_count": int(existing.get("run_count", 1)) + 1,
                "deleted": False,
            }
        else:
            trend_map[trend_id] = {
                **entry,
                "trend_id": trend_id,
                "first_seen_at": timestamp,
                "last_seen_at": timestamp,
                "last_research_id": research_id,
                "history": [history_item],
                "run_count": 1,
                "deleted": False,
            }

    trends = list(trend_map.values())
    trends.sort(key=lambda item: (item.get("deleted", False), item.get("quadrant", ""), item.get("ring", ""), item.get("name", "")))
    return trends


async def _upsert_radar_board(
    request: ICTrendScoutRequest,
    result: dict[str, Any],
    *,
    research_id: str,
    timestamp: int,
) -> dict[str, Any]:
    setup_snapshot = _build_radar_setup_snapshot(request)
    setup_fingerprint = _build_radar_setup_fingerprint(setup_snapshot)
    board_id = setup_snapshot["research_setup_id"] or f"ic_radar_board_{setup_fingerprint}"
    now_iso = _isoformat_utc()
    existing = await radar_board_store.get_report(board_id)

    run_item = {
        "research_id": research_id,
        "timestamp": timestamp,
        "date": now_iso,
        "topic": result.get("topic") or request.topic,
        "entry_count": len(result.get("radar_entries", [])),
        "ring_counts": result.get("ring_counts", {}),
        "quadrant_counts": result.get("quadrant_counts", {}),
        "radar_ring": result.get("radar_ring"),
        "setup_name": _build_board_name(setup_snapshot),
    }

    board = {
        "id": board_id,
        "type": "ic_technology_radar_board",
        "name": _build_board_name(setup_snapshot),
        "setup_fingerprint": setup_fingerprint,
        "setup_snapshot": setup_snapshot,
        "created_at": existing.get("created_at", now_iso) if existing else now_iso,
        "updated_at": now_iso,
        "last_run_at": now_iso,
        "latest_research_id": research_id,
        "latest_result": result,
        "runs_history": ([run_item] if not existing else [run_item, *(existing.get("runs_history") or [])])[:30],
        "trends": _merge_board_trends(existing.get("trends", []) if existing else [], result.get("radar_entries", []), research_id=research_id, timestamp=timestamp),
    }

    await radar_board_store.upsert_report(board_id, board)
    return board


async def _list_radar_boards() -> list[dict[str, Any]]:
    boards = await radar_board_store.list_reports()
    boards.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return boards


async def _list_ic_trend_runs(monitor_id: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    reports = await report_store.list_reports()
    filtered = []
    for report in reports:
        if report.get("type") not in {"ic_trend_scout", "ic_trend_scout_run"}:
            continue
        if monitor_id and report.get("monitor_id") != monitor_id:
            continue
        filtered.append(report)

    filtered.sort(key=lambda item: item.get("timestamp", 0), reverse=True)
    return filtered[: max(1, limit)]


async def _execute_ic_trend_research_run(
    request: ICTrendScoutRequest,
    *,
    run_origin: str,
    monitor_id: str | None = None,
    monitor_name: str | None = None,
) -> dict[str, Any]:
    research_id = sanitize_filename(f"ic_trend_{int(time.time())}_{request.topic}")
    result = await run_ic_trend_scout_research(request, document_root=DOC_PATH)
    timestamp = int(time.time() * 1000)

    await report_store.upsert_report(
        research_id,
        {
            "id": research_id,
            "type": "ic_trend_scout_run",
            "question": request.topic,
            "answer": result.get("executive_summary"),
            "orderedData": [],
            "chatMessages": [],
            "timestamp": timestamp,
            "trend_result": result,
            "run_origin": run_origin,
            "monitor_id": monitor_id,
            "monitor_name": monitor_name or "",
            "request_payload": request.model_dump(mode="json"),
        },
    )

    return {
        "research_id": research_id,
        "run_origin": run_origin,
        "monitor_id": monitor_id,
        "monitor_name": monitor_name or "",
        "timestamp": timestamp,
        **result,
    }


async def _save_ic_trend_monitor(
    request: ICTrendScoutRequest,
    *,
    monitor_id: str | None = None,
    latest_run_id: str | None = None,
) -> dict[str, Any]:
    now = _utc_now()
    monitor_id = monitor_id or sanitize_filename(f"ic_monitor_{int(time.time())}_{request.topic}")
    monitor = {
        "id": monitor_id,
        "type": "ic_trend_monitor",
        "name": _build_monitor_name(request),
        "topic": request.topic.strip(),
        "enabled": bool(request.schedule_enabled),
        "interval_days": max(1, int(request.schedule_interval_days or 3)),
        "created_at": _isoformat_utc(now),
        "updated_at": _isoformat_utc(now),
        "last_run_at": None,
        "next_run_at": _build_next_run_at(int(request.schedule_interval_days or 3), now)
        if request.schedule_enabled
        else None,
        "latest_run_id": latest_run_id,
        "last_error": "",
        "request_payload": request.model_dump(mode="json"),
    }
    existing = await trend_monitor_store.get_report(monitor_id)
    if existing:
        monitor["created_at"] = existing.get("created_at", monitor["created_at"])
        monitor["last_run_at"] = existing.get("last_run_at")
        monitor["latest_run_id"] = latest_run_id or existing.get("latest_run_id")

    await trend_monitor_store.upsert_report(monitor_id, monitor)
    return monitor


async def _run_ic_trend_scheduler() -> None:
    while True:
        try:
            now = _utc_now()
            monitors = await trend_monitor_store.list_reports()
            for monitor in monitors:
                if not monitor.get("enabled"):
                    continue
                next_run_at = _parse_utc(monitor.get("next_run_at"))
                if not next_run_at or next_run_at > now:
                    continue

                request_payload = monitor.get("request_payload") or {}
                request_payload["schedule_enabled"] = True
                request_payload["schedule_interval_days"] = int(monitor.get("interval_days", 3))
                request_payload["monitor_name"] = monitor.get("name", "")
                request = ICTrendScoutRequest(**request_payload)

                try:
                    run_result = await _execute_ic_trend_research_run(
                        request,
                        run_origin="scheduled",
                        monitor_id=monitor["id"],
                        monitor_name=monitor.get("name", ""),
                    )
                    await trend_monitor_store.upsert_report(
                        monitor["id"],
                        {
                            **monitor,
                            "updated_at": _isoformat_utc(),
                            "last_run_at": _isoformat_utc(),
                            "next_run_at": _build_next_run_at(int(monitor.get("interval_days", 3))),
                            "latest_run_id": run_result["research_id"],
                            "last_error": "",
                        },
                    )
                except Exception as exc:
                    logger.exception("Scheduled IC Trend run failed for monitor %s", monitor.get("id"))
                    await trend_monitor_store.upsert_report(
                        monitor["id"],
                        {
                            **monitor,
                            "updated_at": _isoformat_utc(),
                            "last_error": str(exc),
                            "next_run_at": _build_next_run_at(int(monitor.get("interval_days", 3))),
                        },
                    )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("IC Trend scheduler loop failed")

        await asyncio.sleep(max(60, IC_TREND_SCHEDULER_POLL_SECONDS))

# Startup event


# Lifespan events now handled in the lifespan context manager above


# Routes
@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    """Serve the landing page."""
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
    index_path = os.path.join(frontend_dir, "index.html")
    
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="Frontend index.html not found")
    
    with open(index_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    return HTMLResponse(content=content)


@app.get("/classic-research", response_class=HTMLResponse)
async def serve_classic_research():
    """Serve the classic GPT Researcher interface."""
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
    page_path = os.path.join(frontend_dir, "classic-research.html")

    if not os.path.exists(page_path):
        raise HTTPException(status_code=404, detail="Classic Research page not found")

    with open(page_path, "r", encoding="utf-8") as f:
        content = f.read()

    return HTMLResponse(content=content)


@app.get("/ic-technology-radar", response_class=HTMLResponse)
async def serve_ic_technology_radar():
    """Serve the IC Technology Radar frontend page."""
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
    page_path = os.path.join(frontend_dir, "ic-technology-radar.html")

    if not os.path.exists(page_path):
        raise HTTPException(status_code=404, detail="IC Technology Radar page not found")

    with open(page_path, "r", encoding="utf-8") as f:
        content = f.read()

    return HTMLResponse(content=content)


@app.get("/deep-research-service", response_class=HTMLResponse)
async def serve_deep_research_service():
    """Serve the Deep Research Service playground page."""
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
    page_path = os.path.join(frontend_dir, "deep-research-service.html")

    if not os.path.exists(page_path):
        raise HTTPException(status_code=404, detail="Deep Research Service page not found")

    with open(page_path, "r", encoding="utf-8") as f:
        content = f.read()

    return HTMLResponse(content=content)


@app.get("/.well-known/agent-discovery.json")
async def agent_discovery(request: Request):
    """Advertise GPT Researcher services via the Agent Discovery Protocol."""
    origin = str(request.base_url).rstrip("/")
    domain = request.url.hostname or request.headers.get("host", "")
    contact = os.getenv("AGENT_DISCOVERY_CONTACT")

    document = build_agent_discovery_document(origin=origin, domain=domain, contact=contact)
    response = JSONResponse(content=document)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

@app.get("/report/{research_id}")
async def read_report(request: Request, research_id: str):
    docx_path = os.path.join('outputs', f"{research_id}.docx")
    if not os.path.exists(docx_path):
        return {"message": "Report not found."}
    return FileResponse(docx_path)


# Simplified API routes - no database persistence
@app.get("/api/reports")
async def get_all_reports(report_ids: str = None):
    report_ids_list = report_ids.split(",") if report_ids else None
    reports = await report_store.list_reports(report_ids_list)
    return {"reports": reports}


@app.get("/api/reports/{research_id}")
async def get_report_by_id(research_id: str):
    report = await report_store.get_report(research_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"report": report}


@app.post("/api/reports")
async def create_or_update_report(request: Request):
    try:
        data = await request.json()
        research_id = data.get("id", "temp_id")

        now_ms = int(time.time() * 1000)
        existing = await report_store.get_report(research_id)
        incoming_timestamp = data.get("timestamp")
        timestamp = incoming_timestamp if isinstance(incoming_timestamp, int) else now_ms
        if existing and isinstance(existing.get("timestamp"), int):
            timestamp = max(timestamp, existing["timestamp"])

        report = {
            "id": research_id,
            "question": data.get("question"),
            "answer": data.get("answer"),
            "orderedData": data.get("orderedData") or [],
            "chatMessages": data.get("chatMessages") or [],
            "timestamp": timestamp,
        }

        await report_store.upsert_report(research_id, report)
        return {"success": True, "id": research_id}
    except Exception as e:
        logger.error(f"Error processing report creation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/reports/{research_id}")
async def update_report(research_id: str, request: Request):
    existing = await report_store.get_report(research_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Report not found")

    data = await request.json()
    now_ms = int(time.time() * 1000)

    updated = {
        **existing,
        **{k: v for k, v in data.items() if v is not None},
        "id": research_id,
        "timestamp": now_ms,
    }

    await report_store.upsert_report(research_id, updated)
    return {"success": True, "id": research_id}


@app.delete("/api/reports/{research_id}")
async def delete_report(research_id: str):
    existed = await report_store.delete_report(research_id)
    if not existed:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"success": True}


@app.get("/api/reports/{research_id}/chat")
async def get_report_chat(research_id: str):
    report = await report_store.get_report(research_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"chatMessages": report.get("chatMessages") or []}


@app.post("/api/reports/{research_id}/chat")
async def add_report_chat_message(research_id: str, request: Request):
    report = await report_store.get_report(research_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    message = await request.json()
    chat_messages = report.get("chatMessages") or []
    if isinstance(chat_messages, list):
        chat_messages = [*chat_messages, message]
    else:
        chat_messages = [message]

    now_ms = int(time.time() * 1000)
    updated = {
        **report,
        "chatMessages": chat_messages,
        "timestamp": now_ms,
    }

    await report_store.upsert_report(research_id, updated)
    return {"success": True, "id": research_id}


async def write_report(research_request: ResearchRequest, research_id: str = None):
    report_information = await run_agent(
        task=research_request.task,
        report_type=research_request.report_type,
        report_source=research_request.report_source,
        source_urls=[],
        document_urls=[],
        tone=Tone[research_request.tone],
        websocket=None,
        stream_output=None,
        headers=research_request.headers,
        query_domains=[],
        config_path="",
        return_researcher=True
    )

    docx_path = await write_md_to_word(report_information[0], research_id)
    pdf_path = await write_md_to_pdf(report_information[0], research_id)
    if research_request.report_type != "multi_agents":
        report, researcher = report_information
        response = {
            "research_id": research_id,
            "research_information": {
                "source_urls": researcher.get_source_urls(),
                "research_costs": researcher.get_costs(),
                "visited_urls": list(researcher.visited_urls),
                "research_images": researcher.get_research_images(),
                # "research_sources": researcher.get_research_sources(),  # Raw content of sources may be very large
            },
            "report": report,
            "docx_path": docx_path,
            "pdf_path": pdf_path
        }
    else:
        response = { "research_id": research_id, "report": "", "docx_path": docx_path, "pdf_path": pdf_path }

    return response

@app.post("/report/")
async def generate_report(research_request: ResearchRequest, background_tasks: BackgroundTasks):
    research_id = sanitize_filename(f"task_{int(time.time())}_{research_request.task}")

    if research_request.generate_in_background:
        background_tasks.add_task(write_report, research_request=research_request, research_id=research_id)
        return {"message": "Your report is being generated in the background. Please check back later.",
                "research_id": research_id}
    else:
        response = await write_report(research_request, research_id)
        return response


@app.post("/api/ic-trend-research")
async def generate_ic_trend_research(request: ICTrendScoutRequest):
    return await _execute_ic_trend_research_run(request, run_origin="manual")


@app.post("/api/deep-research-service")
async def generate_deep_research_service_response(request: DeepResearchServiceRequest):
    request_id = sanitize_filename(f"deep_service_{int(time.time())}_{request.run_name or request.task}")
    timestamp = int(time.time() * 1000)
    result = await run_deep_research_service(request, document_root=DOC_PATH)

    if request.save_run:
        await report_store.upsert_report(
            request_id,
            {
                "id": request_id,
                "type": "deep_research_service_run",
                "question": request.task,
                "answer": (result.get("output") or {}).get("report")
                or json.dumps((result.get("output") or {}).get("structured_data") or {}, ensure_ascii=False),
                "orderedData": [],
                "chatMessages": [],
                "timestamp": timestamp,
                "request_payload": request.model_dump(mode="json"),
                "service_result": result,
            },
        )

    return {
        "request_id": request_id,
        "timestamp": timestamp,
        "saved": bool(request.save_run),
        **result,
    }


@app.post("/api/deep-research-service/simple")
async def generate_deep_research_service_simple_response(request: SimpleDeepResearchChatRequest):
    expanded_request = build_simple_chat_request(request)
    request_id = sanitize_filename(f"deep_service_simple_{int(time.time())}_{request.message}")
    timestamp = int(time.time() * 1000)
    result = await run_deep_research_service(expanded_request, document_root=DOC_PATH)
    assistant_message = (result.get("output") or {}).get("report") or ""

    if request.save_run:
        await report_store.upsert_report(
            request_id,
            {
                "id": request_id,
                "type": "deep_research_service_run",
                "question": request.message,
                "answer": assistant_message,
                "orderedData": [],
                "chatMessages": [],
                "timestamp": timestamp,
                "request_payload": {
                    "input_mode": "simple_chat",
                    "message": request.message,
                    "expanded_request": expanded_request.model_dump(mode="json"),
                },
                "service_result": {
                    **result,
                    "input_mode": "simple_chat",
                    "assistant_message": assistant_message,
                },
            },
        )

    return {
        "request_id": request_id,
        "timestamp": timestamp,
        "saved": bool(request.save_run),
        "input_mode": "simple_chat",
        "assistant_message": assistant_message,
        **result,
    }


@app.get("/api/deep-research-service/runs")
async def list_deep_research_service_runs(limit: int = 12):
    reports = await report_store.list_reports()
    runs = [item for item in reports if item.get("type") == "deep_research_service_run"]
    runs.sort(key=lambda item: item.get("timestamp", 0), reverse=True)
    return {"runs": runs[: max(1, limit)]}


@app.post("/api/ic-technology-radar")
async def generate_ic_technology_radar(request: ICTrendScoutRequest):
    research_id = sanitize_filename(f"ic_radar_{int(time.time())}_{request.topic}")
    result = await run_ic_technology_radar_research(request, document_root=DOC_PATH)
    timestamp = int(time.time() * 1000)

    await report_store.upsert_report(
        research_id,
        {
            "id": research_id,
            "type": "ic_technology_radar_run",
            "question": request.topic,
            "answer": result.get("executive_summary"),
            "orderedData": [],
            "chatMessages": [],
            "timestamp": timestamp,
            "radar_result": result,
            "request_payload": request.model_dump(mode="json"),
        },
    )

    board = await _upsert_radar_board(
        request,
        result,
        research_id=research_id,
        timestamp=timestamp,
    )

    return {
        "research_id": research_id,
        "timestamp": timestamp,
        "board": board,
        **result,
    }


@app.get("/api/ic-radar-setups")
async def list_ic_radar_setups():
    setups = await radar_setup_store.list_reports()
    setups.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return {"setups": setups}


@app.post("/api/ic-radar-setups")
async def save_ic_radar_setup(request: RadarSetupRequest):
    now_iso = _isoformat_utc()
    setup_id = sanitize_filename(f"ic_setup_{int(time.time())}_{request.name or request.topic}")
    setup = {
        "id": setup_id,
        "type": "ic_radar_setup",
        "name": request.name.strip() or request.topic.strip() or "Research setup",
        "topic": request.topic.strip(),
        "context": request.context.strip(),
        "keywords": request.keywords.strip(),
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await radar_setup_store.upsert_report(setup_id, setup)
    return {"setup": setup}


@app.delete("/api/ic-radar-setups/{setup_id}")
async def delete_ic_radar_setup(setup_id: str):
    existed = await radar_setup_store.delete_report(setup_id)
    if not existed:
        raise HTTPException(status_code=404, detail="Research setup not found")
    return {"success": True}


@app.get("/api/ic-radar-boards")
async def list_ic_radar_boards():
    boards = await _list_radar_boards()
    return {"boards": boards}


@app.get("/api/ic-radar-boards/{board_id}")
async def get_ic_radar_board(board_id: str):
    board = await radar_board_store.get_report(board_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Radar board not found")
    return {"board": board}


@app.delete("/api/ic-radar-boards/{board_id}/trends/{trend_id}")
async def delete_ic_radar_board_trend(board_id: str, trend_id: str):
    board = await radar_board_store.get_report(board_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Radar board not found")

    trends = board.get("trends") or []
    filtered_trends = [trend for trend in trends if trend.get("trend_id") != trend_id]
    if len(filtered_trends) == len(trends):
        raise HTTPException(status_code=404, detail="Trend not found in radar board")

    updated_board = {
        **board,
        "trends": filtered_trends,
        "updated_at": _isoformat_utc(),
    }
    await radar_board_store.upsert_report(board_id, updated_board)
    return {"board": updated_board}


@app.get("/api/ic-trend-runs")
async def list_ic_trend_runs(monitor_id: str | None = None, limit: int = 20):
    runs = await _list_ic_trend_runs(monitor_id=monitor_id, limit=limit)
    return {"runs": runs}


@app.get("/api/ic-trend-monitors")
async def list_ic_trend_monitors():
    monitors = await trend_monitor_store.list_reports()
    monitors.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return {"monitors": monitors}


@app.post("/api/ic-trend-monitors")
async def create_ic_trend_monitor(request: ICTrendScoutRequest):
    monitor = await _save_ic_trend_monitor(request)
    return {"monitor": monitor}


@app.delete("/api/ic-trend-monitors/{monitor_id}")
async def delete_ic_trend_monitor(monitor_id: str):
    existed = await trend_monitor_store.delete_report(monitor_id)
    if not existed:
        raise HTTPException(status_code=404, detail="Monitor not found")
    return {"success": True}


@app.get("/files/")
async def list_files():
    if not os.path.exists(DOC_PATH):
        os.makedirs(DOC_PATH, exist_ok=True)
    files = os.listdir(DOC_PATH)
    print(f"Files in {DOC_PATH}: {files}")
    return {"files": files}


@app.post("/api/multi_agents")
async def run_multi_agents():
    return await execute_multi_agents(manager)


@app.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    return await handle_file_upload(file, DOC_PATH)


@app.delete("/files/{filename}")
async def delete_file(filename: str):
    return await handle_file_deletion(filename, DOC_PATH)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await handle_websocket_communication(websocket, manager)
    except WebSocketDisconnect as e:
        # Disconnect with more detailed logging about the WebSocket disconnect reason
        logger.info(f"WebSocket disconnected with code {e.code} and reason: '{e.reason}'")
        await manager.disconnect(websocket)
    except Exception as e:
        # More general exception handling
        logger.error(f"Unexpected WebSocket error: {str(e)}")
        await manager.disconnect(websocket)

@app.post("/api/chat")
async def chat(chat_request: ChatRequest):
    """Process a chat request with a report and message history.

    Args:
        chat_request: ChatRequest object containing report text and message history

    Returns:
        JSON response with the assistant's message and any tool usage metadata
    """
    try:
        logger.info(f"Received chat request with {len(chat_request.messages)} messages")

        # Create chat agent with the report
        chat_agent = ChatAgentWithMemory(
            report=chat_request.report,
            config_path="default",
            headers=None
        )

        # Process the chat and get response with metadata
        response_content, tool_calls_metadata = await chat_agent.chat(chat_request.messages, None)
        logger.info(f"response_content: {response_content}")
        logger.info(f"Got chat response of length: {len(response_content) if response_content else 0}")
        
        if tool_calls_metadata:
            logger.info(f"Tool calls used: {json.dumps(tool_calls_metadata)}")

        # Format response as a ChatMessage object with role, content, timestamp and metadata
        response_message = {
            "role": "assistant",
            "content": response_content,
            "timestamp": int(time.time() * 1000),  # Current time in milliseconds
            "metadata": {
                "tool_calls": tool_calls_metadata
            } if tool_calls_metadata else None
        }

        logger.info(f"Returning formatted response: {json.dumps(response_message)[:100]}...")
        return {"response": response_message}
    except Exception as e:
        logger.error(f"Error processing chat request: {str(e)}", exc_info=True)
        return {"error": str(e)}

@app.post("/api/reports/{research_id}/chat")
async def research_report_chat(research_id: str, request: Request):
    """Handle chat requests for a specific research report.
    Directly processes the raw request data to avoid validation errors.
    """
    try:
        # Get raw JSON data from request
        data = await request.json()
        
        # Create chat agent with the report
        chat_agent = ChatAgentWithMemory(
            report=data.get("report", ""),
            config_path="default",
            headers=None
        )

        # Process the chat and get response with metadata
        response_content, tool_calls_metadata = await chat_agent.chat(data.get("messages", []), None)
        
        if tool_calls_metadata:
            logger.info(f"Tool calls used: {json.dumps(tool_calls_metadata)}")

        # Format response as a ChatMessage object
        response_message = {
            "role": "assistant",
            "content": response_content,
            "timestamp": int(time.time() * 1000),
            "metadata": {
                "tool_calls": tool_calls_metadata
            } if tool_calls_metadata else None
        }

        return {"response": response_message}
    except Exception as e:
        logger.error(f"Error in research report chat: {str(e)}", exc_info=True)
        return {"error": str(e)}

@app.put("/api/reports/{research_id}")
async def update_report(research_id: str, request: Request):
    """Update a specific research report by ID - no database configured."""
    logger.debug(f"Update requested for report {research_id} - no database configured, not persisted")
    return {"success": True, "id": research_id}

@app.delete("/api/reports/{research_id}")
async def delete_report(research_id: str):
    """Delete a specific research report by ID - no database configured."""
    logger.debug(f"Delete requested for report {research_id} - no database configured, nothing to delete")
    return {"success": True, "id": research_id}
