// Arranque de la plataforma: sesión, catálogos, navegación y enrutador por hash.
import { api } from './api.js';
import { qs, qsa, esc, initials, svg, toast } from './ui.js';

export const state = { user: null, meta: null, counts: {} };

const STAFF_NAV = [
  { href: '#/', label: 'Resumen', icon: 'grid', match: /^\/?$/ },
  { href: '#/procesos', label: 'Procesos', icon: 'folder', match: /^\/procesos/ },
  { href: '#/agenda', label: 'Agenda', icon: 'calendar', match: /^\/agenda/ },
  { href: '#/tareas', label: 'Tareas', icon: 'check', match: /^\/tareas/, countKey: 'tasks' },
  { href: '#/clientes', label: 'Clientes', icon: 'users', match: /^\/clientes/ },
  { href: '#/solicitudes', label: 'Solicitudes', icon: 'inbox', match: /^\/solicitudes/, countKey: 'leads' },
  { href: '#/equipo', label: 'Equipo', icon: 'user', match: /^\/equipo/ },
  { href: '#/ajustes', label: 'Ajustes', icon: 'settings', match: /^\/ajustes/, admin: true },
];
const CLIENT_NAV = [
  { href: '#/', label: 'Resumen', icon: 'grid', match: /^\/?$/ },
  { href: '#/procesos', label: 'Mis procesos', icon: 'folder', match: /^\/procesos/ },
  { href: '#/documentos', label: 'Documentos', icon: 'doc', match: /^\/documentos/ },
  { href: '#/mensajes', label: 'Mensajes', icon: 'message', match: /^\/mensajes/ },
  { href: '#/agenda', label: 'Agenda', icon: 'calendar', match: /^\/agenda/ },
];

const ROUTES = [
  { re: /^\/?$/, load: () => import('./views/resumen.js') },
  { re: /^\/procesos\/?$/, load: () => import('./views/procesos.js') },
  { re: /^\/procesos\/(\d+)(?:\/([a-z]+))?\/?$/, load: () => import('./views/proceso.js'), keys: ['id', 'tab'] },
  { re: /^\/agenda\/?$/, load: () => import('./views/agenda.js') },
  { re: /^\/tareas\/?$/, load: () => import('./views/tareas.js'), staff: true },
  { re: /^\/clientes\/?$/, load: () => import('./views/clientes.js'), staff: true },
  { re: /^\/clientes\/(\d+)\/?$/, load: () => import('./views/cliente.js'), keys: ['id'], staff: true },
  { re: /^\/solicitudes\/?$/, load: () => import('./views/solicitudes.js'), staff: true },
  { re: /^\/equipo\/?$/, load: () => import('./views/equipo.js'), staff: true },
  { re: /^\/ajustes\/?$/, load: () => import('./views/ajustes.js'), admin: true },
  { re: /^\/perfil\/?$/, load: () => import('./views/perfil.js') },
  { re: /^\/documentos\/?$/, load: () => import('./views/portal-documentos.js'), client: true },
  { re: /^\/mensajes\/?$/, load: () => import('./views/portal-mensajes.js'), client: true },
];

export const isClient = () => state.user && state.user.role === 'cliente';
export const isAdmin = () => state.user && state.user.role === 'admin';
export const canManage = () => state.user && ['admin', 'abogado'].includes(state.user.role);
export const navigate = (hash) => { location.hash = hash; };

export function setCrumbs(items) {
  const el = qs('#breadcrumb');
  el.innerHTML = items.map((it, i) => (i === items.length - 1 ? `<strong>${esc(it.label)}</strong>` : `<a href="${it.href || '#/'}">${esc(it.label)}</a><span class="sep">/</span>`)).join('');
  document.title = `${items[items.length - 1].label} · Arroyave H. Litigio`;
}

