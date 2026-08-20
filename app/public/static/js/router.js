// Simple hash-based router
async function renderRoute() {
  const hash = window.location.hash || '#/dashboard'
  const [routePath] = hash.slice(2).split('?')
  const parts = routePath.split('/').filter(Boolean)

  // Auth check
  if (!window.state.user) {
    try {
      const me = await api.get('/auth/me')
      window.state.user = me.user
    } catch (e) {
      if (parts[0] !== 'login' && parts[0] !== 'activate') {
        window.location.hash = '#/login'
        return renderLoginView()
      }
    }
  }

  if (parts[0] === 'login') return renderLoginView()
  if (parts[0] === 'activate') return renderActivateView()

  if (!window.state.user) {
    window.location.hash = '#/login'
    return renderLoginView()
  }

  if (!document.querySelector('.app-header')) {
    renderAppShell()
  } else {
    updateActiveNav()
  }

  const content = document.getElementById('content')
  content.innerHTML = '<div class="flex items-center justify-center h-64"><i class="fa-solid fa-circle-notch fa-spin text-3xl text-future-blue"></i></div>'

  try {
    switch (parts[0]) {
      case 'dashboard': return renderDashboardView(content)
      case 'audit': return renderAuditView(content)
      case 'admin': return renderAdminView(content, parts[1])
      default: return renderDashboardView(content)
    }
  } catch (e) {
    console.error(e)
    content.innerHTML = `<div class="card border-orange-a"><p class="text-orange-a font-semibold"><i class="fa-solid fa-triangle-exclamation mr-2"></i>Erro ao carregar</p><p class="text-sm mt-2">${escapeHtml(e.message)}</p></div>`
  }
}

function updateActiveNav() {
  const currentRoute = window.location.hash
  document.querySelectorAll('.app-sidebar a').forEach((a) => {
    a.classList.toggle('active', currentRoute.startsWith(a.getAttribute('href')))
  })
}

window.addEventListener('hashchange', renderRoute)
window.addEventListener('DOMContentLoaded', renderRoute)
