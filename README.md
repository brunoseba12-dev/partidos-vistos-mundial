# Partidos Vistos Mundial + Penca

Proyecto reestructurado con frontend separado, Netlify Functions y login con Supabase.

## Estructura

- frontend/index.html
- frontend/styles.css
- frontend/app.js
- frontend/assets/fondo-mundial-2026.jpg
- frontend/assets/copa-mundial.png
- netlify/functions/config.mjs
- netlify/functions/vistos.mjs
- netlify/functions/pronosticos.mjs
- package.json
- netlify.toml

## Netlify

En Build & deploy:

- Build command: vacío
- Publish directory: `frontend`
- Functions directory: `netlify/functions`

Variables de entorno necesarias:

- SUPABASE_URL
- SUPABASE_ANON_KEY

No usar la service_role key en el frontend.


## Diagnóstico rápido del login

Abrí esta URL luego del deploy:

`https://partidosvistosdelmundial.netlify.app/.netlify/functions/config`

Debe devolver `loginDisponible: true`.

Si devuelve `loginDisponible: false`, faltan o están mal estas variables en Netlify:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Después de corregirlas, hacé un nuevo deploy.
