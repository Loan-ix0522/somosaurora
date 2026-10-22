/* Informe ciudadano (informe-demo.html): dibuja lo que da /api/informe y los comentarios destacados que
   publica el equipo (/api/featured). Solo muestra el periodo y los porcentajes: nunca cuántas opiniones hay.
   · Modo "informe": el último informe publicado (cada 5 días solo, o el que prepara el equipo desde /admin/).
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

  // Una tarjeta por tema con porcentaje; los temas que no tienen ninguna opinión se nombran aparte
  // (`sin`, que ya viene del servidor: aquí no se cuenta nada).
  function tarjetasHtml(temas, sin) {
    var tarjetas = temas.filter(function (t) { return Number(t.porcentaje) > 0; }).map(function (t) {
      var p = Number(t.porcentaje) || 0;
      return '<div class="card"><div class="num">' + p + '%</div><b>' + esc(t.tema) + '</b>' +
        '<div class="bar" role="img" aria-label="' + p + ' por ciento"><i style="width:' + p + '%"></i></div></div>';
    }).join('');
    var nombres = Array.isArray(sin) ? sin : [];
    return '<div class="grid">' + tarjetas + '</div>' +
      (nombres.length ? '<p class="sin">Sin opiniones por ahora: ' + nombres.map(function (n) { return esc(n); }).join(', ') + '.</p>' : '');
  }

  // "del 16 oct al 21 oct" (o "el 26 oct" si es un solo día). El corte es exclusivo: el último día
  // incluido es el del instante anterior (un informe que corta a la medianoche termina el día anterior).
  function periodo(desdeIso, hastaIso) {
    var a = ecuador(desdeIso), hastaMs = Date.parse(hastaIso);
    var b = isNaN(hastaMs) ? null : ecuador(hastaMs - 1);
    if (!a || !b) return '';
    return a.dia === b.dia ? 'el ' + esc(a.dia) : 'del ' + esc(a.dia) + ' al ' + esc(b.dia);
  }

  // Une con « · » lo que haya (sin huecos si falta algún dato). La página solo dice de qué días es:
  // nunca cuántas opiniones hay, ni por tema ni en total.
  function linea(partes) {
    var con = partes.filter(Boolean);
    return con.length ? '<p class="meta">' + con.join(' · ') + '</p>' : '';
  }

  // Conteo en vivo de los últimos 30 días (todavía no hay un informe publicado).
  function enCursoHtml(d) {
    var desde = ecuador(d.desde), hasta = ecuador(d.actualizado);
    var meta = linea([
      desde && hasta ? 'Periodo: del ' + esc(desde.dia) + ' al ' + esc(hasta.dia) : '',
      hasta ? 'actualizado el ' + esc(hasta.dia) + ' a las ' + esc(hasta.hora) : ''
    ]);
    var nota = '<p class="aviso">Todavía no se ha publicado el primer informe. Mientras tanto, estos porcentajes se calculan con las opiniones de los últimos 30 días y se ponen al día solos. El informe oficial sale cada 5 días.</p>';
    var hay = d.temas.some(function (t) { return Number(t.porcentaje) > 0; });
    if (!hay) {
      return meta + nota + '<p class="estado">Todavía no hay opiniones en este periodo. En cuanto la comunidad envíe las primeras, aparecerán aquí.</p>';
    }
    return meta + nota + tarjetasHtml(d.temas, d.sin_opiniones);
  }

  // El último informe publicado (automático cada 5 días, o el que prepara el equipo desde /admin/):
  // solo el periodo y los porcentajes.
  function publicadoHtml(d) {
    var dias = periodo(d.desde, d.hasta);
    return linea([dias ? 'Periodo: ' + dias : '']) + tarjetasHtml(d.temas, d.sin_opiniones);
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
