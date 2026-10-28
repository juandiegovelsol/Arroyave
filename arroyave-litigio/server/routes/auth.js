'use strict';
const express = require('express');
const { get, run, audit } = require('../db');
const { verifyPassword, hashPassword, createSession, destroySession, requireAuth, checkLoginAllowed, recordFailedLogin, clearLoginAttempts, COOKIE } = require('../auth');
const { HttpError, wrap, str, isEmail } = require('../util');

const router = express.Router();

const safeUser = (u) => {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  try { rest.specialties = JSON.parse(rest.specialties || '[]'); } catch { rest.specialties = []; }
  return rest;
};

router.post('/login', wrap((req, res) => {
  if (req.headers['x-requested-with'] !== 'fetch') throw new HttpError(403, 'Petición no permitida.');
  const email = str(req.body.email, 200).toLowerCase();
  const password = String(req.body.password || '');
  if (!isEmail(email) || !password) throw new HttpError(400, 'Ingrese su correo y su contraseña.');
  const key = `${req.ip}|${email}`;
  if (!checkLoginAllowed(key)) throw new HttpError(429, 'Demasiados intentos. Espere 15 minutos e intente de nuevo.');
  const user = get('SELECT * FROM users WHERE email = ? AND active = 1', email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFailedLogin(key);
    audit(user ? user.id : null, 'login_failed', 'user', user ? user.id : null, { email, ip: req.ip });
    throw new HttpError(401, 'Correo o contraseña incorrectos.');
  }
  clearLoginAttempts(key);
  createSession(res, user, req);
  res.json({ user: safeUser(user) });
}));

router.post('/logout', (req, res) => {
  if (req.user) audit(req.user.id, 'logout', 'user', req.user.id, {});
  destroySession(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sin sesión.' });
  res.json({ user: safeUser(req.user) });
});

router.put('/password', requireAuth, wrap((req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.next || '');
  const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(current, user.password_hash)) throw new HttpError(400, 'La contraseña actual no es correcta.');
  if (next.length < 8) throw new HttpError(400, 'La nueva contraseña debe tener al menos 8 caracteres.');
  run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', hashPassword(next), user.id);
  // Cierra las demás sesiones del usuario.
  const token = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  run('DELETE FROM sessions WHERE user_id = ? AND token <> ?', user.id, token ? token.slice(COOKIE.length + 1) : '');
  audit(user.id, 'password_change', 'user', user.id, {});
  res.json({ ok: true });
}));

router.put('/profile', requireAuth, wrap((req, res) => {
  const b = req.body;
  const name = str(b.name, 120) || req.user.name;
  const phone = str(b.phone, 40);
  const fields = { name, phone };
  if (req.user.role !== 'cliente') {
    fields.title = str(b.title, 120);
    fields.bio = str(b.bio, 2000);
    fields.education = str(b.education, 600);
    fields.card_number = str(b.card_number, 60);
    fields.specialties = JSON.stringify(Array.isArray(b.specialties) ? b.specialties.map((s) => str(s, 60)).filter(Boolean).slice(0, 8) : []);
  }
  const keys = Object.keys(fields);
  run(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => fields[k]), req.user.id);
  audit(req.user.id, 'profile_update', 'user', req.user.id, {});
  res.json({ user: safeUser(get('SELECT * FROM users WHERE id = ?', req.user.id)) });
}));

module.exports = { router, safeUser };
