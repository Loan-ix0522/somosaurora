/* Informe ciudadano en vivo (informe-demo.html): dibuja los porcentajes reales que da /api/informe
   (opiniones de los últimos 30 días, repartidas por tema) y los comentarios destacados que publica
   el equipo (/api/featured). Cada vez que alguien abre la página se piden de nuevo, así que las cifras
   se ponen al día solas con cada opinión nueva. Si algo falla, la página lo dice y no se rompe. */
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
  function ecuador(iso) {
    var ms = Date.parse(iso);
    if (isNaN(ms)) return null;
    var d = new Date(ms - 5 * 3600 * 1000);
    var dos = function (n) { return (n < 10 ? '0' : '') + n; };
    return { dia: d.getUTCDate() + ' ' + MESES[d.getUTCMonth()], hora: dos(d.getUTCHours()) + ':' + dos(d.getUTCMinutes()) };
  }

  function errorHtml() {
    return '<p class="estado">No pudimos cargar los porcentajes en este momento. Intenta de nuevo en unos minutos.</p>';
  }

  function informeHtml(d) {
    if (!d || d.ok !== true || !Array.isArray(d.temas)) return errorHtml();
    var total = Number(d.total) || 0;
    var desde = ecuador(d.desde), hasta = ecuador(d.actualizado);
    var meta = '<p class="meta"><b>' + opiniones(total) + '</b>' +
      (desde && hasta ? ' · del ' + esc(desde.dia) + ' al ' + esc(hasta.dia) : '') +
      (hasta ? ' · actualizado el ' + esc(hasta.dia) + ' a las ' + esc(hasta.hora) : '') + '</p>';
    if (!total) {
      return meta + '<p class="estado">Todavía no hay opiniones en este periodo. En cuanto la comunidad envíe las primeras, aparecerán aquí.</p>';
    }
    var con = d.temas.filter(function (t) { return t.total > 0; });
    var sin = d.temas.filter(function (t) { return !(t.total > 0); });
    var tarjetas = con.map(function (t) {
      var p = Number(t.porcentaje) || 0;
      return '<div class="card"><div class="num">' + p + '%</div><b>' + esc(t.tema) + '</b>' +
        '<span class="cant">' + opiniones(Number(t.total) || 0) + '</span>' +
        '<div class="bar" role="img" aria-label="' + p + ' por ciento"><i style="width:' + p + '%"></i></div></div>';
    }).join('');
    return meta +
      (total < 20 ? '<p class="aviso">Todavía son pocas opiniones, así que los porcentajes pueden moverse bastante. Se irán afinando con cada opinión nueva.</p>' : '') +
      '<div class="grid">' + tarjetas + '</div>' +
      (sin.length ? '<p class="sin">Sin opiniones por ahora: ' + sin.map(function (t) { return esc(t.tema); }).join(', ') + '.</p>' : '');
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
