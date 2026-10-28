import { api } from '../api.js';
import { qs, qsa, esc, svg, badge, fmtStamp, labelOf, emptyState, options, field, select, textarea, modal, confirmDialog, toast } from '../ui.js';

export default async function view({ el, params, state, setCrumbs, navigate, refreshCounts }) {
  const M = state.meta; const admin = state.user.role === 'admin';
  setCrumbs([{ label: 'Solicitudes' }]);
  let status = params.status || '';
  el.innerHTML = `<div class="page-head"><div><p class="eyebrow">Sitio web</p><h1>Solicitudes de contacto</h1><p class="lead">Mensajes recibidos desde el formulario público. Conviértalos en clientes cuando corresponda.</p></div></div>
  <form class="filter-bar"><select name="status" aria-label="Estado">${options(M.LEAD_STATUS, status, { empty: 'Todos los estados' })}</select><span class="count" id="count"></span></form><section class="panel" id="list"></section>`;
  qs('[name=status]', el).addEventListener('change', (e) => { status = e.target.value; load(); });
  const staffOpts = M.staff.map((u) => ({ id: u.id, label: u.name }));
  async function load() {
    const list = qs('#list', el); list.innerHTML = '<div class="loading"><span class="spinner dark"></span></div>';
    const rows = await api.get('/api/leads' + (status ? `?status=${status}` : ''));
    qs('#count', el).textContent = `${rows.length} ${rows.length === 1 ? 'solicitud' : 'solicitudes'}`;
    list.innerHTML = rows.length ? rows.map((l) => `<div class="row"><div class="info"><span class="overline">${esc(fmtStamp(l.created_at))} · ${esc(l.reason || 'Sin motivo')}</span><h3>${esc(l.name)}</h3><p>${esc(l.email)}${l.phone ? ` · ${esc(l.phone)}` : ''}</p>${l.message ? `<p style="white-space:pre-wrap;color:var(--color-ink);margin-top:6px">${esc(l.message)}</p>` : ''}${l.notes ? `<p style="margin-top:6px"><b>Notas:</b> ${esc(l.notes)}</p>` : ''}</div><div class="end">${badge(M.LEAD_STATUS, l.status)}<span class="when">${l.assigned_name ? `Atiende: ${esc(l.assigned_name)}` : 'Sin asignar'}</span><div style="display:flex;gap:12px;flex-wrap:wrap"><button class="text-button" data-edit="${l.id}">Gestionar</button>${l.status !== 'convertida' ? `<button class="text-button" data-convert="${l.id}">Convertir en cliente</button>` : ''}${admin ? `<button class="text-button danger" data-del="${l.id}">Eliminar</button>` : ''}</div></div></div>`).join('') : emptyState('Sin solicitudes', 'Las solicitudes enviadas desde el sitio web aparecerán aquí.');
    qsa('[data-edit]', list).forEach((b) => b.addEventListener('click', async () => {
      const l = rows.find((x) => x.id === +b.dataset.edit);
      const r = await modal({ title: 'Gestionar solicitud', eyebrow: l.name, submitLabel: 'Guardar', body: `<div class="form-grid">${field('Estado', select('status', M.LEAD_STATUS, l.status))}${field('Atiende', select('assigned_to', staffOpts, l.assigned_to || state.user.id, { empty: 'Sin asignar' }))}${field('Notas internas', textarea('notes', l.notes || '', 'rows="3" maxlength="2000"'), { span: true })}</div>`, onSubmit: (data) => api.put(`/api/leads/${l.id}`, data) });
      if (r) { load(); refreshCounts(); }
    }));
    qsa('[data-convert]', list).forEach((b) => b.addEventListener('click', async () => { const r = await api.post(`/api/leads/${b.dataset.convert}/convert`, {}); toast('Cliente creado a partir de la solicitud.'); refreshCounts(); navigate(`#/clientes/${r.client.id}`); }));
    qsa('[data-del]', list).forEach((b) => b.addEventListener('click', async () => { if (await confirmDialog('Eliminar solicitud', 'Se eliminará de forma permanente.')) { await api.del(`/api/leads/${b.dataset.del}`); load(); refreshCounts(); } }));
  }
  await load();
}
