import { api } from '../api.js';
import { qs, qsa, esc, field, input, textarea, toast, fmtStamp } from '../ui.js';

export default async function view({ el, state, setCrumbs }) {
  setCrumbs([{ label: 'Ajustes' }]);
  const s = await api.get('/api/settings');
  const audit = await api.get('/api/audit?limit=40');
  el.innerHTML = `<div class="page-head"><div><p class="eyebrow">Administración</p><h1>Ajustes del despacho</h1><p class="lead">Información que se muestra en el sitio web público y opciones de publicación.</p></div></div>
  <form id="settings" class="stack">
    <section class="panel"><div class="panel-head"><h2>Identidad y textos del sitio</h2></div><div class="panel-body form-grid">
      ${field('Nombre del despacho', input('firm_name', s.firm_name || ''))}${field('Descriptor', input('firm_descriptor', s.firm_descriptor || ''))}
      ${field('Frase principal', input('firm_tagline', s.firm_tagline || ''), { span: true })}${field('Texto de introducción (hero)', input('firm_intro', s.firm_intro || ''), { span: true })}
      ${field('Sobre el despacho (párrafo destacado)', textarea('firm_about', s.firm_about || '', 'rows="3"'), { span: true })}${field('Sobre el despacho (segundo párrafo)', textarea('firm_about_2', s.firm_about_2 || '', 'rows="3"'), { span: true })}
      ${field('Nota de la sección de casos de éxito', textarea('site_success_note', s.site_success_note || '', 'rows="2"'), { span: true })}
    </div></section>
    <section class="panel"><div class="panel-head"><h2>Contacto</h2></div><div class="panel-body form-grid">
      ${field('Dirección', input('firm_address', s.firm_address || ''))}${field('Ciudad', input('firm_city', s.firm_city || ''))}${field('Teléfono', input('firm_phone', s.firm_phone || ''))}${field('WhatsApp', input('firm_whatsapp', s.firm_whatsapp || ''))}${field('Correo', input('firm_email', s.firm_email || ''))}${field('Horario', input('firm_hours', s.firm_hours || ''))}
    </div></section>
    <section class="panel"><div class="panel-head"><h2>Publicación</h2></div><div class="panel-body" style="display:grid;gap:8px">
      <label class="check"><input type="checkbox" name="site_show_success" ${s.site_show_success !== '0' ? 'checked' : ''}> Mostrar la sección de casos de éxito</label>
      <label class="check"><input type="checkbox" name="site_show_team" ${s.site_show_team !== '0' ? 'checked' : ''}> Mostrar el equipo en el sitio</label>
      <label class="check"><input type="checkbox" name="site_show_stats" ${s.site_show_stats !== '0' ? 'checked' : ''}> Mostrar cifras calculadas (procesos concluidos, ciudades, etc.)</label>
      <label class="check"><input type="checkbox" name="demo_notice" ${s.demo_notice === '1' ? 'checked' : ''}> Mostrar el aviso de "contenido de ejemplo" en el sitio y las cuentas de prueba en el acceso</label>
      <p class="helper-text">Desactive el aviso cuando el despacho haya revisado los textos, el equipo y los casos publicados.</p>
    </div></section>
    <div style="display:flex;justify-content:flex-end"><button class="button primary" type="submit">Guardar ajustes</button></div>
  </form>
  <section class="panel" style="margin-top:28px"><div class="panel-head"><h2>Registro de actividad<span class="sub">Últimas 40 acciones registradas en la plataforma</span></h2></div><div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr></thead><tbody>${audit.map((a) => `<tr><td data-label="Fecha">${esc(fmtStamp(a.created_at))}</td><td data-label="Usuario">${esc(a.user_name || 'Sistema / anónimo')}</td><td data-label="Acción">${esc(a.action)}</td><td data-label="Entidad">${esc(a.entity)}${a.entity_id ? ` #${a.entity_id}` : ''}</td><td data-label="Detalle"><span class="muted small">${esc(a.details)}</span></td></tr>`).join('')}</tbody></table></div></section>`;
  qs('#settings', el).addEventListener('submit', async (e) => {
    e.preventDefault(); const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    qsa('input[type=checkbox]', form).forEach((c) => { data[c.name] = c.checked ? '1' : '0'; });
    await api.put('/api/settings', data); toast('Ajustes guardados.');
  });
}
