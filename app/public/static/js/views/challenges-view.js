// Challenges (Desafios)
async function renderChallengesView(content, id) {
  if (id) return renderChallengeDetail(content, id)

  const editionId = window.state.currentEditionId
  const challenges = await api.get(`/challenges${editionId ? '?edition_id=' + editionId : ''}`)

  content.innerHTML = `
    <div class="mb-6 flex items-center justify-between">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold">Desafios</h1>
      <button id="new-challenge-btn" class="btn-primary"><i class="fa-solid fa-plus mr-1"></i> Novo Desafio</button>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Título</th><th>Status</th><th>Cubo Gate</th><th></th></tr></thead>
        <tbody>
          ${challenges.map((ch) => `
            <tr>
              <td>${escapeHtml(ch.title)}</td>
              <td><span class="badge ${statusBadge(ch.status)}">${escapeHtml(ch.status)}</span></td>
              <td>${ch.cubo_gate_completed_at ? '<i class="fa-solid fa-circle-check text-green-a"></i> Concluído' : '<i class="fa-solid fa-hourglass-half text-yellow-a"></i> Pendente'}</td>
              <td class="text-right whitespace-nowrap space-x-1">
                <button class="btn-secondary text-[11px] py-1 px-2 delete-challenge-btn text-orange-a" data-id="${ch.id}"><i class="fa-solid fa-trash"></i></button>
                <a href="#/challenges/${ch.id}" class="text-future-blue hover:underline text-xs">Abrir <i class="fa-solid fa-arrow-right"></i></a>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${challenges.length === 0 ? '<p class="text-sm text-gray-100 mt-3">Nenhum desafio cadastrado nesta edição.</p>' : ''}
    </div>
  `

  content.querySelectorAll('.delete-challenge-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Excluir/arquivar este desafio?')) return
    try {
      await api.del(`/challenges/${btn.getAttribute('data-id')}`)
      renderRoute()
    } catch (e) { alert(e.message) }
  }))

  document.getElementById('new-challenge-btn').addEventListener('click', () => {
    if (!editionId) { alert('Selecione uma edição primeiro.'); return }
    openSimpleFormModal('Novo Desafio', [
      { name: 'title', label: 'Título *', required: true },
      { name: 'business_mission', label: 'Missão de negócio', type: 'textarea' },
      { name: 'problem_statement', label: 'Problema', type: 'textarea' },
      { name: 'expected_outcome', label: 'Resultado esperado', type: 'textarea' },
      { name: 'sponsor', label: 'Patrocinador' },
      {
        name: 'confidentiality', label: 'Confidencialidade', type: 'select',
        options: [{ value: 'internal', label: 'Interno' }, { value: 'confidential', label: 'Confidencial' }, { value: 'public', label: 'Público' }]
      }
    ], async (body) => {
      body.edition_id = editionId
      try {
        await api.post('/challenges', body)
        renderRoute()
      } catch (err) {
        if (err.status === 403 && err.data && err.data.error === 'masterclass_gate_required') {
          throw new Error('Você precisa concluir a Masterclass desta edição antes de criar Desafios.')
        }
        throw err
      }
    })
  })
}

async function renderChallengeDetail(content, id) {
  const ch = await api.get(`/challenges/${id}`)
  content.innerHTML = `
    <div class="mb-6"><a href="#/challenges" class="text-sm text-future-blue hover:underline"><i class="fa-solid fa-arrow-left mr-1"></i> Desafios</a></div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold">${escapeHtml(ch.title)}</h1>
      <div class="flex items-center gap-2">
        <span class="badge ${statusBadge(ch.status)}">${escapeHtml(ch.status)}</span>
        <button id="edit-challenge-btn" class="btn-secondary text-xs"><i class="fa-solid fa-pen mr-1"></i>Editar</button>
        <button id="delete-challenge-btn" class="btn-secondary text-xs text-orange-a"><i class="fa-solid fa-trash mr-1"></i>Excluir</button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-6 mb-6">
      <div class="card">
        <h3 class="font-semibold text-sm text-smart-navy mb-2">Missão de negócio</h3>
        <p class="text-sm text-gray-100">${escapeHtml(ch.business_mission || '-')}</p>
      </div>
      <div class="card">
        <h3 class="font-semibold text-sm text-smart-navy mb-2">Problema</h3>
        <p class="text-sm text-gray-100">${escapeHtml(ch.problem_statement || '-')}</p>
      </div>
      <div class="card">
        <h3 class="font-semibold text-sm text-smart-navy mb-2">Resultado esperado</h3>
        <p class="text-sm text-gray-100">${escapeHtml(ch.expected_outcome || '-')}</p>
      </div>
      <div class="card">
        <h3 class="font-semibold text-sm text-smart-navy mb-2">Cubo Gate</h3>
        <p class="text-sm">${ch.cubo_gate_completed_at
          ? `<i class="fa-solid fa-circle-check text-green-a mr-1"></i> Concluído em ${fmtDate(ch.cubo_gate_completed_at)}`
          : '<i class="fa-solid fa-hourglass-half text-yellow-a mr-1"></i> Aguardando plano de ação de uma Cubo Experience vinculada.'}</p>
        <a href="#/cubo-experiences" class="text-future-blue hover:underline text-xs mt-2 inline-block">Ver Cubo Experiences <i class="fa-solid fa-arrow-right"></i></a>
      </div>
    </div>

    <div class="card">
      <h3 class="font-semibold text-sm text-smart-navy mb-2">Clientes vinculados</h3>
      <p class="text-sm text-gray-100">${(ch.clients || []).map((c) => escapeHtml(c.name)).join(', ') || 'Nenhum'}</p>
    </div>
  `

  document.getElementById('edit-challenge-btn').addEventListener('click', () => {
    openSimpleFormModal('Editar Desafio', [
      { name: 'title', label: 'Título *', required: true, value: ch.title },
      { name: 'business_mission', label: 'Missão de negócio', type: 'textarea', value: ch.business_mission },
      { name: 'problem_statement', label: 'Problema', type: 'textarea', value: ch.problem_statement },
      { name: 'expected_outcome', label: 'Resultado esperado', type: 'textarea', value: ch.expected_outcome },
      { name: 'sponsor', label: 'Patrocinador', value: ch.sponsor },
      {
        name: 'confidentiality', label: 'Confidencialidade', type: 'select',
        options: [{ value: 'internal', label: 'Interno' }, { value: 'confidential', label: 'Confidencial' }, { value: 'public', label: 'Público' }],
        value: ch.confidentiality
      },
      {
        name: 'status', label: 'Status', type: 'select',
        options: [{ value: 'draft', label: 'Rascunho' }, { value: 'active', label: 'Ativo' }, { value: 'archived', label: 'Arquivado' }],
        value: ch.status
      }
    ], async (body) => {
      await api.put(`/challenges/${id}`, body)
      renderRoute()
    })
    setTimeout(() => {
      const selConf = document.querySelector('#generic-form select[name="confidentiality"]')
      if (selConf) selConf.value = ch.confidentiality
      const selStatus = document.querySelector('#generic-form select[name="status"]')
      if (selStatus) selStatus.value = ch.status
    }, 0)
  })

  document.getElementById('delete-challenge-btn').addEventListener('click', async () => {
    if (!confirm('Excluir/arquivar este desafio?')) return
    try {
      await api.del(`/challenges/${id}`)
      window.location.hash = '#/challenges'
    } catch (e) { alert(e.message) }
  })
}
