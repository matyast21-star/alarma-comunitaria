// Worker de VECI+: /api/* lo atiende la API; el resto son los archivos de public/
import { api } from './api.js';

// Huella de la firma de la app Android (para que abra VECI+ a pantalla completa)
const HUELLA_APP = 'F2:4C:4E:65:C2:07:D9:CA:BA:AF:B8:AF:D9:0B:77:89:15:53:E2:61:45:4D:4E:DB:5E:D0:1C:17:AB:A3:78:05';
const APK = 'https://github.com/matyast21-star/alarma-comunitaria/releases/latest/download/veci.apk';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/.well-known/assetlinks.json') {
      return Response.json([{ relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: 'cl.fluva.veci', sha256_cert_fingerprints: [HUELLA_APP] } }]);
    }
    if (url.pathname === '/app' || url.pathname === '/app.apk') return Response.redirect(APK, 302);
    if (url.pathname.startsWith('/api/')) return api(request, env, url.pathname.slice(5).replace(/\/+$/, ''));
    return env.ASSETS.fetch(request);
  },
};
