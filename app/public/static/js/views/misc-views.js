// Funding overview, Legal library, Catalyst Day, Reports, Notifications, Audit views

// ---------- Funding (cross-moonshot overview) ----------
async function renderFundingView(content) {
  const editionId = window.state.currentEditionId
  const moonshots = await api.get(`/moonshots${editionId ? '?edition_id=' + editionId : ''}`)

  const rows = []
  for (const m of moonshots) {
    try {
      const funding = await api.get(`/moonshots/${m.id}/funding`)
      for (const f of funding) rows.push({ ...f, moonshot_title: m.title, moonshot_code: m.code })
    } catch (e) { /* forbidden, skip */ }
  }

  const totalEur = rows.reduce((sum, r) => sum + (r.amount_eur || 0), 0)

  content.innerHTML = `
    <h1 class="font-serif-heading text-2xl text-smart-navy font-bold mb-6"><i class="fa-solid fa-coins text-future-blue mr-2"></i>Funding</h1>
    <div class="kpi-card mb-6 max-w-xs"><div class="kpi-value">${fmtMoney(totalEur, 'EUR')}</div><div class="kpi-label">Total consolidado (EUR)</div></div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Moonshot</th><th>Origem</th><th class="text-right">Valor</th><th class="text-right">EUR</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td class="font-mono text-xs">${escapeHtml(r.moonshot_code)}</td>
              <td>${escapeHtml(r.source_type)}</td>
              <td class="text-right">${fmtMoney(r.amount, r.currency_code)}</td>
              <td class="text-right">${fmtMoney(r.amount_eur, 'EUR')}</td>
              <td><span class="badge ${statusBadge(r.status)}">${escapeHtml(r.status)}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${rows.length === 0 ? '<p class="text-sm text-gray-100 mt-3">Sem dados de funding visíveis para seu perfil ou nenhum registro cadastrado. Edição/exclusão disponível na aba Funding de cada Moonshot.</p>' : ''}
    </div>
  `
}

