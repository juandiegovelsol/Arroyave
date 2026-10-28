import { api } from '../api.js';
import { qs, qsa, esc, svg, badge, prioBadge, fmtDate, relDays, daysUntil, emptyState, options, field, input, select, textarea, modal, confirmDialog, toast } from '../ui.js';

export default async function view({ el, params, state, setCrumbs, refreshCounts }) {
  const M = state.meta;
  setCrumbs([{ label: 'Tareas' }]);
  let assigned = params.assigned || 'me'; let status = params.status || 'open';
  const staffOpts = M.staff.map((u) => ({ id: u.id, label: u.name }));
  el.innerHTML = `<div class="page-head"><div><p class="eyebrow">Trabajo interno</p><h1>Tareas</h1><p class="lead">Pendientes del equipo, con fecha y proceso asociado.</p></div><div class="actions"><button class="button primary" id="new-task">${svg('plus')} Nueva tarea</button></div></div>
  <form class="filter-bar" id="filters"><select name="assigned" aria-label="Asignadas a">${options([{ id: 'me', label: 'Mis tareas' }, { id: 'all', label: 'Todo el equipo' }, ...staffOpts], assigned)}</select><select name="status" aria-label="Estado">${options([{ id: 'open', label: 'Abiertas' }, ...M.TASK_STATUS, { id: 'all', label: 'Todas' }], status)}</select><span class="count" id="count"></span></form>
  <section class="panel" id="list"></section>`;
  qs('#filters', el).addEventListener('change', (e) => { const f = Object.fromEntries(new FormData(e.currentTarget).entries()); assigned = f.assigned; status = f.status; load(); });
  qs('#new-task', el).addEventListener('click', () => taskDialog());

  async function load() {
    const list = qs('#list', el); list.innerHTML = '<div class="loading"><span class="spinner dark"></span></div>';
    const q = new URLSearchParams({ assigned: assigned === 'all' ? '' : assigned, status: status === 'all' ? '' : status }).toString();
    const tasks = await api.get('/api/tasks?' + q);
    qs('#count', el).textContent = `${tasks.length} ${tasks.length === 1 ? 'tarea' : 'tareas'}`;
    list.innerHTML = tasks.length ? tasks.map((t) => { const late = t.status !== 'hecha' && t.due_at && daysUntil(t.due_at) < 0;
      return `<div class="row ${late ? 'danger-row' : ''}"><div class="info"><h3>${esc(t.title)}</h3><p>${t.case_ref ? `<a href="#/procesos/${t.case_id}/tareas">${esc(t.case_ref)}</a> · ${esc(t.case_title)}` : 'Sin proceso asociado'}${t.assigned_name ? ` · ${esc(t.assigned_name)}` : ' · Sin asignar'}${t.description ? ` · ${esc(t.description)}` : ''}</p></div><div class="end"><div style="display:flex;gap:6px;flex-wrap:wrap">${badge(M.TASK_STATUS, t.status)}${prioBadge(t.priority)}<span class="when">${t.due_at ? `${esc(fmtDate(t.due_at))} · ${esc(relDays(t.due_at))}` : 'Sin fecha'}</span></div><div style="display:flex;gap:12px"><button class="text-button" data-toggle="${t.id}">${t.status === 'hecha' ? 'Reabrir' : 'Marcar hecha'}</button><button class="text-button" data-edit="${t.id}">Editar</button><button class="text-button danger" data-del="${t.id}">Eliminar</button></div></div></div>`; }).join('') : emptyState('Sin tareas con esos criterios', 'Cree tareas desde aquí o desde cada proceso.');
    qsa('[data-toggle]', list).forEach((b) => b.addEventListener('click', async () => { const t = tasks.find((x) => x.id === +b.dataset.toggle); await api.put(`/api/tasks/${t.id}`, { status: t.status === 'hecha' ? 'pendiente' : 'hecha' }); load(); refreshCounts(); }));
    qsa('[data-edit]', list).forEach((b) => b.addEventListener('click', () => taskDialog(tasks.find((x) => x.id === +b.dataset.edit))));
    qsa('[data-del]', list).forEach((b) => b.addEventListener('click', async () => { if (await confirmDialog('Eliminar tarea', 'Se eliminará de forma permanente.')) { await api.del(`/api/tasks/${b.dataset.del}`); load(); refreshCounts(); } }));
  }
  async function taskDialog(t) {
    const cases = t ? null : (await api.get('/api/cases?status=activo&limit=100')).items;
    const r = await modal({ title: t ? 'Editar tarea' : 'Nueva tarea', submitLabel: 'Guardar', body: `<div class="form-grid">${field('Título', input('title', t?.title || '', 'required maxlength="200"'), { span: true, required: true })}${t ? '' : field('Proceso', select('case_id', cases.map((c) => ({ id: c.id, label: `${c.ref} · ${c.title}` })), '', { empty: 'Sin proceso' }), { span: true })}${field('Asignada a', select('assigned_to', staffOpts, t?.assigned_to || state.user.id, { empty: 'Sin asignar' }))}${field('Fecha límite', input('due_at', t?.due_at || '', 'type="date"'))}${field('Prioridad', select('priority', M.PRIORITIES, t?.priority || 'media'))}${t ? field('Estado', select('status', M.TASK_STATUS, t.status)) : ''}${field('Detalle', textarea('description', t?.description || '', 'rows="3" maxlength="2000"'), { span: true })}</div>`,
      onSubmit: (data) => t ? api.put(`/api/tasks/${t.id}`, data) : api.post('/api/tasks', data) });
    if (r) { toast('Tarea guardada.'); load(); refreshCounts(); }
  }
  await load();
}
