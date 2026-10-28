import { api } from '../api.js';
import { esc, svg, badge, fmtDate, fmtDateTime, fmtTime, relDays, daysUntil, labelOf, emptyState, plural, fmtStamp } from '../ui.js';

export default async function view({ el, state, setCrumbs }) {
  const d = await api.get('/api/dashboard');
  const M = state.meta;
  setCrumbs([{ label: 'Resumen' }]);
  if (d.role === 'cliente') return renderClient(el, d, M, state);

  const c = d.counts;
  const first = state.user.name.split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
  const maxArea = Math.max(1, ...d.byArea.map((a) => a.n));
  const maxLaw = Math.max(1, ...d.byLawyer.map((a) => a.n));

  el.innerHTML = `
  <div class="page-head">
    <div><p class="eyebrow">${esc(fmtDate(d.today, { long: true, weekday: true }))}</p><h1>${esc(greet)}, ${esc(first)}.</h1><p class="lead">Lo que requiere atención hoy: vencimientos, tareas y procesos a su cargo.</p></div>
    <div class="actions"><a class="button secondary" href="#/agenda">${svg('calendar')} Ver agenda</a><a class="button primary" href="#/procesos?nuevo=1">${svg('plus')} Nuevo proceso</a></div>
  </div>
  <div class="stat-grid">
    <a class="stat-card" href="#/procesos?status=activo"><div class="stat-label">Procesos activos ${svg('folder')}</div><strong>${c.active}</strong><span class="sub">${plural(c.mine, 'a su cargo', 'a su cargo')}</span></a>
    <a class="stat-card ${c.overdueEvents ? 'alert-tone' : ''}" href="#/agenda"><div class="stat-label">Eventos en 7 días ${svg('calendar')}</div><strong>${c.events7}</strong><span class="sub">${c.overdueEvents ? plural(c.overdueEvents, 'evento vencido sin cerrar', 'eventos vencidos sin cerrar') : 'Sin eventos vencidos'}</span></a>
    <a class="stat-card ${c.tasksOverdue ? 'alert-tone' : ''}" href="#/tareas"><div class="stat-label">Mis tareas pendientes ${svg('check')}</div><strong>${c.tasksOpen}</strong><span class="sub">${c.tasksOverdue ? plural(c.tasksOverdue, 'vencida', 'vencidas') : 'Ninguna vencida'}</span></a>
    <a class="stat-card" href="#/solicitudes"><div class="stat-label">Solicitudes nuevas ${svg('inbox')}</div><strong>${c.leadsNew}</strong><span class="sub">${plural(c.docsReview, 'documento por revisar', 'documentos por revisar')}</span></a>
  </div>
  <div class="grid-2">
    <div>
      <section class="panel">
        <div class="panel-head"><h2>Próximos vencimientos y audiencias<span class="sub">Eventos programados, de más próximo a más lejano</span></h2><a class="text-button" href="#/agenda">Ver agenda completa ${svg('arrow')}</a></div>
        ${d.overdue.length ? d.overdue.map((e) => eventRow(e, M, true)).join('') : ''}
        ${d.upcoming.length ? d.upcoming.map((e) => eventRow(e, M)).join('') : (d.overdue.length ? '' : emptyState('Sin eventos próximos', 'Cuando registre audiencias, términos o reuniones en un proceso, aparecerán aquí.'))}
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Mis procesos activos<span class="sub">Procesos donde es responsable, parte del equipo o lleva la etapa en curso</span></h2><a class="text-button" href="#/procesos?lawyer=${state.user.id}">Ver todos ${svg('arrow')}</a></div>
        ${d.myCases.length ? d.myCases.map((k) => caseRow(k, M)).join('') : emptyState('Aún no tiene procesos asignados', 'Cuando se le asigne un proceso o una etapa, aparecerá aquí.')}
        <p class="panel-note">Los estados describen el trabajo interno del despacho; no son el estado oficial del proceso judicial.</p>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Actividad reciente<span class="sub">Últimas actuaciones registradas en todos los procesos</span></h2></div>
        <ul class="timeline">${d.recentDocket.map((a) => `<li class="${a.visibility === 'cliente' ? 'client' : ''}"><div class="t-head"><span class="t-date">${esc(fmtDate(a.date))}</span><span class="badge neutral">${esc(labelOf(M.DOCKET_KINDS, a.kind))}</span></div><strong><a href="#/procesos/${a.case_id}/actuaciones">${esc(a.title)}</a></strong><p>${esc(a.case_ref)} · ${esc(a.case_title)}${a.user_name ? ` · ${esc(a.user_name)}` : ''}</p></li>`).join('')}</ul>
      </section>
    </div>
    <div>
      ${d.dueActions.length ? `<section class="next-step"><div><span class="eyebrow">Siguientes acciones con fecha</span></div><h2>${plural(d.dueActions.length, 'acción vence', 'acciones vencen')} en los próximos 7 días.</h2>${d.dueActions.slice(0, 4).map((a) => `<p><a href="#/procesos/${a.id}" style="color:#fff;font-weight:600">${esc(a.ref)}</a> · ${esc(a.next_action)}<br><span class="overline">${esc(fmtDate(a.next_action_due))} · ${esc(relDays(a.next_action_due))}${a.responsible_name ? ` · ${esc(a.responsible_name)}` : ''}</span></p>`).join('')}<a class="button light" href="#/procesos?sort=due&status=activo">Ver por fecha de acción <span aria-hidden="true">→</span></a></section>` : ''}
      <section class="panel" style="margin-top:${d.dueActions.length ? '20px' : '0'}">
        <div class="panel-head"><h2>Mis tareas<span class="sub">Pendientes y en curso</span></h2><a class="text-button" href="#/tareas">Gestionar ${svg('arrow')}</a></div>
        ${d.myTasks.length ? d.myTasks.map((t) => `<div class="row ${t.due_at && daysUntil(t.due_at) < 0 ? 'danger-row' : ''}"><div class="info"><h3>${esc(t.title)}</h3><p>${t.case_ref ? `<a href="#/procesos/${t.case_id}">${esc(t.case_ref)}</a> · ${esc(t.case_title)}` : 'Sin proceso asociado'}</p></div><div class="end">${badge(M.TASK_STATUS, t.status)}<span class="when">${t.due_at ? esc(fmtDate(t.due_at)) + ' · ' + esc(relDays(t.due_at)) : 'Sin fecha'}</span></div></div>`).join('') : emptyState('Sin tareas pendientes', 'Puede crear tareas desde un proceso o desde la sección Tareas.')}
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Procesos activos por área</h2></div>
        <div class="bars">${d.byArea.map((a) => `<div class="bar"><span class="label">${esc(labelOf(M.AREAS, a.area))}</span><div class="track"><div class="fill" style="width:${Math.round((a.n / maxArea) * 100)}%"></div></div><span class="n">${a.n}</span></div>`).join('') || '<p class="muted small">Sin procesos activos.</p>'}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Carga por abogado responsable</h2></div>
        <div class="bars">${d.byLawyer.map((a) => `<div class="bar"><span class="label">${esc(a.name)}</span><div class="track"><div class="fill" style="width:${Math.round((a.n / maxLaw) * 100)}%;background:var(--color-brass-dark)"></div></div><span class="n">${a.n}</span></div>`).join('')}</div>
      </section>
      ${d.leads.length ? `<section class="panel"><div class="panel-head"><h2>Solicitudes nuevas del sitio web</h2><a class="text-button" href="#/solicitudes">Ver ${svg('arrow')}</a></div>${d.leads.map((l) => `<div class="row"><div class="info"><h3>${esc(l.name)}</h3><p>${esc(l.reason)} · ${esc(fmtStamp(l.created_at))}</p></div></div>`).join('')}</section>` : ''}
    </div>
  </div>`;
}

