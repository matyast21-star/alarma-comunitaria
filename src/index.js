// Worker de VECI+: /api/* lo atiende la API; el resto son los archivos de public/
import { api } from './api.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env, url.pathname.slice(5).replace(/\/+$/, ''));
    return env.ASSETS.fetch(request);
  },
};
