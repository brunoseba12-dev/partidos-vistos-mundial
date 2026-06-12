import { getStore } from "@netlify/blobs";

const MINUTOS_CIERRE = 5;

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function responder(datos, status = 200) {
  return new Response(JSON.stringify(datos), { status, headers: HEADERS });
}

function claveUsuario(usuarioId) {
  return `usuarios/${encodeURIComponent(usuarioId)}/pronosticos/`;
}

function clavePronostico(usuarioId, partidoId) {
  return `${claveUsuario(usuarioId)}${encodeURIComponent(partidoId)}`;
}

async function obtenerUsuario(request) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_ANON_KEY en Netlify");
  }

  if (!token) return null;

  const respuesta = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!respuesta.ok) return null;
  return respuesta.json();
}

function pencaCerrada(fechaHoraISO) {
  const fechaPartido = new Date(fechaHoraISO);

  if (Number.isNaN(fechaPartido.getTime())) {
    return { cerrada: true, cierre: null };
  }

  const cierre = new Date(fechaPartido.getTime() - MINUTOS_CIERRE * 60 * 1000);
  return { cerrada: Date.now() >= cierre.getTime(), cierre: cierre.toISOString() };
}

async function obtenerPronosticosUsuario(store, usuarioId) {
  const prefix = claveUsuario(usuarioId);
  const { blobs } = await store.list({ prefix });
  const pronosticos = {};

  for (const blob of blobs) {
    const dato = await store.get(blob.key, { type: "json" });
    if (dato?.partidoId) {
      pronosticos[dato.partidoId] = dato;
    }
  }

  return pronosticos;
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: HEADERS });
  }

  const store = getStore({ name: "pronosticos-mundial-2026", consistency: "strong" });

  try {
    const usuario = await obtenerUsuario(request);

    if (!usuario?.id) {
      return responder({ error: "Tenés que iniciar sesión para usar la penca" }, 401);
    }

    if (request.method === "GET") {
      const pronosticos = await obtenerPronosticosUsuario(store, usuario.id);
      return responder({ pronosticos });
    }

    if (request.method === "POST") {
      const cuerpo = await request.json();
      const partidoId = String(cuerpo.partidoId || "").trim();
      const local = Number(cuerpo.local);
      const visitante = Number(cuerpo.visitante);
      const fechaHoraISO = String(cuerpo.fechaHoraISO || "").trim();
      const datosPartido = cuerpo.partido || {};

      if (!partidoId) return responder({ error: "Falta partidoId" }, 400);
      if (!Number.isInteger(local) || !Number.isInteger(visitante) || local < 0 || visitante < 0) {
        return responder({ error: "El resultado tiene que tener goles válidos" }, 400);
      }

      const estadoCierre = pencaCerrada(fechaHoraISO);
      if (estadoCierre.cerrada) {
        return responder({ error: "La penca de este partido ya cerró" }, 423);
      }

      const pronostico = {
        partidoId,
        userId: usuario.id,
        email: usuario.email || null,
        local,
        visitante,
        partido: datosPartido,
        fechaHoraISO,
        cierreISO: estadoCierre.cierre,
        updatedAt: new Date().toISOString()
      };

      await store.setJSON(clavePronostico(usuario.id, partidoId), pronostico);
      return responder({ ok: true, pronostico });
    }

    return responder({ error: "Método no permitido" }, 405);
  } catch (error) {
    return responder({ error: "No se pudo procesar la solicitud", detalle: error.message }, 500);
  }
}
