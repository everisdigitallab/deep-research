// App shell: header + sidebar + content mount
const NAV_ITEMS = [
  { section: 'Amostra' },
  { icon: 'fa-gauge-high', label: 'Dashboard', route: '#/dashboard' },
  { section: 'Sistema' },
  { icon: 'fa-clipboard-list', label: 'Auditoria', route: '#/audit', roles: ['master_admin', 'admin'] },
  { icon: 'fa-gears', label: 'Administra\u00e7\u00e3o', route: '#/admin', roles: ['master_admin', 'admin'] }
]

function renderAppShell() {
  const user = window.state.user
  const currentRoute = window.location.hash || '#/dashboard'

  const navHtml = NAV_ITEMS.map((item) => {
    if (item.section) {
      return `<div class="sidebar-section">${item.section}</div>`
    }
    if (item.roles && !item.roles.includes(user.role)) return ''
    const active = currentRoute.startsWith(item.route) ? 'active' : ''
    return `<a href="${item.route}" class="${active}"><i class="fa-solid ${item.icon} w-4"></i><span>${item.label}</span></a>`
  }).join('')

  document.getElementById('app').innerHTML = `
    <header class="app-header">
      <div class="flex items-center gap-3">
        <span class="font-serif-heading text-smart-navy font-bold text-lg tracking-tight">Application Portal</span>
      </div>
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2 pl-3 border-l border-gray-50">
          <div class="w-8 h-8 rounded-full bg-future-blue text-white flex items-center justify-center text-xs font-bold">
            ${(user.name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div class="text-xs leading-tight">
            <div class="font-semibold text-text-gray">${escapeHtml(user.name)}</div>
            <div class="text-gray-100">${roleLabel(user.role)}</div>
          </div>
        </div>
        <button id="logout-btn" class="text-gray-100 hover:text-orange-a" title="Sair"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
        <span class="text-[10px] text-right leading-tight text-gray-100">shared<br/>template</span>
      </div>
    </header>
    <div class="flex">
      <nav class="app-sidebar p-2">${navHtml}</nav>
      <main id="content" class="flex-1 p-6 bg-[#FAFBFC] min-h-[calc(100vh-57px)]"></main>
    </div>
  `

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api.post('/auth/logout')
    window.state.user = null
    window.location.hash = '#/login'
    renderRoute()
  })

}
