
const API_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const VISTOS_API_URL = "/.netlify/functions/vistos";
const PRONOSTICOS_API_URL = "/.netlify/functions/pronosticos";
const CONFIG_API_URL = "/.netlify/functions/config";
const ZONA_HORARIA_URUGUAY = "America/Montevideo";
const MINUTOS_CIERRE_PENCA = 5;

const partidosFallback = [
  { id: "demo-1", fecha: "2026-06-11", hora: "13:00 UTC-6", fase: "Group A", local: "Mexico", visitante: "South Africa", estadio: "Mexico City", marcador: null, estado: "Por jugar" },
  { id: "demo-2", fecha: "2026-06-11", hora: "20:00 UTC-6", fase: "Group A", local: "South Korea", visitante: "Czech Republic", estadio: "Guadalajara (Zapopan)", marcador: null, estado: "Por jugar" },
  { id: "demo-3", fecha: "2026-06-12", hora: "18:00 UTC-4", fase: "Group B", local: "Canada", visitante: "Qatar", estadio: "Toronto", marcador: null, estado: "Por jugar" },
  { id: "demo-4", fecha: "2026-06-13", hora: "15:00 UTC-4", fase: "Group C", local: "Brazil", visitante: "Morocco", estadio: "New York/New Jersey", marcador: null, estado: "Por jugar" },
  { id: "demo-5", fecha: "2026-06-13", hora: "18:00 UTC-7", fase: "Group D", local: "United States", visitante: "Paraguay", estadio: "Los Angeles", marcador: null, estado: "Por jugar" }
];

let supabaseClient = null;
let sesionActual = null;
let partidos = [];
let vistos = JSON.parse(localStorage.getItem("mundial2026PartidosVistos")) || [];
let conteosGlobales = {};
let conteosPendientes = new Set();
let pronosticos = {};
let pronosticosPendientes = new Set();
let aplicacionCargada = false;
let modoAuth = "login";

const listaPartidos = document.getElementById("listaPartidos");
const buscador = document.getElementById("buscador");
const filtroFase = document.getElementById("filtroFase");
const filtroVisto = document.getElementById("filtroVisto");
const limpiar = document.getElementById("limpiar");
const actualizar = document.getElementById("actualizar");
const totalPartidos = document.getElementById("totalPartidos");
const partidosVistos = document.getElementById("partidosVistos");
const partidosNoVistos = document.getElementById("partidosNoVistos");
const barraVistos = document.getElementById("barraVistos");
const estadoCarga = document.getElementById("estadoCarga");
const portalLogin = document.getElementById("portalLogin");
const appShell = document.getElementById("appShell");
const authMensaje = document.getElementById("authMensaje");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authModoLogin = document.getElementById("authModoLogin");
const authModoRegistro = document.getElementById("authModoRegistro");
const btnAuthPrincipal = document.getElementById("btnAuthPrincipal");
const authPasswordToggle = document.getElementById("authPasswordToggle");
const linkModoRegistro = document.getElementById("linkModoRegistro");
const portalCuentaTexto = document.getElementById("portalCuentaTexto");
const usuarioActual = document.getElementById("usuarioActual");
const btnSalir = document.getElementById("btnSalir");

function guardarVistos() {
  localStorage.setItem("mundial2026PartidosVistos", JSON.stringify(vistos));
}

function obtenerDispositivoId() {
  const clave = "mundial2026DispositivoId";
  let dispositivoId = localStorage.getItem(clave);

  if (!dispositivoId) {
    dispositivoId = window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(clave, dispositivoId);
  }

  return dispositivoId;
}

const DISPOSITIVO_ID = obtenerDispositivoId();

