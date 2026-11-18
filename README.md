# 🛡️ Alarma Comunitaria

Página web sencilla y gratuita para que los vecinos den aviso al grupo de WhatsApp de la comunidad.

- **🚨 Robo / Emergencia** (mantener 2 segundos): toma la ubicación GPS y abre WhatsApp con la alerta, el nombre de quien avisa y un enlace al mapa. Se elige el grupo y se envía.
- **📞 Llamar al 133**: botón aparte; solo llama al tocarlo.
- **⚠️ Actividad inusual**: aviso con texto y ubicación.

Además, los vecinos que activan VECI+ en su teléfono reciben una **notificación de alarma** al instante (aunque tengan la página cerrada) y, al abrirla, suena la **sirena de VECI+** y ven el mapa.

## Publicación en Cloudflare (Worker)

El proyecto está conectado a Cloudflare Workers desde este repositorio: cada cambio en `main` se publica solo (`npx wrangler deploy`).
La configuración está en `wrangler.jsonc`; el espacio KV `VECI_KV` se crea automáticamente en el primer despliegue.

## Varias localidades (sectores)

Cada sector tiene su administrador y su propio código para vecinos. Las alarmas solo suenan en los teléfonos del mismo sector.

1. Quien quiera VECI+ en su sector entra a **`/admin`** → *Quiero VECI+ en mi sector* y envía la solicitud. Recibe su **clave de administrador** (queda guardada en su teléfono).
2. El dueño entra a `/admin` → *Soy el dueño de VECI+* con la clave `CLAVE_DUENO` y **aprueba** (o rechaza) la solicitud. También puede pausar, borrar, ver el panel de cualquier sector o generar una clave nueva para un admin que la perdió.
3. Una vez aprobada, el admin ve en su panel el **código**, el enlace `/?codigo=…` y un **QR**, y lo comparte por WhatsApp. Puede cambiar el código si se filtra.

Variables en Cloudflare (Settings → Variables and Secrets):
- `CLAVE_DUENO` (**secreto**, obligatorio para el panel del dueño).
- `WHATSAPP_DUENO` (opcional, ej. `56912345678`): muestra al solicitante un botón para avisarte por WhatsApp.
- `CODIGO_COMUNIDAD`: código de Las Dichas, la localidad original (se conserva tal cual).

Para probar en local, crea `.dev.vars` con esas variables (no se sube al repositorio).

Todo funciona dentro del plan gratuito de Cloudflare.

## Estructura
- `public/`: la página (`index.html`, `sw.js`, `sirena.mp3`, logo e íconos).
- `src/index.js`: Worker; `/api/*` va a la API y el resto a `public/`.
- `src/api.js`: localidades, registro de teléfonos y alertas (KV).
- `public/admin.html`: solicitud de sectores, panel del admin y panel del dueño.
- `public/qrcode.min.js`: generador de QR (qrcodejs, MIT).
- `src/webpush.js`: envío de notificaciones Web Push sin dependencias.

## Probar en local
`npx wrangler dev`
