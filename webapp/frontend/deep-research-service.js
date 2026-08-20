const examplePayloads = {
  report: {
    task: "Compare Model Context Protocol adoption patterns for enterprise AI agents in 2026.",
    response_mode: "report",
    report_type: "deep",
    report_source: "web",
    tone: "Objective",
    source_urls: [
      "https://openai.com/news/",
      "https://www.anthropic.com/news",
    ],
    document_urls: [],
    local_documents: [],
    query_domains: ["openai.com", "anthropic.com", "github.com"],
    headers: {},
    max_search_results: 5,
    complement_source_urls: true,
    structured_output_instructions: "",
    structured_output_schema: null,
    include_research_context: true,
    save_run: true,
    run_name: "MCP adoption deep report",
  },
  structured: {
    task: "Evaluate opportunities for synthetic data platforms in regulated industries.",
    response_mode: "structured",
    report_type: "research_report",
    report_source: "web",
    tone: "Objective",
    source_urls: [],
    document_urls: [],
    local_documents: [],
    query_domains: ["nist.gov", "gartner.com", "mckinsey.com"],
    headers: {},
    max_search_results: 4,
    complement_source_urls: true,
    structured_output_instructions: "Return a business-facing JSON for portfolio review.",
    structured_output_schema: {
      topic: "string",
      executive_summary: "string",
      opportunity_score: 1,
      investment_thesis: "string",
      key_findings: ["string"],
      recommended_actions: ["string"],
      risks: ["string"],
      sources: [
        {
          url: "string",
          type: "web | document",
          reason: "string",
        },
      ],
    },
    include_research_context: true,
    save_run: true,
    run_name: "Synthetic data structured output",
  },
  hybrid: {
    task: "Summarize strategic moves in digital twins and return both report and JSON.",
    response_mode: "hybrid",
    report_type: "deep",
    report_source: "hybrid",
    tone: "Analytical",
    source_urls: ["https://news.microsoft.com/source/features/ai/"],
    document_urls: [],
    local_documents: [],
    query_domains: ["microsoft.com", "siemens.com"],
    headers: {},
    max_search_results: 5,
    complement_source_urls: true,
    structured_output_instructions: "Create a compact JSON that another app can render as cards.",
    structured_output_schema: {
      topic: "string",
      executive_summary: "string",
      trends: [
        {
          name: "string",
          why_it_matters: "string",
          suggested_next_step: "string",
        },
      ],
      sources: [
        {
          url: "string",
          type: "web | document",
          reason: "string",
        },
      ],
    },
    include_research_context: true,
    save_run: true,
    run_name: "Digital twins hybrid output",
  },
};

const simpleChatExample = `Avaliar o nivel de IRL da startup: https://www.autou.io/ , e tambem analisar seus clientes e projetos ja realizados e sua rede de interacao.`;

const payloadTextarea = document.getElementById("servicePayload");
const simpleChatTextarea = document.getElementById("simpleChatPrompt");
const statusElement = document.getElementById("serviceStatus");
const curlPreviewElement = document.getElementById("serviceCurlPreview");
const responseJsonElement = document.getElementById("serviceResponseJson");
const reportPreviewElement = document.getElementById("serviceReportPreview");
const filesListElement = document.getElementById("serviceFilesList");
const runsListElement = document.getElementById("serviceRunsList");
const requestIdMetric = document.getElementById("metricRequestId");
const outputFormatMetric = document.getElementById("metricOutputFormat");
const sourceCountMetric = document.getElementById("metricSourceCount");
const costMetric = document.getElementById("metricCost");

function setStatus(message, kind = "neutral") {
  statusElement.textContent = message;
  statusElement.dataset.kind = kind;
}

function getPayload() {
  return JSON.parse(payloadTextarea.value);
}

function setPayload(payload) {
  payloadTextarea.value = JSON.stringify(payload, null, 2);
  updateCurlPreview();
  syncActiveTemplate();
}

function updateCurlPreview() {
  try {
    const payload = getPayload();
    curlPreviewElement.textContent = [
      "curl -X POST http://127.0.0.1:8000/api/deep-research-service \\",
      '  -H "Content-Type: application/json" \\',
      `  -d '${JSON.stringify(payload)}'`,
    ].join("\n");
  } catch (error) {
    curlPreviewElement.textContent = "Invalid JSON payload. Fix it to preview the cURL command.";
  }
}

function syncActiveTemplate() {
  const buttons = Array.from(document.querySelectorAll("[data-template]"));
  buttons.forEach((button) => button.classList.remove("is-active"));

  const currentText = payloadTextarea.value.trim();
  for (const [name, payload] of Object.entries(examplePayloads)) {
    if (currentText === JSON.stringify(payload, null, 2).trim()) {
      const activeButton = document.querySelector(`[data-template="${name}"]`);
      activeButton?.classList.add("is-active");
      return;
    }
  }
}

function renderMetrics(result) {
  const output = result.output || {};
  const research = result.research || {};
  requestIdMetric.textContent = result.request_id || "-";
  outputFormatMetric.textContent = output.format || "-";
  sourceCountMetric.textContent = String((research.source_urls || []).length);
  costMetric.textContent = typeof research.research_costs === "number"
    ? research.research_costs.toFixed(4)
    : "0";
}

function renderResponse(result) {
  responseJsonElement.textContent = JSON.stringify(result, null, 2);
  reportPreviewElement.textContent = result?.output?.report
    || JSON.stringify(result?.output?.structured_data || {}, null, 2)
    || "No report output returned.";
  renderMetrics(result);
}

