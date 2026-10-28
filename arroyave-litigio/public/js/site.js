(() => {
  'use strict';
  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (name) => name.split(/\s+/).filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w)).slice(0, 2).map((w) => w[0]).join('') || name.slice(0, 2).toUpperCase();
  const year = (d) => (d ? String(d).slice(0, 4) : '');

  qs('#year').textContent = new Date().getFullYear();

  // Navegación móvil
  const menuButton = qs('.menu-toggle'); const siteNav = qs('#site-nav');
  const closeNav = () => { siteNav.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Abrir navegación'); };
  menuButton.addEventListener('click', () => {
    const opened = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(opened));
    menuButton.setAttribute('aria-label', opened ? 'Cerrar navegación' : 'Abrir navegación');
    siteNav.classList.toggle('open', opened);
  });
  qsa('a', siteNav).forEach((a) => a.addEventListener('click', closeNav));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && siteNav.classList.contains('open')) { closeNav(); menuButton.focus(); } });

  // Contenido dinámico
  let site = null;
  fetch('/api/public/site').then((r) => r.json()).then((data) => { site = data; render(); }).catch(() => { qs('#team-grid').innerHTML = '<p class="muted">No fue posible cargar la información del equipo.</p>'; });

  function render() {
    const s = site.settings || {};
    qsa('[data-setting]').forEach((el) => { const v = s[el.dataset.setting]; if (v !== undefined && v !== '') el.textContent = v; });
    document.title = `${s.firm_name || 'Arroyave H. Litigio'} · ${s.firm_descriptor || 'Asesoría y representación judicial'}`;
    qs('#demo-bar').hidden = s.demo_notice !== '1';

    // Cifras
    if (site.stats) {
      const st = site.stats;
      const tiles = [[st.closed, 'procesos concluidos registrados'], [st.favorable, 'con resultado favorable, parcial o conciliado'], [st.cities, st.cities === 1 ? 'ciudad con procesos atendidos' : 'ciudades con procesos atendidos'], [st.lawyers, st.lawyers === 1 ? 'profesional en el equipo' : 'profesionales en el equipo']];
      qs('#stats').innerHTML = tiles.map(([n, label]) => `<div class="stat"><strong>${String(n).padStart(2, '0')}</strong><span>${esc(label)}</span></div>`).join('');
      qs('#stats').hidden = false; qs('#stats-note').hidden = false;
    }

    // Equipo
    const team = site.team || [];
    qs('#team-grid').innerHTML = team.length ? team.map((u) => `
      <article class="team-card">
        <div class="team-avatar" aria-hidden="true">${esc(initials(u.name))}</div>
        <div><h3>${esc(u.name)}</h3><p class="role">${esc(u.title || '')}</p></div>
        ${u.specialties && u.specialties.length ? `<div class="chips">${u.specialties.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}
        ${u.bio ? `<p>${esc(u.bio)}</p>` : ''}
        ${u.education ? `<p class="edu">${esc(u.education)}</p>` : ''}
      </article>`).join('') : '<p class="muted">La información del equipo se publicará próximamente.</p>';
    if (!team.length) qs('#equipo').hidden = true;

    // Áreas
    const success = site.success || [];
    const countByArea = success.reduce((acc, c) => { acc[c.area] = (acc[c.area] || 0) + 1; return acc; }, {});
    qs('#areas-grid').innerHTML = (site.areas || []).map((a, i) => `
      <article class="area">
        <span class="no">0${i + 1}</span>
        <h3>${esc(a.label)}</h3>
        <p>${esc(a.description)}</p>
        ${countByArea[a.id] ? `<span class="count">${countByArea[a.id]} ${countByArea[a.id] === 1 ? 'caso de éxito publicado' : 'casos de éxito publicados'}</span>` : ''}
      </article>`).join('');

    // Casos de éxito
    const areaLabel = (id) => ((site.areas || []).find((a) => a.id === id) || {}).label || id;
    const outcomeLabel = (id) => ((site.outcomes || []).find((o) => o.id === id) || {}).label || id;
    const filters = qs('#case-filters');
    const areasWithCases = (site.areas || []).filter((a) => countByArea[a.id]);
    let active = 'all';
    const renderCases = () => {
      const list = success.filter((c) => active === 'all' || c.area === active);
      qs('#cases-grid').innerHTML = list.length ? list.map((c) => `
        <article class="case-card">
          <div class="tags"><span class="badge brass">${esc(areaLabel(c.area))}</span><span class="badge success">${esc(outcomeLabel(c.outcome))}</span></div>
          <h3>${esc(c.title)}</h3>
          <p>${esc(c.summary)}</p>
          <div class="meta">
            ${c.city ? `<span><strong>${esc(c.city)}</strong>${c.department && c.department !== c.city ? `, ${esc(c.department)}` : ''}</span>` : ''}
            ${c.closed_at ? `<span>Concluido en <strong>${esc(year(c.closed_at))}</strong></span>` : ''}
            ${c.process_type ? `<span>${esc(c.process_type)}</span>` : ''}
            ${c.lawyer ? `<span>Responsable: <strong>${esc(c.lawyer)}</strong></span>` : ''}
          </div>
        </article>`).join('') : '<div class="cases-empty">Aún no hay casos publicados en esta área.</div>';
    };
    if (!success.length) { qs('#casos').hidden = true; }
    else {
      filters.innerHTML = [`<button type="button" aria-pressed="true" data-area="all">Todos (${success.length})</button>`, ...areasWithCases.map((a) => `<button type="button" aria-pressed="false" data-area="${a.id}">${esc(a.label)} (${countByArea[a.id]})</button>`)].join('');
      qsa('button', filters).forEach((b) => b.addEventListener('click', () => { active = b.dataset.area; qsa('button', filters).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderCases(); }));
      renderCases();
    }
  }

  // Formulario de contacto
  const form = qs('#contact-form');
  const result = qs('#contact-result');
  const fields = { name: { error: 'name-error', message: 'Ingrese su nombre.' }, email: { error: 'email-error', message: 'Ingrese un correo electrónico válido.' }, reason: { error: 'reason-error', message: 'Seleccione un motivo de contacto.' } };
  Object.entries(fields).forEach(([name, cfg]) => form.elements[name].addEventListener('input', () => { form.elements[name].removeAttribute('aria-invalid'); qs('#' + cfg.error).textContent = ''; result.hidden = true; }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let firstInvalid = null;
    Object.entries(fields).forEach(([name, cfg]) => {
      const input = form.elements[name];
      const valid = input.value.trim() !== '' && input.validity.valid;
      qs('#' + cfg.error).textContent = valid ? '' : cfg.message;
      if (!valid) { input.setAttribute('aria-invalid', 'true'); firstInvalid = firstInvalid || input; } else input.removeAttribute('aria-invalid');
    });
    if (firstInvalid) { result.hidden = true; firstInvalid.focus(); return; }
    const button = qs('#contact-submit'); button.disabled = true; button.setAttribute('aria-busy', 'true');
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      const r = await fetch('/api/public/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'No pudimos enviar su solicitud. Intente de nuevo.');
      result.className = 'form-result'; result.textContent = 'Solicitud recibida. Le responderemos al correo indicado para acordar una primera conversación.'; result.hidden = false;
      form.reset();
    } catch (err) {
      result.className = 'form-result error'; result.textContent = err.message; result.hidden = false;
    } finally { button.disabled = false; button.removeAttribute('aria-busy'); }
  });
})();