function escaparHTML(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function estaVisto(id) {
  return vistos.includes(id);
}

function textoConteoGlobal(cantidad) {
  const total = Number(cantidad) || 0;
  return total === 1 ? "1 USUARIO VIO ESTE PARTIDO" : `${total} USUARIOS VIERON ESTE PARTIDO`;
}

function tokenActual() {
  return sesionActual?.access_token || null;
}

async function fetchAutenticado(url, opciones = {}) {
  const token = tokenActual();
  const headers = new Headers(opciones.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, {
    ...opciones,
    headers
  });
}

function mostrarPortal() {
  portalLogin.classList.remove("oculto");
  appShell.classList.add("oculto");
}

function mostrarApp() {
  portalLogin.classList.add("oculto");
  appShell.classList.remove("oculto");
}

function ponerMensajeAuth(texto, tipo = "info") {
  if (!authMensaje) return;
  authMensaje.textContent = texto || "";
  authMensaje.dataset.tipo = tipo;
}

function traducirErrorAuth(error) {
  const mensaje = String(error?.message || "").toLowerCase();

  if (mensaje.includes("invalid login credentials")) {
    return "No pudimos entrar: el email o la contraseña no coinciden.";
  }

  if (mensaje.includes("email not confirmed")) {
    return "Tu cuenta existe, pero falta confirmar el email. Revisá tu correo y después volvé a iniciar sesión.";
  }

  if (mensaje.includes("user already registered") || mensaje.includes("already registered") || mensaje.includes("already exists")) {
    return "Ese email ya está registrado. Tocá ‘Iniciar sesión’ y entrá con tu contraseña.";
  }

  if (mensaje.includes("signup") && mensaje.includes("disabled")) {
    return "El registro por email está desactivado en Supabase. Activá Email en Authentication → Providers.";
  }

  if (mensaje.includes("password")) {
    return "La contraseña no cumple los requisitos. Usá al menos 6 caracteres.";
  }

  if (mensaje.includes("rate limit") || mensaje.includes("too many")) {
    return "Se hicieron muchos intentos seguidos. Esperá un minuto y probá de nuevo.";
  }

  return "No se pudo completar la acción. Probá de nuevo o revisá email y contraseña.";
}

function bloquearFormularioAuth(bloqueado) {
  authEmail.disabled = bloqueado;
  authPassword.disabled = bloqueado;
  btnAuthPrincipal.disabled = bloqueado;
  authModoLogin.disabled = bloqueado;
  authModoRegistro.disabled = bloqueado;
}

function cambiarModoAuth(modo) {
  modoAuth = modo;
  const esRegistro = modoAuth === "registro";

  authModoLogin.classList.toggle("tab-activa", !esRegistro);
  authModoRegistro.classList.toggle("tab-activa", esRegistro);
  btnAuthPrincipal.textContent = esRegistro ? "Crear cuenta" : "Ingresar";
  authPassword.autocomplete = esRegistro ? "new-password" : "current-password";

  if (portalCuentaTexto && linkModoRegistro) {
    portalCuentaTexto.textContent = esRegistro ? "¿Ya tenés cuenta?" : "¿No tenés cuenta?";
    linkModoRegistro.textContent = esRegistro ? "Iniciar sesión" : "Registrate acá";
  }

  ponerMensajeAuth(
    esRegistro
      ? "Completá los datos y tocá Crear cuenta."
      : "Ingresá con tu email y contraseña.",
    "info"
  );
}

function actualizarUIAuth() {
  if (sesionActual?.user) {
    usuarioActual.textContent = sesionActual.user.email || sesionActual.user.id;
  } else {
    usuarioActual.textContent = "";
  }
}

async function cargarAppSiCorresponde() {
  if (!sesionActual?.user) return;

  mostrarApp();
  actualizarUIAuth();

  if (!aplicacionCargada) {
    aplicacionCargada = true;
    await cargarPartidos();
  } else {
    await cargarPronosticos();
    mostrarPartidos();
  }
}

async function inicializarSupabase() {
  mostrarPortal();
  bloquearFormularioAuth(true);
  ponerMensajeAuth("Preparando acceso seguro...", "info");

  try {
    const respuesta = await fetch(CONFIG_API_URL, { cache: "no-store" });
    const config = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok || !config.loginDisponible || !config.supabaseUrl || !config.supabaseAnonKey) {
      bloquearFormularioAuth(true);
      ponerMensajeAuth("El acceso no está disponible ahora. Probá de nuevo en unos minutos.", "error");
      return;
    }

    if (!window.supabase?.createClient) {
      bloquearFormularioAuth(true);
      ponerMensajeAuth("No se pudo cargar el módulo de login. Actualizá la página y probá de nuevo.", "error");
      return;
    }

    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

    const { data } = await supabaseClient.auth.getSession();
    sesionActual = data.session;
    bloquearFormularioAuth(false);
    cambiarModoAuth("login");

    supabaseClient.auth.onAuthStateChange(async (_evento, session) => {
      sesionActual = session;
      actualizarUIAuth();

      if (sesionActual?.user) {
        pronosticos = {};
        await cargarAppSiCorresponde();
      } else {
        pronosticos = {};
        aplicacionCargada = false;
        mostrarPortal();
        cambiarModoAuth("login");
      }
    });

    if (sesionActual?.user) {
      await cargarAppSiCorresponde();
    } else {
      mostrarPortal();
    }
  } catch (error) {
    console.error(error);
    bloquearFormularioAuth(true);
    ponerMensajeAuth("El acceso no está disponible ahora. Probá de nuevo en unos minutos.", "error");
  }
}

