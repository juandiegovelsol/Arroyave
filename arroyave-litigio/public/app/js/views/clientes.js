import { api } from '../api.js';
import { qs, qsa, esc, svg, emptyState, options, field, input, select, textarea, modal, toast, initials } from '../ui.js';

export default async function view({ el, params, state, setCrumbs, navigate }) {
  const M = state.meta;
  setCrumbs([{ label: 'Clientes' }]);
  el.innerHTML = `<div class="page-head"><div><p class="eyebrow">Relaciones</p><h1>Clientes</h1><p class="lead">Personas y empresas que el despacho representa.</p></div><div class="actions"><button class="button primary" id="new">${svg('plus')} Nuevo cliente</button></div></div>
  <form class="filter-bar" id="filters"><label class="search"><span class="sr-only">Buscar</span>${svg('search')}<input type="search" name="q" value="${esc(params.q || '')}" placeholder="Nombre, documento, correo o ciudad"></label><span class="count" id="count"></span></form>
  <section class="panel" id="list"></section>`;
  let timer; qs('#filters', el).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  qs('#filters', el).addEventListener('submit', (e) => { e.preventDefault(); load(); });
  qs('#new', el).addEventListener('click', async () => { const c = await clientDialog(M); if (c) navigate(`#/clientes/${c.id}`); });
  async function load() {
    const q = qs('[name=q]', el).value.trim();
    const list = qs('#list', el); list.innerHTML = '<div class="loading"><span class="spinner dark"></span></div>';
    const rows = await api.get('/api/clients?q=' + encodeURIComponent(q));
    qs('#count', el).textContent = `${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'}`;
    list.innerHTML = rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>Documento</th><th>Contacto</th><th>Ciudad</th><th class="num">Procesos</th></tr></thead><tbody>${rows.map((c) => `<tr><td data-label="Cliente"><a class="main" href="#/clientes/${c.id}">${esc(c.name)}</a><span class="sub">${c.kind === 'juridica' ? 'Persona jurídica' : 'Persona natural'}${c.contact_name ? ` · ${esc(c.contact_name)}` : ''}</span></td><td data-label="Documento">${c.doc_number ? `${esc(c.doc_type)} ${esc(c.doc_number)}` : '—'}</td><td data-label="Contacto">${esc(c.email || '—')}<span class="sub">${esc(c.phone || '')}</span></td><td data-label="Ciudad">${esc(c.city || '—')}</td><td data-label="Procesos" class="num">${c.case_count}<span class="sub">${c.active_count} activos</span></td></tr>`).join('')}</tbody></table></div>` : emptyState('No hay clientes con esos criterios');
  }
  await load();
}

export async function clientDialog(M, c) {
  return modal({ title: c ? 'Editar cliente' : 'Nuevo cliente', submitLabel: c ? 'Guardar' : 'Crear cliente', width: '720px', body: `<div class="form-grid">${field('Tipo', select('kind', [{ id: 'natural', label: 'Persona natural' }, { id: 'juridica', label: 'Persona jurídica' }], c?.kind || 'natural'))}${field('Nombre o razón social', input('name', c?.name || '', 'required maxlength="160"'), { required: true })}${field('Tipo de documento', select('doc_type', M.DOC_TYPES, c?.doc_type || 'CC'))}${field('Número de documento / NIT', input('doc_number', c?.doc_number || '', 'maxlength="40"'))}${field('Correo', input('email', c?.email || '', 'type="email" maxlength="160"'))}${field('Teléfono', input('phone', c?.phone || '', 'maxlength="40"'))}${field('Persona de contacto', input('contact_name', c?.contact_name || '', 'maxlength="120" placeholder="Para empresas"'))}${field('Dirección', input('address', c?.address || '', 'maxlength="200"'))}${field('Ciudad', input('city', c?.city || '', 'maxlength="80"'))}${field('Departamento', select('department', M.DEPARTMENTS, c?.department || '', { empty: 'Seleccione' }))}${field('Notas', textarea('notes', c?.notes || '', 'rows="3" maxlength="2000"'), { span: true })}</div>`,
    onSubmit: (data) => c ? api.put(`/api/clients/${c.id}`, data) : api.post('/api/clients', data) }).then((r) => { if (r) toast(c ? 'Cliente actualizado.' : 'Cliente creado.'); return r; });
}
