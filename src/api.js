// API de VECI+ (Cloudflare Worker). Usa un espacio KV enlazado como VECI_KV.
//
// Varias localidades: cada una tiene su admin y su código para vecinos.
//   - Cualquiera puede SOLICITAR una localidad en /admin; queda "pendiente" hasta que el dueño la apruebe.
//   - El dueño entra a /admin con la clave secreta CLAVE_DUENO (Settings → Variables and Secrets).
//   - Variable opcional WHATSAPP_DUENO (ej. 56912345678): muestra un botón para avisarle de cada solicitud.
//   - Las Dichas es la localidad original ("lasdichas"); conserva el código de CODIGO_COMUNIDAD.
//
// Claves en KV:
//   loc:<id>            datos de la localidad (metadata con resumen para listar)
//   cod:<codigo>        → id de la localidad
//   v:<id>:<hash>       teléfono suscrito a esa localidad (metadata = suscripción push)
//   sub:<hash>          teléfonos antiguos de Las Dichas (antes de las localidades)
//   alertas:<id>        últimas 30 alertas de la localidad
//   alerta:<alertaId>   alerta completa (7 días), para enviar por lotes
//   diag:<id>           diagnóstico del último envío
import { generarVapid, enviarPush } from './webpush.js';

const POR_LOTE = 40;            // notificaciones por invocación (límite gratis: 50 subpeticiones)
const MAX_PENDIENTES = 15;      // evita que llenen el KV con solicitudes falsas
const CONTACTO = 'mailto:contacto@fluva.cl';
const LEGADO = 'lasdichas';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const recortar = (v, n) => String(v ?? '').trim().slice(0, n);
const normalizarCodigo = (c) => String(c ?? '').trim().toLowerCase().replace(/\s+/g, '').slice(0, 40);
const azar = (n) => { const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map((x) => 'abcdefghjkmnpqrstuvwxyz23456789'[x % 31]).join(''); };
const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'sector';

async function hash(texto) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function vapid(kv) {
  let v = await kv.get('vapid', 'json');
  if (!v) { v = await generarVapid(); await kv.put('vapid', JSON.stringify(v)); }
  return v;
}

// ---------- Localidades ----------
const cache = new Map(); // código → { loc, t } (ahorra lecturas de KV en las consultas cada 20 s)

async function guardarLoc(kv, loc) {
  await kv.put('loc:' + loc.id, JSON.stringify(loc), {
    metadata: { n: loc.nombre, c: loc.comuna, s: loc.estado, a: recortar(loc.admin, 40), t: recortar(loc.contacto, 30), f: loc.creada, k: loc.codigo },
  });
  cache.clear();
}

// Crea "Las Dichas" la primera vez, con el código que ya usan sus vecinos
async function asegurarLegado(env) {
  if (cache.has('#legado')) return;
  if (!(await env.VECI_KV.get('loc:' + LEGADO))) {
    const codigo = normalizarCodigo(env.CODIGO_COMUNIDAD) || LEGADO;
    await guardarLoc(env.VECI_KV, { id: LEGADO, nombre: 'Las Dichas', comuna: 'Casablanca', estado: 'activa', codigo,
      admin: 'Dueño', contacto: '', creada: Date.now(), claveHash: null });
    await env.VECI_KV.put('cod:' + codigo, LEGADO);
  }
  cache.set('#legado', { t: Date.now() });
}

async function locPorCodigo(env, codigo) {
  codigo = normalizarCodigo(codigo);
  if (!codigo) return null;
  const c = cache.get(codigo);
  if (c && Date.now() - c.t < 60000) return c.loc;
  const id = await env.VECI_KV.get('cod:' + codigo);
  const loc = id ? await env.VECI_KV.get('loc:' + id, 'json') : null;
  const ok = loc && loc.codigo === codigo ? loc : null;
  cache.set(codigo, { loc: ok, t: Date.now() });
  return ok;
}

async function nuevoCodigo(kv, nombre) {
  for (let i = 0; i < 10; i++) {
    const c = slug(nombre).slice(0, 10) + '-' + (1000 + Math.floor(Math.random() * 9000));
    if (!(await kv.get('cod:' + c))) return c;
  }
  return slug(nombre).slice(0, 8) + '-' + azar(6);
}

async function nuevaClaveAdmin(loc) {
  const clave = loc.id + '.' + azar(20);
  loc.claveHash = await hash(clave);
  return clave;
}

