// Clients & Accounts
async function renderClientsView(content, id) {
  if (id) return renderClientDetail(content, id)

  const clients = await api.get('/clients')
  content.innerHTML = `
    <div class="mb-6 flex items-center justify-between">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold">Clientes & Contas</h1>
      <button id="new-client-btn" class="btn-primary"><i class="fa-solid fa-plus mr-1"></i> Novo Cliente</button>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Nome</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${clients.map((cl) => `
            <tr>
              <td>${escapeHtml(cl.name)}</td>
              <td><span class="badge ${statusBadge(cl.status)}">${escapeHtml(cl.status)}</span></td>
              <td class="text-right whitespace-nowrap space-x-1">
                <button class="btn-secondary text-[11px] py-1 px-2 edit-client-btn" data-id="${cl.id}"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-secondary text-[11px] py-1 px-2 delete-client-btn text-orange-a" data-id="${cl.id}"><i class="fa-solid fa-trash"></i></button>
                <a href="#/clients/${cl.id}" class="text-future-blue hover:underline text-xs">Abrir <i class="fa-solid fa-arrow-right"></i></a>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${clients.length === 0 ? '<p class="text-sm text-gray-100 mt-3">Nenhum cliente cadastrado.</p>' : ''}
    </div>
  `
  document.getElementById('new-client-btn').addEventListener('click', () => {
    openSimpleFormModal('Novo Cliente', [
      { name: 'name', label: 'Nome *', required: true },
      { name: 'description', label: 'Descrição', type: 'textarea' }
    ], async (body) => {
      await api.post('/clients', body)
      renderRoute()
    })
  })

  content.querySelectorAll('.edit-client-btn').forEach((btn) => btn.addEventListener('click', async () => {
    const clId = btn.getAttribute('data-id')
    const cl = clients.find((c) => c.id === clId)
    openSimpleFormModal('Editar Cliente', [
      { name: 'name', label: 'Nome *', required: true, value: cl.name },
      { name: 'description', label: 'Descrição', type: 'textarea', value: cl.description },
      {
        name: 'status', label: 'Status', type: 'select',
        options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }],
        value: cl.status
      }
    ], async (body) => {
      await api.put(`/clients/${clId}`, body)
      renderRoute()
    })
    setTimeout(() => {
      const sel = document.querySelector('#generic-form select[name="status"]')
      if (sel) sel.value = cl.status
    }, 0)
  }))

  content.querySelectorAll('.delete-client-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Excluir/arquivar este cliente? Contas e stakeholders vinculados permanecem, mas o cliente ficará inativo.')) return
    try {
      await api.del(`/clients/${btn.getAttribute('data-id')}`)
      renderRoute()
    } catch (e) { alert(e.message) }
  }))
}

async function renderClientDetail(content, id) {
  const client = await api.get(`/clients/${id}`)
  content.innerHTML = `
    <div class="mb-6"><a href="#/clients" class="text-sm text-future-blue hover:underline"><i class="fa-solid fa-arrow-left mr-1"></i> Clientes</a></div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold">${escapeHtml(client.name)}</h1>
      <div class="flex items-center gap-2">
        <span class="badge ${statusBadge(client.status)}">${escapeHtml(client.status)}</span>
        <button id="edit-client-btn" class="btn-secondary text-xs"><i class="fa-solid fa-pen mr-1"></i>Editar</button>
        <button id="delete-client-btn" class="btn-secondary text-xs text-orange-a"><i class="fa-solid fa-trash mr-1"></i>Excluir</button>
      </div>
    </div>
    <p class="text-sm text-gray-100 mb-6">${escapeHtml(client.description || '')}</p>

    <div class="grid grid-cols-2 gap-6">
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-sm text-smart-navy">Contas</h3>
          <button id="new-account-btn" class="btn-secondary text-xs">+ Conta</button>
        </div>
        <table class="data-table">
          <thead><tr><th>Nome</th><th class="text-right">Baseline</th><th class="text-right">Meta</th><th></th></tr></thead>
          <tbody>
            ${(client.accounts || []).map((a) => `
              <tr>
                <td>${escapeHtml(a.name)}</td>
                <td class="text-right">${fmtMoney(a.baseline_value, a.currency_code)}</td>
                <td class="text-right">${a.target_value != null ? fmtMoney(a.target_value, a.currency_code) : '-'}</td>
                <td class="text-right whitespace-nowrap">
                  <button class="btn-secondary text-[11px] py-1 px-2 edit-account-btn" data-id="${a.id}"><i class="fa-solid fa-pen"></i></button>
                  <button class="btn-secondary text-[11px] py-1 px-2 delete-account-btn text-orange-a" data-id="${a.id}"><i class="fa-solid fa-trash"></i></button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${(client.accounts || []).length === 0 ? '<p class="text-xs text-gray-100 mt-2">Sem contas.</p>' : ''}
      </div>
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-sm text-smart-navy">Stakeholders</h3>
          <button id="new-stakeholder-btn" class="btn-secondary text-xs">+ Stakeholder</button>
        </div>
        <table class="data-table">
          <thead><tr><th>Nome</th><th>Cargo</th><th>Papel no projeto</th><th></th></tr></thead>
          <tbody>
            ${(client.stakeholders || []).map((s) => `
              <tr>
                <td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.title || '-')}</td><td>${escapeHtml(s.role_in_project || '-')}</td>
                <td class="text-right whitespace-nowrap">
                  <button class="btn-secondary text-[11px] py-1 px-2 edit-stakeholder-btn" data-id="${s.id}"><i class="fa-solid fa-pen"></i></button>
                  <button class="btn-secondary text-[11px] py-1 px-2 delete-stakeholder-btn text-orange-a" data-id="${s.id}"><i class="fa-solid fa-trash"></i></button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${(client.stakeholders || []).length === 0 ? '<p class="text-xs text-gray-100 mt-2">Sem stakeholders.</p>' : ''}
      </div>
    </div>
  `

  // ---- Client edit/delete ----
  document.getElementById('edit-client-btn').addEventListener('click', () => {
    openSimpleFormModal('Editar Cliente', [
      { name: 'name', label: 'Nome *', required: true, value: client.name },
      { name: 'description', label: 'Descrição', type: 'textarea', value: client.description },
      {
        name: 'status', label: 'Status', type: 'select',
        options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }],
        value: client.status
      }
    ], async (body) => {
      await api.put(`/clients/${id}`, body)
      renderRoute()
    })
    setTimeout(() => {
      const sel = document.querySelector('#generic-form select[name="status"]')
      if (sel) sel.value = client.status
    }, 0)
  })

  document.getElementById('delete-client-btn').addEventListener('click', async () => {
    if (!confirm('Excluir/arquivar este cliente?')) return
    try {
      await api.del(`/clients/${id}`)
      window.location.hash = '#/clients'
    } catch (e) { alert(e.message) }
  })

  // ---- Accounts ----
  document.getElementById('new-account-btn').addEventListener('click', () => {
    openSimpleFormModal('Nova Conta', [
      { name: 'name', label: 'Nome *', required: true },
      { name: 'baseline_type', label: 'Tipo de baseline' },
      { name: 'baseline_value', label: 'Valor baseline', type: 'number' },
      { name: 'currency_code', label: 'Moeda', value: 'EUR' },
      { name: 'target_value', label: 'Meta', type: 'number' }
    ], async (body) => {
      body.client_id = id
      if (body.baseline_value) body.baseline_value = parseFloat(body.baseline_value)
      if (body.target_value) body.target_value = parseFloat(body.target_value)
      await api.post('/accounts', body)
      renderRoute()
    })
  })

  content.querySelectorAll('.edit-account-btn').forEach((btn) => btn.addEventListener('click', async () => {
    const accId = btn.getAttribute('data-id')
    const a = (client.accounts || []).find((x) => x.id === accId)
    openSimpleFormModal('Editar Conta', [
      { name: 'name', label: 'Nome *', required: true, value: a.name },
      { name: 'baseline_type', label: 'Tipo de baseline', value: a.baseline_type },
      { name: 'baseline_value', label: 'Valor baseline', type: 'number', value: a.baseline_value },
      { name: 'currency_code', label: 'Moeda', value: a.currency_code },
      { name: 'target_value', label: 'Meta', type: 'number', value: a.target_value }
    ], async (body) => {
      if (body.baseline_value) body.baseline_value = parseFloat(body.baseline_value)
      if (body.target_value) body.target_value = parseFloat(body.target_value)
      await api.put(`/accounts/${accId}`, body)
      renderRoute()
    })
  }))

  content.querySelectorAll('.delete-account-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Excluir/arquivar esta conta?')) return
    try {
      await api.del(`/accounts/${btn.getAttribute('data-id')}`)
      renderRoute()
    } catch (e) { alert(e.message) }
  }))

  // ---- Stakeholders ----
  document.getElementById('new-stakeholder-btn').addEventListener('click', () => {
    openSimpleFormModal('Novo Stakeholder', [
      { name: 'name', label: 'Nome *', required: true },
      { name: 'title', label: 'Cargo' },
      { name: 'organization', label: 'Organização' },
      { name: 'email', label: 'E-mail' },
      { name: 'phone', label: 'Telefone' },
      { name: 'role_in_project', label: 'Papel no projeto' },
      { name: 'observations', label: 'Observações', type: 'textarea' }
    ], async (body) => {
      await api.post(`/clients/${id}/stakeholders`, body)
      renderRoute()
    })
  })

  content.querySelectorAll('.edit-stakeholder-btn').forEach((btn) => btn.addEventListener('click', async () => {
    const stId = btn.getAttribute('data-id')
    const s = await api.get(`/clients/stakeholders/${stId}`)
    openSimpleFormModal('Editar Stakeholder', [
      { name: 'name', label: 'Nome *', required: true, value: s.name },
      { name: 'title', label: 'Cargo', value: s.title },
      { name: 'organization', label: 'Organização', value: s.organization },
      { name: 'email', label: 'E-mail', value: s.email },
      { name: 'phone', label: 'Telefone', value: s.phone },
      { name: 'role_in_project', label: 'Papel no projeto', value: s.role_in_project },
      { name: 'observations', label: 'Observações', type: 'textarea', value: s.observations }
    ], async (body) => {
      await api.put(`/clients/stakeholders/${stId}`, body)
      renderRoute()
    })
  }))

  content.querySelectorAll('.delete-stakeholder-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Excluir/arquivar este stakeholder?')) return
    try {
      await api.del(`/clients/stakeholders/${btn.getAttribute('data-id')}`)
      renderRoute()
    } catch (e) { alert(e.message) }
  }))
}

// ---------- Generic modal form helper (reused across views) ----------
function openSimpleFormModal(title, fields, onSubmit) {
  const modal = document.createElement('div')
  modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50'
  modal.innerHTML = `
    <div class="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <h3 class="font-semibold text-lg text-smart-navy mb-4">${escapeHtml(title)}</h3>
      <form id="generic-form" class="space-y-3">
        ${fields.map((f) => `
          <div>
            <label class="form-label">${escapeHtml(f.label)}</label>
            ${f.type === 'textarea'
              ? `<textarea class="form-input" name="${f.name}" rows="3" ${f.required ? 'required' : ''}>${f.value || ''}</textarea>`
              : f.type === 'select'
              ? `<select class="form-select" name="${f.name}" ${f.required ? 'required' : ''}>${(f.options || []).map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('')}</select>`
              : `<input class="form-input" type="${f.type || 'text'}" name="${f.name}" value="${f.value || ''}" ${f.required ? 'required' : ''} />`}
          </div>`).join('')}
        <div id="generic-form-error" class="hidden text-sm text-orange-a"></div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="generic-form-cancel" class="btn-secondary">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  `
  document.body.appendChild(modal)
  modal.querySelector('#generic-form-cancel').addEventListener('click', () => modal.remove())
  modal.querySelector('#generic-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const body = Object.fromEntries(fd.entries())
    try {
      await onSubmit(body)
      modal.remove()
    } catch (err) {
      const errEl = modal.querySelector('#generic-form-error')
      errEl.textContent = err.message
      errEl.classList.remove('hidden')
    }
  })
}
