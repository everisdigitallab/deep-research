// Moonshots: list + detail (phase stepper, Gantt, checkpoints, funding, legal, KPIs, decision)
const PHASE_ORDER = [
  'ideation', 'qualification', 'cubo_gate', 'scouting', 'matching', 'solution_design',
  'legal_feasibility', 'financial_feasibility', 'approval', 'contracting', 'kickoff',
  'execution', 'validation', 'scale_or_stop', 'closing', 'commercial_conversion'
]

async function renderMoonshotsView(content, id) {
  if (id) return renderMoonshotDetail(content, id)

  const editionId = window.state.currentEditionId
  const moonshots = await api.get(`/moonshots${editionId ? '?edition_id=' + editionId : ''}`)

  content.innerHTML = `
    <div class="mb-6 flex items-center justify-between">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold"><i class="fa-solid fa-satellite text-future-blue mr-2"></i>Moonshots</h1>
      <button id="new-moonshot-btn" class="btn-primary"><i class="fa-solid fa-plus mr-1"></i> Novo Moonshot</button>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Código</th><th>Título</th><th>Fase</th><th>Jurídico</th><th>Financeiro</th><th></th></tr></thead>
        <tbody>
          ${moonshots.map((m) => `
            <tr>
              <td class="font-mono text-xs">${escapeHtml(m.code)}</td>
              <td>${escapeHtml(m.title)}</td>
              <td><span class="badge badge-blue">${phaseLabel(m.phase)}</span></td>
              <td><span class="badge ${statusBadge(m.legal_status || 'draft')}">${escapeHtml(m.legal_status || 'pending')}</span></td>
              <td><span class="badge ${statusBadge(m.financial_status || 'draft')}">${escapeHtml(m.financial_status || 'pending')}</span></td>
              <td><a href="#/moonshots/${m.id}" class="text-future-blue hover:underline text-xs">Abrir <i class="fa-solid fa-arrow-right"></i></a></td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${moonshots.length === 0 ? '<p class="text-sm text-gray-100 mt-3">Nenhum Moonshot cadastrado.</p>' : ''}
    </div>
  `

  document.getElementById('new-moonshot-btn').addEventListener('click', async () => {
    if (!editionId) { alert('Selecione uma edição primeiro.'); return }
    const [startups, clients] = await Promise.all([api.get('/startups'), api.get('/clients')])
    openMoonshotCreateModal(editionId, startups, clients)
  })
}

function openMoonshotCreateModal(editionId, startups, clients) {
  const modal = document.createElement('div')
  modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50'
  modal.innerHTML = `
    <div class="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <h3 class="font-semibold text-lg text-smart-navy mb-4">Novo Moonshot</h3>
      <form id="moonshot-form" class="space-y-3">
        <div><label class="form-label">Título *</label><input class="form-input" name="title" required /></div>
        <div><label class="form-label">Patrocinador</label><input class="form-input" name="sponsor" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="form-label">Início planejado</label><input type="date" class="form-input" name="planned_start_date" /></div>
          <div><label class="form-label">Fim planejado</label><input type="date" class="form-input" name="planned_end_date" /></div>
        </div>
        <div>
          <label class="form-label">Startup(s) * (ctrl/cmd+click p/ múltiplas)</label>
          <select class="form-select" name="startup_ids" multiple size="4" required>
            ${startups.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">Cliente(s) (deixe vazio se for interno)</label>
          <select class="form-select" name="client_ids" multiple size="4">
            ${clients.map((cl) => `<option value="${cl.id}">${escapeHtml(cl.name)}</option>`).join('')}
          </select>
        </div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="is_internal" /> Moonshot interno (sem cliente externo)</label>
        <div id="moonshot-form-error" class="hidden text-sm text-orange-a"></div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="moonshot-form-cancel" class="btn-secondary">Cancelar</button>
          <button type="submit" class="btn-primary">Criar</button>
        </div>
      </form>
    </div>
  `
  document.body.appendChild(modal)
  modal.querySelector('#moonshot-form-cancel').addEventListener('click', () => modal.remove())
  modal.querySelector('#moonshot-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const form = e.target
    const body = {
      edition_id: editionId,
      title: form.title.value,
      sponsor: form.sponsor.value || null,
      planned_start_date: form.planned_start_date.value || null,
      planned_end_date: form.planned_end_date.value || null,
      is_internal: form.is_internal.checked,
      startup_ids: Array.from(form.startup_ids.selectedOptions).map((o) => o.value),
      client_ids: Array.from(form.client_ids.selectedOptions).map((o) => o.value)
    }
    try {
      const res = await api.post('/moonshots', body)
      modal.remove()
      window.location.hash = `#/moonshots/${res.id}`
    } catch (err) {
      const errEl = modal.querySelector('#moonshot-form-error')
      errEl.textContent = err.message
      errEl.classList.remove('hidden')
    }
  })
}

