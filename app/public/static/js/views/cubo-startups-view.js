// Cubo Experiences + Startups + Hubs views

// ---------- Cubo Experiences ----------
async function renderCuboExperiencesView(content, id) {
  if (id) return renderCuboExperienceDetail(content, id)

  const editionId = window.state.currentEditionId
  const experiences = await api.get(`/cubo-experiences${editionId ? '?edition_id=' + editionId : ''}`)

  content.innerHTML = `
    <div class="mb-6 flex items-center justify-between">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold"><i class="fa-solid fa-cube text-future-blue mr-2"></i>Cubo Experiences</h1>
      <button id="new-cubo-btn" class="btn-primary"><i class="fa-solid fa-plus mr-1"></i> Nova Experience</button>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Tipo</th><th>Data</th><th>Local</th><th>Plano de ação</th><th></th></tr></thead>
        <tbody>
          ${experiences.map((e) => `
            <tr>
              <td>${escapeHtml(e.type || '-')}</td>
              <td>${fmtDate(e.event_date)}</td>
              <td>${escapeHtml(e.city || e.location_flag || '-')}</td>
              <td>${e.action_plan_url ? '<i class="fa-solid fa-circle-check text-green-a"></i>' : '<i class="fa-solid fa-minus text-gray-100"></i>'}</td>
              <td class="text-right whitespace-nowrap space-x-1">
                <button class="btn-secondary text-[11px] py-1 px-2 delete-cubo-btn text-orange-a" data-id="${e.id}"><i class="fa-solid fa-trash"></i></button>
                <a href="#/cubo-experiences/${e.id}" class="text-future-blue hover:underline text-xs">Abrir <i class="fa-solid fa-arrow-right"></i></a>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${experiences.length === 0 ? '<p class="text-sm text-gray-100 mt-3">Nenhuma Cubo Experience cadastrada.</p>' : ''}
    </div>
  `

  content.querySelectorAll('.delete-cubo-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Excluir/arquivar esta Cubo Experience?')) return
    try {
      await api.del(`/cubo-experiences/${btn.getAttribute('data-id')}`)
      renderRoute()
    } catch (e) { alert(e.message) }
  }))

  document.getElementById('new-cubo-btn').addEventListener('click', () => {
    if (!editionId) { alert('Selecione uma edição primeiro.'); return }
    openSimpleFormModal('Nova Cubo Experience', [
      { name: 'type', label: 'Tipo (ex: visita, workshop)' },
      { name: 'location_flag', label: 'Local/Remoto', type: 'select', options: [{ value: 'in_person', label: 'Presencial' }, { value: 'remote', label: 'Remoto' }] },
      { name: 'event_date', label: 'Data', type: 'date' },
      { name: 'city', label: 'Cidade' },
      { name: 'objective', label: 'Objetivo', type: 'textarea' },
      { name: 'agenda', label: 'Agenda', type: 'textarea' }
    ], async (body) => {
      body.edition_id = editionId
      await api.post('/cubo-experiences', body)
      renderRoute()
    })
  })
}

async function renderCuboExperienceDetail(content, id) {
  const exp = await api.get(`/cubo-experiences/${id}`)
  content.innerHTML = `
    <div class="mb-6"><a href="#/cubo-experiences" class="text-sm text-future-blue hover:underline"><i class="fa-solid fa-arrow-left mr-1"></i> Cubo Experiences</a></div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold">${escapeHtml(exp.type || 'Cubo Experience')}</h1>
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-100">${fmtDate(exp.event_date)}</span>
        <button id="delete-cubo-detail-btn" class="btn-secondary text-xs text-orange-a"><i class="fa-solid fa-trash mr-1"></i>Excluir</button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-6 mb-6">
      <div class="card">
        <h3 class="font-semibold text-sm text-smart-navy mb-2">Objetivo</h3>
        <p class="text-sm text-gray-100">${escapeHtml(exp.objective || '-')}</p>
      </div>
      <div class="card">
        <h3 class="font-semibold text-sm text-smart-navy mb-2">Agenda</h3>
        <p class="text-sm text-gray-100">${escapeHtml(exp.agenda || '-')}</p>
      </div>
    </div>

    <div class="card mb-6">
      <h3 class="font-semibold text-sm text-smart-navy mb-3">Registro pós-evento (Maná / Salesforce &mdash; vinculação manual)</h3>
      <form id="cubo-followup-form" class="space-y-3">
        <div><label class="form-label">Relatório</label><textarea class="form-input" name="report" rows="2">${escapeHtml(exp.report || '')}</textarea></div>
        <div><label class="form-label">URL do plano de ação (define o Cubo Gate)</label><input class="form-input" name="action_plan_url" value="${escapeHtml(exp.action_plan_url || '')}" placeholder="https://..." /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="form-label">Nº oportunidade Maná</label><input class="form-input" name="mana_opportunity_number" value="${escapeHtml(exp.mana_opportunity_number || '')}" /></div>
          <div><label class="form-label">Link oportunidade Maná</label><input class="form-input" name="mana_opportunity_link" value="${escapeHtml(exp.mana_opportunity_link || '')}" placeholder="https://..." /></div>
        </div>
        <div id="cubo-followup-error" class="hidden text-sm text-orange-a"></div>
        <button type="submit" class="btn-primary text-sm">Salvar</button>
      </form>
    </div>

    <div class="grid grid-cols-2 gap-6">
      <div class="card">
        <h3 class="font-semibold text-sm text-smart-navy mb-2">Clientes</h3>
        <p class="text-sm text-gray-100">${(exp.clients || []).map((c) => escapeHtml(c.name)).join(', ') || 'Nenhum'}</p>
      </div>
      <div class="card">
        <h3 class="font-semibold text-sm text-smart-navy mb-2">Desafios vinculados</h3>
        <p class="text-sm text-gray-100">${(exp.challenges || []).map((c) => escapeHtml(c.title)).join(', ') || 'Nenhum'}</p>
      </div>
    </div>
  `

  document.getElementById('cubo-followup-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const body = Object.fromEntries(fd.entries())
    try {
      await api.put(`/cubo-experiences/${id}`, body)
      renderRoute()
    } catch (err) {
      const errEl = document.getElementById('cubo-followup-error')
      errEl.textContent = err.message
      errEl.classList.remove('hidden')
    }
  })

  document.getElementById('delete-cubo-detail-btn').addEventListener('click', async () => {
    if (!confirm('Excluir/arquivar esta Cubo Experience?')) return
    try {
      await api.del(`/cubo-experiences/${id}`)
      window.location.hash = '#/cubo-experiences'
    } catch (e) { alert(e.message) }
  })
}

// ---------- Startups ----------
async function renderStartupsView(content, id) {
  if (id) return renderStartupDetail(content, id)

  const startups = await api.get('/startups')
  content.innerHTML = `
    <div class="mb-6 flex items-center justify-between">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold"><i class="fa-solid fa-rocket text-future-blue mr-2"></i>Startups</h1>
      <button id="new-startup-btn" class="btn-primary"><i class="fa-solid fa-plus mr-1"></i> Nova Startup</button>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Nome</th><th>Estágio</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${startups.map((s) => `
            <tr>
              <td>${escapeHtml(s.name)}</td>
              <td>${escapeHtml(s.stage || '-')}</td>
              <td><span class="badge ${statusBadge(s.status)}">${escapeHtml(s.status)}</span></td>
              <td class="text-right whitespace-nowrap space-x-1">
                <button class="btn-secondary text-[11px] py-1 px-2 delete-startup-btn text-orange-a" data-id="${s.id}"><i class="fa-solid fa-trash"></i></button>
                <a href="#/startups/${s.id}" class="text-future-blue hover:underline text-xs">Abrir <i class="fa-solid fa-arrow-right"></i></a>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${startups.length === 0 ? '<p class="text-sm text-gray-100 mt-3">Nenhuma startup cadastrada.</p>' : ''}
    </div>
  `

  content.querySelectorAll('.delete-startup-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Excluir/arquivar esta startup?')) return
    try {
      await api.del(`/startups/${btn.getAttribute('data-id')}`)
      renderRoute()
    } catch (e) { alert(e.message) }
  }))

  document.getElementById('new-startup-btn').addEventListener('click', async () => {
    const hubs = await api.get('/master-data/hubs')
    openSimpleFormModal('Nova Startup', [
      { name: 'name', label: 'Nome *', required: true },
      { name: 'hub_id', label: 'Hub *', type: 'select', options: hubs.map((h) => ({ value: h.id, label: h.name })) },
      { name: 'website', label: 'Website' },
      { name: 'stage', label: 'Estágio', type: 'select', options: [{ value: 'idea', label: 'Ideia' }, { value: 'mvp', label: 'MVP' }, { value: 'growth', label: 'Growth' }, { value: 'scale', label: 'Scale' }] }
    ], async (body) => {
      await api.post('/startups', body)
      renderRoute()
    })
  })
}

