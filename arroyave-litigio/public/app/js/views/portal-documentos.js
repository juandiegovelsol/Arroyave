import { api } from '../api.js';
import { qs, esc, svg, badge, fmtStamp, fmtSize, labelOf, emptyState } from '../ui.js';

export default async function view({ el, state, setCrumbs }) {
  const M = state.meta;
  setCrumbs([{ label: 'Documentos' }]);
  const list = (await api.get('/api/cases?limit=100')).items;
  const details = await Promise.all(list.map((c) => api.get(`/api/cases/${c.id}`)));
  const ext = (name) => (String(name).split('.').pop() || 'doc').toUpperCase().slice(0, 4);
  el.innerHTML = `<div class="page-head"><div><p class="eyebrow">Archivo</p><h1>Documentos</h1><p class="lead">Archivos compartidos por el despacho, organizados por proceso. Para aportar un documento, entre al proceso correspondiente.</p></div></div>
    ${details.length ? details.map((d) => `<section class="panel"><div class="panel-head"><h2>${esc(d.case.title)}<span class="sub">${esc(d.case.ref)} · ${esc(labelOf(M.AREAS, d.case.area))}</span></h2><a class="text-button" href="#/procesos/${d.case.id}/documentos">Ver proceso ${svg('arrow')}</a></div>
      ${d.documents.length ? d.documents.map((x) => `<div class="row doc-row"><span class="file-icon" aria-hidden="true">${esc(ext(x.original_name))}</span><div class="info"><h3><a href="/api/documents/${x.id}/download?inline=1" target="_blank" rel="noopener">${esc(x.title)}</a></h3><p>${esc(labelOf(M.DOC_CATEGORIES, x.category))} · ${esc(fmtSize(x.size || 0))} · ${esc(fmtStamp(x.created_at))}</p>${x.notes ? `<p>${esc(x.notes)}</p>` : ''}</div><div class="end">${badge(M.DOC_STATUS, x.status)}<a class="text-button" href="/api/documents/${x.id}/download">${svg('download')} Descargar</a></div></div>`).join('') : '<p class="muted small" style="padding:0 22px 18px">Aún no hay documentos compartidos en este proceso.</p>'}</section>`).join('') : `<section class="panel">${emptyState('Aún no hay documentos disponibles', 'Cuando el equipo comparta un documento, aparecerá aquí.')}</section>`}
    <p class="muted small" style="margin-top:16px">"Documento recibido" significa que el archivo llegó al despacho; no implica revisión ni aprobación. Un documento "disponible" puede consultarse; tampoco constituye una aprobación.</p>`;
}
