import { getStore } from "@netlify/blobs";

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function responder(datos, status = 200) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: HEADERS
  });
}

function obtenerClave(partidoId, dispositivoId) {
  return `partidos/${encodeURIComponent(partidoId)}/usuarios/${encodeURIComponent(dispositivoId)}`;
}

async function contarUsuariosDelPartido(store, partidoId) {
  const prefix = `partidos/${encodeURIComponent(partidoId)}/usuarios/`;
  const { blobs } = await store.list({ prefix });
  return blobs.length;
}

async function obtenerConteos(store) {
  const { blobs } = await store.list({ prefix: "partidos/" });
  const conteos = {};

  blobs.forEach(({ key }) => {
    const partes = key.split("/");

    if (partes.length >= 4 && partes[0] === "partidos" && partes[2] === "usuarios") {
      const partidoId = decodeURIComponent(partes[1]);
      conteos[partidoId] = (conteos[partidoId] || 0) + 1;
    }
  });

  return conteos;
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: HEADERS
    });
  }

  const store = getStore({
    name: "vistos-mundial-2026",
    consistency: "strong"
  });

  try {
    if (request.method === "GET") {
      const conteos = await obtenerConteos(store);
      return responder({ conteos });
    }

    if (request.method === "POST") {
      const cuerpo = await request.json();
      const partidoId = String(cuerpo.partidoId || "").trim();
      const dispositivoId = String(cuerpo.dispositivoId || "").trim();
      const visto = Boolean(cuerpo.visto);

      if (!partidoId || !dispositivoId) {
        return responder({ error: "Faltan partidoId o dispositivoId" }, 400);
      }

      const clave = obtenerClave(partidoId, dispositivoId);

      if (visto) {
        await store.setJSON(clave, {
          partidoId,
          dispositivoId,
          visto: true,
          updatedAt: new Date().toISOString()
        });
      } else {
        await store.delete(clave);
      }

      const cantidad = await contarUsuariosDelPartido(store, partidoId);

      return responder({
        ok: true,
        partidoId,
        cantidad
      });
    }

    return responder({ error: "Método no permitido" }, 405);
  } catch (error) {
    return responder({
      error: "No se pudo procesar la solicitud",
      detalle: error.message
    }, 500);
  }
}
