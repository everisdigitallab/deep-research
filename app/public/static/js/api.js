// Lightweight API client wrapper
const API_BASE = '/api'

async function apiRequest(method, path, body, isFormData = false) {
  const opts = {
    method,
    credentials: 'include',
    headers: {}
  }
  if (body && !isFormData) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  } else if (body && isFormData) {
    opts.body = body
  }
  const res = await fetch(API_BASE + path, opts)
  let data = null
  try {
    data = await res.json()
  } catch (e) {
    data = null
  }
  if (!res.ok) {
    const err = new Error((data && data.message) || (data && data.error) || `Request failed (${res.status})`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

const api = {
  get: (path) => apiRequest('GET', path),
  post: (path, body) => apiRequest('POST', path, body),
  put: (path, body) => apiRequest('PUT', path, body),
  del: (path) => apiRequest('DELETE', path),
  upload: (path, formData) => apiRequest('POST', path, formData, true)
}

window.api = api
