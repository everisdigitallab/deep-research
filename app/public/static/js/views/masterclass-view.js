// Masterclass: module list, content viewer with progress tracking, certificate issuance
async function renderMasterclassView(content, editionIdParam) {
  const editionId = editionIdParam || window.state.currentEditionId
  if (!editionId) {
    content.innerHTML = `<div class="card"><p class="text-sm text-gray-100">Selecione uma edição no topo da página.</p></div>`
    return
  }
  const user = window.state.user
  const canManage = ['master_admin', 'admin'].includes(user.role)

  const progress = await api.get(`/editions/${editionId}/my-progress`)
  const allDone = progress.length > 0 && progress.every((m) => m.completed_at)

  content.innerHTML = `
    <div class="mb-6 flex items-center justify-between">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold"><i class="fa-solid fa-graduation-cap text-future-blue mr-2"></i>Masterclass</h1>
      ${canManage ? `<button id="new-module-btn" class="btn-secondary text-xs">+ Módulo</button>` : ''}
    </div>

    ${allDone ? `
    <div class="card bg-[#F5FDF8] mb-6">
      <p class="text-sm mb-2"><i class="fa-solid fa-circle-check text-green-a mr-2"></i>Você concluiu todos os módulos obrigatórios desta edição.</p>
      <button id="issue-cert-btn" class="btn-primary text-xs">Emitir certificado</button>
      <div id="cert-result" class="mt-3"></div>
    </div>` : ''}

    <div id="modules-list" class="space-y-4"></div>
  `

  const listEl = document.getElementById('modules-list')
  listEl.innerHTML = progress.map((mod) => `
    <div class="card">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-semibold text-smart-navy">${escapeHtml(mod.title)}</h3>
        <span class="badge ${mod.completed_at ? 'badge-green' : 'badge-gray'}">${mod.completed_at ? 'Concluído' : 'Pendente'}</span>
      </div>
      <p class="text-xs text-gray-100 mb-3">${escapeHtml(mod.description || '')}</p>
      <div id="contents-${mod.id}" class="video-item-list space-y-2"><i class="fa-solid fa-circle-notch fa-spin text-gray-100"></i></div>
    </div>
  `).join('') || '<p class="text-sm text-gray-100">Nenhum módulo configurado para esta edição.</p>'

  for (const mod of progress) {
    loadModuleContents(mod.id)
  }

  const issueBtn = document.getElementById('issue-cert-btn')
  if (issueBtn) {
    issueBtn.addEventListener('click', async () => {
      try {
        const res = await api.post(`/editions/${editionId}/certificates/issue`, {})
        document.getElementById('cert-result').innerHTML = `
          <div class="text-xs bg-smart-navy text-turquoise p-3 rounded mt-2">
            Código: ${escapeHtml(res.code)}<br/>Validação: ${escapeHtml(res.validation_code)}
          </div>`
      } catch (err) { alert(err.message) }
    })
  }

  const newModBtn = document.getElementById('new-module-btn')
  if (newModBtn) {
    newModBtn.addEventListener('click', async () => {
      const title = prompt('Título do módulo:')
      if (!title) return
      const code = prompt('Código do módulo:') || title.slice(0, 10)
      try {
        await api.post(`/editions/${editionId}/modules`, { title, code, order_index: progress.length })
        renderRoute()
      } catch (err) { alert(err.message) }
    })
  }
}

async function loadModuleContents(moduleId) {
  const el = document.getElementById(`contents-${moduleId}`)
  if (!el) return
  try {
    const contents = await api.get(`/modules/${moduleId}/contents`)
    if (contents.length === 0) {
      el.innerHTML = '<p class="text-xs text-gray-100">Nenhum conteúdo cadastrado.</p>'
      return
    }
    el.innerHTML = ''
    for (const item of contents) {
      const prog = await api.get(`/contents/${item.id}/progress`)
      const div = document.createElement('div')
      div.className = `video-item flex items-center justify-between p-2 rounded border border-gray-50 ${prog.completed_at ? 'completed' : ''}`
      div.innerHTML = `
        <div class="flex items-center gap-2 text-sm">
          <i class="fa-solid ${item.type === 'video' ? 'fa-circle-play' : item.type === 'document' ? 'fa-file-lines' : 'fa-note-sticky'} text-future-blue"></i>
          <span>${escapeHtml(item.title)}</span>
          ${item.is_required ? '<span class="badge badge-gray text-[10px]">obrigatório</span>' : ''}
        </div>
        <div class="flex items-center gap-2">
          <div class="progress-track w-24"><div class="progress-fill" style="width:${prog.percent_watched || 0}%"></div></div>
          <span class="text-xs text-gray-100 w-10 text-right">${Math.round(prog.percent_watched || 0)}%</span>
          <button class="btn-secondary text-[11px] py-1 px-2 simulate-watch-btn" data-content-id="${item.id}" data-duration="${item.duration_seconds || 60}">
            ${prog.completed_at ? 'Rever' : 'Assistir'}
          </button>
        </div>
      `
      el.appendChild(div)
    }
    el.querySelectorAll('.simulate-watch-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const contentId = btn.getAttribute('data-content-id')
        const duration = parseInt(btn.getAttribute('data-duration'), 10) || 60
        // Simulate full-segment watch (no real video player wired in this MVP)
        try {
          const res = await api.post(`/contents/${contentId}/progress`, { segment_start: 0, segment_end: duration, position: duration })
          loadModuleContents(moduleId)
        } catch (err) { alert(err.message) }
      })
    })
  } catch (e) {
    el.innerHTML = '<p class="text-xs text-orange-a">Erro ao carregar conteúdos.</p>'
  }
}