function obtenerCredencialesAuth() {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!email || !password) {
    ponerMensajeAuth("Poné email y contraseña para continuar.", "error");
    return null;
  }

  if (!emailValido) {
    ponerMensajeAuth("Ese email no parece válido. Revisalo y probá de nuevo.", "error");
    return null;
  }

  if (password.length < 6) {
    ponerMensajeAuth("La contraseña debe tener al menos 6 caracteres.", "error");
    return null;
  }

  return { email, password };
}

async function ingresar() {
  if (!supabaseClient) {
    ponerMensajeAuth("El login todavía no está pronto. Actualizá la página y probá de nuevo.", "error");
    return;
  }

  const credenciales = obtenerCredencialesAuth();
  if (!credenciales) return;

  bloquearFormularioAuth(true);
  ponerMensajeAuth("Ingresando...", "info");

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword(credenciales);

    if (error) {
      ponerMensajeAuth(traducirErrorAuth(error), "error");
      return;
    }

    sesionActual = data.session;
    ponerMensajeAuth("Listo, entrando...", "ok");
    await cargarAppSiCorresponde();
  } catch (error) {
    console.error(error);
    ponerMensajeAuth("No se pudo conectar con Supabase. Revisá internet y probá de nuevo.", "error");
  } finally {
    bloquearFormularioAuth(false);
  }
}

async function crearCuenta() {
  if (!supabaseClient) {
    ponerMensajeAuth("El login todavía no está pronto. Actualizá la página y probá de nuevo.", "error");
    return;
  }

  const credenciales = obtenerCredencialesAuth();
  if (!credenciales) return;

  bloquearFormularioAuth(true);
  ponerMensajeAuth("Creando cuenta...", "info");

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      ...credenciales,
      options: {
        emailRedirectTo: window.location.origin
      }
    });

    if (error) {
      ponerMensajeAuth(traducirErrorAuth(error), "error");
      return;
    }

    if (data.session) {
      sesionActual = data.session;
      ponerMensajeAuth("Cuenta creada. Entrando...", "ok");
      await cargarAppSiCorresponde();
      return;
    }

    cambiarModoAuth("login");
    ponerMensajeAuth("Cuenta creada. Si Supabase te manda un mail, confirmalo. Después tocá Iniciar sesión.", "ok");
  } catch (error) {
    console.error(error);
    ponerMensajeAuth("No se pudo conectar con Supabase. Revisá internet y probá de nuevo.", "error");
  } finally {
    bloquearFormularioAuth(false);
  }
}

async function enviarAuth(evento) {
  evento?.preventDefault();

  if (modoAuth === "registro") {
    await crearCuenta();
  } else {
    await ingresar();
  }
}

async function salir() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  sesionActual = null;
  pronosticos = {};
  aplicacionCargada = false;
  mostrarPortal();
  cambiarModoAuth("login");
}

async function cargarConteosGlobales() {
  try {
    const respuesta = await fetch(VISTOS_API_URL, { cache: "no-store" });
    if (!respuesta.ok) throw new Error("No se pudieron cargar los vistos globales");

    const datos = await respuesta.json();
    const nuevosConteos = datos.conteos || {};

    partidos.forEach(partido => {
      if (!conteosPendientes.has(partido.id)) {
        conteosGlobales[partido.id] = nuevosConteos[partido.id] || 0;
      }
    });
  } catch (error) {
    console.warn("No se pudieron cargar los vistos globales", error);
  }
}

