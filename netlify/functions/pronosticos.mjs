import { getStore } from "@netlify/blobs";

const MINUTOS_ANTES_DEL_PARTIDO = 5;

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
  return `usuarios/${encodeURIComponent(dispositivoId)}/pronosticos/${encodeURIComponent(partidoId)}`;
}

function validarGoles(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0 && numero <= 30;
}

function obtenerCierre(fechaHoraISO) {
  const inicio = new Date(fechaHoraISO);

  if (Number.isNaN(inicio.getTime())) {
    return null;
  }

  return new Date(inicio.getTime() - MINUTOS_ANTES_DEL_PARTIDO * 60 * 1000);
}

function estaBloqueado(fechaHoraISO) {
  const cierre = obtenerCierre(fechaHoraISO);
  return cierre ? Date.now() >= cierre.getTime() : true;
}

async function obtenerPronosticosDelUsuario(store, dispositivoId) {
  const prefix = `usuarios/${encodeURIComponent(dispositivoId)}/pronosticos/`;
  const { blobs } = await store.list({ prefix });
  const pronosticos = {};

  for (const blob of blobs) {
    const pronostico = await store.get(blob.key, { type: "json" });

    if (pronostico?.partidoId) {
      pronosticos[pronostico.partidoId] = {
        partidoId: pronostico.partidoId,
        golesLocal: pronostico.golesLocal,
        golesVisitante: pronostico.golesVisitante,
        local: pronostico.local,
        visitante: pronostico.visitante,
        fechaHoraISO: pronostico.fechaHoraISO,
        updatedAt: pronostico.updatedAt,
        bloqueado: estaBloqueado(pronostico.fechaHoraISO)
      };
    }
  }

  return pronosticos;
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: HEADERS
    });
  }

  const store = getStore({
    name: "pronosticos-mundial-2026",
    consistency: "strong"
  });

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const dispositivoId = String(url.searchParams.get("dispositivoId") || "").trim();

      if (!dispositivoId) {
        return responder({ error: "Falta dispositivoId" }, 400);
      }

      const pronosticos = await obtenerPronosticosDelUsuario(store, dispositivoId);
      return responder({ pronosticos });
    }

    if (request.method === "POST") {
      const cuerpo = await request.json();
      const partidoId = String(cuerpo.partidoId || "").trim();
      const dispositivoId = String(cuerpo.dispositivoId || "").trim();
      const fechaHoraISO = String(cuerpo.fechaHoraISO || "").trim();
      const local = String(cuerpo.local || "").trim();
      const visitante = String(cuerpo.visitante || "").trim();
      const golesLocal = Number(cuerpo.golesLocal);
      const golesVisitante = Number(cuerpo.golesVisitante);

      if (!partidoId || !dispositivoId || !fechaHoraISO) {
        return responder({ error: "Faltan datos del partido o del usuario" }, 400);
      }

      if (!validarGoles(golesLocal) || !validarGoles(golesVisitante)) {
        return responder({ error: "El resultado no es válido" }, 400);
      }

      if (estaBloqueado(fechaHoraISO)) {
        return responder({
          error: "La penca de este partido ya cerró. No se puede modificar."
        }, 423);
      }

      const clave = obtenerClave(partidoId, dispositivoId);
      const pronostico = {
        partidoId,
        dispositivoId,
        local,
        visitante,
        golesLocal,
        golesVisitante,
        fechaHoraISO,
        updatedAt: new Date().toISOString()
      };

      await store.setJSON(clave, pronostico);

      return responder({
        ok: true,
        pronostico: {
          ...pronostico,
          bloqueado: estaBloqueado(fechaHoraISO)
        }
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
