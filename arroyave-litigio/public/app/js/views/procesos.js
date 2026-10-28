import { api } from '../api.js';
import { qs, qsa, esc, svg, badge, fmtDate, fmtStamp, relDays, labelOf, emptyState, options, field, input, select, textarea, modal, toast, todayStr } from '../ui.js';

export default async function view({ el, params, state, setCrumbs, navigate }) {
  const M = state.meta; const client = state.user.role === 'cliente';
  setCrumbs([{ label: client ? 'Mis procesos' : 'Procesos' }]);
  const f = { q: params.q || '', area: params.area || '', status: params.status || '', lawyer: params.lawyer || '', city: params.city || '', sort: params.sort || 'updated', page: parseInt(params.page || '1', 10) };
  const cities = client ? [] : await api.get('/api/cases/cities');

  el.innerHTML = `
  <div class="page-head"><div><p class="eyebrow">${client ? 'Organización' : 'Gestión'}</p><h1>${client ? 'Mis procesos' : 'Procesos'}</h1><p class="lead">${client ? 'El estado y el siguiente paso de cada asunto, en un mismo lugar.' : 'Todos los procesos del despacho. Filtre por área, estado, abogado o ciudad.'}</p></div>
    ${client ? '' : `<div class="actions"><button class="button primary" id="new-case">${svg('plus')} Nuevo proceso</button></div>`}</div>
  <form class="filter-bar" id="filters">
    <label class="search"><span class="sr-only">Buscar</span>${svg('search')}<input type="search" name="q" value="${esc(f.q)}" placeholder="Referencia, título, radicado, cliente o ciudad"></label>
    <select name="area" aria-label="Área">${options(M.AREAS, f.area, { empty: 'Todas las áreas' })}</select>
    <select name="status" aria-label="Estado">${options(M.CASE_STATUS, f.status, { empty: 'Todos los estados' })}</select>
    ${client ? '' : `<select name="lawyer" aria-label="Abogado">${options(M.staff.map((u) => ({ id: u.id, label: u.name })), f.lawyer, { empty: 'Todo el equipo' })}</select>
    <select name="city" aria-label="Ciudad">${options(cities.map((c) => ({ id: c.city, label: `${c.city} (${c.n})` })), f.city, { empty: 'Todas las ciudades' })}</select>`}
    <select name="sort" aria-label="Ordenar por">${options([{ id: 'updated', label: 'Última actualización' }, { id: 'due', label: 'Fecha de siguiente acción' }, { id: 'ref', label: 'Referencia' }, { id: 'opened', label: 'Fecha de apertura' }, { id: 'title', label: 'Título' }], f.sort)}</select>
    <span class="count" id="count" role="status"></span>
  </form>
  <div class="panel" id="list"></div>`;

  const form = qs('#filters', el);
  let timer;
  form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
  form.addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(apply, e.target.name === 'q' ? 350 : 0); });
  function apply() {
    const data = Object.fromEntries(new FormData(form).entries());
    const q = new URLSearchParams(Object.entries(data).filter(([, v]) => v)).toString();
    location.replace('#/procesos' + (q ? '?' + q : ''));
    Object.assign(f, data, { page: 1 }); load();
  }

  async function load() {
    const list = qs('#list', el);
    list.innerHTML = '<div class="loading"><span class="spinner dark"></span> Cargando…</div>';
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    const data = await api.get('/api/cases?' + q);
    qs('#count', el).textContent = `${data.total} ${data.total === 1 ? 'proceso' : 'procesos'}`;
    if (!data.items.length) { list.innerHTML = emptyState('No hay procesos con esos criterios', client ? 'Cuando el equipo comparta un proceso con usted, aparecerá aquí.' : 'Pruebe con otra búsqueda o cambie los filtros.', client ? '' : '<button class="button secondary" id="reset">Restablecer filtros</button>'); qs('#reset', list)?.addEventListener('click', () => { form.reset(); apply(); }); return; }
    const pages = Math.ceil(data.total / data.limit);
    list.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Proceso</th><th>Cliente</th><th>Etapa actual</th><th>Responsable</th><th>Siguiente acción</th><th>Estado</th></tr></thead><tbody>
      ${data.items.map((k) => `<tr>
        <td data-label="Proceso"><a class="main" href="#/procesos/${k.id}">${esc(k.title)}</a><span class="sub">${esc(k.ref)} · ${esc(labelOf(M.AREAS, k.area))}${k.city ? ` · ${esc(k.city)}` : ''}${k.radicado ? ` · Rad. ${esc(k.radicado)}` : ''}</span></td>
        <td data-label="Cliente">${esc(k.client_name || '—')}</td>
        <td data-label="Etapa">${k.current_stage ? esc(k.current_stage) : '<span class="muted">—</span>'}<span class="sub">${k.stage_done}/${k.stage_count} etapas completadas</span></td>
        <td data-label="Responsable">${esc(k.responsible_name || '—')}</td>
        <td data-label="Siguiente acción">${k.next_action ? esc(k.next_action) : '<span class="muted">—</span>'}${k.next_action_due ? `<span class="sub ${relDays(k.next_action_due).startsWith('hace') ? 'danger-text' : ''}">${esc(fmtDate(k.next_action_due))} · ${esc(relDays(k.next_action_due))}</span>` : ''}</td>
        <td data-label="Estado">${badge(M.CASE_STATUS, k.status)}${k.outcome ? `<span class="sub">${esc(labelOf(M.OUTCOMES, k.outcome))}</span>` : ''}<span class="sub">Act. ${esc(fmtStamp(k.updated_at))}</span></td>
      </tr>`).join('')}</tbody></table></div>
      ${pages > 1 ? `<div class="pager"><span>Página ${data.page} de ${pages}</span><button class="button secondary tiny" id="prev" ${data.page <= 1 ? 'disabled' : ''}>Anterior</button><button class="button secondary tiny" id="next" ${data.page >= pages ? 'disabled' : ''}>Siguiente</button></div>` : ''}`;
    qs('#prev', list)?.addEventListener('click', () => { f.page--; load(); });
    qs('#next', list)?.addEventListener('click', () => { f.page++; load(); });
  }
  await load();

  if (!client) {
    qs('#new-case', el).addEventListener('click', () => newCaseDialog(state, navigate));
    if (params.nuevo === '1') { location.replace('#/procesos'); newCaseDialog(state, navigate); }
  }
}

export async function newCaseDialog(state, navigate, preset = {}) {
  const M = state.meta;
  const clients = await api.get('/api/clients');
  const lawyers = M.lawyers.map((u) => ({ id: u.id, label: u.name }));
  const tpl = Object.entries(M.STAGE_TEMPLATES).map(([id, t]) => ({ id, label: `${t.label} (${t.stages.length} etapas)` }));
  const result = await modal({
    title: 'Nuevo proceso', eyebrow: 'Se asignará una referencia interna automáticamente', submitLabel: 'Crear proceso', width: '760px',
    body: `<div class="form-grid">
      ${field('Título del proceso', input('title', preset.title || '', 'required maxlength="200" placeholder="Ej. Incumplimiento de contrato de obra"'), { span: true, required: true })}
      ${field('Área', select('area', M.AREAS, preset.area || 'civil'), { required: true })}
      ${field('Tipo de proceso', `<select name="process_type" id="ptype"></select>`)}
      ${field('Cliente', select('client_id', clients.map((c) => ({ id: c.id, label: `${c.name}${c.doc_number ? ' · ' + c.doc_number : ''}` })), preset.client_id || '', { empty: 'Seleccione un cliente' }), { help: 'Si el cliente no existe, créelo primero en la sección Clientes.' })}
      ${field('Abogado responsable', select('responsible_id', lawyers, preset.responsible_id || (state.user.role !== 'asistente' ? state.user.id : ''), { empty: 'Seleccione' }), { required: true })}
      ${field('Ciudad', input('city', preset.city || '', 'maxlength="80" placeholder="Ej. Medellín"'))}
      ${field('Departamento', select('department', M.DEPARTMENTS, preset.department || '', { empty: 'Seleccione' }))}
      ${field('Despacho / autoridad', input('court', '', 'maxlength="160" placeholder="Ej. Juzgado 4 Civil del Circuito de Medellín"'), { span: true })}
      ${field('Número de radicación (23 dígitos)', input('radicado', '', 'maxlength="40" inputmode="numeric" placeholder="Opcional, cuando exista"'))}
      ${field('Instancia', select('instance', M.INSTANCES, 'primera'))}
      ${field('Prioridad', select('priority', M.PRIORITIES, 'media'))}
      ${field('Fecha de apertura', input('opened_at', todayStr(), 'type="date"'))}
      ${field('Cuantía (COP)', input('amount', '', 'type="number" min="0" step="1000" placeholder="Opcional"'))}
      ${field('Plantilla de etapas', select('template', [{ id: 'auto', label: 'Según el área (recomendado)' }, ...tpl, { id: 'none', label: 'Sin etapas (las defino después)' }], 'auto'), { help: 'Cada etapa puede asignarse después a un abogado distinto.' })}
      ${field('Descripción de los hechos', textarea('description', '', 'rows="4" maxlength="6000" placeholder="Resumen breve del asunto"'), { span: true })}
      ${field('Siguiente acción', input('next_action', '', 'maxlength="300" placeholder="Ej. Radicar la demanda"'))}
      ${field('Fecha de la siguiente acción', input('next_action_due', '', 'type="date"'))}
    </div>`,
    onOpen(form) {
      const area = form.elements.area; const pt = form.elements.process_type;
      const fill = () => { pt.innerHTML = options(M.PROCESS_TYPES[area.value] || [], preset.process_type || '', { empty: 'Seleccione' }); };
      area.addEventListener('change', fill); fill();
    },
    async onSubmit(data) {
      if (data.template === 'auto') data.template = M.DEFAULT_TEMPLATE_BY_AREA[data.area] || 'generico';
      const c = await api.post('/api/cases', data);
      toast(`Proceso ${c.ref} creado.`);
      return c;
    },
  });
  if (result) navigate(`#/procesos/${result.id}`);
}
