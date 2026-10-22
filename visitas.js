/* Contador de visitas de Somos Aurora: avisa a /api/track que se abrió esta página.
   Sin datos personales: solo la página, de dónde llegó y un código anónimo al azar guardado en
   este navegador (para contar personas únicas). Si algo falla, no pasa nada: la página sigue igual.
   El panel /admin/ nunca se cuenta. */
(function () {
  try {
    var ruta = location.pathname || '/';
    if (/^\/admin(\/|\.html|$)/i.test(ruta)) return;
    var vid = '';
    try {
      vid = localStorage.getItem('aurora_vid') || '';
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(vid)) {
        vid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
        localStorage.setItem('aurora_vid', vid);
      }
    } catch (e) { vid = ''; } // incógnito o almacenamiento bloqueado: la visita cuenta igual
    var cuerpo = JSON.stringify({ path: ruta, vid: vid, ref: document.referrer || '' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([cuerpo], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo, keepalive: true, credentials: 'same-origin' }).catch(function () {});
    }
  } catch (e) { /* nunca afecta la página */ }
})();
