'use strict';
try { process.loadEnvFile(require('node:path').join(__dirname, '..', '.env')); } catch { /* sin .env: se usan valores por defecto */ }

const path = require('node:path');
const express = require('express');
const { HttpError } = require('./util');
const { loadUser, purgeExpiredSessions } = require('./auth');
const { ensureAdmin, seedDemoIfEmpty } = require('./seed');
const authRoutes = require('./routes/auth');
const caseRoutes = require('./routes/cases');
const misc = require('./routes/misc');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

// Cabeceras de seguridad básicas.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'self'; base-uri 'self'; form-action 'self'");
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(loadUser);

// API
app.use('/api/auth', authRoutes.router);
app.use('/api/meta', misc.meta);
app.use('/api/cases', caseRoutes.router);
app.use('/api/documents', caseRoutes.downloadRouter);
app.use('/api/clients', misc.clients);
app.use('/api/users', misc.users);
app.use('/api/agenda', misc.agenda);
app.use('/api/tasks', misc.tasks);
app.use('/api/dashboard', misc.dashboard);
app.use('/api/leads', misc.leads);
app.use('/api/settings', misc.settings);
app.use('/api/audit', misc.audit);
app.use('/api/public', misc.pub);
app.all('/api/*', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Plataforma privada: exige sesión; el enrutado interno lo hace la SPA.
app.get(['/app', '/app/', '/app/*'], (req, res, next) => {
  if (req.path.match(/\.(js|css|svg|png|woff2?|ico|map)$/)) return next();
  if (!req.user) return res.redirect('/acceso?next=' + encodeURIComponent(req.originalUrl));
  res.sendFile(path.join(PUBLIC_DIR, 'app', 'index.html'));
});
app.get('/acceso', (req, res) => {
  if (req.user) return res.redirect('/app/');
  res.sendFile(path.join(PUBLIC_DIR, 'acceso.html'));
});
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, index: 'index.html' }));

// Errores
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : err.type === 'entity.parse.failed' ? 400 : 500);
  const message = err instanceof HttpError ? err.message : err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo (25 MB).' : status === 400 ? 'Solicitud no válida.' : 'Ocurrió un error inesperado. Intente de nuevo.';
  if (status >= 500) console.error(err);
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: message, ...(err.extra || {}) });
  res.status(status).send(`<!doctype html><meta charset="utf-8"><title>Error</title><p style="font-family:sans-serif;padding:40px">${message}</p>`);
});

ensureAdmin();
seedDemoIfEmpty();
purgeExpiredSessions();
setInterval(purgeExpiredSessions, 6 * 3600 * 1000).unref();

app.listen(PORT, () => {
  console.log(`Arroyave H. Litigio · sitio web en http://localhost:${PORT}  ·  plataforma en http://localhost:${PORT}/app/`);
});