function aplicarConteoOptimista(id, nuevoEstado) {
  const cantidadActual = Number(conteosGlobales[id]) || 0;
  const variacion = nuevoEstado ? 1 : -1;
  conteosGlobales[id] = Math.max(0, cantidadActual + variacion);
}

async function actualizarVistoGlobal(id, visto) {
  const respuesta = await fetchAutenticado(VISTOS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partidoId: id, dispositivoId: DISPOSITIVO_ID, visto })
  });

  if (!respuesta.ok) throw new Error("No se pudo guardar el visto global");

  const datos = await respuesta.json();
  conteosGlobales[id] = datos.cantidad || 0;
}

async function cambiarVisto(id) {
  const estabaVisto = estaVisto(id);
  const nuevoEstado = !estabaVisto;
  const cantidadAnterior = conteosGlobales[id] || 0;

  if (nuevoEstado) {
    vistos.push(id);
  } else {
    vistos = vistos.filter(partidoId => partidoId !== id);
  }

  aplicarConteoOptimista(id, nuevoEstado);
  conteosPendientes.add(id);
  guardarVistos();
  mostrarRecuento();
  mostrarPartidos();

  try {
    await actualizarVistoGlobal(id, nuevoEstado);
  } catch (error) {
    console.error(error);
    conteosGlobales[id] = cantidadAnterior;

    if (nuevoEstado) {
      vistos = vistos.filter(partidoId => partidoId !== id);
    } else if (!vistos.includes(id)) {
      vistos.push(id);
    }

    guardarVistos();
    mostrarRecuento();
    alert("No se pudo actualizar el contador global. Probá de nuevo en unos segundos.");
  } finally {
    conteosPendientes.delete(id);
    mostrarPartidos();
  }
}

async function sincronizarConteosGlobales() {
  if (!partidos.length) return;
  await cargarConteosGlobales();
  mostrarPartidos();
}

async function cargarPronosticos() {
  if (!sesionActual?.access_token) {
    pronosticos = {};
    return;
  }

  try {
    const respuesta = await fetchAutenticado(PRONOSTICOS_API_URL, { cache: "no-store" });
    if (!respuesta.ok) throw new Error("No se pudieron cargar pronósticos");

    const datos = await respuesta.json();
    pronosticos = datos.pronosticos || {};
  } catch (error) {
    console.warn("No se pudieron cargar los pronósticos", error);
  }
}

function crearId(partido, indice) {
  const idEstable = `${partido.date || ""}-${partido.time || ""}-${partido.team1 || ""}-${partido.team2 || ""}`.trim();
  return idEstable || `partido-${indice + 1}`;
}

function obtenerMarcador(partido) {
  if (partido.score && partido.score.ft) {
    return `${partido.score.ft[0]} : ${partido.score.ft[1]}`;
  }
  return partido.marcador || null;
}

function obtenerEstado(partido) {
  if (partido.score && partido.score.ft) return "Finalizado";
  return partido.estado || "Por jugar";
}

function parsearFechaHora(fecha, hora) {
  if (!fecha || fecha === "Sin fecha" || !hora || hora === "Horario a confirmar") return null;

  const textoHora = String(hora).trim();
  const partes = textoHora.match(/(\d{1,2}):(\d{2})(?:\s*(?:UTC|GMT)\s*([+-]\d{1,2})(?::?(\d{2}))?)?/i);
  if (!partes) return null;

  const horas = partes[1].padStart(2, "0");
  const minutos = partes[2];
  const offsetHoras = partes[3];
  const offsetMinutos = partes[4] || "00";

  if (offsetHoras) {
    const signo = offsetHoras.startsWith("-") ? "-" : "+";
    const horasOffset = offsetHoras.replace("+", "").replace("-", "").padStart(2, "0");
    return new Date(`${fecha}T${horas}:${minutos}:00${signo}${horasOffset}:${offsetMinutos}`);
  }

  return new Date(`${fecha}T${horas}:${minutos}:00Z`);
}

function agregarFechaHoraUruguay(partido) {
  return {
    ...partido,
    fechaHora: parsearFechaHora(partido.fecha, partido.hora)
  };
}

