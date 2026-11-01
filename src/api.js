// API de VECI+ (Cloudflare Worker). Usa un espacio KV enlazado como VECI_KV.
// Variable opcional: CODIGO_COMUNIDAD (si existe, se pide para registrarse y enviar alertas).
import { generarVapid, enviarPush } from './webpush.js';

const POR_LOTE = 40;            // notificaciones por invocación (límite gratis: 50 subpeticiones)
const CONTACTO = 'mailto:contacto@fluva.cl';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const recortar = (v, n) => String(v ?? '').slice(0, n);

async function hash(texto) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function vapid(kv) {
  let v = await kv.get('vapid', 'json');
  if (!v) { v = await generarVapid(); await kv.put('vapid', JSON.stringify(v)); }
  return v;
}

async function listarVecinos(kv) {
  const lista = []; let cursor;
  do {
    const r = await kv.list({ prefix: 'sub:', cursor });
    for (const k of r.keys) if (k.metadata) lista.push({ key: k.name, sub: { endpoint: k.metadata.e, keys: { p256dh: k.metadata.p, auth: k.metadata.a } } });
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return lista.sort((a, b) => a.key.localeCompare(b.key));
}

async function enviarLote(env, alerta, parte) {
  const v = await vapid(env.VECI_KV);
  const todos = (await listarVecinos(env.VECI_KV)).filter((x) => x.sub.endpoint !== alerta.endpoint);
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
  await env.VECI_KV.put('diagnostico', JSON.stringify({ fecha: new Date().toISOString(), alerta: alerta.id, parte, total: todos.length, enviados, resultados: resultados.slice(0, 20) }));
  return { enviados, partes: Math.ceil(todos.length / POR_LOTE), total: todos.length };
}

export async function api(request, env, ruta) {
  if (!env.VECI_KV) return json({ error: 'Falta configurar el espacio KV (VECI_KV) en Cloudflare' }, 500);
  const url = new URL(request.url);
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  const codigo = body.codigo ?? url.searchParams.get('codigo') ?? '';
  const codigoOk = !env.CODIGO_COMUNIDAD || codigo === env.CODIGO_COMUNIDAD;

  if (ruta === 'estado' && request.method === 'GET') {
    const vecinos = await listarVecinos(env.VECI_KV);
    return json({ vecinosRegistrados: vecinos.length, servicios: [...new Set(vecinos.map((x) => new URL(x.sub.endpoint).host))],
      pideCodigo: !!env.CODIGO_COMUNIDAD, ultimoEnvio: await env.VECI_KV.get('diagnostico', 'json') });
  }

  if (ruta === 'config' && request.method === 'GET') {
    const v = await vapid(env.VECI_KV);
    return json({ publicKey: v.publicKey, pideCodigo: !!env.CODIGO_COMUNIDAD });
  }

  if (!codigoOk) return json({ error: 'Código de comunidad incorrecto' }, 403);

  if (ruta === 'registro' && request.method === 'POST') {
    const s = body.sub;
    if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) return json({ error: 'Suscripción inválida' }, 400);
    const key = 'sub:' + await hash(s.endpoint);
    await env.VECI_KV.put(key, JSON.stringify({ nombre: recortar(body.nombre, 60), direccion: recortar(body.direccion, 100), fecha: Date.now() }),
      { metadata: { e: s.endpoint, p: s.keys.p256dh, a: s.keys.auth } });
    return json({ ok: true });
  }

  if (ruta === 'baja' && request.method === 'POST') {
    if (body.endpoint) await env.VECI_KV.delete('sub:' + await hash(body.endpoint));
    return json({ ok: true });
  }

  if (ruta === 'alerta' && request.method === 'POST') {
    const tipo = ['robo', 'inusual', 'grupo'].includes(body.tipo) ? body.tipo : 'grupo';
    const nombre = recortar(body.nombre || 'Vecino/a', 60), direccion = recortar(body.direccion, 100), mensaje = recortar(body.mensaje, 300);
    const lat = Number.isFinite(body.lat) ? body.lat : null, lng = Number.isFinite(body.lng) ? body.lng : null;
    const titulo = { robo: '🚨 ALERTA: ROBO / EMERGENCIA', inusual: '⚠️ Actividad inusual', grupo: '📢 Aviso a la comunidad' }[tipo];
    const cuerpo = `${nombre}${direccion ? ' — ' + direccion : ''}${mensaje ? ': ' + mensaje : ''}`;
    const alerta = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), tipo, titulo, cuerpo, nombre, direccion, mensaje, lat, lng, fecha: new Date().toISOString(), endpoint: body.endpoint || '' };
    await env.VECI_KV.put('alerta:' + alerta.id, JSON.stringify(alerta), { expirationTtl: 86400 * 7 });
    const recientes = (await env.VECI_KV.get('alertas', 'json')) || [];
    const { endpoint, ...publica } = alerta;
    await env.VECI_KV.put('alertas', JSON.stringify([publica, ...recientes].slice(0, 30)));
    const r = await enviarLote(env, alerta, 0);
    return json({ ok: true, id: alerta.id, partes: r.partes, enviados: r.enviados, total: r.total });
  }

  if (ruta === 'lote' && request.method === 'POST') {
    const alerta = await env.VECI_KV.get('alerta:' + recortar(body.id, 40), 'json');
    if (!alerta || Date.now() - Date.parse(alerta.fecha) > 5 * 60000) return json({ error: 'Alerta no encontrada o antigua' }, 404);
    const parte = Math.max(1, Math.min(100, parseInt(body.parte) || 1));
    return json(await enviarLote(env, alerta, parte));
  }

  if (ruta === 'alertas' && request.method === 'GET') {
    return json({ alertas: (await env.VECI_KV.get('alertas', 'json')) || [] });
  }

  return json({ error: 'Ruta no encontrada' }, 404);
}
