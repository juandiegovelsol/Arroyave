// Cliente HTTP mínimo para la API de la plataforma.
async function request(method, url, body, isForm = false) {
  const headers = { 'X-Requested-With': 'fetch' };
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  const r = await fetch(url, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined, credentials: 'same-origin' });
  if (r.status === 401) { location.href = '/acceso?next=' + encodeURIComponent('/app/' + location.hash); throw new Error('Sesión expirada.'); }
  let data = null;
  const text = await r.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!r.ok) { const e = new Error((data && data.error) || `Error ${r.status}`); e.status = r.status; e.data = data; throw e; }
  return data;
}
export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  upload: (url, formData) => request('POST', url, formData, true),
};