function adaptarPartido(partido, indice) {
  const partidoAdaptado = {
    id: partido.id || crearId(partido, indice),
    fecha: partido.date || "Sin fecha",
    hora: partido.time || "Horario a confirmar",
    fase: partido.group || partido.round || "Fase a confirmar",
    local: partido.team1 || "Equipo por definir",
    visitante: partido.team2 || "Equipo por definir",
    estadio: partido.ground || "Sede a confirmar",
    marcador: obtenerMarcador(partido),
    estado: obtenerEstado(partido)
  };

  return agregarFechaHoraUruguay(partidoAdaptado);
}

async function cargarPartidos() {
  estadoCarga.textContent = "Cargando partidos reales...";
  listaPartidos.innerHTML = `<div class="sin-resultados">Cargando lista...</div>`;

  try {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), 6000);
    const respuesta = await fetch(API_URL, { signal: controlador.signal, cache: "no-store" });
    clearTimeout(temporizador);

    if (!respuesta.ok) throw new Error("No se pudo cargar la API");

    const datos = await respuesta.json();
    partidos = datos.matches.map(adaptarPartido);

    estadoCarga.textContent = `Conectado. Última carga: ${new Date().toLocaleString("es-UY", { timeZone: ZONA_HORARIA_URUGUAY })}.`;
  } catch (error) {
    partidos = partidosFallback.map(agregarFechaHoraUruguay);
    estadoCarga.textContent = "No se pudo conectar ahora. Mostrando datos de ejemplo.";
  }

  ordenarPartidosPorDiaYHora();
  cargarFases();
  await cargarConteosGlobales();
  await cargarPronosticos();
  mostrarRecuento();
  mostrarPartidos();
}

function ordenarPartidosPorDiaYHora() {
  partidos.sort((a, b) => {
    const fechaA = a.fechaHora ? a.fechaHora.getTime() : new Date(a.fecha).getTime();
    const fechaB = b.fechaHora ? b.fechaHora.getTime() : new Date(b.fecha).getTime();
    return fechaA - fechaB;
  });
}

function cargarFases() {
  const faseActual = filtroFase.value;
  const fases = [...new Set(partidos.map(partido => partido.fase))].sort();

  filtroFase.innerHTML = `<option value="todos">Todas las fases</option>` +
    fases.map(fase => `<option value="${escaparHTML(fase)}">${escaparHTML(fase)}</option>`).join("");

  if (["todos", ...fases].includes(faseActual)) filtroFase.value = faseActual;
}

function mostrarRecuento() {
  const total = partidos.length;
  const vistosTotal = partidos.filter(partido => estaVisto(partido.id)).length;
  const noVistos = total - vistosTotal;
  const porcentaje = total ? Math.round((vistosTotal / total) * 100) : 0;

  totalPartidos.textContent = total;
  partidosVistos.textContent = vistosTotal;
  partidosNoVistos.textContent = noVistos;
  barraVistos.style.width = `${porcentaje}%`;
}

function formatearFechaUruguay(partido) {
  const fecha = partido.fechaHora;
  if (!fecha) return formatearFechaSimple(partido.fecha);
  return fecha.toLocaleDateString("es-UY", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: ZONA_HORARIA_URUGUAY
  });
}

function formatearHoraUruguay(partido) {
  const fecha = partido.fechaHora;
  if (!fecha) return partido.hora;
  return `${fecha.toLocaleTimeString("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_HORARIA_URUGUAY
  })} UY`;
}

function formatearFechaSimple(fecha) {
  if (!fecha || fecha === "Sin fecha") return fecha;
  const fechaObj = new Date(`${fecha}T00:00:00`);
  return fechaObj.toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric" });
}

function cierrePenca(partido) {
  if (!partido.fechaHora) return null;
  return new Date(partido.fechaHora.getTime() - MINUTOS_CIERRE_PENCA * 60 * 1000);
}

function estaPencaCerrada(partido) {
  const cierre = cierrePenca(partido);
  return cierre ? Date.now() >= cierre.getTime() : true;
}