async function renderMoonshotDetail(content, id) {
  const ms = await api.get(`/moonshots/${id}`)

  content.innerHTML = `
    <div class="mb-6"><a href="#/moonshots" class="text-sm text-future-blue hover:underline"><i class="fa-solid fa-arrow-left mr-1"></i> Moonshots</a></div>
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="font-serif-heading text-2xl text-smart-navy font-bold">${escapeHtml(ms.title)}</h1>
        <p class="text-xs text-gray-100 font-mono">${escapeHtml(ms.code)}</p>
      </div>
      <div class="flex gap-2 items-center">
        <span class="badge ${statusBadge(ms.legal_status || 'draft')}">Jurídico: ${escapeHtml(ms.legal_status || 'pending')}</span>
        <span class="badge ${statusBadge(ms.financial_status || 'draft')}">Financeiro: ${escapeHtml(ms.financial_status || 'pending')}</span>
        <button id="edit-moonshot-btn" class="btn-secondary text-xs"><i class="fa-solid fa-pen mr-1"></i>Editar</button>
        <button id="delete-moonshot-btn" class="btn-secondary text-xs text-orange-a"><i class="fa-solid fa-trash mr-1"></i>Excluir</button>
      </div>
    </div>

    <div id="phase-stepper" class="card mb-6 overflow-x-auto"></div>

    <div class="grid grid-cols-3 gap-2 mb-6" id="moonshot-tabs">
      <button data-tab="overview" class="tab-btn btn-secondary text-xs active">Visão Geral</button>
      <button data-tab="gantt" class="tab-btn btn-secondary text-xs">Gantt / Milestones</button>
      <button data-tab="checkpoints" class="tab-btn btn-secondary text-xs">Checkpoints</button>
      <button data-tab="kpis" class="tab-btn btn-secondary text-xs">KPIs</button>
      <button data-tab="legal" class="tab-btn btn-secondary text-xs">Jurídico</button>
      ${ms.financial_access ? '<button data-tab="funding" class="tab-btn btn-secondary text-xs">Funding</button>' : ''}
      <button data-tab="decision" class="tab-btn btn-secondary text-xs">Decisão Final</button>
    </div>

    <div id="tab-content"></div>
  `

  renderPhaseStepper(ms)
  renderMoonshotTab('overview', ms)

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      renderMoonshotTab(btn.getAttribute('data-tab'), ms)
    })
  })

  document.getElementById('edit-moonshot-btn').addEventListener('click', () => {
    openSimpleFormModal('Editar Moonshot', [
      { name: 'title', label: 'Título *', required: true, value: ms.title },
      { name: 'sponsor', label: 'Patrocinador', value: ms.sponsor },
      { name: 'success_criteria', label: 'Critérios de sucesso', type: 'textarea', value: ms.success_criteria },
      { name: 'planned_start_date', label: 'Início planejado', type: 'date', value: ms.planned_start_date },
      { name: 'planned_end_date', label: 'Fim planejado', type: 'date', value: ms.planned_end_date },
      { name: 'duration_weeks', label: 'Duração (semanas)', type: 'number', value: ms.duration_weeks },
      { name: 'duration_exception_justification', label: 'Justificativa exceção de duração', type: 'textarea', value: ms.duration_exception_justification }
    ], async (body) => {
      if (body.duration_weeks) body.duration_weeks = parseInt(body.duration_weeks, 10)
      await api.put(`/moonshots/${id}`, body)
      renderRoute()
    })
  })

  document.getElementById('delete-moonshot-btn').addEventListener('click', async () => {
    if (!confirm('Excluir/arquivar este Moonshot? Esta ação requer permissão de Admin/Master Admin.')) return
    try {
      await api.del(`/moonshots/${id}`)
      window.location.hash = '#/moonshots'
    } catch (e) { alert(e.message) }
  })
}