function renderNav() {
  const items = (isClient() ? CLIENT_NAV : STAFF_NAV).filter((i) => !i.admin || isAdmin());
  const path = location.hash.replace(/^#/, '') || '/';
  qs('#nav').innerHTML = items.map((i) => {
    const n = i.countKey ? state.counts[i.countKey] : 0;
    return `<a href="${i.href}" ${i.match.test(path) ? 'aria-current="page"' : ''}>${svg(i.icon)}<span>${esc(i.label)}</span>${n ? `<span class="count">${n}</span>` : ''}</a>`;
  }).join('');
  qs('#sidebar-eyebrow').textContent = isClient() ? 'Área de clientes' : 'Gestión de procesos';
}

async function refreshCounts() {
  if (isClient()) return;
  try {
    const [tasks, leads] = await Promise.all([api.get('/api/tasks?status=open&assigned=me'), api.get('/api/leads?status=nueva')]);
    state.counts = { tasks: tasks.length, leads: leads.length };
    renderNav();
  } catch { /* silencioso */ }
}

let current = null;
async function route() {
  const hashPath = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = hashPath.split('?');
  const params = Object.fromEntries(new URLSearchParams(query).entries());
  const main = qs('#main');
  closeSidebar();
  renderNav();
  const r = ROUTES.find((x) => x.re.test(path));
  if (!r || (r.staff && isClient()) || (r.admin && !isAdmin()) || (r.client && !isClient())) {
    main.innerHTML = `<div class="empty-state"><img src="/img/monogram-navy.svg" alt=""><h3>Página no encontrada</h3><p>La dirección no existe o su perfil no tiene acceso a ella.</p><a class="button secondary" href="#/">Ir al resumen</a></div>`;
    setCrumbs([{ label: 'Inicio' }]);
    return;
  }
  const m = path.match(r.re);
  (r.keys || []).forEach((k, i) => { params[k] = m[i + 1]; });
  const token = {}; current = token;
  main.innerHTML = '<div class="loading"><span class="spinner dark"></span> Cargando…</div>';
  try {
    const mod = await r.load();
    if (current !== token) return;
    await mod.default({ el: main, params, state, setCrumbs, navigate, refresh: () => route(), refreshCounts });
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (err) {
    if (current !== token) return;
    console.error(err);
    main.innerHTML = `<div class="alert danger"><strong>No fue posible cargar esta página</strong>${esc(err.message || '')}</div>`;
  }
}

// Barra lateral en móvil
const sidebar = qs('#sidebar'); const backdrop = qs('#backdrop'); const menuButton = qs('#menu-button');
function openSidebar() { sidebar.classList.add('open'); backdrop.hidden = false; menuButton.setAttribute('aria-expanded', 'true'); qs('#sidebar-close').focus(); }
function closeSidebar() { if (!sidebar.classList.contains('open')) return; sidebar.classList.remove('open'); backdrop.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); }
menuButton.addEventListener('click', openSidebar);
qs('#sidebar-close').addEventListener('click', () => { closeSidebar(); menuButton.focus(); });
backdrop.addEventListener('click', closeSidebar);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSidebar(); qs('#user-menu').hidden = true; qs('#user-button').setAttribute('aria-expanded', 'false'); } });

// Menú de usuario
const userButton = qs('#user-button'); const userMenu = qs('#user-menu');
userButton.addEventListener('click', () => { const open = userMenu.hidden; userMenu.hidden = !open; userButton.setAttribute('aria-expanded', String(open)); });
document.addEventListener('click', (e) => { if (!e.target.closest('.topbar-user')) { userMenu.hidden = true; userButton.setAttribute('aria-expanded', 'false'); } });
qs('#logout').addEventListener('click', async () => { try { await api.post('/api/auth/logout', {}); } catch { /* ignorar */ } location.href = '/acceso'; });
qs('#global-search').addEventListener('submit', (e) => { e.preventDefault(); const q = e.currentTarget.elements.q.value.trim(); navigate('#/procesos?q=' + encodeURIComponent(q)); });

async function boot() {
  try {
    const [me, meta] = await Promise.all([api.get('/api/auth/me'), api.get('/api/meta')]);
    state.user = me.user; state.meta = meta;
  } catch (err) { location.href = '/acceso'; return; }
  qs('#user-name').textContent = state.user.name;
  qs('#user-avatar').textContent = initials(state.user.name);
  if (isClient()) qs('#footer-note').textContent = 'Los estados que ve aquí describen el trabajo del despacho; no sustituyen la información oficial del juzgado.';
  window.addEventListener('hashchange', route);
  await route();
  refreshCounts();
  if (state.user.must_change_password) toast('Le recomendamos cambiar su contraseña desde "Mi perfil".', 'warning', 7000);
}
boot();
