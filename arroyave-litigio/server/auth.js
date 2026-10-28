'use strict';
const crypto = require('node:crypto');
const { get, run, audit } = require('./db');
const { HttpError, randomToken } = require('./util');

const COOKIE = 'arh_session';
const SESSION_DAYS = 7;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length, { N: +N, r: +r, p: +p });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function createSession(res, user, req) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  run('INSERT INTO sessions(token,user_id,expires_at,ip,user_agent) VALUES(?,?,?,?,?)',
    token, user.id, expires.toISOString().replace('T', ' ').slice(0, 19), req.ip || '', String(req.headers['user-agent'] || '').slice(0, 300));
  run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", user.id);
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  audit(user.id, 'login', 'user', user.id, { ip: req.ip });
}
function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// Carga el usuario de la sesión (si existe) en req.user. No bloquea.
function loadUser(req, res, next) {
  req.user = null;
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const row = get(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                     WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1`, token);
    if (row) { delete row.password_hash; req.user = row; }
  }
  next();
}

const STAFF = ['admin', 'abogado', 'asistente'];
function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Inicie sesión para continuar.'));
  // Protección CSRF: toda petición que modifica datos debe llevar una cabecera que un formulario cruzado no puede enviar.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'fetch') {
    return next(new HttpError(403, 'Petición no permitida.'));
  }
  next();
}
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Inicie sesión para continuar.'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Su perfil no permite esta acción.'));
  next();
};
const requireStaff = requireRole(...STAFF);
const isStaff = (u) => !!u && STAFF.includes(u.role);
const canManage = (u) => !!u && ['admin', 'abogado'].includes(u.role);
const isAdmin = (u) => !!u && u.role === 'admin';

// Límite de intentos de inicio de sesión (memoria local; suficiente para un despacho pequeño).
const attempts = new Map();
const MAX_ATTEMPTS = 8; const WINDOW_MS = 15 * 60 * 1000;
function checkLoginAllowed(key) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  attempts.set(key, recent);
  return recent.length < MAX_ATTEMPTS;
}
function recordFailedLogin(key) { if (!attempts.has(key)) attempts.set(key, []); attempts.get(key).push(Date.now()); }
function clearLoginAttempts(key) { attempts.delete(key); }
setInterval(() => { const now = Date.now(); for (const [k, v] of attempts) { if (!v.some((t) => now - t < WINDOW_MS)) attempts.delete(k); } }, 60000).unref();

function purgeExpiredSessions() { run("DELETE FROM sessions WHERE expires_at <= datetime('now')"); }

module.exports = { COOKIE, hashPassword, verifyPassword, createSession, destroySession, loadUser, requireAuth, requireRole, requireStaff, isStaff, canManage, isAdmin, checkLoginAllowed, recordFailedLogin, clearLoginAttempts, purgeExpiredSessions };