function renderPhaseStepper(ms) {
  const el = document.getElementById('phase-stepper')
  const currentIdx = PHASE_ORDER.indexOf(ms.phase)
  el.innerHTML = `
    <div class="flex items-center gap-1 min-w-max pb-2">
      ${PHASE_ORDER.map((p, idx) => `
        <div class="flex items-center gap-1">
          <span class="text-[10px] px-2 py-1 rounded whitespace-nowrap ${idx === currentIdx ? 'bg-future-blue text-white font-semibold' : idx < currentIdx ? 'bg-green-a/20 text-green-a' : 'bg-gray-50 text-gray-100'}">${phaseLabel(p)}</span>
          ${idx < PHASE_ORDER.length - 1 ? '<i class="fa-solid fa-chevron-right text-gray-100 text-[10px]"></i>' : ''}
        </div>`).join('')}
    </div>
    <div class="flex items-center gap-2 mt-3">
      <select id="phase-select" class="form-select text-xs">
        ${PHASE_ORDER.map((p) => `<option value="${p}" ${p === ms.phase ? 'selected' : ''}>${phaseLabel(p)}</option>`).join('')}
      </select>
      <button id="phase-change-btn" class="btn-primary text-xs">Avançar fase</button>
    </div>
  `
  document.getElementById('phase-change-btn').addEventListener('click', async () => {
    const toPhase = document.getElementById('phase-select').value
    let comment = null, justification = null, authorizeWithPending = false
    const targetIdx = PHASE_ORDER.indexOf(toPhase)
    if (targetIdx < currentIdx) {
      justification = prompt('Justificativa obrigatória para retroceder de fase:')
      if (!justification) return
    }
    try {
      await api.post(`/moonshots/${ms.id}/phase`, { to_phase: toPhase, comment, justification })
      renderRoute()
    } catch (err) {
      if (err.status === 409 && err.data && err.data.error === 'pending_gate') {
        const confirmMsg = `Jurídico: ${err.data.legal_status || 'pendente'} | Financeiro: ${err.data.financial_status || 'pendente'}.\nDeseja autorizar avanço mesmo assim? (será auditado)`
        if (confirm(confirmMsg)) {
          const j = prompt('Justificativa para autorizar com pendências:') || 'Autorizado com pendências'
          try {
            await api.post(`/moonshots/${ms.id}/phase`, { to_phase: toPhase, authorize_with_pending: true, justification: j })
            renderRoute()
          } catch (e2) { alert(e2.message) }
        }
      } else {
        alert(err.message)
      }
    }
  })
}

function renderMoonshotTab(tab, ms) {
  const el = document.getElementById('tab-content')
  if (tab === 'overview') {
    el.innerHTML = `
      <div class="grid grid-cols-2 gap-6">
        <div class="card">
          <h3 class="font-semibold text-sm text-smart-navy mb-2">Startups</h3>
          <p class="text-sm text-gray-100">${(ms.startups || []).map((s) => escapeHtml(s.name)).join(', ') || 'Nenhuma'}</p>
        </div>
        <div class="card">
          <h3 class="font-semibold text-sm text-smart-navy mb-2">Clientes</h3>
          <p class="text-sm text-gray-100">${(ms.clients || []).map((c) => escapeHtml(c.name)).join(', ') || 'Interno'}</p>
        </div>
        <div class="card">
          <h3 class="font-semibold text-sm text-smart-navy mb-2">Equipe</h3>
          <table class="data-table"><tbody>
            ${(ms.members || []).map((m) => `<tr><td>${escapeHtml(m.user_name)}</td><td class="text-right text-xs text-gray-100">${escapeHtml(m.role_in_project)}</td></tr>`).join('')}
          </tbody></table>
        </div>
        <div class="card">
          <h3 class="font-semibold text-sm text-smart-navy mb-2">Cronograma</h3>
          <p class="text-sm text-gray-100">Início: ${fmtDate(ms.planned_start_date)} &mdash; Fim: ${fmtDate(ms.planned_end_date)}</p>
          <p class="text-sm text-gray-100">Duração: ${ms.duration_weeks || '-'} semanas</p>
        </div>
      </div>
    `
  } else if (tab === 'gantt') {
    renderGanttTab(el, ms)
  } else if (tab === 'checkpoints') {
    renderCheckpointsTab(el, ms)
  } else if (tab === 'kpis') {
    renderKpisTab(el, ms)
  } else if (tab === 'legal') {
    renderLegalTab(el, ms)
  } else if (tab === 'funding') {
    renderFundingTab(el, ms)
  } else if (tab === 'decision') {
    renderDecisionTab(el, ms)
  }
}

