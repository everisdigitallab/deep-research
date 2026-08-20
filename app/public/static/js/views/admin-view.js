async function renderAdminView(content, subview) {
  const tabs = [
    { key: 'users', label: 'Usuários' },
    { key: 'master-data', label: 'Dados de referência' }
  ]
  const active = subview || 'users'

  content.innerHTML = `
    <h1 class="font-serif-heading text-2xl text-smart-navy font-bold mb-6"><i class="fa-solid fa-gears text-future-blue mr-2"></i>Administração</h1>
    <div class="flex gap-2 mb-6">
      ${tabs.map((t) => `<a href="#/admin/${t.key}" class="btn-secondary text-xs ${active === t.key ? 'active' : ''}">${t.label}</a>`).join('')}
    </div>
    <div id="admin-tab-content"></div>
  `

  const tabEl = document.getElementById('admin-tab-content')
  if (active === 'users') renderAdminUsers(tabEl)
  else renderAdminMasterData(tabEl)
}

async function renderAdminUsers(el) {
  const users = await api.get('/users')

  el.innerHTML = `
    <div class="card">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-sm text-smart-navy">Usuários</h3>
        <button id="new-user-btn" class="btn-primary text-xs">+ Novo Usuário</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${users.map((u) => `
            <tr>
              <td>${escapeHtml(u.name)}</td>
              <td class="text-xs">${escapeHtml(u.email)}</td>
              <td>${roleLabel(u.role)}</td>
              <td><span class="badge ${statusBadge(u.status)}">${escapeHtml(u.status)}</span></td>
              <td class="space-x-1 whitespace-nowrap">
                <button class="btn-secondary text-[11px] py-1 px-2 edit-user-btn" data-id="${u.id}"><i class="fa-solid fa-pen"></i></button>
                ${u.status === 'active'
                  ? `<button class="btn-secondary text-[11px] py-1 px-2 suspend-btn" data-id="${u.id}">Suspender</button>`
                  : u.status === 'suspended'
                    ? `<button class="btn-secondary text-[11px] py-1 px-2 reactivate-btn" data-id="${u.id}">Reativar</button>`
                    : ''}
                <button class="btn-secondary text-[11px] py-1 px-2 regen-token-btn" data-id="${u.id}">Novo token</button>
                <button class="btn-secondary text-[11px] py-1 px-2 delete-user-btn text-orange-a" data-id="${u.id}"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${users.length === 0 ? '<p class="text-sm text-gray-100 mt-3">Nenhum usuário.</p>' : ''}
    </div>
    <div id="user-action-result" class="mt-4"></div>
  `

  const roleOptions = [
    { value: 'executive', label: 'Executivo' },
    { value: 'admin', label: 'Admin' },
    { value: 'legal', label: 'Jurídico' },
    { value: 'master_admin', label: 'Master Admin' }
  ]

  document.getElementById('new-user-btn').addEventListener('click', () => {
    openSimpleFormModal('Novo Usuário', [
      { name: 'name', label: 'Nome *', required: true },
      { name: 'email', label: 'E-mail *', required: true },
      { name: 'role', label: 'Perfil', type: 'select', options: roleOptions }
    ], async (body) => {
      const res = await api.post('/users', body)
      document.getElementById('user-action-result').innerHTML = `
        <div class="card bg-[#F5FDF8]">
          <p class="text-sm font-semibold text-green-a mb-1">Usuário criado. Token de ativação:</p>
          <code class="block bg-smart-navy text-turquoise p-3 rounded text-xs break-all">${escapeHtml(res.activation_token)}</code>
        </div>`
      renderAdminUsers(el)
    })
  })

  el.querySelectorAll('.edit-user-btn').forEach((btn) => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-id')
    const u = await api.get(`/users/${id}`)
    openSimpleFormModal('Editar Usuário', [
      { name: 'name', label: 'Nome *', required: true, value: u.name },
      { name: 'role', label: 'Perfil', type: 'select', options: roleOptions, value: u.role }
    ], async (body) => {
      await api.put(`/users/${id}`, body)
      renderAdminUsers(el)
    })
    setTimeout(() => {
      const sel = document.querySelector('#generic-form select[name="role"]')
      if (sel) sel.value = u.role
    }, 0)
  }))

  el.querySelectorAll('.suspend-btn').forEach((btn) => btn.addEventListener('click', async () => {
    try { await api.post(`/users/${btn.getAttribute('data-id')}/suspend`); renderAdminUsers(el) } catch (e) { alert(e.message) }
  }))
  el.querySelectorAll('.reactivate-btn').forEach((btn) => btn.addEventListener('click', async () => {
    await api.post(`/users/${btn.getAttribute('data-id')}/reactivate`)
    renderAdminUsers(el)
  }))
  el.querySelectorAll('.regen-token-btn').forEach((btn) => btn.addEventListener('click', async () => {
    const res = await api.post(`/users/${btn.getAttribute('data-id')}/regenerate-token`)
    document.getElementById('user-action-result').innerHTML = `
      <div class="card bg-[#F5FDF8]">
        <p class="text-sm font-semibold text-green-a mb-1">Novo token pessoal:</p>
        <code class="block bg-smart-navy text-turquoise p-3 rounded text-xs break-all">${escapeHtml(res.personal_token)}</code>
      </div>`
  }))
  el.querySelectorAll('.delete-user-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Arquivar este usuário?')) return
    try {
      await api.del(`/users/${btn.getAttribute('data-id')}`)
      renderAdminUsers(el)
    } catch (e) { alert(e.message) }
  }))
}

function renderMasterDataCard(title, items, apiBase, renderExtra = null) {
  return `
    <div class="card">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-sm text-smart-navy">${title}</h3>
        <button class="btn-secondary text-xs md-new-btn" data-entity="${apiBase}">+</button>
      </div>
      <table class="data-table">
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${escapeHtml(item.name || item.code || '-')}${renderExtra ? renderExtra(item) : ''}</td>
              <td class="text-right whitespace-nowrap">
                <button class="btn-secondary text-[11px] py-1 px-2 md-edit-btn" data-entity="${apiBase}" data-id="${item.id}"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-secondary text-[11px] py-1 px-2 md-delete-btn text-orange-a" data-entity="${apiBase}" data-id="${item.id}"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${items.length === 0 ? '<p class="text-xs text-gray-100 mt-2">Nenhum registro.</p>' : ''}
    </div>
  `
}

async function renderAdminMasterData(el) {
  const [hubs, countries, technologies, currencies, exchangeRates] = await Promise.all([
    api.get('/master-data/hubs'),
    api.get('/master-data/countries'),
    api.get('/master-data/technologies'),
    api.get('/master-data/currencies'),
    api.get('/master-data/exchange-rates')
  ])

  const registry = {
    hubs: {
      label: 'Hub',
      items: hubs,
      fields: (v) => [
        { name: 'name', label: 'Nome *', required: true, value: v?.name },
        { name: 'city', label: 'Cidade', value: v?.city },
        { name: 'website', label: 'Website', value: v?.website },
        { name: 'description', label: 'Descrição', type: 'textarea', value: v?.description }
      ]
    },
    countries: {
      label: 'País',
      items: countries,
      fields: (v) => [
        { name: 'code', label: 'Código *', required: true, value: v?.code },
        { name: 'name', label: 'Nome *', required: true, value: v?.name }
      ]
    },
    technologies: {
      label: 'Tecnologia',
      items: technologies,
      fields: (v) => [{ name: 'name', label: 'Nome *', required: true, value: v?.name }]
    },
    currencies: {
      label: 'Moeda',
      items: currencies,
      fields: (v) => [
        { name: 'code', label: 'Código *', required: true, value: v?.code },
        { name: 'name', label: 'Nome *', required: true, value: v?.name },
        { name: 'symbol', label: 'Símbolo', value: v?.symbol }
      ]
    },
    'exchange-rates': {
      label: 'Taxa de câmbio',
      items: exchangeRates,
      fields: (v) => [
        { name: 'currency_code', label: 'Moeda *', required: true, value: v?.currency_code },
        { name: 'rate_to_eur', label: 'Taxa para EUR *', type: 'number', required: true, value: v?.rate_to_eur },
        { name: 'rate_date', label: 'Data', type: 'date', value: v?.rate_date }
      ]
    }
  }

  el.innerHTML = `
    <div class="grid grid-cols-2 gap-6">
      ${renderMasterDataCard('Hubs', hubs, 'hubs')}
      ${renderMasterDataCard('Países', countries, 'countries')}
      ${renderMasterDataCard('Tecnologias', technologies, 'technologies')}
      ${renderMasterDataCard('Moedas', currencies, 'currencies')}
      ${renderMasterDataCard('Taxas de câmbio', exchangeRates, 'exchange-rates', (item) => ` <span class="text-xs text-gray-100">(${escapeHtml(String(item.rate_to_eur))} EUR — ${fmtDate(item.rate_date)})</span>`)}
    </div>
  `

  function refresh() { renderAdminMasterData(el) }

  el.querySelectorAll('.md-new-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entity = btn.getAttribute('data-entity')
      const def = registry[entity]
      openSimpleFormModal(`Novo(a) ${def.label}`, def.fields(null), async (body) => {
        if (entity === 'exchange-rates' && body.rate_to_eur) body.rate_to_eur = parseFloat(body.rate_to_eur)
        await api.post(`/master-data/${entity}`, body)
        refresh()
      })
    })
  })

  el.querySelectorAll('.md-edit-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const entity = btn.getAttribute('data-entity')
      const id = btn.getAttribute('data-id')
      const def = registry[entity]
      const current = def.items.find((i) => i.id === id)
      openSimpleFormModal(`Editar ${def.label}`, def.fields(current), async (body) => {
        if (entity === 'exchange-rates' && body.rate_to_eur) body.rate_to_eur = parseFloat(body.rate_to_eur)
        await api.put(`/master-data/${entity}/${id}`, body)
        refresh()
      })
    })
  })

  el.querySelectorAll('.md-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const entity = btn.getAttribute('data-entity')
      const id = btn.getAttribute('data-id')
      const def = registry[entity]
      if (!confirm(`Arquivar este(a) ${def.label}?`)) return
      await api.del(`/master-data/${entity}/${id}`)
      refresh()
    })
  })
}

function openSimpleFormModal(title, fields, onSubmit) {
  const modal = document.createElement('div')
  modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50'
  modal.innerHTML = `
    <div class="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <h3 class="font-semibold text-lg text-smart-navy mb-4">${escapeHtml(title)}</h3>
      <form id="generic-form" class="space-y-3">
        ${fields.map((field) => {
          if (field.type === 'textarea') {
            return `<div><label class="form-label">${field.label}</label><textarea class="form-input" name="${field.name}" rows="3">${escapeHtml(field.value || '')}</textarea></div>`
          }
          if (field.type === 'select') {
            return `<div><label class="form-label">${field.label}</label><select class="form-select" name="${field.name}">${(field.options || []).map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`).join('')}</select></div>`
          }
          return `<div><label class="form-label">${field.label}</label><input class="form-input" name="${field.name}" type="${field.type || 'text'}" value="${escapeHtml(field.value || '')}" ${field.required ? 'required' : ''} /></div>`
        }).join('')}
        <div id="generic-form-error" class="hidden text-sm text-orange-a"></div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="generic-form-cancel" class="btn-secondary">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  `
  document.body.appendChild(modal)
  document.getElementById('generic-form-cancel').addEventListener('click', () => modal.remove())
  document.getElementById('generic-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const body = Object.fromEntries(fd.entries())
    try {
      await onSubmit(body)
      modal.remove()
    } catch (err) {
      const errorEl = document.getElementById('generic-form-error')
      errorEl.textContent = err.message || 'Erro ao salvar'
      errorEl.classList.remove('hidden')
    }
  })
  setTimeout(() => {
    fields.forEach((field) => {
      if (field.type === 'select' && field.value !== undefined) {
        const el = document.querySelector(`#generic-form select[name="${field.name}"]`)
        if (el) el.value = field.value
      }
    })
  }, 0)
}
