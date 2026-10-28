# Arroyave H. Litigio · Sitio web y plataforma de gestión de procesos

Sitio web público del despacho y plataforma privada para gestionar los procesos judiciales (clientes, etapas, abogados, actuaciones, documentos, agenda, tareas y mensajes), construidos sobre el sistema de identidad del manual de marca v1.0.

## Requisitos

- Node.js 22.13 o superior (probado con Node 24). La base de datos usa el módulo `node:sqlite` incluido en Node: no hay dependencias nativas que compilar.
- Windows, macOS o Linux.

## Puesta en marcha

```bash
cd arroyave-litigio
npm install
copy .env.example .env     # en Windows (cp en macOS/Linux)
npm start
```

- Sitio web: <http://localhost:3000>
- Acceso a la plataforma: <http://localhost:3000/acceso>
- Plataforma: <http://localhost:3000/app/>

En el primer arranque se crea el administrador definido en `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) y, si `SEED_DEMO=1`, un conjunto de datos de ejemplo.

### Cuentas de ejemplo (datos ficticios)

| Perfil | Correo | Contraseña |
|---|---|---|
| Administración (socia directora) | admin@arroyaveh.co | Admin2026* |
| Abogados | andres@arroyaveh.co · valentina@arroyaveh.co · julian@arroyaveh.co | Demo2026* |
| Asistente jurídica | laura@arroyaveh.co | Demo2026* |
| Clientes | cliente@ejemplo.co · cliente2@ejemplo.co | Cliente2026* |

Cambie todas las contraseñas antes de usar la plataforma con información real.

### Scripts

| Comando | Qué hace |
|---|---|
| `npm start` | Inicia el servidor (puerto `PORT`, por defecto 3000). |
| `npm run dev` | Igual, reiniciando al cambiar archivos del servidor. |
| `npm run seed` | Vuelve a cargar los datos de ejemplo sobre la base actual. |
| `npm run reset` | Borra toda la base de datos y los archivos subidos y carga los datos de ejemplo. |

## Qué incluye

### Sitio web público (`public/index.html`)

Inicio, El despacho (con cifras calculadas desde la plataforma), Equipo (perfiles marcados como públicos), Áreas de práctica, Casos de éxito (procesos terminados marcados como destacados, con resumen anónimo y filtro por área), Acompañamiento, Contacto (el formulario crea una solicitud en la plataforma) y acceso a la plataforma. Diseño responsivo para escritorio y móvil.

### Plataforma privada (`public/app/`)

- **Resumen**: vencimientos, tareas, procesos a cargo, carga por abogado y por área.
- **Procesos**: listado con búsqueda y filtros (área, estado, abogado, ciudad). Cada proceso tiene referencia interna, radicado, despacho, ciudad, instancia, cuantía, cliente, abogado responsable y siguiente acción. Pestañas:
  - *Etapas*: plantillas por tipo de proceso (verbal, ejecutivo, laboral, familia, penal, tutela, administrativo). Cada etapa tiene su propio abogado responsable, estado y fechas.
  - *Partes*: demandantes, demandados, apoderados, terceros y autoridades.
  - *Actuaciones*: historial con tipo, fuente (Rama Judicial, estado electrónico, interna…) y visibilidad para el cliente.
  - *Documentos*: carga y descarga de archivos con categoría, estado (recibido, en revisión, disponible, requiere atención) y visibilidad.
  - *Agenda*: audiencias, términos, diligencias y reuniones.
  - *Tareas*, *Mensajes y notas* (internas o visibles para el cliente) y *Equipo* del proceso.
- **Agenda** general, **Tareas**, **Clientes** (con creación de acceso a la plataforma), **Solicitudes** del sitio web (convertibles en clientes), **Equipo** (usuarios y perfiles públicos), **Ajustes** (textos del sitio, contacto, publicación y registro de actividad) y **Mi perfil**.
- **Espacio del cliente**: ve únicamente sus procesos, las etapas, las actuaciones, los documentos, las fechas y los mensajes marcados como visibles; puede aportar documentos y escribir al despacho.

### Perfiles y permisos

| Perfil | Puede |
|---|---|
| Administrador | Todo, incluida la gestión de usuarios, ajustes, eliminación de procesos y registro de actividad. |
| Abogado | Crear y editar procesos, cerrar procesos, publicar casos de éxito, gestionar clientes, solicitudes y accesos de clientes. |
| Asistente jurídico | Registrar actuaciones, documentos, eventos, tareas y partes; editar datos básicos. No cierra ni elimina. |
| Cliente | Consulta de sus procesos, documentos y agenda compartidos; mensajes y aporte de documentos. |

## Seguridad

- Contraseñas con `scrypt` y sal aleatoria; sesiones en cookie `HttpOnly` + `SameSite=Lax`; verificación de cabecera en peticiones que modifican datos (protección CSRF); límite de intentos de inicio de sesión; cabeceras de seguridad y CSP; validación de tipo y tamaño de archivos; registro de auditoría.
- Para producción: sirva detrás de HTTPS, defina `COOKIE_SECURE=1` y `TRUST_PROXY=1` en `.env`, cambie las contraseñas iniciales, programe copias de seguridad de la carpeta `data/` (base de datos y archivos) y revise la política de tratamiento de datos personales (Ley 1581 de 2012).

## Antes de publicar

Los textos, el equipo, los clientes y los procesos de ejemplo son ficticios. Revise y reemplace:

1. Textos y datos de contacto en **Ajustes** (dirección, teléfono, correo, horario).
2. Perfiles del equipo en **Equipo** (nombres, cargos, formación, tarjeta profesional).
3. Casos de éxito: publique solo asuntos reales, con autorización del cliente y sin datos identificables.
4. Desactive el aviso de "contenido de ejemplo" en Ajustes, o ejecute `npm run reset` con `SEED_DEMO=0` para arrancar con la base vacía.

## Estructura

```
arroyave-litigio/
├── server/           API (Express) y base de datos (node:sqlite)
│   ├── index.js      arranque, rutas, seguridad
│   ├── db.js         esquema y utilidades
│   ├── meta.js       catálogos jurídicos y plantillas de etapas
│   ├── seed.js       administrador inicial y datos de ejemplo
│   └── routes/       auth, cases (procesos y anexos), misc (clientes, usuarios, agenda, tareas, resumen, solicitudes, ajustes, sitio público)
├── public/
│   ├── index.html    sitio web
│   ├── acceso.html   inicio de sesión
│   ├── app/          plataforma (SPA sin paso de compilación)
│   ├── css/          tokens de marca, sitio y plataforma
│   ├── fonts/ img/   Manrope, Cormorant Garamond (OFL) y logotipos
└── data/             base de datos y archivos subidos (no versionar)
```