function renderGanttTab(el, ms) {
  const milestones = ms.milestones || []
  const allDates = milestones.flatMap((m) => [m.planned_start, m.planned_end]).filter(Boolean).map((d) => new Date(d).getTime())
  const minDate = allDates.length ? Math.min(...allDates) : Date.now()
  const maxDate = allDates.length ? Math.max(...allDates) : Date.now() + 30 * 86400000
  const span = Math.max(1, maxDate - minDate)

  el.innerHTML = `
    <div class="card mb-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-sm text-smart-navy">Gantt / Milestones</h3>
        <button id="new-milestone-btn" class="btn-secondary text-xs">+ Milestone</button>
      </div>
      <div class="space-y-2">
        ${milestones.map((m) => {
          const start = m.planned_start ? new Date(m.planned_start).getTime() : minDate
          const end = m.planned_end ? new Date(m.planned_end).getTime() : start
          const leftPct = ((start - minDate) / span) * 100
          const widthPct = Math.max(2, ((end - start) / span) * 100)
          const delayed = m.actual_end && m.planned_end && new Date(m.actual_end) > new Date(m.planned_end)
          return `
          <div class="gantt-row">
            <div class="text-xs w-40 truncate" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</div>
            <div class="gantt-track flex-1 relative h-5 bg-gray-50/50 rounded">
              <div class="gantt-bar absolute h-full rounded ${delayed ? 'delayed' : ''}" style="left:${leftPct}%;width:${widthPct}%;background:${m.is_milestone ? '#00CB5D' : '#0072BC'}"></div>
            </div>
            <div class="text-xs w-16 text-right">${m.percent_complete || 0}%</div>
            <div class="whitespace-nowrap">
              <button class="btn-secondary text-[11px] py-1 px-2 edit-milestone-btn" data-id="${m.id}"><i class="fa-solid fa-pen"></i></button>
              <button class="btn-secondary text-[11px] py-1 px-2 delete-milestone-btn text-orange-a" data-id="${m.id}"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>`
        }).join('')}
      </div>
      ${milestones.length === 0 ? '<p class="text-sm text-gray-100">Nenhum milestone cadastrado.</p>' : ''}
    </div>
  `
  document.getElementById('new-milestone-btn').addEventListener('click', () => {
    openSimpleFormModal('Novo Milestone', [
      { name: 'name', label: 'Nome *', required: true },
      { name: 'planned_start', label: 'Início planejado', type: 'date' },
      { name: 'planned_end', label: 'Fim planejado', type: 'date' },
      { name: 'percent_complete', label: '% concluído', type: 'number', value: '0' }
    ], async (body) => {
      if (body.percent_complete) body.percent_complete = parseInt(body.percent_complete, 10)
      await api.post(`/moonshots/${ms.id}/milestones`, body)
      renderRoute()
    })
  })

  el.querySelectorAll('.edit-milestone-btn').forEach((btn) => btn.addEventListener('click', () => {
    const mId = btn.getAttribute('data-id')
    const m = milestones.find((x) => x.id === mId)
    openSimpleFormModal('Editar Milestone', [
      { name: 'name', label: 'Nome *', required: true, value: m.name },
      { name: 'planned_start', label: 'Início planejado', type: 'date', value: m.planned_start },
      { name: 'planned_end', label: 'Fim planejado', type: 'date', value: m.planned_end },
      { name: 'actual_start', label: 'Início real', type: 'date', value: m.actual_start },
      { name: 'actual_end', label: 'Fim real', type: 'date', value: m.actual_end },
      { name: 'percent_complete', label: '% concluído', type: 'number', value: m.percent_complete }
    ], async (body) => {
      if (body.percent_complete) body.percent_complete = parseInt(body.percent_complete, 10)
      await api.put(`/moonshots/${ms.id}/milestones/${mId}`, body)
      renderRoute()
    })
  }))

  el.querySelectorAll('.delete-milestone-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Excluir este milestone?')) return
    try {
      await api.del(`/moonshots/${ms.id}/milestones/${btn.getAttribute('data-id')}`)
      renderRoute()
    } catch (e) { alert(e.message) }
  }))
}

