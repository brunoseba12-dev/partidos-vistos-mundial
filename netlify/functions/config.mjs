const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function responder(datos, status = 200) {
  return new Response(JSON.stringify(datos), { status, headers: HEADERS });
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: HEADERS });
  }

  if (request.method !== "GET") {
    return responder({ error: "Método no permitido" }, 405);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return responder({ error: "Faltan SUPABASE_URL o SUPABASE_ANON_KEY en Netlify" }, 500);
  }

  return responder({ supabaseUrl, supabaseAnonKey });
}
