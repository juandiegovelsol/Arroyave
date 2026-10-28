(() => {
  'use strict';
  const form = document.getElementById('login-form');
  const error = document.getElementById('login-error');
  const submit = document.getElementById('login-submit');
  const next = new URLSearchParams(location.search).get('next');
  const target = next && next.startsWith('/app') ? next : '/app/';
  fetch('/api/public/site').then((r) => r.json()).then((d) => { if (d.settings && d.settings.demo_notice === '1') document.getElementById('demo-box').hidden = false; }).catch(() => {});
  document.getElementById('toggle-pw').addEventListener('click', (e) => {
    const input = form.elements.password; const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'Ocultar' : 'Mostrar';
    e.currentTarget.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const email = form.elements.email.value.trim(); const password = form.elements.password.value;
    if (!email || !password) { error.textContent = 'Ingrese su correo y su contraseña.'; error.hidden = false; return; }
    submit.disabled = true; submit.setAttribute('aria-busy', 'true');
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ email, password }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'No fue posible iniciar sesión.');
      location.replace(target);
    } catch (err) {
      error.textContent = err.message; error.hidden = false;
      submit.disabled = false; submit.removeAttribute('aria-busy');
      form.elements.password.focus();
    }
  });
})();