function renderCheckpointsTab(el, ms) {
  const checkpoints = ms.checkpoints || []
  el.innerHTML = `
    <div class="card">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-sm text-smart-navy">Checkpoints semanais</h3>
        <button id="new-checkpoint-btn" class="btn-secondary text-xs">+ Checkpoint</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Data</th><th>Status</th><th>Progresso</th><th>Comentários</th><th></th></tr></thead>
        <tbody>
          ${checkpoints.map((cp) => `
            <tr>
              <td>${fmtDate(cp.checkpoint_date)}</td>
              <td><span class="badge ${statusBadge(cp.overall_status)}">${escapeHtml(cp.overall_status)}</span></td>
              <td>${cp.percent_progress || 0}%</td>
              <td class="text-xs">${escapeHtml(cp.comments || '-')}</td>
              <td class="text-right whitespace-nowrap">
                <button class="btn-secondary text-[11px] py-1 px-2 edit-checkpoint-btn" data-id="${cp.id}"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-secondary text-[11px] py-1 px-2 delete-checkpoint-btn text-orange-a" data-id="${cp.id}"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${checkpoints.length === 0 ? '<p class="text-sm text-gray-100 mt-2">Nenhum checkpoint registrado.</p>' : ''}
    </div>
  `
  document.getElementById('new-checkpoint-btn').addEventListener('click', () => {
    openSimpleFormModal('Novo Checkpoint', [
      { name: 'checkpoint_date', label: 'Data', type: 'date' },
      { name: 'overall_status', label: 'Status', type: 'select', options: [{ value: 'on_track', label: 'No prazo' }, { value: 'at_risk', label: 'Em risco' }, { value: 'delayed', label: 'Atrasado' }] },
      { name: 'percent_progress', label: '% progresso', type: 'number', value: '0' },
      { name: 'comments', label: 'Comentários', type: 'textarea' },
      { name: 'blockers', label: 'Bloqueios', type: 'textarea' }
    ], async (body) => {
      if (body.percent_progress) body.percent_progress = parseInt(body.percent_progress, 10)
      await api.post(`/moonshots/${ms.id}/checkpoints`, body)
      renderRoute()
    })
  })

  el.querySelectorAll('.edit-checkpoint-btn').forEach((btn) => btn.addEventListener('click', () => {
    const cpId = btn.getAttribute('data-id')
    const cp = checkpoints.find((x) => x.id === cpId)
    openSimpleFormModal('Editar Checkpoint', [
      { name: 'checkpoint_date', label: 'Data', type: 'date', value: cp.checkpoint_date },
      {
        name: 'overall_status', label: 'Status', type: 'select',
        options: [{ value: 'on_track', label: 'No prazo' }, { value: 'at_risk', label: 'Em risco' }, { value: 'delayed', label: 'Atrasado' }],
        value: cp.overall_status
      },
      { name: 'percent_progress', label: '% progresso', type: 'number', value: cp.percent_progress },
      { name: 'comments', label: 'Comentários', type: 'textarea', value: cp.comments },
      { name: 'blockers', label: 'Bloqueios', type: 'textarea', value: cp.blockers }
    ], async (body) => {
      if (body.percent_progress) body.percent_progress = parseInt(body.percent_progress, 10)
      await api.put(`/moonshots/checkpoints/${cpId}`, body)
      renderRoute()
    })
    setTimeout(() => {
      const sel = document.querySelector('#generic-form select[name="overall_status"]')
      if (sel) sel.value = cp.overall_status
    }, 0)
  }))

  el.querySelectorAll('.delete-checkpoint-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Excluir este checkpoint?')) return
    try {
      await api.del(`/moonshots/checkpoints/${btn.getAttribute('data-id')}`)
      renderRoute()
    } catch (e) { alert(e.message) }
  }))
}

function renderKpisTab(el, ms) {
  const kpis = ms.kpis || []
  el.innerHTML = `
    <div class="card">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-sm text-smart-navy">KPIs</h3>
        <button id="new-kpi-btn" class="btn-secondary text-xs">+ KPI</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Nome</th><th>Baseline</th><th>Meta</th><th>Atual</th><th></th></tr></thead>
        <tbody>
          ${kpis.map((k) => `
            <tr>
              <td>${escapeHtml(k.name)}</td>
              <td class="text-right">${k.baseline_value ?? '-'}</td>
              <td class="text-right">${k.target_value ?? '-'}</td>
              <td class="text-right font-semibold">${k.current_value ?? '-'}</td>
              <td class="text-right whitespace-nowrap space-x-1">
                <button class="btn-secondary text-[11px] py-1 px-2 add-kpi-record-btn" data-kpi-id="${k.id}">+ Registro</button>
                <button class="btn-secondary text-[11px] py-1 px-2 edit-kpi-btn" data-id="${k.id}"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-secondary text-[11px] py-1 px-2 delete-kpi-btn text-orange-a" data-id="${k.id}"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${kpis.length === 0 ? '<p class="text-sm text-gray-100 mt-2">Nenhum KPI cadastrado.</p>' : ''}
    </div>
  `
  document.getElementById('new-kpi-btn').addEventListener('click', () => {
    openSimpleFormModal('Novo KPI', [
      { name: 'name', label: 'Nome *', required: true },
      { name: 'unit', label: 'Unidade' },
      { name: 'baseline_value', label: 'Baseline', type: 'number' },
      { name: 'target_value', label: 'Meta', type: 'number' }
    ], async (body) => {
      ;['baseline_value', 'target_value'].forEach((f) => { if (body[f]) body[f] = parseFloat(body[f]) })
      await api.post(`/moonshots/${ms.id}/kpis`, body)
      renderRoute()
    })
  })
  el.querySelectorAll('.add-kpi-record-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kpiId = btn.getAttribute('data-kpi-id')
      openSimpleFormModal('Novo Registro de KPI', [
        { name: 'value', label: 'Valor *', type: 'number', required: true },
        { name: 'measured_at', label: 'Data medição', type: 'date' },
        { name: 'observations', label: 'Observações', type: 'textarea' }
      ], async (body) => {
        body.value = parseFloat(body.value)
        body.measured_at = body.measured_at || nowIsoLocal()
        await api.post(`/moonshots/kpis/${kpiId}/records`, body)
        renderRoute()
      })
    })
  })

  el.querySelectorAll('.edit-kpi-btn').forEach((btn) => btn.addEventListener('click', () => {
    const kpiId = btn.getAttribute('data-id')
    const k = kpis.find((x) => x.id === kpiId)
    openSimpleFormModal('Editar KPI', [
      { name: 'name', label: 'Nome *', required: true, value: k.name },
      { name: 'description', label: 'Descrição', type: 'textarea', value: k.description },
      { name: 'unit', label: 'Unidade', value: k.unit },
      { name: 'baseline_value', label: 'Baseline', type: 'number', value: k.baseline_value },
      { name: 'target_value', label: 'Meta', type: 'number', value: k.target_value },
      { name: 'current_value', label: 'Atual', type: 'number', value: k.current_value }
    ], async (body) => {
      ;['baseline_value', 'target_value', 'current_value'].forEach((f) => { if (body[f]) body[f] = parseFloat(body[f]) })
      await api.put(`/moonshots/kpis/${kpiId}`, body)
      renderRoute()
    })
  }))

  el.querySelectorAll('.delete-kpi-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Excluir este KPI e seus registros históricos?')) return
    try {
      await api.del(`/moonshots/kpis/${btn.getAttribute('data-id')}`)
      renderRoute()
    } catch (e) { alert(e.message) }
  }))
}