function textoCierre(partido) {
  const cierre = cierrePenca(partido);
  if (!cierre) return "Horario no confirmado: no se puede guardar todavía.";
  return `Cierra ${cierre.toLocaleDateString("es-UY", { day: "2-digit", month: "short", timeZone: ZONA_HORARIA_URUGUAY })} a las ${cierre.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA_HORARIA_URUGUAY })} UY.`;
}

function crearPenca(partido) {
  const pronostico = pronosticos[partido.id] || {};
  const cerrada = estaPencaCerrada(partido);
  const logueado = Boolean(sesionActual?.user);
  const pendiente = pronosticosPendientes.has(partido.id);
  const disabled = !logueado || cerrada || pendiente;
  const idSeguro = encodeURIComponent(partido.id);

  let ayuda = textoCierre(partido);
  if (!logueado) ayuda = "Iniciá sesión para guardar tu pronóstico.";
  if (cerrada && pronostico.local !== undefined) ayuda = `Penca cerrada. Tu jugada quedó: ${pronostico.local} - ${pronostico.visitante}.`;

  return `
    <div class="penca">
      <div class="penca-titulo">
        <span>Mi penca</span>
        <span class="penca-badge ${cerrada ? "cerrada" : ""}">${cerrada ? "Cerrada" : "Abierta"}</span>
      </div>
      <div class="penca-form">
        <input data-pron-local="${idSeguro}" type="number" min="0" max="99" value="${escaparHTML(pronostico.local ?? "")}" ${disabled ? "disabled" : ""} />
        <span>-</span>
        <input data-pron-visitante="${idSeguro}" type="number" min="0" max="99" value="${escaparHTML(pronostico.visitante ?? "")}" ${disabled ? "disabled" : ""} />
        <button data-guardar-pronostico="${idSeguro}" ${disabled ? "disabled" : ""}>Guardar</button>
      </div>
      <div class="penca-ayuda">${escaparHTML(ayuda)}</div>
    </div>
  `;
}

function crearTarjeta(partido) {
  const visto = estaVisto(partido.id);
  const cantidadGlobal = conteosGlobales[partido.id] || 0;
  const actualizandoConteo = conteosPendientes.has(partido.id);
  const idSeguro = encodeURIComponent(partido.id);

  return `
    <article class="partido ${visto ? "visto-ok" : ""}">
      <div class="fecha">
        <strong>${escaparHTML(formatearFechaUruguay(partido))}</strong>
        ${escaparHTML(formatearHoraUruguay(partido))}
      </div>

      <div class="equipos">
        <div class="fase">${escaparHTML(partido.fase)}</div>
        <div class="cruce">
          <span>${escaparHTML(partido.local)}</span>
          <span class="vs">vs</span>
          <span>${escaparHTML(partido.visitante)}</span>
        </div>
        <div class="estadio">📍 ${escaparHTML(partido.estadio)}</div>
      </div>

      <div class="resultado">
        <div class="marcador">${escaparHTML(partido.marcador || "- : -")}</div>
        <div class="estado">${escaparHTML(partido.estado)}</div>
      </div>

      <div class="visto-bloque">
        <label class="visto">
          <input type="checkbox" data-visto="${idSeguro}" ${visto ? "checked" : ""} />
          VISTO
        </label>
        <div class="conteo-global ${actualizandoConteo ? "actualizando" : ""}">${escaparHTML(textoConteoGlobal(cantidadGlobal))}</div>
      </div>

      ${crearPenca(partido)}
    </article>
  `;
}

function mostrarPartidos() {
  const textoBuscado = buscador.value.toLowerCase().trim();
  const faseElegida = filtroFase.value;
  const vistoElegido = filtroVisto.value;

  const partidosFiltrados = partidos.filter(partido => {
    const coincideTexto =
      partido.local.toLowerCase().includes(textoBuscado) ||
      partido.visitante.toLowerCase().includes(textoBuscado) ||
      partido.estadio.toLowerCase().includes(textoBuscado);

    const coincideFase = faseElegida === "todos" || partido.fase === faseElegida;
    const coincideVisto =
      vistoElegido === "todos" ||
      (vistoElegido === "vistos" && estaVisto(partido.id)) ||
      (vistoElegido === "no-vistos" && !estaVisto(partido.id));

    return coincideTexto && coincideFase && coincideVisto;
  });

  partidosFiltrados.sort((a, b) => {
    const fechaA = a.fechaHora ? a.fechaHora.getTime() : new Date(a.fecha).getTime();
    const fechaB = b.fechaHora ? b.fechaHora.getTime() : new Date(b.fecha).getTime();
    return fechaA - fechaB;
  });

  if (partidosFiltrados.length === 0) {
    listaPartidos.innerHTML = `<div class="sin-resultados">No encontré partidos con ese filtro.</div>`;
    return;
  }

  listaPartidos.innerHTML = partidosFiltrados.map(crearTarjeta).join("");
}