const IRL_DIMENSION_LABELS = {
  technology_maturity: 'Maturidade tecnológica', solution_maturity: 'Maturidade da solução',
  integration_capability: 'Capacidade de integração', security_compliance: 'Segurança/Compliance',
  financial_health: 'Saúde financeira', intellectual_property: 'Propriedade intelectual',
  delivery_capability: 'Capacidade de entrega', cases_references: 'Cases/Referências',
  scalability: 'Escalabilidade', challenge_fit: 'Fit com o desafio',
  poc_availability: 'Disponibilidade de PoC', commercial_viability: 'Viabilidade comercial'
}

async function renderStartupDetail(content, id) {
  const startup = await api.get(`/startups/${id}`)
  const contacts = await api.get(`/startups/${id}/contacts`)
  const irl = startup.irl || {}
  content.innerHTML = `
    <div class="mb-6"><a href="#/startups" class="text-sm text-future-blue hover:underline"><i class="fa-solid fa-arrow-left mr-1"></i> Startups</a></div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold">${escapeHtml(startup.name)}</h1>
      <div class="flex items-center gap-2">
        <span class="badge ${statusBadge(startup.status)}">${escapeHtml(startup.status)}</span>
        <button id="edit-startup-btn" class="btn-secondary text-xs"><i class="fa-solid fa-pen mr-1"></i>Editar</button>
        <button id="delete-startup-detail-btn" class="btn-secondary text-xs text-orange-a"><i class="fa-solid fa-trash mr-1"></i>Excluir</button>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="kpi-card"><div class="kpi-value">${irl.weighted_average ?? '-'}</div><div class="kpi-label">IRL ponderado (1-9)</div></div>
      <div class="kpi-card"><div class="kpi-value">${irl.dimensions_assessed || 0}/${irl.total_dimensions || 12}</div><div class="kpi-label">Dimensões avaliadas</div></div>
      <div class="kpi-card"><div class="kpi-value text-base">${escapeHtml(startup.stage || '-')}</div><div class="kpi-label">Estágio</div></div>
    </div>

    <div class="card mb-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-sm text-smart-navy">Avaliação IRL (Innovation Readiness Level)</h3>
      </div>
      <form id="irl-form" class="grid grid-cols-2 gap-3">
        <div>
          <label class="form-label">Dimensão</label>
          <select class="form-select" name="dimension">
            ${Object.entries(IRL_DIMENSION_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">Nota (1-9)</label>
          <input type="number" min="1" max="9" class="form-input" name="score" required />
        </div>
        <div class="col-span-2">
          <label class="form-label">Justificativa</label>
          <textarea class="form-input" name="justification" rows="2"></textarea>
        </div>
        <div class="col-span-2 flex justify-end">
          <button type="submit" class="btn-primary text-sm">Registrar avaliação</button>
        </div>
      </form>
    </div>

    <div class="card mb-6">
      <h3 class="font-semibold text-sm text-smart-navy mb-2">Website</h3>
      <p class="text-sm text-gray-100">${escapeHtml(startup.website || '-')}</p>
    </div>

    <div class="card">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-sm text-smart-navy">Contatos</h3>
        <button id="new-contact-btn" class="btn-secondary text-xs">+ Contato</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Nome</th><th>Cargo</th><th>E-mail</th><th>Telefone</th><th></th></tr></thead>
        <tbody>
          ${contacts.map((ct) => `
            <tr>
              <td>${escapeHtml(ct.name)}</td>
              <td>${escapeHtml(ct.role || '-')}</td>
              <td class="text-xs">${escapeHtml(ct.email || '-')}</td>
              <td>${escapeHtml(ct.phone || '-')}</td>
              <td class="text-right whitespace-nowrap">
                <button class="btn-secondary text-[11px] py-1 px-2 edit-contact-btn" data-id="${ct.id}"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-secondary text-[11px] py-1 px-2 delete-contact-btn text-orange-a" data-id="${ct.id}"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${contacts.length === 0 ? '<p class="text-xs text-gray-100 mt-2">Sem contatos.</p>' : ''}
    </div>
  `

  document.getElementById('irl-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const body = Object.fromEntries(fd.entries())
    body.score = parseInt(body.score, 10)
    try {
      await api.post(`/startups/${id}/irl`, body)
      renderRoute()
    } catch (err) { alert(err.message) }
  })

  document.getElementById('edit-startup-btn').addEventListener('click', () => {
    openSimpleFormModal('Editar Startup', [
      { name: 'name', label: 'Nome *', required: true, value: startup.name },
      { name: 'website', label: 'Website', value: startup.website },
      {
        name: 'stage', label: 'Estágio', type: 'select',
        options: [{ value: 'idea', label: 'Ideia' }, { value: 'mvp', label: 'MVP' }, { value: 'growth', label: 'Growth' }, { value: 'scale', label: 'Scale' }],
        value: startup.stage
      },
      { name: 'financial_health', label: 'Saúde financeira', value: startup.financial_health },
      { name: 'ip_notes', label: 'Notas de PI', type: 'textarea', value: startup.ip_notes },
      { name: 'observations', label: 'Observações', type: 'textarea', value: startup.observations },
      {
        name: 'status', label: 'Status', type: 'select',
        options: [{ value: 'active', label: 'Ativa' }, { value: 'inactive', label: 'Inativa' }],
        value: startup.status
      }
    ], async (body) => {
      await api.put(`/startups/${id}`, body)
      renderRoute()
    })
    setTimeout(() => {
      const selStage = document.querySelector('#generic-form select[name="stage"]')
      if (selStage) selStage.value = startup.stage
      const selStatus = document.querySelector('#generic-form select[name="status"]')
      if (selStatus) selStatus.value = startup.status
    }, 0)
  })

  document.getElementById('delete-startup-detail-btn').addEventListener('click', async () => {
    if (!confirm('Excluir/arquivar esta startup?')) return
    try {
      await api.del(`/startups/${id}`)
      window.location.hash = '#/startups'
    } catch (e) { alert(e.message) }
  })

  document.getElementById('new-contact-btn').addEventListener('click', () => {
    openSimpleFormModal('Novo Contato', [
      { name: 'name', label: 'Nome *', required: true },
      { name: 'role', label: 'Cargo' },
      { name: 'email', label: 'E-mail' },
      { name: 'phone', label: 'Telefone' }
    ], async (body) => {
      await api.post(`/startups/${id}/contacts`, body)
      renderRoute()
    })
  })

  content.querySelectorAll('.edit-contact-btn').forEach((btn) => btn.addEventListener('click', () => {
    const ctId = btn.getAttribute('data-id')
    const ct = contacts.find((c) => c.id === ctId)
    openSimpleFormModal('Editar Contato', [
      { name: 'name', label: 'Nome *', required: true, value: ct.name },
      { name: 'role', label: 'Cargo', value: ct.role },
      { name: 'email', label: 'E-mail', value: ct.email },
      { name: 'phone', label: 'Telefone', value: ct.phone }
    ], async (body) => {
      await api.put(`/startups/contacts/${ctId}`, body)
      renderRoute()
    })
  }))

  content.querySelectorAll('.delete-contact-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Excluir este contato?')) return
    try {
      await api.del(`/startups/contacts/${btn.getAttribute('data-id')}`)
      renderRoute()
    } catch (e) { alert(e.message) }
  }))
}

// ---------- Hubs ----------
async function renderHubsView(content) {
  const hubs = await api.get('/master-data/hubs')
  const user = window.state.user
  const canManage = ['master_admin', 'admin'].includes(user.role)

  content.innerHTML = `
    <div class="mb-6 flex items-center justify-between">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold"><i class="fa-solid fa-network-wired text-future-blue mr-2"></i>Hubs</h1>
      ${canManage ? `<button id="new-hub-btn" class="btn-primary"><i class="fa-solid fa-plus mr-1"></i> Novo Hub</button>` : ''}
    </div>
    <div class="grid grid-cols-3 gap-4">
      ${hubs.map((h) => `
        <div class="card">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-smart-navy">${escapeHtml(h.name)}</h3>
            ${canManage ? `
              <div class="space-x-1 whitespace-nowrap">
                <button class="btn-secondary text-[11px] py-1 px-2 edit-hub-btn" data-id="${h.id}"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-secondary text-[11px] py-1 px-2 delete-hub-btn text-orange-a" data-id="${h.id}"><i class="fa-solid fa-trash"></i></button>
              </div>` : ''}
          </div>
          <p class="text-xs text-gray-100 mt-1">${escapeHtml(h.city || '-')}</p>
          <p class="text-sm text-gray-100 mt-2">${escapeHtml(h.description || '')}</p>
          <span class="badge ${statusBadge(h.status)} mt-2 inline-block">${escapeHtml(h.status)}</span>
        </div>
      `).join('')}
    </div>
    ${hubs.length === 0 ? '<p class="text-sm text-gray-100 mt-3">Nenhum hub cadastrado.</p>' : ''}
  `

  const btn = document.getElementById('new-hub-btn')
  if (btn) {
    btn.addEventListener('click', () => {
      openSimpleFormModal('Novo Hub', [
        { name: 'name', label: 'Nome *', required: true },
        { name: 'city', label: 'Cidade' },
        { name: 'website', label: 'Website' },
        { name: 'description', label: 'Descrição', type: 'textarea' }
      ], async (body) => {
        await api.post('/master-data/hubs', body)
        renderRoute()
      })
    })
  }

  content.querySelectorAll('.edit-hub-btn').forEach((b) => b.addEventListener('click', () => {
    const hId = b.getAttribute('data-id')
    const h = hubs.find((x) => x.id === hId)
    openSimpleFormModal('Editar Hub', [
      { name: 'name', label: 'Nome *', required: true, value: h.name },
      { name: 'city', label: 'Cidade', value: h.city },
      { name: 'website', label: 'Website', value: h.website },
      { name: 'description', label: 'Descrição', type: 'textarea', value: h.description }
    ], async (body) => {
      await api.put(`/master-data/hubs/${hId}`, body)
      renderRoute()
    })
  }))

  content.querySelectorAll('.delete-hub-btn').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Excluir/arquivar este hub?')) return
    try {
      await api.del(`/master-data/hubs/${b.getAttribute('data-id')}`)
      renderRoute()
    } catch (e) { alert(e.message) }
  }))
}