function nowIsoLocal() { return new Date().toISOString() }

function renderLegalTab(el, ms) {
  const docs = ms.legal_documents || []
  const user = window.state.user
  const canManage = ['master_admin', 'admin', 'legal'].includes(user.role)
  el.innerHTML = `
    <div class="card mb-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-sm text-smart-navy">Documentos jurídicos (MSA/SOW)</h3>
        ${canManage ? '<button id="new-legal-doc-btn" class="btn-secondary text-xs">+ Documento</button>' : ''}
      </div>
      <table class="data-table">
        <thead><tr><th>Tipo</th><th>Status</th><th>Versão</th><th></th></tr></thead>
        <tbody>
          ${docs.map((d) => `
            <tr>
              <td>${escapeHtml(d.type)}</td>
              <td><span class="badge ${statusBadge(d.status)}">${escapeHtml(d.status)}</span></td>
              <td>${d.version}</td>
              <td class="text-right whitespace-nowrap space-x-1">
                ${canManage && d.status !== 'signed' ? `<button class="btn-secondary text-[11px] py-1 px-2 sign-doc-btn" data-id="${d.id}">Marcar assinado</button>` : ''}
                ${canManage ? `<button class="btn-secondary text-[11px] py-1 px-2 delete-legal-doc-btn text-orange-a" data-id="${d.id}"><i class="fa-solid fa-trash"></i></button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${docs.length === 0 ? '<p class="text-sm text-gray-100 mt-2">Nenhum documento.</p>' : ''}
    </div>
    ${canManage ? `
    <div class="card">
      <h3 class="font-semibold text-sm text-smart-navy mb-2">Status jurídico do Moonshot</h3>
      <div class="flex items-center gap-2">
        <select id="legal-status-select" class="form-select text-sm">
          ${['pending', 'in_review', 'signed', 'waived', 'rejected'].map((s) => `<option value="${s}" ${s === ms.legal_status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button id="legal-status-save" class="btn-primary text-xs">Salvar</button>
      </div>
    </div>` : ''}
  `
  const newDocBtn = document.getElementById('new-legal-doc-btn')
  if (newDocBtn) {
    newDocBtn.addEventListener('click', () => {
      openSimpleFormModal('Novo Documento Jurídico', [
        { name: 'type', label: 'Tipo', type: 'select', options: [{ value: 'MSA', label: 'MSA' }, { value: 'SOW', label: 'SOW' }, { value: 'NDA', label: 'NDA' }] },
        { name: 'file_url', label: 'URL do arquivo' }
      ], async (body) => {
        body.moonshot_id = ms.id
        await api.post('/legal/documents', body)
        renderRoute()
      })
    })
  }
  el.querySelectorAll('.sign-doc-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api.put(`/legal/documents/${btn.getAttribute('data-id')}`, { status: 'signed' })
        renderRoute()
      } catch (err) { alert(err.message) }
    })
  })
  el.querySelectorAll('.delete-legal-doc-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este documento jurídico?')) return
      try {
        await api.del(`/legal/documents/${btn.getAttribute('data-id')}`)
        renderRoute()
      } catch (err) { alert(err.message) }
    })
  })
  const legalStatusSave = document.getElementById('legal-status-save')
  if (legalStatusSave) {
    legalStatusSave.addEventListener('click', async () => {
      try {
        await api.put(`/moonshots/${ms.id}/legal-status`, { legal_status: document.getElementById('legal-status-select').value })
        renderRoute()
      } catch (err) { alert(err.message) }
    })
  }
}

function renderFundingTab(el, ms) {
  const funding = ms.funding || []
  el.innerHTML = `
    <div class="card mb-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-sm text-smart-navy">Funding</h3>
        <button id="new-funding-btn" class="btn-secondary text-xs">+ Fonte de recurso</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Origem</th><th class="text-right">Valor</th><th class="text-right">EUR</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${funding.map((f) => `
            <tr>
              <td>${escapeHtml(f.source_type)}</td>
              <td class="text-right">${fmtMoney(f.amount, f.currency_code)}</td>
              <td class="text-right">${fmtMoney(f.amount_eur, 'EUR')}</td>
              <td><span class="badge ${statusBadge(f.status)}">${escapeHtml(f.status)}</span></td>
              <td class="text-right whitespace-nowrap">
                <button class="btn-secondary text-[11px] py-1 px-2 edit-funding-btn" data-id="${f.id}"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-secondary text-[11px] py-1 px-2 delete-funding-btn text-orange-a" data-id="${f.id}"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${funding.length === 0 ? '<p class="text-sm text-gray-100 mt-2">Nenhuma fonte de recurso.</p>' : ''}
    </div>
    <div class="card">
      <h3 class="font-semibold text-sm text-smart-navy mb-2">Status financeiro do Moonshot</h3>
      <div class="flex items-center gap-2">
        <select id="financial-status-select" class="form-select text-sm">
          ${['pending', 'partially_funded', 'funded', 'waived'].map((s) => `<option value="${s}" ${s === ms.financial_status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button id="financial-status-save" class="btn-primary text-xs">Salvar</button>
      </div>
    </div>
  `
  document.getElementById('new-funding-btn').addEventListener('click', () => {
    openSimpleFormModal('Nova Fonte de Recurso', [
      { name: 'source_type', label: 'Origem *', type: 'select', options: [{ value: 'client', label: 'Cliente' }, { value: 'internal', label: 'Interno' }, { value: 'partner', label: 'Parceiro' }, { value: 'grant', label: 'Grant/Subsídio' }] },
      { name: 'amount', label: 'Valor *', type: 'number', required: true },
      { name: 'currency_code', label: 'Moeda', value: 'EUR' },
      { name: 'exchange_rate', label: 'Taxa de câmbio p/ EUR', type: 'number', value: '1' },
      { name: 'description', label: 'Descrição', type: 'textarea' }
    ], async (body) => {
      body.amount = parseFloat(body.amount)
      body.exchange_rate = parseFloat(body.exchange_rate)
      await api.post(`/moonshots/${ms.id}/funding`, body)
      renderRoute()
    })
  })
  document.getElementById('financial-status-save').addEventListener('click', async () => {
    try {
      await api.put(`/moonshots/${ms.id}/financial-status`, { financial_status: document.getElementById('financial-status-select').value })
      renderRoute()
    } catch (err) { alert(err.message) }
  })

  el.querySelectorAll('.edit-funding-btn').forEach((btn) => btn.addEventListener('click', () => {
    const fId = btn.getAttribute('data-id')
    const f = funding.find((x) => x.id === fId)
    openSimpleFormModal('Editar Fonte de Recurso', [
      {
        name: 'source_type', label: 'Origem *', type: 'select',
        options: [{ value: 'client', label: 'Cliente' }, { value: 'internal', label: 'Interno' }, { value: 'partner', label: 'Parceiro' }, { value: 'grant', label: 'Grant/Subsídio' }],
        value: f.source_type
      },
      { name: 'amount', label: 'Valor *', type: 'number', required: true, value: f.amount },
      { name: 'currency_code', label: 'Moeda', value: f.currency_code },
      { name: 'exchange_rate', label: 'Taxa de câmbio p/ EUR', type: 'number', value: f.exchange_rate },
      {
        name: 'status', label: 'Status', type: 'select',
        options: [{ value: 'planned', label: 'Planejado' }, { value: 'committed', label: 'Comprometido' }, { value: 'received', label: 'Recebido' }],
        value: f.status
      },
      { name: 'description', label: 'Descrição', type: 'textarea', value: f.description }
    ], async (body) => {
      if (body.amount) body.amount = parseFloat(body.amount)
      if (body.exchange_rate) body.exchange_rate = parseFloat(body.exchange_rate)
      await api.put(`/moonshots/funding/${fId}`, body)
      renderRoute()
    })
    setTimeout(() => {
      const selSrc = document.querySelector('#generic-form select[name="source_type"]')
      if (selSrc) selSrc.value = f.source_type
      const selStatus = document.querySelector('#generic-form select[name="status"]')
      if (selStatus) selStatus.value = f.status
    }, 0)
  }))

  el.querySelectorAll('.delete-funding-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Excluir esta fonte de recurso?')) return
    try {
      await api.del(`/moonshots/funding/${btn.getAttribute('data-id')}`)
      renderRoute()
    } catch (e) { alert(e.message) }
  }))
}

function renderDecisionTab(el, ms) {
  el.innerHTML = `
    <div class="card">
      <h3 class="font-semibold text-sm text-smart-navy mb-3">Decisão final (Scale / Pivot / Stop)</h3>
      ${ms.final_decision ? `<p class="text-sm mb-3"><span class="badge ${ms.final_decision === 'scale' ? 'badge-green' : ms.final_decision === 'pivot' ? 'badge-yellow' : 'badge-orange'}">${ms.final_decision.toUpperCase()}</span> registrado em ${fmtDate(ms.final_decision_date)}</p>` : ''}
      <form id="decision-form" class="space-y-3">
        <div>
          <label class="form-label">Decisão</label>
          <select class="form-select" name="final_decision">
            <option value="scale">Scale</option>
            <option value="pivot">Pivot</option>
            <option value="stop">Stop</option>
          </select>
        </div>
        <div><label class="form-label">Justificativa</label><textarea class="form-input" name="final_decision_justification" rows="2"></textarea></div>
        <div><label class="form-label">Resultados finais</label><textarea class="form-input" name="final_results" rows="2"></textarea></div>
        <div><label class="form-label">Lições aprendidas</label><textarea class="form-input" name="lessons_learned" rows="2"></textarea></div>
        <button type="submit" class="btn-primary text-sm">Registrar decisão</button>
      </form>
    </div>
    ${ms.financial_access ? `
    <div class="card mt-4">
      <h3 class="font-semibold text-sm text-smart-navy mb-3">Conversão Comercial (registro manual)</h3>
      ${ms.commercial_conversion_registered ? `<p class="text-sm text-green-a">Registrado: ${fmtMoney(ms.commercial_conversion_value, 'EUR')}</p>` : `
      <form id="commercial-form" class="flex gap-2 items-end">
        <div class="flex-1"><label class="form-label">Valor (EUR)</label><input type="number" class="form-input" name="value" required /></div>
        <button type="submit" class="btn-primary text-sm">Registrar</button>
      </form>`}
    </div>` : ''}
  `
  document.getElementById('decision-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const body = Object.fromEntries(fd.entries())
    try {
      await api.post(`/moonshots/${ms.id}/decision`, body)
      renderRoute()
    } catch (err) { alert(err.message) }
  })
  const commercialForm = document.getElementById('commercial-form')
  if (commercialForm) {
    commercialForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const value = parseFloat(new FormData(e.target).get('value'))
      try {
        await api.post(`/moonshots/${ms.id}/commercial-conversion`, { value })
        renderRoute()
      } catch (err) { alert(err.message) }
    })
  }
}