const publica = (loc) => ({ id: loc.id, nombre: loc.nombre, comuna: loc.comuna, estado: loc.estado, codigo: loc.codigo,
  admin: loc.admin, contacto: loc.contacto, creada: loc.creada });

// Admin de una localidad (con su clave) o el dueño (CLAVE_DUENO + cabecera X-Localidad)
async function autenticar(request, env) {
  const clave = request.headers.get('X-Clave') || '';
  const dueno = !!env.CLAVE_DUENO && clave === env.CLAVE_DUENO;
  const id = dueno ? request.headers.get('X-Localidad') : clave.split('.')[0];
  const loc = id ? await env.VECI_KV.get('loc:' + recortar(id, 40), 'json') : null;
  if (!loc) return { dueno, loc: null };
  if (dueno || (loc.claveHash && loc.claveHash === await hash(clave))) return { dueno, loc };
  return { dueno, loc: null };
}

// ---------- Vecinos ----------
async function listarVecinos(kv, locId) {
  const lista = [];
  const prefijos = ['v:' + locId + ':', ...(locId === LEGADO ? ['sub:'] : [])];
  for (const prefix of prefijos) {
    let cursor;
    do {
      const r = await kv.list({ prefix, cursor });
      for (const k of r.keys) if (k.metadata) lista.push({ key: k.name, sub: { endpoint: k.metadata.e, keys: { p256dh: k.metadata.p, auth: k.metadata.a } } });
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor);
  }
  return lista.sort((a, b) => a.key.localeCompare(b.key));
}

async function enviarLote(env, alerta, parte) {
  const v = await vapid(env.VECI_KV);
  const todos = (await listarVecinos(env.VECI_KV, alerta.loc)).filter((x) => x.sub.endpoint !== alerta.endpoint);
  const lote = todos.slice(parte * POR_LOTE, (parte + 1) * POR_LOTE);
  const payload = JSON.stringify({ id: alerta.id, tipo: alerta.tipo, titulo: alerta.titulo, cuerpo: alerta.cuerpo });
  let enviados = 0; const resultados = [];
  await Promise.all(lote.map(async (x) => {
    const servicio = new URL(x.sub.endpoint).host;
    try {
      const st = await enviarPush(x.sub, payload, v, CONTACTO);
      resultados.push({ servicio, st: st.status, detalle: st.status >= 300 ? st.detalle : '' });
      if (st.status === 404 || st.status === 410) await env.VECI_KV.delete(x.key); // suscripción caducada
      else if (st.status < 300) enviados++;
    } catch (e) { resultados.push({ servicio, st: 0, detalle: String(e).slice(0, 200) }); }
  }));
  await env.VECI_KV.put('diag:' + alerta.loc, JSON.stringify({ fecha: new Date().toISOString(), alerta: alerta.id, parte, total: todos.length, enviados, resultados: resultados.slice(0, 20) }));
  return { enviados, partes: Math.ceil(todos.length / POR_LOTE), total: todos.length };
}