function renderRuns(runs) {
  if (!runs.length) {
    runsListElement.innerHTML = '<div class="service-run-card"><strong>No saved runs yet.</strong><p>The next execution with <code>save_run: true</code> will appear here.</p></div>';
    return;
  }

  runsListElement.innerHTML = runs.map((run) => {
    const responseMode = run?.service_result?.input_mode === "simple_chat"
      ? "simple_chat"
      : run?.service_result?.response_mode || "-";
    const reportType = run?.service_result?.report_type || "-";
    const updatedAt = new Date(run.timestamp || Date.now()).toLocaleString();
    return `
      <article class="service-run-card">
        <strong>${escapeHtml(run.request_payload?.run_name || run.question || "Saved run")}</strong>
        <p>${escapeHtml(run.question || "")}</p>
        <div class="service-run-meta">
          <span>${escapeHtml(responseMode)}</span>
          <span>${escapeHtml(reportType)}</span>
          <span>${escapeHtml(updatedAt)}</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderFiles(files) {
  if (!files.length) {
    filesListElement.innerHTML = '<span class="service-muted">No local files found in DOC_PATH.</span>';
    return;
  }

  const activeFiles = new Set((safeReadPayload().local_documents || []).map((item) => String(item)));
  filesListElement.innerHTML = files.map((file) => `
    <button
      type="button"
      class="service-doc-chip ${activeFiles.has(file) ? "is-active" : ""}"
      data-filename="${escapeAttribute(file)}"
    >
      <i class="fas fa-file-lines"></i>
      <span>${escapeHtml(file)}</span>
    </button>
  `).join("");
}

function safeReadPayload() {
  try {
    return getPayload();
  } catch (error) {
    return { local_documents: [] };
  }
}

function toggleDocumentInPayload(filename) {
  const payload = getPayload();
  const current = Array.isArray(payload.local_documents) ? payload.local_documents.map(String) : [];
  payload.local_documents = current.includes(filename)
    ? current.filter((item) => item !== filename)
    : [...current, filename];
  setPayload(payload);
}

async function fetchFiles() {
  try {
    const response = await fetch("/files/");
    const data = await response.json();
    renderFiles(data.files || []);
  } catch (error) {
    filesListElement.innerHTML = '<span class="service-muted">Unable to load local files.</span>';
  }
}

async function fetchRuns() {
  try {
    const response = await fetch("/api/deep-research-service/runs");
    const data = await response.json();
    renderRuns(data.runs || []);
  } catch (error) {
    runsListElement.innerHTML = '<div class="service-run-card"><strong>Unable to load saved runs.</strong><p>Check whether the backend is active.</p></div>';
  }
}

async function runService() {
  let payload;
  try {
    payload = getPayload();
  } catch (error) {
    setStatus(`Invalid JSON: ${error.message}`, "error");
    return;
  }

  setStatus("Running deep research service request...", "loading");
  responseJsonElement.textContent = "Running request...";
  reportPreviewElement.textContent = "Waiting for response...";

  try {
    const response = await fetch("/api/deep-research-service", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.detail || "Request failed");
    }

    renderResponse(result);
    await fetchRuns();
    setStatus("Request completed successfully.", "success");
  } catch (error) {
    responseJsonElement.textContent = error.message;
    reportPreviewElement.textContent = "The service returned an error.";
    setStatus(`Request failed: ${error.message}`, "error");
  }
}

async function runSimpleChat() {
  const message = simpleChatTextarea.value.trim();
  if (!message) {
    setStatus("Type a message before running the simple chat.", "error");
    return;
  }

  setStatus("Running simple chat request...", "loading");
  responseJsonElement.textContent = "Running request...";
  reportPreviewElement.textContent = "Waiting for response...";

  try {
    const response = await fetch("/api/deep-research-service/simple", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        save_run: true,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.detail || "Request failed");
    }

    renderResponse(result);
    await fetchRuns();
    setStatus("Simple chat completed successfully.", "success");
  } catch (error) {
    responseJsonElement.textContent = error.message;
    reportPreviewElement.textContent = "The service returned an error.";
    setStatus(`Simple chat failed: ${error.message}`, "error");
  }
}

function copySimpleChatToPayload() {
  const message = simpleChatTextarea.value.trim() || simpleChatExample;
  const payload = {
    ...examplePayloads.report,
    task: message,
    run_name: "Simple chat copied to payload",
  };
  setPayload(payload);
  setStatus("Simple chat copied into the payload builder.", "success");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

document.querySelectorAll("[data-template]").forEach((button) => {
  button.addEventListener("click", () => {
    setPayload(examplePayloads[button.dataset.template]);
    setStatus("Example payload loaded.", "success");
  });
});

payloadTextarea.addEventListener("input", updateCurlPreview);
payloadTextarea.addEventListener("input", syncActiveTemplate);

document.getElementById("validatePayloadButton").addEventListener("click", () => {
  try {
    getPayload();
    setStatus("Payload JSON is valid.", "success");
    updateCurlPreview();
    fetchFiles();
  } catch (error) {
    setStatus(`Invalid JSON: ${error.message}`, "error");
  }
});

document.getElementById("runServiceButton").addEventListener("click", runService);
document.getElementById("runSimpleChatButton").addEventListener("click", runSimpleChat);
document.getElementById("copySimpleToPayloadButton").addEventListener("click", copySimpleChatToPayload);
document.getElementById("refreshFilesButton").addEventListener("click", fetchFiles);

filesListElement.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filename]");
  if (!button) {
    return;
  }

  try {
    toggleDocumentInPayload(button.dataset.filename);
    fetchFiles();
    setStatus(`Updated local_documents with ${button.dataset.filename}.`, "success");
  } catch (error) {
    setStatus(`Unable to update payload: ${error.message}`, "error");
  }
});

simpleChatTextarea.value = simpleChatExample;
setPayload(examplePayloads.structured);
fetchFiles();
fetchRuns();
