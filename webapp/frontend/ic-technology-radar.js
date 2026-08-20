(function () {
  const defaultSource = () => ({ source_name: "", url: "" });
  const SAVED_SOURCES_KEY = "ic_saved_sources_library";
  const SOURCES_DRAFT_KEY = "ic_technology_radar_sources_draft";

  const QUADRANT_ORDER = ["Techniques", "Platforms", "Tools", "Languages & Frameworks"];
  const RING_ORDER = ["Adopt", "Trial", "Assess", "Caution"];
  const RING_INDEX = { Adopt: 0, Trial: 1, Assess: 2, Caution: 3 };
  const QUADRANT_INDEX = {
    Techniques: 0,
    Platforms: 1,
    Tools: 2,
    "Languages & Frameworks": 3,
  };

  const state = {
    sources: [defaultSource()],
    files: [],
    selectedDocuments: [],
    savedSources: [],
    savedSetups: [],
    savedBoards: [],
    activeBoard: null,
    activeSetupId: "",
  };

  const form = document.getElementById("icTechnologyRadarForm");
  const sourcesList = document.getElementById("radarSourcesList");
  const savedSourcesLibrary = document.getElementById("radarSavedSourcesLibrary");
  const addSourceBtn = document.getElementById("radarAddSourceBtn");
  const saveSourcesBtn = document.getElementById("radarSaveSourcesBtn");
  const clearSavedSourcesBtn = document.getElementById("radarClearSavedSourcesBtn");
  const timeWindow = document.getElementById("radarTimeWindow");
  const customDateRange = document.getElementById("radarCustomDateRange");
  const runButton = document.getElementById("runTechnologyRadarBtn");
  const statusText = document.getElementById("technologyRadarStatus");
  const loadingState = document.getElementById("technologyRadarLoading");
  const emptyState = document.getElementById("technologyRadarEmpty");
  const results = document.getElementById("technologyRadarResults");
  const summary = document.getElementById("technologyRadarSummary");
  const filesList = document.getElementById("radarLocalFilesList");
  const refreshFilesBtn = document.getElementById("radarRefreshFilesBtn");
  const localFileInput = document.getElementById("radarLocalFileInput");
  const setupNameInput = document.getElementById("radarSetupName");
  const saveResearchSetupBtn = document.getElementById("saveResearchSetupBtn");
  const savedResearchSetups = document.getElementById("savedResearchSetups");
  const savedRadarBoards = document.getElementById("savedRadarBoards");

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(value) {
    if (!value) {
      return "Not scheduled";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  }

  function deriveSourceLabel(item) {
    const name = String(item?.name || "").trim();
    if (name && name.toLowerCase() !== "discovered source") {
      return name;
    }

    const url = String(item?.url || "").trim();
    if (!url) {
      return "Source";
    }

    try {
      const parsed = new URL(url.startsWith("local:") ? `https://local/${url.slice(6)}` : url);
      const pathname = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
      return pathname
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
    } catch (error) {
      return url;
    }
  }

  function normalizeResultPayload(data) {
    const executiveSummary = String(data?.executive_summary || "").trim();
    if (executiveSummary.startsWith("{") && executiveSummary.includes('"topic"')) {
      try {
        const parsed = JSON.parse(executiveSummary);
        if (parsed && typeof parsed === "object" && parsed.topic) {
          return parsed;
        }
      } catch (error) {
        return data;
      }
    }
    return data;
  }

  function collectCheckedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
  }

  function readSavedSources() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_SOURCES_KEY) || "[]");
    } catch (error) {
      return [];
    }
  }

  function saveSavedSources() {
    localStorage.setItem(SAVED_SOURCES_KEY, JSON.stringify(state.savedSources));
  }

  function saveSourceDraft() {
    localStorage.setItem(
      SOURCES_DRAFT_KEY,
      JSON.stringify(state.sources.filter((source) => source.source_name.trim() || source.url.trim()))
    );
  }

  function loadSourceDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(SOURCES_DRAFT_KEY) || "[]");
      if (Array.isArray(draft) && draft.length) {
        state.sources = draft.map((item) => ({
          source_name: String(item.source_name || ""),
          url: String(item.url || ""),
        }));
      }
    } catch (error) {
      state.sources = [defaultSource()];
    }
  }

  function setLoading(isLoading) {
    runButton.disabled = isLoading;
    saveResearchSetupBtn.disabled = isLoading;
    statusText.textContent = isLoading ? "Generating technology radar..." : "Ready for a radar run";
    loadingState.classList.toggle("radar-hidden", !isLoading);
    emptyState.classList.toggle("radar-hidden", isLoading || !results.classList.contains("radar-hidden"));
  }

  function renderSummary(status, totalEntries, ring, subtitle) {
    summary.innerHTML = `
      <article class="radar-summary-card">
        <span>Status</span>
        <strong>${escapeHtml(status)}</strong>
        <small>${escapeHtml(subtitle || "Waiting for a run")}</small>
      </article>
      <article class="radar-summary-card">
        <span>Total entries</span>
        <strong>${escapeHtml(String(totalEntries))}</strong>
        <small>Active trends in the board</small>
      </article>
      <article class="radar-summary-card">
        <span>Overall ring</span>
        <strong>${escapeHtml(ring)}</strong>
        <small>Latest portfolio recommendation</small>
      </article>
    `;
  }

  function renderList(items) {
    if (!items || !items.length) {
      return `<p class="radar-muted">No items returned.</p>`;
    }
    return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }

  function scoreLine(label, value) {
    const safeValue = Math.max(0, Math.min(5, Number(value) || 0));
    return `
      <div class="radar-score-line">
        <strong>${escapeHtml(label)}</strong>
        <span>${safeValue}/5</span>
        <div class="radar-score-bar"><div style="width:${safeValue * 20}%"></div></div>
      </div>
    `;
  }

  function normalizeTrendForBoard(trend) {
    return {
      ...trend,
      name: trend.name || trend.trend_name || "Unnamed trend",
      summary: trend.summary || trend.trend_summary || "",
      project_opportunities: trend.project_opportunities || trend.suggested_projects || [],
      signals: trend.signals || trend.evidence || [],
      recommended_action: trend.recommended_action || trend.recommended_next_step || "",
      innovation_center_relevance: trend.innovation_center_relevance || trend.innovation_center_fit || "",
      ring: trend.ring || trend.radar_ring || "Assess",
    };
  }

  function currentSetupPayload() {
    return {
      name: setupNameInput.value.trim() || document.getElementById("radarTopic").value.trim() || "Research setup",
      topic: document.getElementById("radarTopic").value.trim(),
      context: document.getElementById("radarContext").value.trim(),
      keywords: document.getElementById("radarKeywords").value.trim(),
    };
  }

  function collectPayload() {
    return {
      topic: document.getElementById("radarTopic").value.trim(),
      context: document.getElementById("radarContext").value.trim(),
      keywords: document.getElementById("radarKeywords").value.trim(),
      research_setup_id: state.activeSetupId,
      research_setup_name: setupNameInput.value.trim(),
      time_window: timeWindow.value,
      custom_date_start: document.getElementById("radarCustomDateStart").value || null,
      custom_date_end: document.getElementById("radarCustomDateEnd").value || null,
      output_types: collectCheckedValues("radar_output_type"),
      sources: state.sources.filter((source) => source.url.trim().length > 0),
      local_documents: state.selectedDocuments,
      max_search_results: Number(document.getElementById("radarMaxSearchResults").value) || 6,
    };
  }

  function renderSourceRows() {
    sourcesList.innerHTML = "";
    state.sources.forEach((source, index) => {
      const row = document.createElement("div");
      row.className = "radar-source-row";
      row.innerHTML = `
        <div>
          <label>Source name</label>
          <input type="text" data-field="source_name" data-index="${index}" placeholder="OpenAI Blog" value="${escapeHtml(source.source_name)}">
        </div>
        <div>
          <label>URL</label>
          <input type="url" data-field="url" data-index="${index}" placeholder="https://openai.com/news/" value="${escapeHtml(source.url)}">
        </div>
        <div>
          <button type="button" class="radar-button radar-button-muted" data-remove-index="${index}">
            <i class="fas fa-trash-alt"></i>
            <span>Remove</span>
          </button>
        </div>
      `;
      sourcesList.appendChild(row);
    });
  }

  function mergeSourcesIntoLibrary(sources) {
    const merged = [...state.savedSources];
    const seen = new Set(merged.map((source) => source.url.trim().toLowerCase()));

    sources.forEach((source) => {
      const normalizedUrl = source.url.trim();
      if (!normalizedUrl) {
        return;
      }
      const key = normalizedUrl.toLowerCase();
      if (seen.has(key)) {
        const existing = merged.find((item) => item.url.trim().toLowerCase() === key);
        if (existing && !existing.source_name.trim() && source.source_name.trim()) {
          existing.source_name = source.source_name.trim();
        }
        return;
      }
      seen.add(key);
      merged.push({
        source_name: source.source_name.trim(),
        url: normalizedUrl,
      });
    });

    state.savedSources = merged;
    saveSavedSources();
    renderSavedSourcesLibrary();
  }

  function addSavedSourceToCurrent(source) {
    const exists = state.sources.some((item) => item.url.trim().toLowerCase() === source.url.trim().toLowerCase());
    if (exists) {
      return;
    }

    if (state.sources.length === 1 && !state.sources[0].source_name.trim() && !state.sources[0].url.trim()) {
      state.sources = [{ source_name: source.source_name || "", url: source.url || "" }];
    } else {
      state.sources.push({ source_name: source.source_name || "", url: source.url || "" });
    }
    saveSourceDraft();
    renderSourceRows();
  }

  function removeSavedSource(url) {
    state.savedSources = state.savedSources.filter((source) => source.url.trim().toLowerCase() !== url.trim().toLowerCase());
    saveSavedSources();
    renderSavedSourcesLibrary();
  }

  function renderSavedSourcesLibrary() {
    if (!state.savedSources.length) {
      savedSourcesLibrary.innerHTML = "";
      return;
    }

    savedSourcesLibrary.innerHTML = `
      <article class="radar-saved-library-card">
        <div class="radar-saved-library-head">
          <div>
            <label>Saved sources</label>
            <p class="radar-muted">Reuse the web sources you keep adding across radar runs.</p>
          </div>
          <span class="radar-muted">${state.savedSources.length} saved</span>
        </div>
        <div class="radar-saved-source-list">
          ${state.savedSources
            .map(
              (source) => `
                <div class="radar-saved-source-item">
                  <div>
                    <strong>${escapeHtml(source.source_name || source.url)}</strong>
                    <span>${escapeHtml(source.url)}</span>
                  </div>
                  <div class="radar-inline-actions">
                    <button type="button" class="radar-button radar-button-muted" data-use-saved-source="${escapeHtml(source.url)}">Use</button>
                    <button type="button" class="radar-button radar-button-muted" data-delete-saved-source="${escapeHtml(source.url)}">Remove</button>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </article>
    `;
  }

  function renderFiles() {
    const filteredFiles = state.files.filter((file) => /\.(pdf|txt|md|docx?|pptx|csv|xlsx?|html?)$/i.test(file));
    if (!filteredFiles.length) {
      filesList.innerHTML = `<p class="radar-muted">No local files uploaded yet.</p>`;
      return;
    }

    filesList.innerHTML = filteredFiles
      .map(
        (file) => `
          <article class="radar-doc-card">
            <label class="radar-doc-toggle">
              <input type="checkbox" data-doc-name="${escapeHtml(file)}" ${state.selectedDocuments.includes(file) ? "checked" : ""}>
              <span>
                <strong>${escapeHtml(file)}</strong>
                <small>Use this file as supporting context for the radar.</small>
              </span>
            </label>
            <button type="button" class="radar-button radar-button-muted" data-delete-file="${escapeHtml(file)}">
              <i class="fas fa-trash-alt"></i>
              <span>Delete</span>
            </button>
          </article>
        `
      )
      .join("");
  }

  function applyResearchSetup(setup) {
    state.activeSetupId = setup.id || "";
    setupNameInput.value = setup.name || "";
    document.getElementById("radarTopic").value = setup.topic || "";
    document.getElementById("radarContext").value = setup.context || "";
    document.getElementById("radarKeywords").value = setup.keywords || "";
    statusText.textContent = `Loaded setup: ${setup.name || setup.topic || "Research setup"}`;
    renderSavedResearchSetups();
  }

  function renderSavedResearchSetups() {
    if (!state.savedSetups.length) {
      savedResearchSetups.innerHTML = `<p class="radar-muted">No research setups saved yet.</p>`;
      return;
    }

    savedResearchSetups.innerHTML = state.savedSetups
      .map(
        (setup) => `
          <article class="radar-saved-library-card">
            <div class="radar-saved-library-head">
              <div>
                <strong>${escapeHtml(setup.name || setup.topic || "Research setup")}</strong>
                <p class="radar-muted">${escapeHtml(setup.topic || "")}</p>
              </div>
              ${state.activeSetupId === setup.id ? '<span class="radar-ring-pill radar-ring-adopt">Selected</span>' : ""}
            </div>
            <div class="radar-run-history">
              ${setup.keywords ? `<span>${escapeHtml(setup.keywords)}</span>` : ""}
              <span>${escapeHtml(formatDate(setup.updated_at))}</span>
            </div>
            <div class="radar-inline-actions">
              <button type="button" class="radar-button radar-button-muted" data-use-setup="${escapeHtml(setup.id)}">Use setup</button>
              <button type="button" class="radar-button radar-button-muted" data-delete-setup="${escapeHtml(setup.id)}">Delete</button>
            </div>
          </article>
        `
      )
      .join("");
  }

  function renderSavedRadarBoards() {
    if (!state.savedBoards.length) {
      savedRadarBoards.innerHTML = `<p class="radar-muted">No radar boards saved yet.</p>`;
      return;
    }

    savedRadarBoards.innerHTML = state.savedBoards
      .map((board) => {
        const trends = board.trends || [];
        const latest = board.latest_result || {};
        const recentRuns = (board.runs_history || []).slice(0, 3);
        return `
          <article class="radar-board-card">
            <div class="radar-board-head">
              <div>
                <div class="radar-entry-meta">Research setup</div>
                <h3>${escapeHtml(board.name || board.setup_snapshot?.topic || "Radar board")}</h3>
                <p class="radar-muted">${escapeHtml(board.setup_snapshot?.topic || "")}</p>
              </div>
              ${state.activeBoard?.id === board.id ? '<span class="radar-ring-pill radar-ring-adopt">Open</span>' : ""}
            </div>
            <div class="radar-board-meta">
              <span>${escapeHtml(String(trends.length))} active trends</span>
              <span>${escapeHtml(String((board.runs_history || []).length))} runs</span>
              <span>${escapeHtml(formatDate(board.last_run_at))}</span>
              <span>${escapeHtml(latest.radar_ring || "Assess")}</span>
            </div>
            <div class="radar-run-history">
              ${recentRuns.map((run) => `<span>${escapeHtml(formatDate(run.date || run.timestamp))}</span>`).join("")}
            </div>
            <div class="radar-inline-actions">
              <button type="button" class="radar-button radar-button-muted" data-open-board="${escapeHtml(board.id)}">Open board</button>
              <button type="button" class="radar-button radar-button-muted" data-load-board-setup="${escapeHtml(board.id)}">Load setup</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function upsertSavedBoard(board) {
    if (!board?.id) {
      return;
    }

    const existingIndex = state.savedBoards.findIndex((item) => item.id === board.id);
    if (existingIndex >= 0) {
      state.savedBoards.splice(existingIndex, 1, board);
    } else {
      state.savedBoards.unshift(board);
    }

    state.savedBoards.sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")));
  }

  function renderAnalytics(title, counts) {
    const items = Object.entries(counts || {});
    return `
      <section class="radar-section-card">
        <div class="radar-entry-meta">${escapeHtml(title)}</div>
        <div class="radar-entry-tags">
          ${items.length ? items.map(([label, value]) => `<span>${escapeHtml(label)}: ${escapeHtml(String(value))}</span>`).join("") : `<span>No data</span>`}
        </div>
      </section>
    `;
  }

  function renderSourceMap(items) {
    if (!items || !items.length) {
      return `<p class="radar-muted">No sources returned.</p>`;
    }
    return `
      <div class="radar-source-links">
        ${items
          .map((item) => {
            const label = deriveSourceLabel(item);
            const isHttp = /^https?:\/\//i.test(item.url || "");
            return isHttp
              ? `<a class="radar-source-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
              : `<span class="radar-source-link">${escapeHtml(label)}</span>`;
          })
          .join("")}
      </div>
    `;
  }

  function buildMapItems(trends) {
    const sorted = [...trends].sort((left, right) => {
      const qDiff = (QUADRANT_INDEX[left.quadrant] ?? 99) - (QUADRANT_INDEX[right.quadrant] ?? 99);
      if (qDiff !== 0) {
        return qDiff;
      }
      const rDiff = (RING_INDEX[left.ring] ?? 99) - (RING_INDEX[right.ring] ?? 99);
      if (rDiff !== 0) {
        return rDiff;
      }
      return String(left.name || "").localeCompare(String(right.name || ""));
    });

    return sorted.map((trend, index) => ({
      ...trend,
      mapNumber: index + 1,
    }));
  }

  function buildRadarMapSvg(mapItems) {
    const centerX = 320;
    const centerY = 320;
    const ringRadii = [90, 150, 210, 270];
    const svgParts = [];

    svgParts.push(`<svg class="radar-map-svg" viewBox="0 0 640 640" role="img" aria-label="Innovation Center radar map with four quadrants and four recommendation rings">`);
    svgParts.push(`<rect class="radar-map-surface" x="0" y="0" width="640" height="640"></rect>`);
    ringRadii.forEach((radius, index) => {
      const ring = RING_ORDER[index].toLowerCase();
      svgParts.push(`<circle class="radar-map-ring radar-map-ring-${ring}" cx="${centerX}" cy="${centerY}" r="${radius}"></circle>`);
    });
    svgParts.push(`<line class="radar-map-axis" x1="${centerX}" y1="40" x2="${centerX}" y2="600"></line>`);
    svgParts.push(`<line class="radar-map-axis" x1="40" y1="${centerY}" x2="600" y2="${centerY}"></line>`);
    svgParts.push(`<circle class="radar-map-core" cx="${centerX}" cy="${centerY}" r="34"></circle>`);
    svgParts.push(`<text class="radar-map-core-label" x="${centerX}" y="${centerY + 5}" text-anchor="middle">IC</text>`);

    const placementMap = {};

    QUADRANT_ORDER.forEach((quadrant, quadrantIndex) => {
      RING_ORDER.forEach((ring, ringIndex) => {
        const bucket = mapItems.filter((item) => item.quadrant === quadrant && item.ring === ring);
        const startRadius = ringIndex === 0 ? 45 : ringRadii[ringIndex - 1] + 18;
        const endRadius = ringRadii[ringIndex] - 20;
        const radius = startRadius + Math.max(0, endRadius - startRadius) / 2;
        const startAngle = [180, 270, 90, 0][quadrantIndex];
        const endAngle = [270, 360, 180, 90][quadrantIndex];
        const angleStep = (endAngle - startAngle) / (bucket.length + 1 || 1);

        bucket.forEach((item, index) => {
          const angleDegrees = startAngle + angleStep * (index + 1);
          const angleRadians = (angleDegrees * Math.PI) / 180;
          const x = centerX + radius * Math.cos(angleRadians);
          const y = centerY + radius * Math.sin(angleRadians);
          placementMap[item.trend_id] = { x, y };
        });
      });
    });

    mapItems.forEach((item) => {
      const placement = placementMap[item.trend_id];
      const ringClass = String(item.ring || "assess").toLowerCase();
      const markerLabel = `${item.mapNumber}. ${item.name || "Trend"}. ${item.quadrant || "Quadrant"}, ${item.ring || "Assess"}.`;
      svgParts.push(`<g class="radar-map-marker radar-map-marker-${ringClass}" tabindex="0" role="img" aria-label="${escapeHtml(markerLabel)}">`);
      svgParts.push(`<title>${escapeHtml(markerLabel)}</title>`);
      svgParts.push(`<circle class="radar-map-marker-halo" cx="${placement.x}" cy="${placement.y}" r="20"></circle>`);
      svgParts.push(`<circle class="radar-map-marker-dot" cx="${placement.x}" cy="${placement.y}" r="15"></circle>`);
      svgParts.push(`<text class="radar-map-marker-number" x="${placement.x}" y="${placement.y + 5}" text-anchor="middle">${item.mapNumber}</text>`);
      svgParts.push(`</g>`);
    });

    svgParts.push(`</svg>`);
    return svgParts.join("");
  }

  function renderRadarMap(mapItems) {
    return `
      <section class="radar-section-card radar-map-card">
        <div class="radar-map-heading">
          <div>
            <div class="radar-entry-meta">Radar map</div>
            <h3>Accumulated trend map</h3>
          </div>
          <span class="radar-map-total">${mapItems.length} active ${mapItems.length === 1 ? "signal" : "signals"}</span>
        </div>
        <div class="radar-map-grid">
          <div class="radar-map-shell">
            <div class="radar-map-frame">
              ${buildRadarMapSvg(mapItems)}
              <div class="radar-map-caption">
                <span>Techniques</span>
                <span>Platforms</span>
                <span>Tools</span>
                <span>Languages &amp; Frameworks</span>
              </div>
              <div class="radar-map-ring-key" aria-label="Radar ring order">
                <span class="radar-ring-adopt">Adopt</span>
                <span class="radar-ring-trial">Trial</span>
                <span class="radar-ring-assess">Assess</span>
                <span class="radar-ring-caution">Caution</span>
              </div>
            </div>
          </div>
          <div class="radar-map-legend">
            <div class="radar-map-legend-head">
              <strong>Numbered trends</strong>
              <span>Use the board list to review or remove a signal.</span>
            </div>
            ${mapItems
              .map(
                (item) => `
                  <article class="radar-map-legend-item">
                    <span class="radar-map-number radar-map-number-${String(item.ring || "assess").toLowerCase()}">${item.mapNumber}</span>
                    <div>
                      <strong>${escapeHtml(item.name || "Trend")}</strong>
                      <small>${escapeHtml(item.quadrant || "Quadrant")} · ${escapeHtml(item.ring || "Assess")}</small>
                    </div>
                    <button type="button" class="radar-button radar-button-muted radar-delete-button" data-delete-board-trend="${escapeHtml(item.trend_id)}" title="Remove ${escapeHtml(item.name || "trend")} from this board">
                      <i class="fas fa-trash-can" aria-hidden="true"></i><span>Remove</span>
                    </button>
                  </article>
                `
              )
              .join("")}
          </div>
        </div>
      </section>
    `;
  }

  function renderEntry(entry) {
    return `
      <article class="radar-entry-card">
        <div class="radar-entry-topline">
          <div>
            <div class="radar-entry-meta">${escapeHtml(entry.entry_type || "trend")}</div>
            <h4>${escapeHtml(entry.name || "Radar entry")}</h4>
          </div>
          <span class="radar-quadrant-pill">${escapeHtml(entry.quadrant || "Techniques")}</span>
        </div>
        <p>${escapeHtml(entry.summary || "")}</p>
        <div class="radar-entry-columns">
          <div>
            <h5>Why relevant</h5>
            <p>${escapeHtml(entry.why_relevant || "")}</p>
            <h5>Innovation Center fit</h5>
            <p>${escapeHtml(entry.innovation_center_relevance || "")}</p>
          </div>
          <div>
            <h5>Scores</h5>
            <div class="radar-score-list">
              ${scoreLine("Strategic", entry.scores?.strategic_impact || 0)}
              ${scoreLine("Market", entry.scores?.market_client_potential || 0)}
              ${scoreLine("Readiness", entry.scores?.execution_readiness || 0)}
              ${scoreLine("Scalable asset", entry.scores?.scalable_asset_potential || 0)}
            </div>
          </div>
        </div>
        <div class="radar-entry-columns">
          <div>
            <h5>Project opportunities</h5>
            ${renderList(entry.project_opportunities)}
          </div>
          <div>
            <h5>Signals</h5>
            ${renderList(entry.signals)}
          </div>
        </div>
        <h5>Linked sources</h5>
        <div class="radar-source-links">
          ${(entry.linked_source_urls || [])
            .map((url, index) => {
              const label = deriveSourceLabel({ name: entry.linked_source_names?.[index] || "", url });
              const isHttp = /^https?:\/\//i.test(url || "");
              return isHttp
                ? `<a class="radar-source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
                : `<span class="radar-source-link">${escapeHtml(label)}</span>`;
            })
            .join("")}
        </div>
        <p><strong>Recommended action:</strong> ${escapeHtml(entry.recommended_action || "")}</p>
        <h5>Risks</h5>
        ${renderList(entry.risks)}
        <div class="radar-entry-tags">${(entry.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      </article>
    `;
  }

  function renderLane(ring, entries) {
    return `
      <section class="radar-lane-card">
        <div class="radar-lane-head">
          <div>
            <div class="radar-entry-meta">Radar ring</div>
            <h3>${escapeHtml(ring)}</h3>
          </div>
          <span class="radar-ring-pill radar-ring-${ring.toLowerCase()}">${escapeHtml(String(entries.length))} entries</span>
        </div>
        <div class="radar-entry-grid">
          ${entries.length ? entries.map((entry) => renderEntry(entry)).join("") : `<p class="radar-muted">No entries in this ring.</p>`}
        </div>
      </section>
    `;
  }

  function renderRunsHistory(board) {
    const runs = board.runs_history || [];
    return `
      <section class="radar-section-card">
        <div class="radar-entry-meta">History</div>
        <h3>Saved runs for this research setup</h3>
        <div class="radar-board-history">
          ${runs
            .map(
              (run) => `
                <article class="radar-board-card">
                  <div class="radar-board-head">
                    <div>
                      <strong>${escapeHtml(run.topic || "Radar run")}</strong>
                      <p class="radar-muted">${escapeHtml(formatDate(run.date || run.timestamp))}</p>
                    </div>
                    <span class="radar-ring-pill radar-ring-${String(run.radar_ring || "assess").toLowerCase()}">${escapeHtml(run.radar_ring || "Assess")}</span>
                  </div>
                  <div class="radar-board-meta">
                    <span>${escapeHtml(String(run.entry_count || 0))} entries</span>
                    ${Object.entries(run.ring_counts || {}).map(([label, value]) => `<span>${escapeHtml(label)}: ${escapeHtml(String(value))}</span>`).join("")}
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function renderBoard(board) {
    state.activeBoard = board;
    upsertSavedBoard(board);
    const latest = normalizeResultPayload(board.latest_result || {});
    const trends = buildMapItems((board.trends || []).filter((trend) => !trend.deleted).map((trend) => normalizeTrendForBoard(trend)));
    const grouped = { Adopt: [], Trial: [], Assess: [], Caution: [] };
    trends.forEach((trend) => {
      grouped[trend.ring] = grouped[trend.ring] || [];
      grouped[trend.ring].push(trend);
    });

    renderSummary("Completed", trends.length, latest.radar_ring || "Assess", `${board.name || "Radar board"} updated ${formatDate(board.updated_at)}`);

    results.innerHTML = [
      `<section class="radar-section-card">
        <div class="radar-entry-meta">Executive summary</div>
        <h3>${escapeHtml(latest.topic || board.setup_snapshot?.topic || "Technology Radar")}</h3>
        <p>${escapeHtml(latest.executive_summary || "")}</p>
        <p><strong>Why it matters:</strong> ${escapeHtml(latest.why_it_matters || "")}</p>
        <p><strong>Radar story:</strong> ${escapeHtml(latest.radar_story || "")}</p>
      </section>`,
      `<div class="radar-summary-analytics">
        ${renderAnalytics("Rings", latest.ring_counts || groupedSummary(trends, "ring"))}
        ${renderAnalytics("Quadrants", latest.quadrant_counts || groupedSummary(trends, "quadrant"))}
      </div>`,
      renderRadarMap(trends),
      `<section class="radar-section-card">
        <div class="radar-entry-meta">Priority moves</div>
        ${renderList(latest.priority_moves)}
      </section>`,
      `<section class="radar-section-card">
        <div class="radar-entry-meta">Source map</div>
        ${renderSourceMap(latest.source_map || latest.sources)}
      </section>`,
      renderRunsHistory(board),
      `<div class="radar-lane-stack">
        ${RING_ORDER.map((ring) => renderLane(ring, grouped[ring] || [])).join("")}
      </div>`,
    ].join("");

    results.classList.remove("radar-hidden");
    emptyState.classList.add("radar-hidden");
    renderSavedRadarBoards();
  }

  function groupedSummary(items, field) {
    return items.reduce((accumulator, item) => {
      const key = item[field] || "Unknown";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});
  }

  async function fetchFiles() {
    const response = await fetch("/files/");
    if (!response.ok) {
      throw new Error(`Could not load files (${response.status})`);
    }
    const data = await response.json();
    state.files = data.files || [];
    state.selectedDocuments = state.selectedDocuments.filter((name) => state.files.includes(name));
    renderFiles();
  }

  async function fetchSavedSetups() {
    const response = await fetch("/api/ic-radar-setups");
    if (!response.ok) {
      throw new Error(`Could not load research setups (${response.status})`);
    }
    const data = await response.json();
    state.savedSetups = data.setups || [];
    renderSavedResearchSetups();
  }

  async function fetchSavedBoards() {
    const response = await fetch("/api/ic-radar-boards");
    if (!response.ok) {
      throw new Error(`Could not load radar boards (${response.status})`);
    }
    const data = await response.json();
    state.savedBoards = data.boards || [];
    if (state.activeBoard?.id) {
      const refreshedActiveBoard = state.savedBoards.find((item) => item.id === state.activeBoard.id);
      if (refreshedActiveBoard) {
        state.activeBoard = refreshedActiveBoard;
      }
    }
    if (!state.activeBoard && state.savedBoards.length) {
      state.activeBoard = state.savedBoards[0];
      renderBoard(state.activeBoard);
    } else {
      renderSavedRadarBoards();
    }
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/upload/", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Upload failed for ${file.name}`);
      }
    }
  }

  async function saveCurrentSetup() {
    const payload = currentSetupPayload();
    if (!payload.topic || !payload.context || !payload.keywords) {
      throw new Error("Fill Innovation Center Context, Research Topic, and Keywords before saving the setup");
    }

    const response = await fetch("/api/ic-radar-setups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Could not save research setup (${response.status})`);
    }
    const data = await response.json();
    state.activeSetupId = data.setup.id;
    setupNameInput.value = data.setup.name || "";
    await fetchSavedSetups();
    statusText.textContent = "Research setup saved";
  }

  async function openBoard(boardId) {
    const response = await fetch(`/api/ic-radar-boards/${encodeURIComponent(boardId)}`);
    if (!response.ok) {
      throw new Error(`Could not load radar board (${response.status})`);
    }
    const data = await response.json();
    upsertSavedBoard(data.board);
    renderBoard(data.board);
  }

  async function deleteBoardTrend(trendId) {
    if (!state.activeBoard) {
      return;
    }
    const response = await fetch(`/api/ic-radar-boards/${encodeURIComponent(state.activeBoard.id)}/trends/${encodeURIComponent(trendId)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`Could not delete trend (${response.status})`);
    }
    const data = await response.json();
    upsertSavedBoard(data.board);
    renderBoard(data.board);
    await fetchSavedBoards();
    statusText.textContent = "Trend removed from radar board";
  }

  sourcesList.addEventListener("input", (event) => {
    const field = event.target.getAttribute("data-field");
    const index = Number(event.target.getAttribute("data-index"));
    if (!field || Number.isNaN(index) || !state.sources[index]) {
      return;
    }
    state.sources[index][field] = event.target.value;
    saveSourceDraft();
  });

  sourcesList.addEventListener("click", (event) => {
    const removeTarget = event.target.closest("[data-remove-index]");
    if (!removeTarget) {
      return;
    }
    const index = Number(removeTarget.getAttribute("data-remove-index"));
    if (Number.isNaN(index)) {
      return;
    }
    state.sources.splice(index, 1);
    if (!state.sources.length) {
      state.sources.push(defaultSource());
    }
    renderSourceRows();
    saveSourceDraft();
  });

  savedSourcesLibrary.addEventListener("click", (event) => {
    const useBtn = event.target.closest("[data-use-saved-source]");
    if (useBtn) {
      const savedSource = state.savedSources.find((source) => source.url === useBtn.getAttribute("data-use-saved-source"));
      if (savedSource) {
        addSavedSourceToCurrent(savedSource);
      }
      return;
    }

    const deleteBtn = event.target.closest("[data-delete-saved-source]");
    if (deleteBtn) {
      removeSavedSource(deleteBtn.getAttribute("data-delete-saved-source") || "");
    }
  });

  savedResearchSetups.addEventListener("click", async (event) => {
    const useBtn = event.target.closest("[data-use-setup]");
    if (useBtn) {
      const setup = state.savedSetups.find((item) => item.id === useBtn.getAttribute("data-use-setup"));
      if (setup) {
        applyResearchSetup(setup);
      }
      return;
    }

    const deleteBtn = event.target.closest("[data-delete-setup]");
    if (deleteBtn) {
      const setupId = deleteBtn.getAttribute("data-delete-setup");
      const response = await fetch(`/api/ic-radar-setups/${encodeURIComponent(setupId)}`, { method: "DELETE" });
      if (!response.ok) {
        statusText.textContent = "Could not delete research setup";
        return;
      }
      if (state.activeSetupId === setupId) {
        state.activeSetupId = "";
      }
      await fetchSavedSetups();
      statusText.textContent = "Research setup deleted";
    }
  });

  savedRadarBoards.addEventListener("click", async (event) => {
    const openBtn = event.target.closest("[data-open-board]");
    if (openBtn) {
      await openBoard(openBtn.getAttribute("data-open-board"));
      return;
    }

    const loadBtn = event.target.closest("[data-load-board-setup]");
    if (loadBtn) {
      const board = state.savedBoards.find((item) => item.id === loadBtn.getAttribute("data-load-board-setup"));
      if (board?.setup_snapshot) {
        applyResearchSetup({
          id: board.setup_snapshot.research_setup_id || "",
          name: board.name || "",
          topic: board.setup_snapshot.topic || "",
          context: board.setup_snapshot.context || "",
          keywords: board.setup_snapshot.keywords || "",
        });
      }
    }
  });

  results.addEventListener("click", async (event) => {
    const deleteBtn = event.target.closest("[data-delete-board-trend]");
    if (!deleteBtn) {
      return;
    }
    await deleteBoardTrend(deleteBtn.getAttribute("data-delete-board-trend"));
  });

  filesList.addEventListener("change", (event) => {
    const docName = event.target.getAttribute("data-doc-name");
    if (!docName) {
      return;
    }
    if (event.target.checked) {
      if (!state.selectedDocuments.includes(docName)) {
        state.selectedDocuments.push(docName);
      }
    } else {
      state.selectedDocuments = state.selectedDocuments.filter((name) => name !== docName);
    }
  });

  filesList.addEventListener("click", async (event) => {
    const deleteBtn = event.target.closest("[data-delete-file]");
    if (!deleteBtn) {
      return;
    }
    const fileName = deleteBtn.getAttribute("data-delete-file");
    try {
      const response = await fetch(`/files/${encodeURIComponent(fileName)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Could not delete ${fileName}`);
      }
      await fetchFiles();
    } catch (error) {
      statusText.textContent = error.message || "File deletion failed";
    }
  });

  addSourceBtn.addEventListener("click", () => {
    state.sources.push(defaultSource());
    renderSourceRows();
    saveSourceDraft();
  });

  saveSourcesBtn.addEventListener("click", () => {
    mergeSourcesIntoLibrary(state.sources.filter((source) => source.url.trim()));
    statusText.textContent = "Sources saved for future radar runs";
  });

  clearSavedSourcesBtn.addEventListener("click", () => {
    state.savedSources = [];
    saveSavedSources();
    renderSavedSourcesLibrary();
    statusText.textContent = "Saved sources cleared";
  });

  saveResearchSetupBtn.addEventListener("click", async () => {
    try {
      await saveCurrentSetup();
    } catch (error) {
      statusText.textContent = error.message || "Could not save research setup";
    }
  });

  timeWindow.addEventListener("change", () => {
    customDateRange.classList.toggle("radar-hidden", timeWindow.value !== "Custom date range");
  });

  refreshFilesBtn.addEventListener("click", async () => {
    try {
      await fetchFiles();
      statusText.textContent = "File list refreshed";
    } catch (error) {
      statusText.textContent = error.message || "File refresh failed";
    }
  });

  localFileInput.addEventListener("change", async () => {
    if (!localFileInput.files?.length) {
      return;
    }
    try {
      statusText.textContent = "Uploading local documents...";
      await uploadFiles(localFileInput.files);
      await fetchFiles();
      statusText.textContent = "Files uploaded";
    } catch (error) {
      statusText.textContent = error.message || "Upload failed";
    } finally {
      localFileInput.value = "";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    results.classList.add("radar-hidden");
    renderSummary("Running", 0, "Assess", "Collecting signals and placing entries");
    setLoading(true);

    try {
      const response = await fetch("/api/ic-technology-radar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(collectPayload()),
      });

      if (!response.ok) {
        throw new Error(`Technology radar request failed with status ${response.status}`);
      }

      const data = await response.json();
      if (data.board) {
        upsertSavedBoard(data.board);
        renderBoard(data.board);
        renderSavedRadarBoards();
      } else {
        renderSummary("Completed", (data.radar_entries || []).length, data.radar_ring || "Assess", "Technology radar generated");
      }
      await fetchSavedBoards();
      statusText.textContent = "Technology radar generated and saved";
    } catch (error) {
      renderSummary("Error", 0, "Caution", "The radar run did not complete");
      results.classList.remove("radar-hidden");
      results.innerHTML = `
        <section class="radar-section-card">
          <div class="radar-entry-meta">Error</div>
          <h3>Could not complete Technology Radar generation</h3>
          <p>${escapeHtml(error.message || "Unknown error")}</p>
        </section>
      `;
      statusText.textContent = "Error";
    } finally {
      setLoading(false);
    }
  });

  async function init() {
    state.savedSources = readSavedSources();
    loadSourceDraft();
    renderSummary("Idle", 0, "Assess", "Waiting for a run");
    renderSourceRows();
    renderSavedSourcesLibrary();
    renderFiles();
    renderSavedResearchSetups();
    renderSavedRadarBoards();

    try {
      await Promise.all([fetchFiles(), fetchSavedSetups(), fetchSavedBoards()]);
    } catch (error) {
      statusText.textContent = error.message || "Could not load radar workspace";
    }
  }

  init();
})();