async function guardarPronostico(partidoId) {
  if (!sesionActual?.user) {
    alert("Tenés que iniciar sesión para guardar la penca.");
    return;
  }

  const partido = partidos.find(item => item.id === partidoId);
  if (!partido) return;

  if (estaPencaCerrada(partido)) {
    alert("La penca de este partido ya cerró.");
    mostrarPartidos();
    return;
  }

  const idSeguro = encodeURIComponent(partidoId);
  const inputLocal = document.querySelector(`[data-pron-local="${CSS.escape(idSeguro)}"]`);
  const inputVisitante = document.querySelector(`[data-pron-visitante="${CSS.escape(idSeguro)}"]`);
  const local = Number(inputLocal?.value);
  const visitante = Number(inputVisitante?.value);

  if (!Number.isInteger(local) || !Number.isInteger(visitante) || local < 0 || visitante < 0) {
    alert("Poné goles válidos para los dos equipos.");
    return;
  }

  pronosticosPendientes.add(partidoId);
  mostrarPartidos();

  try {
    const respuesta = await fetchAutenticado(PRONOSTICOS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partidoId,
        local,
        visitante,
        fechaHoraISO: partido.fechaHora ? partido.fechaHora.toISOString() : null,
        partido: {
          local: partido.local,
          visitante: partido.visitante,
          fecha: partido.fecha,
          hora: partido.hora,
          fase: partido.fase
        }
      })
    });

    const datos = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(datos.error || "No se pudo guardar el pronóstico");
    }

    pronosticos[partidoId] = datos.pronostico;
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    pronosticosPendientes.delete(partidoId);
    mostrarPartidos();
  }
}

buscador.addEventListener("input", mostrarPartidos);
filtroFase.addEventListener("change", mostrarPartidos);
filtroVisto.addEventListener("change", mostrarPartidos);

limpiar.addEventListener("click", () => {
  buscador.value = "";
  filtroFase.value = "todos";
  filtroVisto.value = "todos";
  mostrarPartidos();
});

actualizar.addEventListener("click", cargarPartidos);
authForm?.addEventListener("submit", enviarAuth);
btnAuthPrincipal.addEventListener("click", (evento) => {
  if (!authForm) enviarAuth(evento);
});
authModoLogin.addEventListener("click", () => cambiarModoAuth("login"));
authModoRegistro.addEventListener("click", () => cambiarModoAuth("registro"));
linkModoRegistro?.addEventListener("click", () => cambiarModoAuth(modoAuth === "registro" ? "login" : "registro"));
authPasswordToggle?.addEventListener("click", () => {
  const mostrando = authPassword.type === "text";
  authPassword.type = mostrando ? "password" : "text";
  authPasswordToggle.setAttribute("aria-label", mostrando ? "Mostrar contraseña" : "Ocultar contraseña");
});
btnSalir.addEventListener("click", salir);

authPassword.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") enviarAuth(evento);
});
authEmail.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") enviarAuth(evento);
});

listaPartidos.addEventListener("change", (evento) => {
  const input = evento.target.closest("[data-visto]");
  if (!input) return;
  cambiarVisto(decodeURIComponent(input.dataset.visto));
});

listaPartidos.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-guardar-pronostico]");
  if (!boton) return;
  guardarPronostico(decodeURIComponent(boton.dataset.guardarPronostico));
});

setInterval(cargarPartidos, 30 * 60 * 1000);
setInterval(sincronizarConteosGlobales, 10 * 1000);
setInterval(mostrarPartidos, 60 * 1000);

(async function iniciar() {
  await inicializarSupabase();
})();
