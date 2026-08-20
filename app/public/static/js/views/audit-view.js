async function renderAuditView(content) {
  const response = await api.get('/audit')
  const rows = response.results || []

  content.innerHTML = `
    <h1 class="font-serif-heading text-2xl text-smart-navy font-bold mb-6"><i class="fa-solid fa-clipboard-list text-future-blue mr-2"></i>Auditoria</h1>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Ação</th><th>Entidade</th><th>Usuário</th><th>IP</th><th class="text-right">Quando</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.action || '-')}</td>
              <td>${escapeHtml(row.entity_type || '-')}</td>
              <td>${escapeHtml(row.user_name || 'system')}</td>
              <td class="text-xs">${escapeHtml(row.ip_address || '-')}</td>
              <td class="text-right text-xs">${fmtDateTime(row.created_at)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${rows.length === 0 ? '<p class="text-sm text-gray-100 mt-3">Nenhum evento auditado.</p>' : ''}
    </div>
  `
}
