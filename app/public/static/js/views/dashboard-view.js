async function renderDashboardView(content) {
  const summary = await api.get('/dashboard/summary')

  const recentAuditRows = (summary.recent_audit || [])
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.action || '-')}</td>
          <td>${escapeHtml(row.entity_type || '-')}</td>
          <td>${escapeHtml(row.user_name || 'system')}</td>
          <td class="text-right text-xs">${fmtDateTime(row.created_at)}</td>
        </tr>`
    )
    .join('')

  content.innerHTML = `
    <div class="mb-6 flex items-center justify-between">
      <h1 class="font-serif-heading text-2xl text-smart-navy font-bold">Dashboard</h1>
      <span class="badge badge-blue">Sample Runtime</span>
    </div>

    <div class="grid grid-cols-4 gap-4 mb-6">
      <div class="kpi-card"><div class="kpi-value">${summary.users.total}</div><div class="kpi-label">Usuários</div></div>
      <div class="kpi-card"><div class="kpi-value">${summary.users.active}</div><div class="kpi-label">Usuários ativos</div></div>
      <div class="kpi-card"><div class="kpi-value">${summary.users.pending_activation}</div><div class="kpi-label">Ativações pendentes</div></div>
      <div class="kpi-card"><div class="kpi-value">${summary.users.active_sessions}</div><div class="kpi-label">Sessões abertas</div></div>
    </div>

    <div class="grid grid-cols-4 gap-4 mb-6">
      <div class="kpi-card"><div class="kpi-value">${summary.reference_data.countries}</div><div class="kpi-label">Países</div></div>
      <div class="kpi-card"><div class="kpi-value">${summary.reference_data.currencies}</div><div class="kpi-label">Moedas</div></div>
      <div class="kpi-card"><div class="kpi-value">${summary.reference_data.technologies}</div><div class="kpi-label">Tecnologias</div></div>
      <div class="kpi-card"><div class="kpi-value">${summary.reference_data.hubs}</div><div class="kpi-label">Hubs</div></div>
    </div>

    <div class="card">
      <h3 class="font-semibold text-sm text-smart-navy mb-3">Atividade recente</h3>
      <table class="data-table">
        <thead><tr><th>Ação</th><th>Entidade</th><th>Usuário</th><th class="text-right">Quando</th></tr></thead>
        <tbody>${recentAuditRows || '<tr><td colspan="4" class="text-gray-100">Nenhum registro de auditoria ainda.</td></tr>'}</tbody>
      </table>
    </div>
  `
}
