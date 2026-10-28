import { api } from '../api.js';
import { qs, qsa, esc, nl2br, svg, badge, prioBadge, fmtDate, fmtDateTime, fmtTime, fmtStamp, fmtMoney, fmtSize, relDays, daysUntil, labelOf, emptyState, options, field, input, select, textarea, modal, confirmDialog, toast, todayStr, nowStr, initials } from '../ui.js';

const TABS_STAFF = [['resumen', 'Resumen'], ['etapas', 'Etapas'], ['partes', 'Partes'], ['actuaciones', 'Actuaciones'], ['documentos', 'Documentos'], ['agenda', 'Agenda'], ['tareas', 'Tareas'], ['mensajes', 'Mensajes y notas'], ['equipo', 'Equipo']];
const TABS_CLIENT = [['resumen', 'Resumen'], ['etapas', 'Etapas'], ['actuaciones', 'Actuaciones'], ['documentos', 'Documentos'], ['agenda', 'Agenda'], ['mensajes', 'Mensajes']];

export default async function view(ctx) {
  const { el, params, state, setCrumbs, navigate } = ctx;
  const M = state.meta; const role = state.user.role; const client = role === 'cliente'; const manage = ['admin', 'abogado'].includes(role); const admin = role === 'admin';
  const id = params.id; let tab = params.tab || 'resumen';
  let d = null;

  async function load() { d = await api.get(`/api/cases/${id}`); render(); }
  const staffOpts = M.staff.map((u) => ({ id: u.id, label: `${u.name}${u.role === 'asistente' ? ' (asistente)' : ''}` }));
  const lawyerOpts = M.lawyers.map((u) => ({ id: u.id, label: u.name }));
  const stageOpts = () => d.stages.map((s) => ({ id: s.id, label: `${s.position}. ${s.name}` }));
  const stageName = (sid) => { const s = d.stages.find((x) => x.id === sid); return s ? s.name : ''; };

  function render() {
    const c = d.case;
    setCrumbs([{ label: client ? 'Mis procesos' : 'Procesos', href: '#/procesos' }, { label: c.ref }]);
    const pct = c.stage_count ? Math.round((c.stage_done / c.stage_count) * 100) : 0;
    const tabs = (client ? TABS_CLIENT : TABS_STAFF);
    const counts = { etapas: d.stages.length, partes: d.parties.length, actuaciones: d.docket.length, documentos: d.documents.length, agenda: d.events.filter((e) => e.status === 'programado').length, tareas: d.tasks.filter((t) => t.status !== 'hecha').length, mensajes: d.messages.length, equipo: d.team.length };
    if (!tabs.some(([k]) => k === tab)) tab = 'resumen';
    el.innerHTML = `
    <section class="case-head">
      <div class="top">
        <div>
          <p class="eyebrow">${esc(c.ref)}${c.radicado ? ` · Rad. ${esc(c.radicado)}` : ''}</p>
          <h1>${esc(c.title)}</h1>
          <div class="tags">${badge(M.CASE_STATUS, c.status)}<span class="badge brass">${esc(labelOf(M.AREAS, c.area))}</span>${c.process_type ? `<span class="badge neutral">${esc(c.process_type)}</span>` : ''}${c.outcome ? `<span class="badge ${['favorable', 'parcial', 'conciliado'].includes(c.outcome) ? 'success' : 'neutral'}">${esc(labelOf(M.OUTCOMES, c.outcome))}</span>` : ''}${prioBadge(c.priority)}${c.featured ? '<span class="badge info">Publicado como caso de éxito</span>' : ''}</div>
        </div>
        ${client ? '' : `<div class="actions"><button class="button secondary small" id="edit-case">${svg('edit')} Editar</button>${c.status === 'activo' && manage ? `<button class="button secondary small" id="close-case">Cerrar proceso</button>` : ''}${admin ? `<button class="button danger small" id="delete-case">${svg('trash')} Eliminar</button>` : ''}</div>`}
      </div>
      <dl class="kv">
        <div><dt>Cliente</dt><dd>${c.client_id ? (client ? esc(c.client_name) : `<a href="#/clientes/${c.client_id}">${esc(c.client_name)}</a>`) : '—'}</dd></div>
        <div><dt>Abogado responsable</dt><dd>${esc(c.responsible_name || '—')}</dd></div>
        <div><dt>Ciudad</dt><dd>${esc(c.city || '—')}${c.department ? `<span class="muted"> · ${esc(c.department)}</span>` : ''}</dd></div>
        <div><dt>Despacho / autoridad</dt><dd>${esc(c.court || '—')}</dd></div>
        <div><dt>Instancia</dt><dd>${esc(labelOf(M.INSTANCES, c.instance))}</dd></div>
        <div><dt>Apertura</dt><dd>${esc(fmtDate(c.opened_at))}${c.closed_at ? `<span class="muted"> · cierre ${esc(fmtDate(c.closed_at))}</span>` : ''}</dd></div>
        ${client ? '' : `<div><dt>Cuantía</dt><dd>${esc(fmtMoney(c.amount))}</dd></div>`}
        <div><dt>Avance de etapas</dt><dd>${c.stage_done}/${c.stage_count}${c.current_stage ? ` · ${esc(c.current_stage)}` : ''}<div class="progress" aria-hidden="true"><span style="width:${pct}%"></span></div></dd></div>
        <div class="${client ? '' : ''}"><dt>Siguiente acción</dt><dd>${c.next_action ? esc(c.next_action) : '<span class="muted">Sin definir</span>'}${c.next_action_due ? `<span class="sub muted"> · ${esc(fmtDate(c.next_action_due))} (${esc(relDays(c.next_action_due))})</span>` : ''}</dd></div>
      </dl>
    </section>
    <nav class="tabs" aria-label="Secciones del proceso">${tabs.map(([k, label]) => `<a href="#/procesos/${id}/${k}" ${k === tab ? 'aria-current="page"' : ''}>${esc(label)}${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</a>`).join('')}</nav>
    <div id="tab"></div>`;
    qs('#edit-case', el)?.addEventListener('click', editCase);
    qs('#close-case', el)?.addEventListener('click', closeCase);
    qs('#delete-case', el)?.addEventListener('click', async () => {
      if (!(await confirmDialog('Eliminar el proceso', `Se eliminarán de forma permanente el proceso ${c.ref}, sus etapas, actuaciones, documentos, eventos, tareas y mensajes. Esta acción no se puede deshacer.`, { submitLabel: 'Eliminar definitivamente' }))) return;
      await api.del(`/api/cases/${id}`); toast('Proceso eliminado.'); navigate('#/procesos');
    });
    TABS[tab]();
  }

  // --------------------------------------------------------------- Pestañas
  const TABS = {
    resumen() {
      const c = d.case; const upcoming = d.events.filter((e) => e.status === 'programado' && e.start_at >= nowStr()).sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 4);
      const openTasks = d.tasks.filter((t) => t.status !== 'hecha').slice(0, 5); const current = d.stages.find((s) => s.status === 'en_curso');
      qs('#tab', el).innerHTML = `<div class="grid-2"><div>
        <section class="panel"><div class="panel-head"><h2>Descripción del asunto</h2></div><div class="panel-body"><p style="font-size:15px;line-height:1.7">${c.description ? nl2br(c.description) : '<span class="muted">Sin descripción.</span>'}</p></div></section>
        ${current ? `<section class="panel"><div class="panel-head"><h2>Etapa en curso<span class="sub">${esc(current.position)} de ${d.stages.length}</span></h2><a class="text-button" href="#/procesos/${id}/etapas">Ver etapas ${svg('arrow')}</a></div><div class="row"><div class="sym">${svg('scale')}</div><div class="info"><h3>${esc(current.name)}</h3><p>${esc(current.description || '')}</p><p>${current.lawyer_name ? `Responsable de la etapa: <b>${esc(current.lawyer_name)}</b>` : 'Sin abogado asignado'}${current.started_at ? ` · desde ${esc(fmtDate(current.started_at))}` : ''}${current.due_at ? ` · límite ${esc(fmtDate(current.due_at))} (${esc(relDays(current.due_at))})` : ''}</p></div></div></section>` : ''}
        <section class="panel"><div class="panel-head"><h2>Últimas actuaciones</h2><a class="text-button" href="#/procesos/${id}/actuaciones">Ver todas ${svg('arrow')}</a></div>${d.docket.length ? `<ul class="timeline">${d.docket.slice(0, 5).map(docketItem).join('')}</ul>` : emptyState('Sin actuaciones registradas')}</section>
      </div><div>
        ${c.next_action ? `<section class="next-step"><div><span class="eyebrow">Siguiente acción</span></div><h2>${esc(c.next_action)}</h2><p>${c.next_action_due ? `${esc(fmtDate(c.next_action_due, { long: true }))} · ${esc(relDays(c.next_action_due))}` : 'Sin fecha definida'}</p><span class="overline">${esc(c.responsible_name || '')}</span></section>` : ''}
        <section class="panel" style="margin-top:${c.next_action ? '20px' : '0'}"><div class="panel-head"><h2>Próximas fechas</h2><a class="text-button" href="#/procesos/${id}/agenda">Agenda ${svg('arrow')}</a></div>${upcoming.length ? upcoming.map(eventRow).join('') : emptyState('Sin fechas programadas')}</section>
        ${client ? '' : `<section class="panel"><div class="panel-head"><h2>Tareas abiertas</h2><a class="text-button" href="#/procesos/${id}/tareas">Ver ${svg('arrow')}</a></div>${openTasks.length ? openTasks.map(taskRow).join('') : emptyState('Sin tareas abiertas')}</section>`}
        <section class="panel"><div class="panel-head"><h2>Equipo del proceso</h2>${client ? '' : `<a class="text-button" href="#/procesos/${id}/equipo">Gestionar ${svg('arrow')}</a>`}</div>${d.team.map((t) => `<div class="row"><span class="avatar ink" aria-hidden="true">${esc(initials(t.name))}</span><div class="info"><h3>${esc(t.name)}</h3><p>${esc(t.role_in_case)}${t.title ? ` · ${esc(t.title)}` : ''}</p></div></div>`).join('') || emptyState('Sin equipo asignado')}</section>
      </div></div>`;
    },
    etapas() {
      const tpl = Object.entries(M.STAGE_TEMPLATES).map(([k, t]) => ({ id: k, label: `${t.label} (${t.stages.length})` }));
      qs('#tab', el).innerHTML = `<section class="panel"><div class="panel-head"><h2>Etapas del proceso<span class="sub">Cada etapa tiene un abogado responsable y un estado propio</span></h2>${client ? '' : `<div class="actions" style="display:flex;gap:10px;flex-wrap:wrap"><button class="button secondary small" id="apply-tpl">Aplicar plantilla</button><button class="button primary small" id="add-stage">${svg('plus')} Añadir etapa</button></div>`}</div>
        ${d.stages.length ? `<ol class="stage-list">${d.stages.map((s) => `<li class="stage ${s.status}"><span class="dot" aria-hidden="true">${s.status === 'completada' ? '✓' : s.position}</span><div><h3>${esc(s.name)}</h3>${s.description ? `<p>${esc(s.description)}</p>` : ''}<div class="meta">${s.lawyer_name ? `<span>Responsable: <b>${esc(s.lawyer_name)}</b></span>` : '<span>Sin abogado asignado</span>'}${s.started_at ? `<span>Inicio: <b>${esc(fmtDate(s.started_at))}</b></span>` : ''}${s.due_at && s.status !== 'completada' ? `<span>Límite: <b>${esc(fmtDate(s.due_at))}</b> (${esc(relDays(s.due_at))})</span>` : ''}${s.completed_at ? `<span>Completada: <b>${esc(fmtDate(s.completed_at))}</b></span>` : ''}</div>${s.notes ? `<p style="margin-top:8px;white-space:pre-wrap">${esc(s.notes)}</p>` : ''}</div><div class="side">${badge(M.STAGE_STATUS, s.status)}${client ? '' : `<div style="display:flex;gap:12px">${s.status === 'pendiente' ? `<button class="text-button" data-start="${s.id}">Iniciar</button>` : ''}${s.status === 'en_curso' ? `<button class="text-button" data-complete="${s.id}">Completar</button>` : ''}<button class="text-button" data-edit-stage="${s.id}">Editar</button>${manage ? `<button class="text-button danger" data-del-stage="${s.id}">Eliminar</button>` : ''}</div>`}</div></li>`).join('')}</ol>` : emptyState('Este proceso no tiene etapas', 'Aplique una plantilla según el tipo de proceso o añada etapas manualmente.')}
        <p class="panel-note">Las etapas describen la organización interna del trabajo. No sustituyen las actuaciones oficiales del despacho judicial.</p></section>`;
      if (client) return;
      qs('#add-stage', el).addEventListener('click', () => stageDialog());
      qs('#apply-tpl', el).addEventListener('click', async () => {
        const r = await modal({ title: 'Aplicar plantilla de etapas', body: `<div class="form-grid">${field('Plantilla', select('template', tpl, M.DEFAULT_TEMPLATE_BY_AREA[d.case.area] || 'generico'), { span: true })}${field('Abogado por defecto', select('lawyer_id', lawyerOpts, d.case.responsible_id || '', { empty: 'Sin asignar' }), { span: true })}<label class="check span-2"><input type="checkbox" name="replace" ${d.stages.length ? '' : 'checked'}> Reemplazar las etapas existentes (${d.stages.length})</label></div>`, submitLabel: 'Aplicar', onSubmit: (data) => api.post(`/api/cases/${id}/stages/template`, data) });
        if (r) { toast('Plantilla aplicada.'); load(); }
      });
      qsa('[data-edit-stage]', el).forEach((b) => b.addEventListener('click', () => stageDialog(d.stages.find((s) => s.id === +b.dataset.editStage))));
      qsa('[data-start]', el).forEach((b) => b.addEventListener('click', async () => { const s = d.stages.find((x) => x.id === +b.dataset.start); await api.put(`/api/cases/${id}/stages/${s.id}`, { ...s, status: 'en_curso', started_at: s.started_at || todayStr() }); toast('Etapa iniciada.'); load(); }));
      qsa('[data-complete]', el).forEach((b) => b.addEventListener('click', async () => {
        const s = d.stages.find((x) => x.id === +b.dataset.complete);
        const next = d.stages.find((x) => x.position > s.position && x.status === 'pendiente');
        const r = await modal({ title: `Completar "${s.name}"`, body: `<div class="form-grid">${field('Fecha de finalización', input('completed_at', todayStr(), 'type="date"'))}${next ? `<label class="check"><input type="checkbox" name="start_next" checked> Iniciar la siguiente etapa: ${esc(next.name)}</label>` : ''}${field('Notas', textarea('notes', s.notes || '', 'rows="3"'), { span: true })}</div>`, submitLabel: 'Completar etapa', async onSubmit(data) {
          await api.put(`/api/cases/${id}/stages/${s.id}`, { ...s, status: 'completada', completed_at: data.completed_at, notes: data.notes });
          if (next && data.start_next) await api.put(`/api/cases/${id}/stages/${next.id}`, { ...next, status: 'en_curso', started_at: todayStr() });
        } });
        if (r) { toast('Etapa completada.'); load(); }
      }));
      qsa('[data-del-stage]', el).forEach((b) => b.addEventListener('click', async () => { if (await confirmDialog('Eliminar etapa', 'Las actuaciones vinculadas conservarán su registro sin referencia a esta etapa.')) { await api.del(`/api/cases/${id}/stages/${b.dataset.delStage}`); load(); } }));
    },
    partes() {
      qs('#tab', el).innerHTML = `<section class="panel"><div class="panel-head"><h2>Partes e intervinientes</h2>${client ? '' : `<button class="button primary small" id="add-party">${svg('plus')} Añadir parte</button>`}</div>
        ${d.parties.length ? `<div class="party-grid">${d.parties.map((p) => `<article class="party"><span class="avatar ${p.side === 'nuestra' ? 'ink' : ''}" aria-hidden="true">${esc(initials(p.name))}</span><div class="info"><h3>${esc(p.name)}</h3><p>${esc(p.role)}${p.counsel ? ` · Apoderado: ${esc(p.counsel)}` : ''}</p>${(p.doc_number || p.email || p.phone) ? `<p>${[p.doc_type && p.doc_number ? `${p.doc_type} ${p.doc_number}` : p.doc_number, p.email, p.phone].filter(Boolean).map(esc).join(' · ')}</p>` : ''}${p.notes ? `<p>${esc(p.notes)}</p>` : ''}<div class="tags">${badge(M.PARTY_SIDES, p.side)}</div></div>${client ? '' : `<div class="side-actions"><button class="text-button" data-edit-party="${p.id}">Editar</button><button class="text-button danger" data-del-party="${p.id}">Eliminar</button></div>`}</article>`).join('')}</div>` : emptyState('Sin partes registradas', 'Registre demandantes, demandados, apoderados de la contraparte y demás intervinientes.')}</section>`;
      if (client) return;
      qs('#add-party', el).addEventListener('click', () => partyDialog());
      qsa('[data-edit-party]', el).forEach((b) => b.addEventListener('click', () => partyDialog(d.parties.find((p) => p.id === +b.dataset.editParty))));
      qsa('[data-del-party]', el).forEach((b) => b.addEventListener('click', async () => { if (await confirmDialog('Eliminar parte', 'Se quitará del proceso.')) { await api.del(`/api/cases/${id}/parties/${b.dataset.delParty}`); load(); } }));
    },
    actuaciones() {
      qs('#tab', el).innerHTML = `<section class="panel"><div class="panel-head"><h2>Actuaciones y seguimiento<span class="sub">Historial del proceso, de más reciente a más antiguo</span></h2>${client ? '' : `<button class="button primary small" id="add-docket">${svg('plus')} Registrar actuación</button>`}</div>
        ${d.docket.length ? `<ul class="timeline">${d.docket.map(docketItem).join('')}</ul>` : emptyState('Sin actuaciones', 'Registre autos, notificaciones, memoriales, audiencias y notas internas.')}
        ${client ? '<p class="panel-note">Las actuaciones registradas por el despacho se muestran con fines informativos. La información oficial es la del juzgado.</p>' : '<p class="panel-note">Las actuaciones marcadas como visibles para el cliente aparecen en su espacio privado.</p>'}</section>`;
      if (client) return;
      qs('#add-docket', el).addEventListener('click', () => docketDialog());
      qsa('[data-edit-docket]', el).forEach((b) => b.addEventListener('click', () => docketDialog(d.docket.find((x) => x.id === +b.dataset.editDocket))));
      qsa('[data-del-docket]', el).forEach((b) => b.addEventListener('click', async () => { if (await confirmDialog('Eliminar actuación', 'Se borrará del historial del proceso.')) { await api.del(`/api/cases/${id}/docket/${b.dataset.delDocket}`); load(); } }));
    },
    documentos() {
      qs('#tab', el).innerHTML = `<section class="panel"><div class="panel-head"><h2>Documentos del expediente<span class="sub">${client ? 'Archivos compartidos por el despacho y los que usted aporta' : 'Archivos del proceso. Marque como visibles los que el cliente puede consultar.'}</span></h2><button class="button primary small" id="upload">${svg('upload')} ${client ? 'Aportar documento' : 'Subir documento'}</button></div>
        ${d.documents.length ? d.documents.map((x) => `<div class="row doc-row"><span class="file-icon" aria-hidden="true">${esc(ext(x.original_name))}</span><div class="info"><h3><a href="/api/documents/${x.id}/download?inline=1" target="_blank" rel="noopener">${esc(x.title)}</a>${x.version > 1 ? ` <span class="muted small">v${x.version}</span>` : ''}</h3><p>${esc(labelOf(M.DOC_CATEGORIES, x.category))}${x.stage_name ? ` · ${esc(x.stage_name)}` : ''} · ${esc(fmtSize(x.size || 0))} · ${esc(fmtStamp(x.created_at))}${x.uploaded_by_name ? ` · ${esc(x.uploaded_by_name)}` : ''}</p>${x.notes ? `<p>${esc(x.notes)}</p>` : ''}</div><div class="end"><div class="tags" style="display:flex;gap:6px;flex-wrap:wrap">${badge(M.DOC_STATUS, x.status)}${client ? '' : (x.visibility === 'cliente' ? '<span class="badge success">Visible para el cliente</span>' : '<span class="badge neutral">Interno</span>')}</div><div style="display:flex;gap:12px"><a class="text-button" href="/api/documents/${x.id}/download">${svg('download')} Descargar</a>${client ? '' : `<button class="text-button" data-edit-doc="${x.id}">Editar</button>`}${manage ? `<button class="text-button danger" data-del-doc="${x.id}">Eliminar</button>` : ''}</div></div></div>`).join('') : emptyState('Aún no hay documentos', client ? 'Cuando el despacho comparta un documento, aparecerá aquí. También puede aportar los suyos.' : 'Suba poderes, demandas, pruebas, autos y sentencias.')}
        <p class="panel-note">${client ? '"Documento recibido" significa que el archivo llegó al despacho; no implica revisión ni aprobación.' : 'Formatos permitidos: PDF, Word, Excel, imágenes, texto y ZIP. Máximo 25 MB por archivo.'}</p></section>`;
      qs('#upload', el).addEventListener('click', () => uploadDialog());
      qsa('[data-edit-doc]', el).forEach((b) => b.addEventListener('click', () => docDialog(d.documents.find((x) => x.id === +b.dataset.editDoc))));
      qsa('[data-del-doc]', el).forEach((b) => b.addEventListener('click', async () => { if (await confirmDialog('Eliminar documento', 'El archivo se borrará del servidor de forma permanente.')) { await api.del(`/api/cases/${id}/documents/${b.dataset.delDoc}`); load(); } }));
    },
    agenda() {
      const sorted = [...d.events].sort((a, b) => b.start_at.localeCompare(a.start_at));
      const upcoming = sorted.filter((e) => e.start_at >= nowStr() && e.status === 'programado').reverse(); const past = sorted.filter((e) => !(e.start_at >= nowStr() && e.status === 'programado'));
      qs('#tab', el).innerHTML = `<section class="panel"><div class="panel-head"><h2>Próximas fechas<span class="sub">Audiencias, términos, diligencias y reuniones</span></h2>${client ? '' : `<button class="button primary small" id="add-event">${svg('plus')} Programar</button>`}</div>${upcoming.length ? upcoming.map(eventRow).join('') : emptyState('Sin fechas próximas')}</section>
        <section class="panel"><div class="panel-head"><h2>Historial</h2></div>${past.length ? past.map(eventRow).join('') : emptyState('Sin eventos anteriores')}
        <p class="panel-note">Un término interno no es automáticamente un término judicial. Verifique siempre la fuente oficial.</p></section>`;
      if (client) return;
      qs('#add-event', el).addEventListener('click', () => eventDialog());
      qsa('[data-edit-event]', el).forEach((b) => b.addEventListener('click', () => eventDialog(d.events.find((x) => x.id === +b.dataset.editEvent))));
      qsa('[data-done-event]', el).forEach((b) => b.addEventListener('click', async () => { const e = d.events.find((x) => x.id === +b.dataset.doneEvent); await api.put(`/api/cases/${id}/events/${e.id}`, { ...e, status: 'cumplido' }); toast('Evento marcado como cumplido.'); load(); }));
      qsa('[data-del-event]', el).forEach((b) => b.addEventListener('click', async () => { if (await confirmDialog('Eliminar evento', 'Se quitará de la agenda.')) { await api.del(`/api/cases/${id}/events/${b.dataset.delEvent}`); load(); } }));
    },
    tareas() {
      const open = d.tasks.filter((t) => t.status !== 'hecha'); const done = d.tasks.filter((t) => t.status === 'hecha');
      qs('#tab', el).innerHTML = `<section class="panel"><div class="panel-head"><h2>Tareas internas</h2><button class="button primary small" id="add-task">${svg('plus')} Nueva tarea</button></div>${open.length ? open.map(taskRow).join('') : emptyState('Sin tareas abiertas')}</section>
        ${done.length ? `<section class="panel"><div class="panel-head"><h2>Hechas</h2></div>${done.map(taskRow).join('')}</section>` : ''}`;
      qs('#add-task', el).addEventListener('click', () => taskDialog());
      qsa('[data-edit-task]', el).forEach((b) => b.addEventListener('click', () => taskDialog(d.tasks.find((x) => x.id === +b.dataset.editTask))));
      qsa('[data-toggle-task]', el).forEach((b) => b.addEventListener('click', async () => { const t = d.tasks.find((x) => x.id === +b.dataset.toggleTask); await api.put(`/api/cases/${id}/tasks/${t.id}`, { ...t, status: t.status === 'hecha' ? 'pendiente' : 'hecha' }); load(); ctx.refreshCounts(); }));
      qsa('[data-del-task]', el).forEach((b) => b.addEventListener('click', async () => { await api.del(`/api/cases/${id}/tasks/${b.dataset.delTask}`); load(); ctx.refreshCounts(); }));
    },
    mensajes() {
      qs('#tab', el).innerHTML = `<section class="panel"><div class="panel-head"><h2>${client ? 'Conversación con el despacho' : 'Mensajes y notas'}<span class="sub">${client ? 'Escriba sus dudas; el equipo responderá en este mismo hilo.' : 'Los mensajes visibles para el cliente aparecen en su espacio. Las notas internas solo las ve el equipo.'}</span></h2></div>
        <div class="thread" id="thread">${d.messages.length ? d.messages.map((m) => `<div class="bubble ${m.author_id === state.user.id ? 'own' : ''}"><span class="who">${esc(m.author_name || 'Usuario')}${client ? '' : (m.visibility === 'cliente' ? '<span class="badge success">Cliente</span>' : '<span class="badge neutral">Nota interna</span>')}${m.author_role === 'cliente' ? '<span class="badge info">Cliente</span>' : ''}</span><p>${esc(m.body)}</p><time>${esc(fmtStamp(m.created_at))}${!client && (admin || m.author_id === state.user.id) ? ` · <button class="text-button danger" style="min-height:0;padding:0;font-size:11px" data-del-msg="${m.id}">Eliminar</button>` : ''}</time></div>`).join('') : `<p class="muted small">Aún no hay mensajes en este proceso.</p>`}</div>
        <form class="compose" id="compose"><label class="field">${client ? 'Escriba su mensaje' : 'Nuevo mensaje o nota'}<textarea name="body" rows="3" maxlength="4000" required placeholder="${client ? 'Escriba aquí su pregunta o comentario. Evite incluir datos sensibles de terceros.' : 'Escriba el mensaje…'}"></textarea></label><div class="foot">${client ? '<p>Su mensaje llegará al equipo responsable del proceso.</p>' : `<label class="check"><input type="checkbox" name="to_client"> Visible para el cliente</label>`}<button class="button primary" type="submit">Enviar ${svg('arrow')}</button></div></form></section>`;
      qs('#compose', el).addEventListener('submit', async (e) => {
        e.preventDefault(); const form = e.currentTarget; const body = form.elements.body.value.trim(); if (!body) return;
        await api.post(`/api/cases/${id}/messages`, { body, visibility: client || form.elements.to_client?.checked ? 'cliente' : 'interno' });
        toast(client ? 'Mensaje enviado al despacho.' : 'Mensaje guardado.'); load();
      });
      qsa('[data-del-msg]', el).forEach((b) => b.addEventListener('click', async () => { await api.del(`/api/cases/${id}/messages/${b.dataset.delMsg}`); load(); }));
      const th = qs('#thread', el); th.scrollTop = th.scrollHeight;
    },
    equipo() {
      const stageByLawyer = {}; d.stages.forEach((s) => { if (s.lawyer_id) { stageByLawyer[s.lawyer_id] = stageByLawyer[s.lawyer_id] || []; stageByLawyer[s.lawyer_id].push(s); } });
      qs('#tab', el).innerHTML = `<section class="panel"><div class="panel-head"><h2>Equipo del proceso<span class="sub">Responsable, abogados de apoyo y asistentes. Las etapas muestran quién lleva cada parte.</span></h2><button class="button primary small" id="add-member">${svg('plus')} Añadir miembro</button></div>
        ${d.team.map((t) => `<div class="row"><span class="avatar ink" aria-hidden="true">${esc(initials(t.name))}</span><div class="info"><h3>${esc(t.name)} ${t.user_id === d.case.responsible_id ? '<span class="badge brass">Responsable</span>' : ''}</h3><p>${esc(t.role_in_case)}${t.title ? ` · ${esc(t.title)}` : ''}${t.email ? ` · ${esc(t.email)}` : ''}</p>${(stageByLawyer[t.user_id] || []).length ? `<p>Etapas: ${stageByLawyer[t.user_id].map((s) => `<b>${esc(s.name)}</b> (${esc(labelOf(M.STAGE_STATUS, s.status).toLowerCase())})`).join(', ')}</p>` : ''}</div><div class="end">${manage && t.user_id !== d.case.responsible_id ? `<button class="text-button danger" data-del-member="${t.user_id}">Quitar</button>` : ''}</div></div>`).join('') || emptyState('Sin miembros asignados')}
        <p class="panel-note">Para cambiar el abogado responsable, edite el proceso.</p></section>`;
      qs('#add-member', el).addEventListener('click', async () => {
        const r = await modal({ title: 'Añadir miembro al equipo', body: `<div class="form-grid">${field('Miembro', select('user_id', staffOpts, '', { empty: 'Seleccione' }), { span: true })}${field('Rol en el proceso', select('role_in_case', M.TEAM_ROLES, 'Abogado de apoyo'), { span: true })}</div>`, submitLabel: 'Añadir', onSubmit: (data) => api.post(`/api/cases/${id}/team`, data) });
        if (r) load();
      });
      qsa('[data-del-member]', el).forEach((b) => b.addEventListener('click', async () => { await api.del(`/api/cases/${id}/team/${b.dataset.delMember}`); load(); }));
    },
  };

  // ---------------------------------------------------------- Fragmentos
  const ext = (name) => (String(name).split('.').pop() || 'doc').toUpperCase().slice(0, 4);
  function docketItem(a) {
    return `<li class="${a.visibility === 'cliente' ? 'client' : ''}"><div class="t-head"><span class="t-date">${esc(fmtDate(a.date))}</span><span class="badge neutral">${esc(labelOf(M.DOCKET_KINDS, a.kind))}</span>${!client && a.visibility === 'cliente' ? '<span class="badge success">Visible para el cliente</span>' : ''}</div><strong>${esc(a.title)}</strong>${a.description ? `<p>${esc(a.description)}</p>` : ''}<div class="t-foot"><span>${esc(labelOf(M.DOCKET_SOURCES, a.source))}</span>${a.stage_name ? `<span>Etapa: ${esc(a.stage_name)}</span>` : ''}${a.user_name ? `<span>${esc(a.user_name)}</span>` : ''}${client ? '' : `<button class="text-button" data-edit-docket="${a.id}">Editar</button><button class="text-button danger" data-del-docket="${a.id}">Eliminar</button>`}</div></li>`;
  }
  function eventRow(e) {
    const dt = new Date(e.start_at.slice(0, 10) + 'T12:00:00'); const overdue = e.status === 'programado' && e.start_at < nowStr();
    return `<div class="row ${overdue ? 'danger-row' : ''}"><div class="sym date"><b>${dt.getDate()}</b><small>${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][dt.getMonth()]}</small></div><div class="info"><span class="overline">${esc(labelOf(M.EVENT_KINDS, e.kind))}${!client && e.visibility === 'cliente' ? ' · visible para el cliente' : ''}</span><h3>${esc(e.title)}</h3><p>${esc(fmtDate(e.start_at, { weekday: true }))}${e.all_day ? ' · todo el día' : (fmtTime(e.start_at) ? ` · ${esc(fmtTime(e.start_at))}` : '')}${e.end_at ? ` a ${esc(fmtTime(e.end_at))}` : ''} · Hora de Bogotá${e.location ? ` · ${esc(e.location)}` : ''}${e.responsible_name ? ` · ${esc(e.responsible_name)}` : ''}</p>${e.notes ? `<p>${esc(e.notes)}</p>` : ''}</div><div class="end">${overdue ? '<span class="badge danger">Vencido sin cerrar</span>' : badge(M.EVENT_STATUS, e.status)}${client ? `<span class="when">${esc(relDays(e.start_at))}</span>` : `<div style="display:flex;gap:12px">${e.status === 'programado' ? `<button class="text-button" data-done-event="${e.id}">Cumplido</button>` : ''}<button class="text-button" data-edit-event="${e.id}">Editar</button><button class="text-button danger" data-del-event="${e.id}">Eliminar</button></div>`}</div></div>`;
  }
  function taskRow(t) {
    const late = t.status !== 'hecha' && t.due_at && daysUntil(t.due_at) < 0;
    return `<div class="row ${late ? 'danger-row' : ''}"><div class="info"><h3>${esc(t.title)}</h3><p>${t.assigned_name ? `Asignada a ${esc(t.assigned_name)}` : 'Sin asignar'}${t.due_at ? ` · vence ${esc(fmtDate(t.due_at))} (${esc(relDays(t.due_at))})` : ''}${t.description ? ` · ${esc(t.description)}` : ''}</p></div><div class="end"><div style="display:flex;gap:6px">${badge(M.TASK_STATUS, t.status)}${prioBadge(t.priority)}</div><div style="display:flex;gap:12px"><button class="text-button" data-toggle-task="${t.id}">${t.status === 'hecha' ? 'Reabrir' : 'Marcar hecha'}</button><button class="text-button" data-edit-task="${t.id}">Editar</button><button class="text-button danger" data-del-task="${t.id}">Eliminar</button></div></div></div>`;
  }

  // ------------------------------------------------------------- Diálogos
  async function editCase() {
    const c = d.case; const clients = await api.get('/api/clients');
    const r = await modal({ title: 'Editar proceso', eyebrow: c.ref, submitLabel: 'Guardar cambios', width: '800px', body: `<div class="form-grid">
      ${field('Título', input('title', c.title, 'required maxlength="200"'), { span: true, required: true })}
      ${field('Área', select('area', M.AREAS, c.area))}${field('Tipo de proceso', '<select name="process_type" id="ptype"></select>')}
      ${field('Cliente', select('client_id', clients.map((x) => ({ id: x.id, label: x.name })), c.client_id || '', { empty: 'Sin cliente' }))}
      ${manage ? field('Abogado responsable', select('responsible_id', lawyerOpts, c.responsible_id || '', { empty: 'Seleccione' })) : ''}
      ${field('Ciudad', input('city', c.city, 'maxlength="80"'))}${field('Departamento', select('department', M.DEPARTMENTS, c.department, { empty: 'Seleccione' }))}
      ${field('Despacho / autoridad', input('court', c.court, 'maxlength="160"'), { span: true })}
      ${field('Juez / funcionario', input('judge', c.judge, 'maxlength="120"'))}${field('Número de radicación', input('radicado', c.radicado, 'maxlength="40" inputmode="numeric"'))}
      ${field('Instancia', select('instance', M.INSTANCES, c.instance))}${field('Prioridad', select('priority', M.PRIORITIES, c.priority))}
      ${field('Fecha de apertura', input('opened_at', c.opened_at || '', 'type="date"'))}${field('Cuantía (COP)', input('amount', c.amount ?? '', 'type="number" min="0" step="1000"'))}
      ${field('Descripción de los hechos', textarea('description', c.description, 'rows="4" maxlength="6000"'), { span: true })}
      ${field('Siguiente acción', input('next_action', c.next_action, 'maxlength="300"'))}${field('Fecha de la siguiente acción', input('next_action_due', c.next_action_due || '', 'type="date"'))}
      ${manage ? `${field('Estado interno', select('status', M.CASE_STATUS, c.status))}${field('Resultado', select('outcome', M.OUTCOMES, c.outcome))}${field('Fecha de cierre', input('closed_at', c.closed_at || '', 'type="date"'), { help: 'Se completa automáticamente al terminar o archivar.' })}
      <div class="span-2" style="border-top:1px solid var(--color-line);padding-top:16px"><p class="eyebrow" style="margin-bottom:10px">Publicación en el sitio web (casos de éxito)</p><label class="check"><input type="checkbox" name="featured" ${c.featured ? 'checked' : ''}> Mostrar como caso de éxito en el sitio público</label><p class="helper-text">Solo se publica si el proceso está terminado con resultado favorable, parcial o conciliado y tiene un resumen público. No incluya nombres ni datos que identifiquen a las personas.</p></div>
      ${field('Título público', input('public_title', c.public_title, 'maxlength="160" placeholder="Si se deja vacío se usa el título del proceso"'), { span: true })}
      ${field('Resumen público (anónimo)', textarea('public_summary', c.public_summary, 'rows="4" maxlength="2000"'), { span: true })}` : ''}
    </div>`,
    onOpen(form) { const area = form.elements.area; const pt = form.elements.process_type; const fill = () => { pt.innerHTML = options(M.PROCESS_TYPES[area.value] || [], c.process_type, { empty: 'Seleccione' }); }; area.addEventListener('change', fill); fill(); },
    onSubmit: (data) => api.put(`/api/cases/${id}`, data) });
    if (r) { toast('Proceso actualizado.'); load(); }
  }
  async function closeCase() {
    const c = d.case;
    const r = await modal({ title: 'Cerrar el proceso', eyebrow: c.ref, submitLabel: 'Cerrar proceso', body: `<div class="form-grid">${field('Estado final', select('status', M.CASE_STATUS.filter((s) => ['terminado', 'archivado'].includes(s.id)), 'terminado'))}${field('Resultado', select('outcome', M.OUTCOMES.filter((o) => o.id), 'favorable'))}${field('Fecha de cierre', input('closed_at', todayStr(), 'type="date"'), { span: true })}<label class="check span-2"><input type="checkbox" name="featured"> Publicar como caso de éxito (requiere resumen público)</label>${field('Resumen público (anónimo)', textarea('public_summary', c.public_summary, 'rows="4" maxlength="2000" placeholder="Describa el asunto y su resultado sin datos que identifiquen a las personas"'), { span: true })}</div>`,
      onSubmit: (data) => api.put(`/api/cases/${id}`, { ...c, ...data, next_action: '', next_action_due: '' }) });
    if (r) { toast('Proceso cerrado.'); load(); }
  }
  async function stageDialog(s) {
    const r = await modal({ title: s ? 'Editar etapa' : 'Nueva etapa', submitLabel: s ? 'Guardar' : 'Añadir', body: `<div class="form-grid">${field('Nombre', input('name', s?.name || '', 'required maxlength="160"'), { span: true, required: true })}${field('Descripción', textarea('description', s?.description || '', 'rows="2" maxlength="1000"'), { span: true })}${field('Abogado responsable de la etapa', select('lawyer_id', staffOpts, s?.lawyer_id || d.case.responsible_id || '', { empty: 'Sin asignar' }))}${field('Estado', select('status', M.STAGE_STATUS, s?.status || 'pendiente'))}${field('Inicio', input('started_at', s?.started_at || '', 'type="date"'))}${field('Fecha límite', input('due_at', s?.due_at || '', 'type="date"'))}${field('Completada el', input('completed_at', s?.completed_at || '', 'type="date"'))}${field('Notas', textarea('notes', s?.notes || '', 'rows="3" maxlength="2000"'), { span: true })}</div>`,
      onSubmit: (data) => s ? api.put(`/api/cases/${id}/stages/${s.id}`, data) : api.post(`/api/cases/${id}/stages`, data) });
    if (r) { toast(s ? 'Etapa actualizada.' : 'Etapa añadida.'); load(); }
  }
  async function partyDialog(p) {
    const r = await modal({ title: p ? 'Editar parte' : 'Añadir parte', submitLabel: p ? 'Guardar' : 'Añadir', body: `<div class="form-grid">${field('Nombre o razón social', input('name', p?.name || '', 'required maxlength="160"'), { span: true, required: true })}${field('Calidad en el proceso', select('role', M.PARTY_ROLES, p?.role || 'Demandante'))}${field('Posición', select('side', M.PARTY_SIDES, p?.side || 'nuestra'))}${field('Tipo de documento', select('doc_type', M.DOC_TYPES, p?.doc_type || '', { empty: '—' }))}${field('Número de documento', input('doc_number', p?.doc_number || '', 'maxlength="40"'))}${field('Correo', input('email', p?.email || '', 'type="email" maxlength="160"'))}${field('Teléfono', input('phone', p?.phone || '', 'maxlength="40"'))}${field('Apoderado / contacto', input('counsel', p?.counsel || '', 'maxlength="160"'), { span: true })}${field('Notas', textarea('notes', p?.notes || '', 'rows="2" maxlength="1000"'), { span: true })}</div>`,
      onSubmit: (data) => p ? api.put(`/api/cases/${id}/parties/${p.id}`, data) : api.post(`/api/cases/${id}/parties`, data) });
    if (r) load();
  }
  async function docketDialog(a) {
    const r = await modal({ title: a ? 'Editar actuación' : 'Registrar actuación', submitLabel: 'Guardar', body: `<div class="form-grid">${field('Fecha', input('date', a?.date || todayStr(), 'type="date" required'))}${field('Tipo', select('kind', M.DOCKET_KINDS, a?.kind || 'actuacion'))}${field('Título', input('title', a?.title || '', 'required maxlength="200"'), { span: true, required: true })}${field('Descripción', textarea('description', a?.description || '', 'rows="4" maxlength="4000"'), { span: true })}${field('Fuente', select('source', M.DOCKET_SOURCES, a?.source || 'interna'))}${field('Etapa relacionada', select('stage_id', stageOpts(), a?.stage_id || (d.stages.find((s) => s.status === 'en_curso') || {}).id || '', { empty: 'Sin etapa' }))}<label class="check span-2"><input type="checkbox" name="visible" ${a ? (a.visibility === 'cliente' ? 'checked' : '') : ''}> Visible para el cliente en su espacio privado</label></div>`,
      onSubmit: (data) => { data.visibility = data.visible ? 'cliente' : 'interno'; return a ? api.put(`/api/cases/${id}/docket/${a.id}`, data) : api.post(`/api/cases/${id}/docket`, data); } });
    if (r) { toast('Actuación guardada.'); load(); }
  }
  async function uploadDialog() {
    const r = await modal({ title: client ? 'Aportar un documento' : 'Subir documento', submitLabel: 'Subir', body: `<div class="form-grid"><div class="span-2 upload-box"><input type="file" name="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.txt,.rtf,.odt,.zip,.csv,.mp3,.mp4,.m4a"><p>PDF, Word, Excel, imágenes o ZIP. Máximo 25 MB.</p></div>${field('Título', input('title', '', 'maxlength="200" placeholder="Si se deja vacío se usa el nombre del archivo"'), { span: true })}${field('Categoría', select('category', M.DOC_CATEGORIES, 'otro'))}${client ? '' : field('Etapa relacionada', select('stage_id', stageOpts(), (d.stages.find((s) => s.status === 'en_curso') || {}).id || '', { empty: 'Sin etapa' }))}${client ? '' : `${field('Estado', select('status', M.DOC_STATUS, 'disponible'))}<label class="check"><input type="checkbox" name="visible"> Visible para el cliente</label>`}${field('Notas', textarea('notes', '', 'rows="2" maxlength="1000"'), { span: true })}</div>`,
      async onSubmit(data, form) {
        const fd = new FormData(); const file = form.elements.file.files[0]; if (!file) throw new Error('Seleccione un archivo.');
        fd.append('file', file); Object.entries(data).forEach(([k, v]) => { if (k !== 'file' && k !== 'visible') fd.append(k, v); }); fd.append('visibility', data.visible ? 'cliente' : 'interno');
        return api.upload(`/api/cases/${id}/documents`, fd);
      } });
    if (r) { toast('Documento recibido.'); load(); }
  }
  async function docDialog(x) {
    const r = await modal({ title: 'Editar documento', eyebrow: x.original_name, submitLabel: 'Guardar', body: `<div class="form-grid">${field('Título', input('title', x.title, 'required maxlength="200"'), { span: true })}${field('Categoría', select('category', M.DOC_CATEGORIES, x.category))}${field('Etapa relacionada', select('stage_id', stageOpts(), x.stage_id || '', { empty: 'Sin etapa' }))}${field('Estado', select('status', M.DOC_STATUS, x.status))}<label class="check"><input type="checkbox" name="visible" ${x.visibility === 'cliente' ? 'checked' : ''}> Visible para el cliente</label>${field('Notas', textarea('notes', x.notes || '', 'rows="2" maxlength="1000"'), { span: true })}</div>`,
      onSubmit: (data) => api.put(`/api/cases/${id}/documents/${x.id}`, { ...data, visibility: data.visible ? 'cliente' : 'interno' }) });
    if (r) load();
  }
  async function eventDialog(e) {
    const r = await modal({ title: e ? 'Editar evento' : 'Programar evento', submitLabel: 'Guardar', body: `<div class="form-grid">${field('Título', input('title', e?.title || '', 'required maxlength="200"'), { span: true, required: true })}${field('Tipo', select('kind', M.EVENT_KINDS, e?.kind || 'audiencia'))}${field('Responsable', select('responsible_id', staffOpts, e?.responsible_id || d.case.responsible_id || '', { empty: 'Sin asignar' }))}${field('Inicio (hora de Bogotá)', input('start_at', e?.start_at || `${todayStr()}T09:00`, 'type="datetime-local" required'))}${field('Fin', input('end_at', e?.end_at || '', 'type="datetime-local"'))}${field('Lugar o enlace', input('location', e?.location || '', 'maxlength="200"'), { span: true })}${field('Fuente', input('source', e?.source || 'interna', 'maxlength="80" placeholder="Ej. auto del 20 de octubre"'))}${field('Estado', select('status', M.EVENT_STATUS, e?.status || 'programado'))}<label class="check"><input type="checkbox" name="all_day" ${e?.all_day ? 'checked' : ''}> Todo el día</label><label class="check"><input type="checkbox" name="visible" ${e?.visibility === 'cliente' ? 'checked' : ''}> Visible para el cliente</label>${field('Notas', textarea('notes', e?.notes || '', 'rows="2" maxlength="2000"'), { span: true })}</div>`,
      onSubmit: (data) => { data.visibility = data.visible ? 'cliente' : 'interno'; return e ? api.put(`/api/cases/${id}/events/${e.id}`, data) : api.post(`/api/cases/${id}/events`, data); } });
    if (r) { toast('Evento guardado.'); load(); }
  }
  async function taskDialog(t) {
    const r = await modal({ title: t ? 'Editar tarea' : 'Nueva tarea', submitLabel: 'Guardar', body: `<div class="form-grid">${field('Título', input('title', t?.title || '', 'required maxlength="200"'), { span: true, required: true })}${field('Asignada a', select('assigned_to', staffOpts, t?.assigned_to || state.user.id, { empty: 'Sin asignar' }))}${field('Fecha límite', input('due_at', t?.due_at || '', 'type="date"'))}${field('Prioridad', select('priority', M.PRIORITIES, t?.priority || 'media'))}${field('Estado', select('status', M.TASK_STATUS, t?.status || 'pendiente'))}${field('Detalle', textarea('description', t?.description || '', 'rows="3" maxlength="2000"'), { span: true })}</div>`,
      onSubmit: (data) => t ? api.put(`/api/cases/${id}/tasks/${t.id}`, data) : api.post(`/api/cases/${id}/tasks`, data) });
    if (r) { load(); ctx.refreshCounts(); }
  }

  await load();
}
