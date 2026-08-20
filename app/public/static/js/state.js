// Global app state
window.state = {
  user: null,
  currentEditionId: null,
  editions: []
}

function fmtDate(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch (e) {
    return iso
  }
}

function fmtDateTime(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch (e) {
    return iso
  }
}

function fmtMoney(value, currency) {
  if (value === null || value === undefined) return '-'
  const cur = currency || 'EUR'
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(value)
  } catch (e) {
    return `${cur} ${value.toFixed(2)}`
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function roleLabel(role) {
  const map = {
    master_admin: 'Master Admin',
    admin: 'Admin',
    executive: 'Executivo',
    legal: 'Jur\u00eddico'
  }
  return map[role] || role
}

function phaseLabel(phase) {
  const map = {
    ideation: 'Idea\u00e7\u00e3o',
    qualification: 'Qualifica\u00e7\u00e3o',
    cubo_gate: 'Cubo Gate',
    scouting: 'Scouting',
    matching: 'Matching',
    solution_design: 'Desenho da Solu\u00e7\u00e3o',
    legal_feasibility: 'Viabilidade Jur\u00eddica',
    financial_feasibility: 'Viabilidade Financeira',
    approval: 'Aprova\u00e7\u00e3o',
    contracting: 'Contrata\u00e7\u00e3o',
    kickoff: 'Kick-off',
    execution: 'Execu\u00e7\u00e3o',
    validation: 'Valida\u00e7\u00e3o',
    scale_or_stop: 'Scale-or-Stop',
    closing: 'Encerramento',
    commercial_conversion: 'Convers\u00e3o Comercial'
  }
  return map[phase] || phase
}

function statusBadge(status) {
  const colorMap = {
    active: 'badge-green', valid: 'badge-green', signed: 'badge-green', funded: 'badge-green', approved: 'badge-green',
    draft: 'badge-gray', pending_activation: 'badge-yellow', in_review: 'badge-yellow', pending_signature: 'badge-yellow',
    suspended: 'badge-orange', invalidated: 'badge-orange', rejected: 'badge-orange', cancelled: 'badge-orange',
    closed: 'badge-navy', archived: 'badge-navy'
  }
  return colorMap[status] || 'badge-blue'
}
