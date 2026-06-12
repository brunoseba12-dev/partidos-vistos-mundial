# Partidos Vistos Mundial + Penca con Login

Estructura:

- `frontend/`: página visible.
- `netlify/functions/`: backend con Netlify Functions.
- Supabase se usa solo para login.
- Netlify Blobs guarda vistos y pronósticos.

Variables necesarias en Netlify:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Configuración Netlify:

- Build command: vacío
- Publish directory: `frontend`
- Functions directory: `netlify/functions`

En Supabase Authentication:

- Site URL: URL de tu sitio Netlify
- Redirect URLs: URL de tu sitio Netlify con `/*`