// ---------- Legal library ----------
async function renderLegalView(content) {
  const [templates, clauses, signatureStatus] = await Promise.all([
    api.get('/legal/templates'), api.get('/legal/clauses'), api.get('/legal/signature/status')
  ])
  const user = window.state.user
  const canManage = ['master_admin', 'admin', 'legal'].includes(user.role)

  content.innerHTML = `
    <h1 class="font-serif-heading text-2xl text-smart-navy font-bold mb-6"><i class="fa-solid fa-scale-balanced text-future-blue mr-2"></i>Jurídico</h1>

    <div class="card mb-4 bg-[#FFF9EE]">
      <p class="text-sm"><i class="fa-solid fa-signature mr-2 text-yellow-a"></i>Assinatura eletrônica: <strong>${signatureStatus.message}</strong></p>
    </div>

    <div class="grid grid-cols-2 gap-6">
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-sm text-smart-navy">Templates (MSA/SOW)</h3>
          ${canManage ? '<button id="new-template-btn" class="btn-secondary text-xs">+ Template</button>' : ''}
        </div>
        <table class="data-table">
          <thead><tr><th>Tipo</th><th>Versão</th><th>Status</th><th></th></tr></thead>
          <tbody>${templates.map((t) => `
            <tr>
              <td>${escapeHtml(t.type)}</td><td>${escapeHtml(t.version)}</td>
              <td><span class="badge ${statusBadge(t.status)}">${escapeHtml(t.status)}</span></td>
              <td class="text-right whitespace-nowrap">
                ${canManage ? `
                  <button class="btn-secondary text-[11px] py-1 px-2 edit-template-btn" data-id="${t.id}"><i class="fa-solid fa-pen"></i></button>
                  <button class="btn-secondary text-[11px] py-1 px-2 delete-template-btn text-orange-a" data-id="${t.id}"><i class="fa-solid fa-trash"></i></button>
                ` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>
        ${templates.length === 0 ? '<p class="text-xs text-gray-100 mt-2">Nenhum template.</p>' : ''}
      </div>
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-sm text-smart-navy">Biblioteca de cláusulas</h3>
          ${canManage ? '<button id="new-clause-btn" class="btn-secondary text-xs">+ Cláusula</button>' : ''}
        </div>
        <table class="data-table">
          <thead><tr><th>Nome</th><th>Categoria</th><th></th></tr></thead>
          <tbody>${clauses.map((cl) => `
            <tr>
              <td>${escapeHtml(cl.name)}</td><td>${escapeHtml(cl.category || '-')}</td>
              <td class="text-right whitespace-nowrap">
                ${canManage ? `
                  <button class="btn-secondary text-[11px] py-1 px-2 edit-clause-btn" data-id="${cl.id}"><i class="fa-solid fa-pen"></i></button>
                  <button class="btn-secondary text-[11px] py-1 px-2 delete-clause-btn text-orange-a" data-id="${cl.id}"><i class="fa-solid fa-trash"></i></button>
                ` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>
        ${clauses.length === 0 ? '<p class="text-xs text-gray-100 mt-2">Nenhuma cláusula.</p>' : ''}
      </div>
    </div>
  `

  const templateStatusOptions = [{ value: 'draft', label: 'Rascunho' }, { value: 'active', label: 'Ativo' }, { value: 'superseded', label: 'Substituído' }]
  const clauseStatusOptions = [{ value: 'active', label: 'Ativa' }, { value: 'inactive', label: 'Inativa' }]

  const newTemplateBtn = document.getElementById('new-template-btn')
  if (newTemplateBtn) {
    newTemplateBtn.addEventListener('click', () => {
      openSimpleFormModal('Novo Template', [
        { name: 'type', label: 'Tipo', type: 'select', options: [{ value: 'MSA', label: 'MSA' }, { value: 'SOW', label: 'SOW' }] },
        { name: 'version', label: 'Versão *', required: true },
        { name: 'file_url', label: 'URL do arquivo' }
      ], async (body) => {
        await api.post('/legal/templates', body)
        renderRoute()
      })
    })
  }
  const newClauseBtn = document.getElementById('new-clause-btn')
  if (newClauseBtn) {
    newClauseBtn.addEventListener('click', () => {
      openSimpleFormModal('Nova Cláusula', [
        { name: 'name', label: 'Nome *', required: true },
        { name: 'category', label: 'Categoria' },
        { name: 'clause_text', label: 'Texto da cláusula', type: 'textarea' }
      ], async (body) => {
        await api.post('/legal/clauses', body)
        renderRoute()
      })
    })
  }

  content.querySelectorAll('.edit-template-btn').forEach((btn) => btn.addEventListener('click', () => {
    const tId = btn.getAttribute('data-id')
    const t = templates.find((x) => x.id === tId)
    openSimpleFormModal('Editar Template', [
      { name: 'type', label: 'Tipo', type: 'select', options: [{ value: 'MSA', label: 'MSA' }, { value: 'SOW', label: 'SOW' }], value: t.type },
      { name: 'version', label: 'Versão *', required: true, value: t.version },
      { name: 'file_url', label: 'URL do arquivo', value: t.file_url },
      { name: 'status', label: 'Status', type: 'select', options: templateStatusOptions, value: t.status },
      { name: 'observations', label: 'Observações', type: 'textarea', value: t.observations }
    ], async (body) => {
      await api.put(`/legal/templates/${tId}`, body)
      renderRoute()
    })
    setTimeout(() => {
      const s1 = document.querySelector('#generic-form select[name="type"]'); if (s1) s1.value = t.type
      const s2 = document.querySelector('#generic-form select[name="status"]'); if (s2) s2.value = t.status
    }, 0)
  }))

  content.querySelectorAll('.delete-template-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Marcar este template como substituído (superseded)?')) return
    try { await api.del(`/legal/templates/${btn.getAttribute('data-id')}`); renderRoute() } catch (e) { alert(e.message) }
  }))

  content.querySelectorAll('.edit-clause-btn').forEach((btn) => btn.addEventListener('click', () => {
    const clId = btn.getAttribute('data-id')
    const cl = clauses.find((x) => x.id === clId)
    openSimpleFormModal('Editar Cláusula', [
      { name: 'name', label: 'Nome *', required: true, value: cl.name },
      { name: 'category', label: 'Categoria', value: cl.category },
      { name: 'clause_text', label: 'Texto da cláusula', type: 'textarea', value: cl.clause_text },
      { name: 'status', label: 'Status', type: 'select', options: clauseStatusOptions, value: cl.status }
    ], async (body) => {
      await api.put(`/legal/clauses/${clId}`, body)
      renderRoute()
    })
    setTimeout(() => {
      const s = document.querySelector('#generic-form select[name="status"]'); if (s) s.value = cl.status
    }, 0)
  }))

  content.querySelectorAll('.delete-clause-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Marcar esta cláusula como inativa?')) return
    try { await api.del(`/legal/clauses/${btn.getAttribute('data-id')}`); renderRoute() } catch (e) { alert(e.message) }
  }))
}