function eventRow(e, M, overdue = false) {
  const dd = e.start_at.slice(0, 10);
  const dt = new Date(dd + 'T12:00:00');
  return `<a class="row ${overdue ? 'danger-row' : ''}" href="#/procesos/${e.case_id}/agenda"><div class="sym date"><b>${dt.getDate()}</b><small>${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][dt.getMonth()]}</small></div><div class="info"><span class="overline">${esc(labelOf(M.EVENT_KINDS, e.kind))}${e.case_ref ? ` · ${esc(e.case_ref)}` : ''}</span><h3>${esc(e.title)}</h3><p>${esc(e.case_title || '')}${e.location ? ` · ${esc(e.location)}` : ''}${e.responsible_name ? ` · ${esc(e.responsible_name)}` : ''}</p></div><div class="end">${overdue ? '<span class="badge danger">Vencido sin cerrar</span>' : badge(M.EVENT_STATUS, e.status)}<span class="when">${esc(fmtTime(e.start_at) || 'Todo el día')} · ${esc(relDays(e.start_at))}</span></div></a>`;
}
function caseRow(k, M) {
  const pct = k.stage_count ? Math.round((k.stage_done / k.stage_count) * 100) : 0;
  return `<a class="row" href="#/procesos/${k.id}"><div class="sym">${svg('folder')}</div><div class="info"><span class="overline">${esc(k.ref)} · ${esc(labelOf(M.AREAS, k.area))}</span><h3>${esc(k.title)}</h3><p>${k.current_stage ? `Etapa: ${esc(k.current_stage)}` : 'Sin etapa en curso'}${k.next_action ? ` · Siguiente: ${esc(k.next_action)}` : ''}</p><div class="progress" aria-hidden="true"><span style="width:${pct}%"></span></div></div><div class="end">${badge(M.CASE_STATUS, k.status)}<span class="when">${k.next_action_due ? `Acción: ${esc(fmtDate(k.next_action_due))} · ${esc(relDays(k.next_action_due))}` : `Actualizado ${esc(fmtStamp(k.updated_at))}`}</span></div></a>`;
}

