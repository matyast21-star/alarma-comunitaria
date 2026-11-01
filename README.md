# 🛡️ Alarma Comunitaria

Página web sencilla y gratuita para que los vecinos den aviso al grupo de WhatsApp de la comunidad.

- **🚨 Robo / Emergencia** (mantener 2 segundos): toma la ubicación GPS y abre WhatsApp con la alerta, el nombre de quien avisa y un enlace al mapa. Se elige el grupo y se envía.
- **📞 Llamar al 133**: botón aparte; solo llama al tocarlo.
- **⚠️ Actividad inusual**: aviso con texto y ubicación.

Además, los vecinos que activan VECI+ en su teléfono reciben una **notificación de alarma** al instante (aunque tengan la página cerrada) y, al abrirla, suena la **sirena de VECI+** y ven el mapa.

## Publicar en Cloudflare Pages

Workers & Pages → Create → Pages → Connect to Git → este repositorio.
- Framework preset: **None** · Build command: *(vacío)* · Build output directory: `/`

### Activar las alarmas (una sola vez)
1. Cloudflare → **Storage & Databases → KV → Create** → nombre `veci-kv`.
2. Proyecto de Pages → **Settings → Bindings → Add → KV namespace**: nombre de variable `VECI_KV`, espacio `veci-kv`. Guardar.
3. **Deployments** → en el último despliegue, **Retry deployment**.

Opcional: variable de entorno `CODIGO_COMUNIDAD` para que solo quien tenga el código pueda activar alarmas y enviar avisos.

Todo funciona dentro del plan gratuito de Cloudflare.

## Estructura
- `index.html`, `sw.js`, `sirena.mp3`, íconos: la página.
- `functions/api/[[ruta]].js`: API (registro de teléfonos, alertas).
- `lib/webpush.js`: envío de notificaciones Web Push sin dependencias.
