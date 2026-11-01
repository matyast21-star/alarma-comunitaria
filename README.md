# 🛡️ Alarma Comunitaria

Página web sencilla y gratuita para que los vecinos den aviso al grupo de WhatsApp de la comunidad.

- **🚨 Robo / Emergencia** (mantener 2 segundos): toma la ubicación GPS y abre WhatsApp con la alerta, el nombre de quien avisa y un enlace al mapa. Se elige el grupo y se envía.
- **📞 Llamar al 133**: botón aparte; solo llama al tocarlo.
- **⚠️ Actividad inusual**: aviso con texto y ubicación.

Además, los vecinos que activan VECI+ en su teléfono reciben una **notificación de alarma** al instante (aunque tengan la página cerrada) y, al abrirla, suena la **sirena de VECI+** y ven el mapa.

## Publicación en Cloudflare (Worker)

El proyecto está conectado a Cloudflare Workers desde este repositorio: cada cambio en `main` se publica solo (`npx wrangler deploy`).
La configuración está en `wrangler.jsonc`; el espacio KV `VECI_KV` se crea automáticamente en el primer despliegue.

Opcional: variable `CODIGO_COMUNIDAD` (Settings → Variables and Secrets) para que solo quien tenga el código pueda activar alarmas y enviar avisos.

Todo funciona dentro del plan gratuito de Cloudflare.

## Estructura
- `public/`: la página (`index.html`, `sw.js`, `sirena.mp3`, logo e íconos).
- `src/index.js`: Worker; `/api/*` va a la API y el resto a `public/`.
- `src/api.js`: registro de teléfonos y alertas (KV).
- `src/webpush.js`: envío de notificaciones Web Push sin dependencias.

## Probar en local
`npx wrangler dev`