function renderClient(el, d, M, state) {
  const active = d.cases.filter((c) => c.status === 'activo');
  const next = active.find((c) => c.next_action) || active[0];
  el.innerHTML = `
  <div class="page-head"><div><p class="eyebrow">Bienvenido a su espacio</p><h1>Su asunto, en perspectiva.</h1><p class="lead">Consulte el estado, los documentos y el próximo paso de cada proceso. Si tiene dudas, escríbanos desde la sección Mensajes.</p></div><div class="actions"><a class="button secondary" href="#/mensajes">${svg('message')} Escribir al despacho</a></div></div>
  <div class="stat-grid">
    <a class="stat-card" href="#/procesos"><div class="stat-label">Procesos ${svg('folder')}</div><strong>${d.cases.length}</strong><span class="sub">${plural(active.length, 'activo', 'activos')}</span></a>
    <a class="stat-card" href="#/agenda"><div class="stat-label">Fechas confirmadas ${svg('calendar')}</div><strong>${d.events.length}</strong><span class="sub">Próximas audiencias y reuniones</span></a>
    <a class="stat-card ${d.pendingDocs.length ? 'alert-tone' : ''}" href="#/documentos"><div class="stat-label">Documentos por atender ${svg('doc')}</div><strong>${d.pendingDocs.length}</strong><span class="sub">${d.pendingDocs.length ? 'Requieren su atención' : 'Nada pendiente de su parte'}</span></a>
    <a class="stat-card" href="#/mensajes"><div class="stat-label">Mensajes ${svg('message')}</div><strong>${d.messages.length}</strong><span class="sub">Recientes del equipo</span></a>
  </div>
  <div class="grid-2">
    <div>
      <section class="panel"><div class="panel-head"><h2>Mis procesos</h2><a class="text-button" href="#/procesos">Ver todos ${svg('arrow')}</a></div>
        ${d.cases.length ? d.cases.map((k) => `<a class="row" href="#/procesos/${k.id}"><div class="sym">${svg('folder')}</div><div class="info"><span class="overline">${esc(k.ref)} · ${esc(labelOf(M.AREAS, k.area))}</span><h3>${esc(k.title)}</h3><p>${k.current_stage ? `Etapa actual: ${esc(k.current_stage)}` : (k.status === 'terminado' ? 'Proceso concluido' : 'Sin etapa en curso')}${k.responsible_name ? ` · Responsable: ${esc(k.responsible_name)}` : ''}</p></div><div class="end">${badge(M.CASE_STATUS, k.status)}<span class="when">Actualizado ${esc(fmtStamp(k.updated_at))}</span></div></a>`).join('') : emptyState('Aún no hay procesos disponibles', 'Cuando el equipo comparta un proceso con usted, aparecerá aquí.')}
        <p class="panel-note">Los estados describen el trabajo del despacho; no un resultado judicial.</p>
      </section>
      <section class="panel"><div class="panel-head"><h2>Actividad reciente</h2></div>
        ${d.docket.length ? `<ul class="timeline">${d.docket.map((a) => `<li class="client"><div class="t-head"><span class="t-date">${esc(fmtDate(a.date))}</span><span class="badge neutral">${esc(labelOf(M.DOCKET_KINDS, a.kind))}</span></div><strong>${esc(a.title)}</strong><p>${esc(a.case_ref)} · ${esc(a.case_title)}${a.description ? '\n' + esc(a.description) : ''}</p></li>`).join('')}</ul>` : emptyState('Sin actividad reciente')}
      </section>
    </div>
    <div>
      ${next ? `<section class="next-step"><div><span class="eyebrow">Su siguiente paso</span></div><h2>${esc(next.next_action || `Revise la información de ${next.ref}`)}</h2><p>${esc(next.title)}${next.next_action_due ? ` · Fecha estimada: ${esc(fmtDate(next.next_action_due))}` : ''}</p><span class="overline">${esc(next.ref)}${next.responsible_name ? ` · ${esc(next.responsible_name)}` : ''}</span><a class="button light" href="#/procesos/${next.id}">Ver el proceso <span aria-hidden="true">→</span></a></section>` : ''}
      <section class="panel" style="margin-top:${next ? '20px' : '0'}"><div class="panel-head"><h2>Próximas fechas</h2><a class="text-button" href="#/agenda">Agenda ${svg('arrow')}</a></div>
        ${d.events.length ? d.events.map((e) => eventRow(e, M)).join('') : emptyState('Sin fechas confirmadas', 'Las audiencias y reuniones confirmadas por el despacho aparecerán aquí.')}
      </section>
      ${d.pendingDocs.length ? `<section class="panel"><div class="panel-head"><h2>Documentos que requieren su atención</h2></div>${d.pendingDocs.map((x) => `<div class="row"><div class="info"><h3>${esc(x.title)}</h3><p>${esc(x.case_ref)}${x.notes ? ` · ${esc(x.notes)}` : ''}</p></div><div class="end">${badge(M.DOC_STATUS, x.status)}</div></div>`).join('')}</section>` : ''}
    </div>
  </div>`;
}