async function borrarVecinos(kv, locId) {
  let borrados = 0, cursor;
  do {
    const r = await kv.list({ prefix: 'v:' + locId + ':', cursor });
    for (const k of r.keys) { if (borrados >= 800) return false; await kv.delete(k.name); borrados++; }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return true;
}

const estadoError = { pendiente: 'Esta localidad todavía está esperando aprobación.', pausada: 'Esta localidad está pausada. Habla con tu administrador.' };

// ---------- Rutas ----------
export async function api(request, env, ruta) {
  if (!env.VECI_KV) return json({ error: 'Falta configurar el espacio KV (VECI_KV) en Cloudflare' }, 500);
  const kv = env.VECI_KV;
  await asegurarLegado(env);
  const url = new URL(request.url);
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  // ----- Solicitar una localidad nueva (abierto; queda pendiente) -----
  if (ruta === 'solicitar' && request.method === 'POST') {
    const nombre = recortar(body.nombre, 40), comuna = recortar(body.comuna, 40), admin = recortar(body.admin, 60), contacto = recortar(body.contacto, 30);
    if (nombre.length < 3 || comuna.length < 3 || admin.length < 2 || contacto.length < 6) return json({ error: 'Completa todos los datos.' }, 400);
    let pendientes = 0, cursor;
    do { const r = await kv.list({ prefix: 'loc:', cursor }); pendientes += r.keys.filter((k) => k.metadata?.s === 'pendiente').length; cursor = r.list_complete ? null : r.cursor; } while (cursor);
    if (pendientes >= MAX_PENDIENTES) return json({ error: 'Hay muchas solicitudes en espera. Intenta de nuevo en unos días.' }, 429);
    let id = slug(nombre);
    for (let i = 2; await kv.get('loc:' + id); i++) id = slug(nombre).slice(0, 11) + i;
    const loc = { id, nombre, comuna, admin, contacto, estado: 'pendiente', creada: Date.now(), codigo: await nuevoCodigo(kv, nombre) };
    const clave = await nuevaClaveAdmin(loc);
    await guardarLoc(kv, loc);
    await kv.put('cod:' + loc.codigo, id);
    return json({ ok: true, clave, localidad: publica(loc), whatsappDueno: env.WHATSAPP_DUENO || null });
  }

  // ----- Panel del admin de una localidad -----
  if (ruta.startsWith('admin/')) {
    const { dueno, loc } = await autenticar(request, env);
    if (!loc) return json({ error: 'Clave de administrador incorrecta' }, 401);
    if (ruta === 'admin/panel' && request.method === 'GET') {
      const vecinos = await listarVecinos(kv, loc.id);
      const alertas = (await kv.get('alertas:' + loc.id, 'json')) || [];
      return json({ localidad: publica(loc), dueno, vecinos: vecinos.length, alertas: alertas.slice(0, 10) });
    }
    if (ruta === 'admin/codigo' && request.method === 'POST') {
      if (loc.id === LEGADO && env.CODIGO_COMUNIDAD && !dueno) return json({ error: 'Solo el dueño puede cambiar este código.' }, 403);
      const viejo = loc.codigo;
      loc.codigo = await nuevoCodigo(kv, loc.nombre);
      await kv.put('cod:' + loc.codigo, loc.id);
      await guardarLoc(kv, loc);
      await kv.delete('cod:' + viejo);
      return json({ ok: true, localidad: publica(loc) });
    }
    return json({ error: 'Ruta no encontrada' }, 404);
  }

  // ----- Panel del dueño -----
  if (ruta.startsWith('dueno/')) {
    if (!env.CLAVE_DUENO) return json({ error: 'Falta definir CLAVE_DUENO en Cloudflare (Settings → Variables and Secrets).' }, 500);
    if (request.headers.get('X-Clave') !== env.CLAVE_DUENO) return json({ error: 'Clave de dueño incorrecta' }, 401);
    if (ruta === 'dueno/localidades' && request.method === 'GET') {
      const lista = []; let cursor;
      do {
        const r = await kv.list({ prefix: 'loc:', cursor });
        for (const k of r.keys) { const m = k.metadata || {}; lista.push({ id: k.name.slice(4), nombre: m.n, comuna: m.c, estado: m.s, admin: m.a, contacto: m.t, creada: m.f, codigo: m.k }); }
        cursor = r.list_complete ? null : r.cursor;
      } while (cursor);
      return json({ localidades: lista.sort((a, b) => (a.estado === 'pendiente' ? 0 : 1) - (b.estado === 'pendiente' ? 0 : 1) || b.creada - a.creada) });
    }
    const loc = await kv.get('loc:' + recortar(body.id, 40), 'json');
    if (!loc) return json({ error: 'Localidad no encontrada' }, 404);
    if (ruta === 'dueno/estado' && request.method === 'POST') {
      if (!['activa', 'pausada'].includes(body.estado)) return json({ error: 'Estado inválido' }, 400);
      loc.estado = body.estado;
      await guardarLoc(kv, loc);
      return json({ ok: true, localidad: publica(loc) });
    }
    if (ruta === 'dueno/clave' && request.method === 'POST') {
      const clave = await nuevaClaveAdmin(loc);
      await guardarLoc(kv, loc);
      return json({ ok: true, clave, localidad: publica(loc) });
    }
    if (ruta === 'dueno/borrar' && request.method === 'POST') {
      if (loc.id === LEGADO) return json({ error: 'Las Dichas no se puede borrar (puedes pausarla).' }, 400);
      if (!(await borrarVecinos(kv, loc.id))) return json({ error: 'Quedan vecinos por borrar; vuelve a tocar Borrar.' }, 409);
      await Promise.all([kv.delete('cod:' + loc.codigo), kv.delete('alertas:' + loc.id), kv.delete('diag:' + loc.id)]);
      await kv.delete('loc:' + loc.id);
      cache.clear();
      return json({ ok: true });
    }
    return json({ error: 'Ruta no encontrada' }, 404);
  }

  // ----- App de vecinos: todo va con el código de su localidad -----
  const codigo = body.codigo ?? url.searchParams.get('codigo') ?? '';
  const loc = await locPorCodigo(env, codigo);

  if (ruta === 'config' && request.method === 'GET') {
    const v = await vapid(kv);
    return json({ publicKey: v.publicKey, pideCodigo: true, localidad: loc ? { nombre: loc.nombre, comuna: loc.comuna, estado: loc.estado } : null });
  }

  if (ruta === 'estado' && request.method === 'GET') {
    const l = loc || (await kv.get('loc:' + LEGADO, 'json'));
    const vecinos = await listarVecinos(kv, l.id);
    return json({ localidad: l.nombre, vecinosRegistrados: vecinos.length, servicios: [...new Set(vecinos.map((x) => new URL(x.sub.endpoint).host))],
      ultimoEnvio: loc ? await kv.get('diag:' + l.id, 'json') : undefined });
  }

  if (ruta === 'baja' && request.method === 'POST') {
    if (body.endpoint) {
      const h = await hash(body.endpoint);
      await kv.delete('v:' + (loc?.id || '_') + ':' + h);
      if (loc?.id === LEGADO) await kv.delete('sub:' + h);
    }
    return json({ ok: true });
  }

  if (!loc) return json({ error: 'Código de comunidad incorrecto' }, 403);
  if (loc.estado !== 'activa') return json({ error: estadoError[loc.estado] || 'Localidad no disponible' }, 403);

  if (ruta === 'registro' && request.method === 'POST') {
    const s = body.sub;
    if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) return json({ error: 'Suscripción inválida' }, 400);
    const h = await hash(s.endpoint);
    await kv.put('v:' + loc.id + ':' + h, JSON.stringify({ nombre: recortar(body.nombre, 60), direccion: recortar(body.direccion, 100), fecha: Date.now() }),
      { metadata: { e: s.endpoint, p: s.keys.p256dh, a: s.keys.auth } });
    if (loc.id === LEGADO) await kv.delete('sub:' + h); // teléfono antiguo: ya quedó con la clave nueva
    return json({ ok: true, localidad: { nombre: loc.nombre, comuna: loc.comuna } });
  }

  if (ruta === 'alerta' && request.method === 'POST') {
    const tipo = ['robo', 'inusual', 'grupo'].includes(body.tipo) ? body.tipo : 'grupo';
    const nombre = recortar(body.nombre || 'Vecino/a', 60), direccion = recortar(body.direccion, 100), mensaje = recortar(body.mensaje, 300);
    const lat = Number.isFinite(body.lat) ? body.lat : null, lng = Number.isFinite(body.lng) ? body.lng : null;
    const titulo = { robo: '🚨 ALERTA: ROBO / EMERGENCIA', inusual: '⚠️ Actividad inusual', grupo: '📢 Aviso a la comunidad' }[tipo];
    const cuerpo = `${nombre}${direccion ? ' — ' + direccion : ''}${mensaje ? ': ' + mensaje : ''}`;
    const alerta = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), loc: loc.id, tipo, titulo, cuerpo, nombre, direccion, mensaje, lat, lng, fecha: new Date().toISOString(), endpoint: body.endpoint || '' };
    await kv.put('alerta:' + alerta.id, JSON.stringify(alerta), { expirationTtl: 86400 * 7 });
    const recientes = (await kv.get('alertas:' + loc.id, 'json')) || [];
    const { endpoint, ...visible } = alerta;
    await kv.put('alertas:' + loc.id, JSON.stringify([visible, ...recientes].slice(0, 30)));
    const r = await enviarLote(env, alerta, 0);
    return json({ ok: true, id: alerta.id, partes: r.partes, enviados: r.enviados, total: r.total });
  }

  if (ruta === 'lote' && request.method === 'POST') {
    const alerta = await kv.get('alerta:' + recortar(body.id, 40), 'json');
    if (!alerta || alerta.loc !== loc.id || Date.now() - Date.parse(alerta.fecha) > 5 * 60000) return json({ error: 'Alerta no encontrada o antigua' }, 404);
    const parte = Math.max(1, Math.min(100, parseInt(body.parte) || 1));
    return json(await enviarLote(env, alerta, parte));
  }

  if (ruta === 'alertas' && request.method === 'GET') {
    let alertas = await kv.get('alertas:' + loc.id, 'json');
    if (!alertas && loc.id === LEGADO) alertas = await kv.get('alertas', 'json'); // historial anterior
    return json({ alertas: alertas || [] });
  }

  return json({ error: 'Ruta no encontrada' }, 404);
}