// ---------- Catalyst Day ----------
async function renderCatalystDayView(content, id) {
  if (id) return renderCatalystDayDetail(content, id)
  const editionId = window.state.currentEditionId
  const days = await api.get(`/catalyst-day${editionId ? '?edition_id=' + editionId : ''}`)
  const user = window.state.user
  const canManage = ['master_admin', 'admin'].includes(user.role)

  content.innerHTML = `
    <div class="mb-6 flex items-center justify-between">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold"><i class="fa-solid fa-star text-future-blue mr-2"></i>Catalyst Day</h1>
      ${canManage ? '<button id="new-catalyst-btn" class="btn-primary"><i class="fa-solid fa-plus mr-1"></i> Novo evento</button>' : ''}
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Nome</th><th>Data</th><th>Local</th><th></th></tr></thead>
        <tbody>
          ${days.map((d) => `
            <tr>
              <td>${escapeHtml(d.name)}</td>
              <td>${fmtDate(d.event_date)}</td>
              <td>${escapeHtml(d.location || '-')}</td>
              <td class="text-right whitespace-nowrap space-x-1">
                ${canManage ? `<button class="btn-secondary text-[11px] py-1 px-2 delete-catalyst-btn text-orange-a" data-id="${d.id}"><i class="fa-solid fa-trash"></i></button>` : ''}
                <a href="#/catalyst-day/${d.id}" class="text-future-blue hover:underline text-xs">Abrir <i class="fa-solid fa-arrow-right"></i></a>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${days.length === 0 ? '<p class="text-sm text-gray-100 mt-3">Nenhum Catalyst Day cadastrado.</p>' : ''}
    </div>
  `
  const btn = document.getElementById('new-catalyst-btn')
  if (btn) {
    btn.addEventListener('click', () => {
      if (!editionId) { alert('Selecione uma edição primeiro.'); return }
      openSimpleFormModal('Novo Catalyst Day', [
        { name: 'name', label: 'Nome *', required: true },
        { name: 'event_date', label: 'Data', type: 'date' },
        { name: 'location', label: 'Local' },
        { name: 'description', label: 'Descrição', type: 'textarea' }
      ], async (body) => {
        body.edition_id = editionId
        await api.post('/catalyst-day', body)
        renderRoute()
      })
    })
  }
  content.querySelectorAll('.delete-catalyst-btn').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Excluir/arquivar este Catalyst Day?')) return
    try { await api.del(`/catalyst-day/${b.getAttribute('data-id')}`); renderRoute() } catch (e) { alert(e.message) }
  }))
}

async function renderCatalystDayDetail(content, id) {
  const day = await api.get(`/catalyst-day/${id}`)
  const user = window.state.user
  const canManage = ['master_admin', 'admin'].includes(user.role)
  content.innerHTML = `
    <div class="mb-6"><a href="#/catalyst-day" class="text-sm text-future-blue hover:underline"><i class="fa-solid fa-arrow-left mr-1"></i> Catalyst Day</a></div>
    <div class="flex items-center justify-between mb-2">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold">${escapeHtml(day.name)}</h1>
      ${canManage ? `
        <div class="flex items-center gap-2">
          <button id="edit-catalyst-btn" class="btn-secondary text-xs"><i class="fa-solid fa-pen mr-1"></i>Editar</button>
          <button id="delete-catalyst-detail-btn" class="btn-secondary text-xs text-orange-a"><i class="fa-solid fa-trash mr-1"></i>Excluir</button>
        </div>` : ''}
    </div>
    <p class="text-sm text-gray-100 mb-6">${fmtDate(day.event_date)} &mdash; ${escapeHtml(day.location || '')}</p>

    <div class="grid grid-cols-2 gap-6">
      <div class="card">
        <h3 class="font-semibold text-sm text-smart-navy mb-2">Moonshots apresentados</h3>
        <table class="data-table"><tbody>
          ${(day.moonshots || []).map((m) => `
            <tr>
              <td>${escapeHtml(m.title)}</td>
              <td class="text-right text-xs">#${m.presentation_order}</td>
              <td class="text-right">${canManage ? `<button class="btn-secondary text-[11px] py-1 px-2 delete-ms-link-btn text-orange-a" data-id="${m.link_id || m.id}"><i class="fa-solid fa-trash"></i></button>` : ''}</td>
            </tr>`).join('')}
        </tbody></table>
        ${(day.moonshots || []).length === 0 ? '<p class="text-xs text-gray-100 mt-2">Nenhum.</p>' : ''}
      </div>
      <div class="card">
        <h3 class="font-semibold text-sm text-smart-navy mb-2">Reconhecimentos</h3>
        <table class="data-table"><tbody>
          ${(day.recognitions || []).map((r) => `
            <tr>
              <td>${escapeHtml(r.entity_name || '-')}</td>
              <td class="text-xs">${escapeHtml(r.reason || '')}</td>
              <td class="text-right">${canManage ? `<button class="btn-secondary text-[11px] py-1 px-2 delete-recognition-btn text-orange-a" data-id="${r.id}"><i class="fa-solid fa-trash"></i></button>` : ''}</td>
            </tr>`).join('')}
        </tbody></table>
        ${(day.recognitions || []).length === 0 ? '<p class="text-xs text-gray-100 mt-2">Nenhum.</p>' : ''}
      </div>
    </div>
  `

  const editBtn = document.getElementById('edit-catalyst-btn')
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      openSimpleFormModal('Editar Catalyst Day', [
        { name: 'name', label: 'Nome *', required: true, value: day.name },
        { name: 'event_date', label: 'Data', type: 'date', value: day.event_date },
        { name: 'location', label: 'Local', value: day.location },
        { name: 'description', label: 'Descrição', type: 'textarea', value: day.description },
        { name: 'agenda', label: 'Agenda', type: 'textarea', value: day.agenda }
      ], async (body) => {
        await api.put(`/catalyst-day/${id}`, body)
        renderRoute()
      })
    })
  }

  const deleteBtn = document.getElementById('delete-catalyst-detail-btn')
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Excluir/arquivar este Catalyst Day?')) return
      try { await api.del(`/catalyst-day/${id}`); window.location.hash = '#/catalyst-day' } catch (e) { alert(e.message) }
    })
  }

  content.querySelectorAll('.delete-ms-link-btn').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Remover este moonshot do evento?')) return
    try { await api.del(`/catalyst-day/${id}/moonshots/${b.getAttribute('data-id')}`); renderRoute() } catch (e) { alert(e.message) }
  }))

  content.querySelectorAll('.delete-recognition-btn').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Excluir este reconhecimento?')) return
    try { await api.del(`/catalyst-day/${id}/recognitions/${b.getAttribute('data-id')}`); renderRoute() } catch (e) { alert(e.message) }
  }))
}

// ---------- Reports (simple aggregate view reusing dashboard data) ----------
async function renderReportsView(content) {
  const editionId = window.state.currentEditionId
  const summary = await api.get(`/dashboard/summary${editionId ? '?edition_id=' + editionId : ''}`)

  content.innerHTML = `
    <h1 class="font-serif-heading text-2xl text-smart-navy font-bold mb-6"><i class="fa-solid fa-chart-column text-future-blue mr-2"></i>Relatórios</h1>
    <div class="grid grid-cols-2 gap-6">
      <div class="card">
        <h3 class="font-semibold text-sm text-smart-navy mb-3">Moonshots por fase</h3>
        <canvas id="report-phase-chart" height="220"></canvas>
      </div>
      <div class="card">
        <h3 class="font-semibold text-sm text-smart-navy mb-3">Resumo do programa</h3>
        <table class="data-table">
          <tbody>
            <tr><td>Desafios totais</td><td class="text-right font-semibold">${summary.challenges.total}</td></tr>
            <tr><td>Cubo Gate concluídos</td><td class="text-right font-semibold">${summary.challenges.cubo_gate_done}</td></tr>
            <tr><td>Moonshots ativos</td><td class="text-right font-semibold">${summary.moonshots.active}</td></tr>
            <tr><td>Moonshots concluídos</td><td class="text-right font-semibold">${summary.moonshots.completed}</td></tr>
            <tr><td>Startups selecionadas</td><td class="text-right font-semibold">${summary.startups.selected}/${summary.startups.total}</td></tr>
            <tr><td>Pendências jurídicas</td><td class="text-right font-semibold">${summary.legal_pending}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    ${summary.financial_access ? `
    <div class="card mt-6">
      <h3 class="font-semibold text-sm text-smart-navy mb-3">Financeiro consolidado (EUR)</h3>
      <div class="grid grid-cols-3 gap-4">
        <div class="kpi-card"><div class="kpi-value">${fmtMoney(summary.financials.total_invested_eur, 'EUR')}</div><div class="kpi-label">Total investido</div></div>
        <div class="kpi-card"><div class="kpi-value">${fmtMoney(summary.financials.pipeline_influenced_eur, 'EUR')}</div><div class="kpi-label">Pipeline influenciado</div></div>
        <div class="kpi-card"><div class="kpi-value">${fmtMoney(summary.financials.revenue_closed_eur, 'EUR')}</div><div class="kpi-label">Receita fechada</div></div>
      </div>
    </div>` : ''}
  `

  const phaseData = summary.moonshots.by_phase || []
  const ctx = document.getElementById('report-phase-chart')
  if (ctx && phaseData.length > 0) {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: phaseData.map((p) => phaseLabel(p.phase)),
        datasets: [{ label: 'Moonshots', data: phaseData.map((p) => p.n), backgroundColor: '#0072BC' }]
      },
      options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { autoSkip: false, maxRotation: 60, minRotation: 30 } } } }
    })
  }
}

// ---------- Notifications ----------
async function renderNotificationsView(content) {
  const notifs = await api.get('/notifications')
  content.innerHTML = `
    <div class="mb-6 flex items-center justify-between">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold"><i class="fa-solid fa-bell text-future-blue mr-2"></i>Notificações</h1>
      <button id="mark-all-read-btn" class="btn-secondary text-xs">Marcar todas como lidas</button>
    </div>
    <div class="card">
      ${notifs.map((n) => `
        <div class="flex items-start justify-between py-3 border-b border-gray-50 last:border-0 ${n.read_at ? 'opacity-60' : ''}">
          <div>
            <p class="font-semibold text-sm text-smart-navy">${escapeHtml(n.title)}</p>
            <p class="text-xs text-gray-100">${escapeHtml(n.body || '')}</p>
            <p class="text-[10px] text-gray-100 mt-1">${fmtDateTime(n.created_at)}</p>
          </div>
          ${!n.read_at ? `<button class="btn-secondary text-[11px] py-1 px-2 mark-read-btn" data-id="${n.id}">Marcar lida</button>` : ''}
        </div>
      `).join('')}
      ${notifs.length === 0 ? '<p class="text-sm text-gray-100">Nenhuma notificação.</p>' : ''}
    </div>
  `
  document.getElementById('mark-all-read-btn').addEventListener('click', async () => {
    await api.post('/notifications/read-all')
    renderRoute()
  })
  document.querySelectorAll('.mark-read-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.post(`/notifications/${btn.getAttribute('data-id')}/read`)
      renderRoute()
    })
  })
}

// ---------- Audit (intentionally read-only immutable log — no CRUD) ----------
async function renderAuditView(content) {
  const res = await api.get('/audit')
  const rows = res.results || []
  content.innerHTML = `
    <h1 class="font-serif-heading text-2xl text-smart-navy font-bold mb-6"><i class="fa-solid fa-clipboard-list text-future-blue mr-2"></i>Auditoria</h1>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Entidade</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td class="text-xs">${fmtDateTime(r.created_at)}</td>
              <td>${escapeHtml(r.user_name || '-')}</td>
              <td class="font-mono text-xs">${escapeHtml(r.action)}</td>
              <td class="text-xs">${escapeHtml(r.entity_type || '-')}${r.entity_id ? ' #' + r.entity_id.slice(0, 8) : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${rows.length === 0 ? '<p class="text-sm text-gray-100 mt-3">Nenhum registro de auditoria.</p>' : ''}
    </div>
  `
}
