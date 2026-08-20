// Editions list / detail / create / duplicate / reopen
async function renderEditionsView(content, id) {
  if (id) return renderEditionDetail(content, id)

  const editions = await api.get('/editions')
  const user = window.state.user
  const canManage = ['master_admin', 'admin'].includes(user.role)

  content.innerHTML = `
    <div class="mb-6 flex items-center justify-between">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold">Edições</h1>
      ${canManage ? `<button id="new-edition-btn" class="btn-primary"><i class="fa-solid fa-plus mr-1"></i> Nova Edição</button>` : ''}
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Código</th><th>Nome</th><th>Status</th><th>Início</th><th>Fim</th><th></th></tr></thead>
        <tbody>
          ${editions.map((e) => `
            <tr>
              <td class="font-mono text-xs">${escapeHtml(e.code || '-')}</td>
              <td>${escapeHtml(e.name)}</td>
              <td><span class="badge ${statusBadge(e.status)}">${escapeHtml(e.status)}</span></td>
              <td>${fmtDate(e.start_date)}</td>
              <td>${fmtDate(e.end_date)}</td>
              <td><a href="#/editions/${e.id}" class="text-future-blue hover:underline text-xs">Abrir <i class="fa-solid fa-arrow-right"></i></a></td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${editions.length === 0 ? '<p class="text-sm text-gray-100 mt-3">Nenhuma edição cadastrada.</p>' : ''}
    </div>
  `

  const btn = document.getElementById('new-edition-btn')
  if (btn) btn.addEventListener('click', () => openEditionFormModal())
}

function openEditionFormModal() {
  const modal = document.createElement('div')
  modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50'
  modal.innerHTML = `
    <div class="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <h3 class="font-semibold text-lg text-smart-navy mb-4">Nova Edição</h3>
      <form id="edition-form" class="space-y-3">
        <div><label class="form-label">Nome *</label><input class="form-input" name="name" required /></div>
        <div><label class="form-label">Código</label><input class="form-input" name="code" placeholder="APP-2026" /></div>
        <div><label class="form-label">Descrição</label><textarea class="form-input" name="description" rows="2"></textarea></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="form-label">Início</label><input type="date" class="form-input" name="start_date" /></div>
          <div><label class="form-label">Fim</label><input type="date" class="form-input" name="end_date" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="form-label">Masterclass início</label><input type="date" class="form-input" name="masterclass_start" /></div>
          <div><label class="form-label">Masterclass fim</label><input type="date" class="form-input" name="masterclass_end" /></div>
        </div>
        <div><label class="form-label">IRL mínimo (1-9)</label><input type="number" min="1" max="9" class="form-input" name="irl_min_score" value="6" /></div>
        <div id="edition-form-error" class="hidden text-sm text-orange-a"></div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="edition-form-cancel" class="btn-secondary">Cancelar</button>
          <button type="submit" class="btn-primary">Criar</button>
        </div>
      </form>
    </div>
  `
  document.body.appendChild(modal)
  modal.querySelector('#edition-form-cancel').addEventListener('click', () => modal.remove())
  modal.querySelector('#edition-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const body = Object.fromEntries(fd.entries())
    if (body.irl_min_score) body.irl_min_score = parseInt(body.irl_min_score, 10)
    try {
      await api.post('/editions', body)
      modal.remove()
      renderRoute()
    } catch (err) {
      const errEl = modal.querySelector('#edition-form-error')
      errEl.textContent = err.message
      errEl.classList.remove('hidden')
    }
  })
}

async function renderEditionDetail(content, id) {
  const edition = await api.get(`/editions/${id}`)
  const user = window.state.user
  const canManage = ['master_admin', 'admin'].includes(user.role)
  const gate = await api.get(`/editions/${id}/masterclass-gate`).catch(() => null)

  content.innerHTML = `
    <div class="mb-6">
      <a href="#/editions" class="text-sm text-future-blue hover:underline"><i class="fa-solid fa-arrow-left mr-1"></i> Edições</a>
    </div>
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="font-serif-heading text-2xl text-smart-navy font-bold">${escapeHtml(edition.name)}</h1>
        <p class="text-sm text-gray-100 font-mono">${escapeHtml(edition.code || '')}</p>
      </div>
      <div class="flex gap-2">
        <span class="badge ${statusBadge(edition.status)}">${escapeHtml(edition.status)}</span>
        ${canManage && (edition.status === 'closed' || edition.status === 'archived') && user.role === 'master_admin'
          ? `<button id="reopen-btn" class="btn-secondary text-xs">Reabrir</button>` : ''}
        ${canManage ? `<button id="duplicate-btn" class="btn-secondary text-xs">Duplicar</button>` : ''}
      </div>
    </div>

    ${gate ? `
    <div class="card mb-4 ${gate.gate_passed || gate.exempt ? 'bg-[#F5FDF8]' : 'bg-[#FFF9EE]'}">
      <p class="text-sm">
        <i class="fa-solid ${gate.gate_passed || gate.exempt ? 'fa-circle-check text-green-a' : 'fa-triangle-exclamation text-yellow-a'} mr-2"></i>
        ${gate.exempt ? 'Você está isento do gate de Masterclass (perfil não-Executivo).' :
          gate.gate_passed ? 'Masterclass concluída — você pode criar Desafios nesta edição.' :
          'Complete a Masterclass desta edição para poder criar Desafios.'}
        <a href="#/masterclass/${id}" class="text-future-blue hover:underline ml-1">Ir para Masterclass</a>
      </p>
    </div>` : ''}

    <div class="grid grid-cols-4 gap-4 mb-6">
      <div class="kpi-card"><div class="kpi-value text-base">${fmtDate(edition.start_date)}</div><div class="kpi-label">Início</div></div>
      <div class="kpi-card"><div class="kpi-value text-base">${fmtDate(edition.end_date)}</div><div class="kpi-label">Fim</div></div>
      <div class="kpi-card"><div class="kpi-value text-base">${fmtDate(edition.catalyst_day_date)}</div><div class="kpi-label">Catalyst Day</div></div>
      <div class="kpi-card"><div class="kpi-value">${edition.irl_min_score ?? '-'}</div><div class="kpi-label">IRL mínimo</div></div>
    </div>

    <div class="card">
      <h3 class="font-semibold text-sm text-smart-navy mb-2">Descrição</h3>
      <p class="text-sm text-gray-100">${escapeHtml(edition.description || 'Sem descrição.')}</p>
    </div>
  `

  const reopenBtn = document.getElementById('reopen-btn')
  if (reopenBtn) {
    reopenBtn.addEventListener('click', async () => {
      const justification = prompt('Justificativa para reabrir a edição (obrigatório):')
      if (!justification) return
      try {
        await api.post(`/editions/${id}/reopen`, { justification })
        renderRoute()
      } catch (err) { alert(err.message) }
    })
  }
  const dupBtn = document.getElementById('duplicate-btn')
  if (dupBtn) {
    dupBtn.addEventListener('click', async () => {
      const name = prompt('Nome da nova edição:')
      if (!name) return
      const code = prompt('Código da nova edição:') || ''
      try {
        const res = await api.post(`/editions/${id}/duplicate`, { name, code })
        window.location.hash = `#/editions/${res.id}`
      } catch (err) { alert(err.message) }
    })
  }
}
