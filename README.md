# 🛡️ Alarma Comunitaria

Página web sencilla y gratuita para que los vecinos den aviso al grupo de WhatsApp de la comunidad.

- **🚨 Robo / Emergencia** (mantener 2 segundos): toma la ubicación GPS y abre WhatsApp con la alerta, el nombre de quien avisa y un enlace al mapa. Se elige el grupo y se envía.
- **📞 Llamar al 133**: botón aparte; solo llama al tocarlo.
- **⚠️ Actividad inusual**: aviso con texto y ubicación.

No necesita servidor ni base de datos: es un solo `index.html`.

## Publicar en Cloudflare Pages

Workers & Pages → Create → Pages → Connect to Git → elegir este repositorio.
- Framework preset: **None**
- Build command: *(vacío)*
- Build output directory: `/`

Cada cambio que se suba a `main` se publica solo.

## Consejo para los vecinos

En WhatsApp, abrir el grupo → Notificaciones → elegir un **tono propio** fuerte, para reconocer las alertas.
