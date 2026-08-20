function renderLoginView() {
  document.getElementById('app').innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-[#F5F7F9]">
      <div class="w-full max-w-md">
        <div class="card">
          <h1 class="font-serif-heading text-2xl text-smart-navy font-bold mb-1">Application Portal</h1>
          <p class="text-sm text-gray-100 mb-6">Ambiente protegido &mdash; acesso restrito</p>
          <form id="login-form" class="space-y-4">
            <div>
              <label class="form-label">Token pessoal de acesso</label>
              <input type="password" id="login-token" class="form-input" placeholder="Cole seu token pessoal" required />
            </div>
            <div id="login-error" class="hidden text-sm text-orange-a"></div>
            <button type="submit" class="btn-primary w-full">Entrar</button>
          </form>
          <div class="mt-4 text-center">
            <a href="#/activate" class="text-sm text-future-blue hover:underline">Primeiro acesso? Ativar conta com token de ativa\u00e7\u00e3o</a>
          </div>
        </div>
        <p class="text-center text-xs text-gray-100 mt-6">Uso restrito. Acesso somente para pessoas autorizadas.</p>
      </div>
    </div>
  `
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const token = document.getElementById('login-token').value
    const errorEl = document.getElementById('login-error')
    errorEl.classList.add('hidden')
    try {
      const res = await api.post('/auth/login', { token })
      window.state.user = res.user
      window.location.hash = '#/dashboard'
      renderRoute()
    } catch (err) {
      errorEl.textContent = err.message || 'Falha na autentica\u00e7\u00e3o'
      errorEl.classList.remove('hidden')
    }
  })
}

function renderActivateView() {
  document.getElementById('app').innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-[#F5F7F9]">
      <div class="w-full max-w-md">
        <div class="card">
          <h1 class="font-serif-heading text-2xl text-smart-navy font-bold mb-1">Ativar conta</h1>
          <p class="text-sm text-gray-100 mb-6">Use o token de ativa\u00e7\u00e3o enviado pelo seu Admin</p>
          <form id="activate-form" class="space-y-4">
            <div>
              <label class="form-label">Token de ativa\u00e7\u00e3o</label>
              <input type="text" id="activation-token" class="form-input" required />
            </div>
            <div>
              <label class="form-label">Idioma preferido</label>
              <select id="locale" class="form-select">
                <option value="pt-BR">Portugu\u00eas (Brasil)</option>
                <option value="en-US">English</option>
                <option value="es-ES">Espa\u00f1ol</option>
              </select>
            </div>
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" id="accept-terms" class="mt-1" required />
              <span>Li e aceito os <a href="#" class="text-future-blue">Termos de Uso</a></span>
            </label>
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" id="accept-privacy" class="mt-1" required />
              <span>Li e aceito a <a href="#" class="text-future-blue">Pol\u00edtica de Privacidade</a></span>
            </label>
            <div id="activate-error" class="hidden text-sm text-orange-a"></div>
            <div id="activate-success" class="hidden text-sm"></div>
            <button type="submit" class="btn-primary w-full">Ativar conta</button>
          </form>
          <div class="mt-4 text-center">
            <a href="#/login" class="text-sm text-future-blue hover:underline">Voltar ao login</a>
          </div>
        </div>
      </div>
    </div>
  `
  document.getElementById('activate-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const errorEl = document.getElementById('activate-error')
    const successEl = document.getElementById('activate-success')
    errorEl.classList.add('hidden')
    try {
      const res = await api.post('/auth/activate', {
        activation_token: document.getElementById('activation-token').value,
        locale: document.getElementById('locale').value,
        accept_terms: document.getElementById('accept-terms').checked,
        accept_privacy: document.getElementById('accept-privacy').checked
      })
      document.getElementById('activate-form').classList.add('hidden')
      successEl.classList.remove('hidden')
      successEl.innerHTML = `
        <div class="card bg-[#F5FDF8] border-green-a">
          <p class="font-semibold text-green-a mb-2"><i class="fa-solid fa-circle-check mr-1"></i> Conta ativada!</p>
          <p class="text-xs mb-2">Guarde este token pessoal com seguran\u00e7a. Ele n\u00e3o ser\u00e1 exibido novamente:</p>
          <code class="block bg-smart-navy text-turquoise p-3 rounded text-xs break-all">${escapeHtml(res.personal_token)}</code>
          <a href="#/login" class="btn-primary inline-block mt-4">Ir para login</a>
        </div>
      `
    } catch (err) {
      errorEl.textContent = err.message || 'Falha na ativa\u00e7\u00e3o'
      errorEl.classList.remove('hidden')
    }
  })
}
