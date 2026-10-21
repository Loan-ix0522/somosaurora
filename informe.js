/* Informe ciudadano (informe-demo.html): dibuja lo que da /api/informe y los comentarios destacados que
   publica el equipo (/api/featured).
   · Modo "informe": el último informe publicado (cada 5 días solo, o el que prepara el equipo desde /admin/),
     con las opiniones nuevas desde su corte y cuándo sale el próximo.
   · Modo "en-curso": mientras no haya ninguno publicado, el conteo en vivo de los últimos 30 días.
   Si algo falla, la página lo dice y no se rompe. */
(function () {
  var caja = document.getElementById('informe-datos');
  if (!caja) return;
  var zonaCitas = document.getElementById('informe-citas');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function opiniones(n) { return n + (n === 1 ? ' opinión' : ' opiniones'); }

  // Fecha y hora de Ecuador (UTC-5, sin horario de verano), sin depender de la zona del aparato.
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function ecuador(cuando) {
    var ms = typeof cuando === 'number' ? cuando : Date.parse(cuando);
    if (cuando == null || isNaN(ms)) return null;
    var d = new Date(ms - 5 * 3600 * 1000);
    var dos = function (n) { return (n < 10 ? '0' : '') + n; };
    return { dia: d.getUTCDate() + ' ' + MESES[d.getUTCMonth()], hora: dos(d.getUTCHours()) + ':' + dos(d.getUTCMinutes()) };
  }

  function errorHtml() {
    return '<p class="estado">No pudimos cargar los porcentajes en este momento. Intenta de nuevo en unos minutos.</p>';
  }

  function tarjetasHtml(temas) {
    var con = temas.filter(function (t) { return t.total > 0; });
    var sin = temas.filter(function (t) { return !(t.total > 0); });
    var tarjetas = con.map(function (t) {
      var p = Number(t.porcentaje) || 0;
      return '<div class="card"><div class="num">' + p + '%</div><b>' + esc(t.tema) + '</b>' +
        '<span class="cant">' + opiniones(Number(t.total) || 0) + '</span>' +
        '<div class="bar" role="img" aria-label="' + p + ' por ciento"><i style="width:' + p + '%"></i></div></div>';
    }).join('');
    return '<div class="grid">' + tarjetas + '</div>' +
      (sin.length ? '<p class="sin">Sin opiniones por ahora: ' + sin.map(function (t) { return esc(t.tema); }).join(', ') + '.</p>' : '');
  }

  // "del 16 oct al 21 oct" (o "el 26 oct" si es un solo día). El corte es exclusivo: el último día
  // incluido es el del instante anterior (un informe que corta a la medianoche termina el día anterior).
  function periodo(desdeIso, hastaIso) {
    var a = ecuador(desdeIso), hastaMs = Date.parse(hastaIso);
    var b = isNaN(hastaMs) ? null : ecuador(hastaMs - 1);
    if (!a || !b) return '';
    return a.dia === b.dia ? 'el ' + esc(a.dia) : 'del ' + esc(a.dia) + ' al ' + esc(b.dia);
  }

  // Conteo en vivo de los últimos 30 días (todavía no hay un informe publicado).
  function enCursoHtml(d) {
    var total = Number(d.total) || 0;
    var desde = ecuador(d.desde), hasta = ecuador(d.actualizado);
    var meta = '<p class="meta"><b>' + opiniones(total) + '</b>' +
      (desde && hasta ? ' · del ' + esc(desde.dia) + ' al ' + esc(hasta.dia) : '') +
      (hasta ? ' · actualizado el ' + esc(hasta.dia) + ' a las ' + esc(hasta.hora) : '') + '</p>';
    var nota = '<p class="aviso">Todavía no se ha publicado el primer informe. Mientras tanto, estos porcentajes se calculan con las opiniones de los últimos 30 días y se ponen al día solos. El informe oficial sale cada 5 días.</p>';
    if (!total) {
      return meta + nota + '<p class="estado">Todavía no hay opiniones en este periodo. En cuanto la comunidad envíe las primeras, aparecerán aquí.</p>';
    }
    return meta + nota +
      (total < 20 ? '<p class="aviso">Todavía son pocas opiniones, así que los porcentajes pueden moverse bastante. Se irán afinando con cada opinión nueva.</p>' : '') +
      tarjetasHtml(d.temas);
  }

  // Lo que viene después del informe: cuántas opiniones han llegado desde su corte y cuándo sale el próximo.
  function siguienteHtml(d) {
    var min = Number(d.minimo) || 10, partes = [];
    if (typeof d.nuevas === 'number' && isFinite(d.nuevas) && d.nuevas >= 0) {
      partes.push(d.nuevas === 0 ? 'Todavía no han llegado opiniones nuevas desde este informe.'
        : 'Desde este informe ' + (d.nuevas === 1 ? 'ha llegado 1 opinión nueva' : 'han llegado ' + d.nuevas + ' opiniones nuevas') + '.');
    }
    var prox = ecuador(d.proximo);
    if (prox) {
      var tocaYa = Date.parse(d.proximo) <= Date.now();
      var bastan = typeof d.nuevas === 'number' && d.nuevas >= min;
      partes.push(!tocaYa
        ? 'El próximo informe sale a partir del ' + esc(prox.dia) + ', si llegan al menos ' + min + ' opiniones nuevas; si no, este se mantiene.'
        : bastan ? 'El próximo informe sale en la próxima revisión (se hace una vez al día).'
        : 'El próximo informe saldrá en cuanto lleguen al menos ' + min + ' opiniones nuevas.');
    }
    return partes.length ? '<p class="siguiente">' + partes.join(' ') + '</p>' : '';
  }

  // El último informe publicado (automático cada 5 días, o el que prepara el equipo desde /admin/).
  function publicadoHtml(d) {
    var total = Number(d.total) || 0;
    var dias = periodo(d.desde, d.hasta), pub = ecuador(d.publicado);
    var origen = d.origen === 'manual' ? 'preparado por el equipo' : 'informe automático';
    var meta = '<p class="meta"><b>' + opiniones(total) + '</b>' + (dias ? ' · ' + dias : '') +
      (pub ? ' · publicado el ' + esc(pub.dia) + ' (' + origen + ')' : '') + '</p>';
    var min = Number(d.minimo) || 10;
    return meta +
      (total < min ? '<p class="aviso">Este informe se basa en pocas opiniones, así que los porcentajes son solo una referencia.</p>' : '') +
      tarjetasHtml(d.temas) + siguienteHtml(d);
  }

  function informeHtml(d) {
    if (!d || d.ok !== true || !Array.isArray(d.temas)) return errorHtml();
    return d.modo === 'informe' ? publicadoHtml(d) : enCursoHtml(d);
  }

  function citasHtml(d) {
    var items = d && d.ok !== false && Array.isArray(d.items) ? d.items.slice(0, 3) : [];
    items = items.filter(function (i) { return i && i.texto; });
    if (!items.length) return '';
    return '<h2>Comentarios destacados</h2>' + items.map(function (i) {
      return '<blockquote>“' + esc(i.texto) + '”<small>— ' + esc(i.autor_display || 'Vecino de La Aurora') + '</small></blockquote>';
    }).join('');
  }

  function pedir(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('http');
      return r.json();
    });
  }

  pedir('/api/informe').then(informeHtml, errorHtml).catch(errorHtml).then(function (h) { caja.innerHTML = h; });

  if (zonaCitas) {
    pedir('/api/featured').then(citasHtml, function () { return ''; }).then(function (h) {
      if (!h) return;
      zonaCitas.innerHTML = h;
      zonaCitas.hidden = false;
    });
  }
})();
