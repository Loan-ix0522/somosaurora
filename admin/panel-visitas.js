/* Panel "Visitas a la web" del admin de Somos Aurora.
   Lee la tabla `visitas` y la función estadisticas_visitas() (migración 0006) con la sesión del
   admin: la base solo se las muestra a los correos de la tabla `admins`.
   Muestra los totales, una fila por visitante ("N×") y cada visita con su hora de Ecuador.
   El admin lo arranca con AuroraVisitas.montar(db, panel) después de entrar. */
(function (raiz) {
  'use strict';

  var TZ = 'America/Guayaquil';
  var LIMITE = 1000;   // visitas que se traen para las tablas (los totales cuentan todas)
  var POR_HOJA = 25;
  var PAGINAS = { '/': 'Portada', '/terminos.html': 'Términos', '/politica-datos.html': 'Política de datos', '/informe-demo.html': 'Informe de muestra' };
  var APARATOS = { movil: 'Celular', tablet: 'Tablet', escritorio: 'Computadora' };
  var COLUMNAS = 'creada_en,ruta,visitante,pais,ciudad,dispositivo,procedencia,ip';

  // ---------- cálculos (sin pantalla) ----------

  // Código corto y estable del navegador, para reconocerlo en la tabla.
  function codigo(vid) {
    if (typeof vid !== 'string' || !vid) return null;
    return vid.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || null;
  }

  // Una fila por navegador (las filas llegan de la más nueva a la más vieja). Las visitas en
  // incógnito (sin código) se juntan en una sola fila "Sin identificar".
  function agrupar(filas) {
    var mapa = new Map();
    filas.forEach(function (f) {
      var clave = f.visitante || '';
      var e = mapa.get(clave);
      if (!e) {
        e = { codigo: f.visitante ? codigo(f.visitante) : null, anonimo: !f.visitante, visitas: 0, ultima: f.creada_en, primera: f.creada_en,
              pais: null, ciudad: null, dispositivo: null, ip: null, _rutas: new Set() };
        mapa.set(clave, e);
      }
      e.visitas++;
      e.primera = f.creada_en;
      if (!e.pais && f.pais) e.pais = f.pais;
      if (!e.ciudad && f.ciudad) e.ciudad = f.ciudad;
      if (!e.dispositivo && f.dispositivo) e.dispositivo = f.dispositivo;
      if (!e.ip && f.ip) e.ip = f.ip;
      if (f.ruta) e._rutas.add(f.ruta);
    });
    return Array.from(mapa.values()).map(function (e) {
      return { codigo: e.codigo, anonimo: e.anonimo, visitas: e.visitas, ultima: e.ultima, primera: e.primera,
               pais: e.pais, ciudad: e.ciudad, dispositivo: e.dispositivo, ip: e.ip, paginas: e._rutas.size };
    }).sort(function (a, b) { return b.visitas - a.visitas || (a.ultima < b.ultima ? 1 : a.ultima > b.ultima ? -1 : 0); });
  }

  // "19 oct · 14:05" en hora de Ecuador.
  function hora(iso) {
    try {
      var p = {};
      new Intl.DateTimeFormat('es-EC', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(iso)).forEach(function (x) { p[x.type] = x.value; });
      return p.day + ' ' + String(p.month).replace('.', '') + ' · ' + p.hour + ':' + p.minute;
    } catch (e) { return String(iso || ''); }
  }

  var pagina = function (r) { return PAGINAS[r] || r || '—'; };
  var aparato = function (d) { return APARATOS[d] || '—'; };

  var regiones = null;
  function nombrePais(cc) {
    if (!cc) return null;
    try { regiones = regiones || new Intl.DisplayNames(['es'], { type: 'region' }); return regiones.of(cc) || cc; } catch (e) { return cc; }
  }
  // "Daule, Ecuador"
  function lugar(ciudad, pais) {
    var partes = [ciudad, nombrePais(pais)].filter(Boolean);
    return partes.length ? partes.join(', ') : '—';
  }

  // ¿El error dice que la migración 0006 todavía no está aplicada?
  function falta(err) {
    if (!err) return false;
    if (['PGRST202', 'PGRST205', '42P01', '42883'].indexOf(err.code) !== -1) return true;
    return /schema cache|does not exist|could not find/i.test(String(err.message || ''));
  }

  async function cargar(db) {
    var s = await db.rpc('estadisticas_visitas');
    if (s.error) { if (falta(s.error)) return { listo: false }; throw new Error(s.error.message); }
    var q = await db.from('visitas').select(COLUMNAS).order('creada_en', { ascending: false }).limit(LIMITE);
    if (q.error) { if (falta(q.error)) return { listo: false }; throw new Error(q.error.message); }
    return { listo: true, stats: s.data, filas: q.data || [] };
  }

  // ---------- pantalla ----------

  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('es-EC'); }
  var raya = '<span class="muted">—</span>';

  function montar(db, panel) {
    var cuerpo = panel.querySelector('.vis-body');
    var datos = null;
    var tablas = {
      gente: { orden: 'visitas', dir: -1, hoja: 0 },
      log: { orden: 'creada_en', dir: -1, hoja: 0 },
    };

    var COL_GENTE = [
      ['codigo', 'Visitante'], ['visitas', 'Visitas'], ['ultima', 'Última vez'], ['primera', 'Primera vez'],
      ['lugar', 'Lugar'], ['ip', 'IP'], ['dispositivo', 'Aparato'], ['paginas', 'Páginas'],
    ];
    var COL_LOG = [
      ['creada_en', 'Hora de ingreso'], ['ruta', 'Página'], ['lugar', 'Lugar'], ['ip', 'IP'],
      ['dispositivo', 'Aparato'], ['codigo', 'Visitante'], ['procedencia', 'Llegó desde'],
    ];

    function valor(x, k) {
      if (k === 'lugar') return lugar(x.ciudad, x.pais);
      if (k === 'codigo') return x.anonimo ? '~' : (x.codigo || '');
      return x[k] == null ? '' : x[k];
    }
    function ordenar(lista, t) {
      return lista.slice().sort(function (a, b) {
        var va = valor(a, t.orden), vb = valor(b, t.orden);
        var r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es');
        return r * t.dir;
      });
    }
    function encabezado(cols, t) {
      return '<thead><tr>' + cols.map(function (c) {
        var activo = c[0] === t.orden;
        return '<th data-k="' + c[0] + '" aria-sort="' + (activo ? (t.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' + esc(c[1]) +
          '<i class="srt">' + (activo ? (t.dir > 0 ? '▲' : '▼') : '') + '</i></th>';
      }).join('') + '</tr></thead>';
    }
    function hojas(nombre, total, t) {
      var n = Math.max(1, Math.ceil(total / POR_HOJA));
      if (t.hoja > n - 1) t.hoja = n - 1;
      if (n === 1) return '';
      var desde = t.hoja * POR_HOJA + 1, hasta = Math.min(total, desde + POR_HOJA - 1);
      return '<div class="vis-pager"><button type="button" class="btn ghost sm" data-hoja="' + nombre + '" data-d="-1"' + (t.hoja === 0 ? ' disabled' : '') + '>‹ Anterior</button>' +
        '<span>Hoja ' + (t.hoja + 1) + ' de ' + n + ' · ' + num(desde) + '–' + num(hasta) + ' de ' + num(total) + '</span>' +
        '<button type="button" class="btn ghost sm" data-hoja="' + nombre + '" data-d="1"' + (t.hoja >= n - 1 ? ' disabled' : '') + '>Siguiente ›</button></div>';
    }
    function quien(x) { return x.anonimo ? '<span class="muted">Sin identificar</span>' : '<span class="vis-mono">#' + esc(x.codigo || '—') + '</span>'; }

    function tablaGente() {
      var t = tablas.gente, lista = ordenar(agrupar(datos.filas), t);
      var filas = lista.slice(t.hoja * POR_HOJA, (t.hoja + 1) * POR_HOJA).map(function (v) {
        return '<tr><td>' + quien(v) + '</td><td><b>' + num(v.visitas) + '×</b></td><td>' + esc(hora(v.ultima)) + '</td><td>' + esc(hora(v.primera)) +
          '</td><td>' + esc(lugar(v.ciudad, v.pais)) + '</td><td class="vis-mono">' + (v.ip ? esc(v.ip) : raya) + '</td><td>' + esc(aparato(v.dispositivo)) +
          '</td><td>' + num(v.paginas) + '</td></tr>';
      }).join('');
      return '<div class="tablebox compact"><table class="xl xl-vis">' + encabezado(COL_GENTE, t) + '<tbody>' + filas + '</tbody></table></div>' + hojas('gente', lista.length, t);
    }
    function tablaLog() {
      var t = tablas.log;
      var lista = ordenar(datos.filas.map(function (f) {
        return { creada_en: f.creada_en, ruta: f.ruta, ciudad: f.ciudad, pais: f.pais, ip: f.ip, dispositivo: f.dispositivo,
                 codigo: codigo(f.visitante), anonimo: !f.visitante, procedencia: f.procedencia };
      }), t);
      var filas = lista.slice(t.hoja * POR_HOJA, (t.hoja + 1) * POR_HOJA).map(function (v) {
        return '<tr><td>' + esc(hora(v.creada_en)) + '</td><td title="' + esc(v.ruta) + '">' + esc(pagina(v.ruta)) + '</td><td>' + esc(lugar(v.ciudad, v.pais)) +
          '</td><td class="vis-mono">' + (v.ip ? esc(v.ip) : raya) + '</td><td>' + esc(aparato(v.dispositivo)) + '</td><td>' + quien(v) +
          '</td><td>' + (v.procedencia ? esc(v.procedencia) : '<span class="muted">Directo</span>') + '</td></tr>';
      }).join('');
      return '<div class="tablebox compact"><table class="xl xl-vis">' + encabezado(COL_LOG, t) + '<tbody>' + filas + '</tbody></table></div>' + hojas('log', lista.length, t);
    }

    function pintar() {
      var s = datos.stats || {};
      var tile = function (n, l) { return '<div class="stat"><div class="n">' + num(n) + '</div><div class="l">' + esc(l) + '</div></div>'; };
      var html = '<div class="grid vis-grid">' +
        tile(s.personas_total, 'Personas únicas') + tile(s.personas_hoy, 'Personas hoy') + tile(s.personas_semana, 'Personas (7 días)') +
        tile(s.visitas_total, 'Visitas totales') + tile(s.visitas_hoy, 'Visitas hoy') + tile(s.visitas_semana, 'Visitas (7 días)') + '</div>';
      if (!datos.filas.length) {
        cuerpo.innerHTML = html + '<p class="empty">Todavía no hay visitas registradas. Aparecen aquí apenas alguien abra la web.</p>';
        return;
      }
      var tope = datos.filas.length >= LIMITE ? ' (las tablas muestran las últimas ' + num(LIMITE) + ' visitas)' : '';
      cuerpo.innerHTML = html +
        '<h3 class="sec-h">Visitantes</h3><p class="muted vis-nota">Cada navegador cuenta una vez; “N×” es cuántas veces entró' + esc(tope) + '. Clic en un encabezado para ordenar.</p>' +
        '<div data-tabla="gente">' + tablaGente() + '</div>' +
        '<h3 class="sec-h vis-h">Cada visita, con su hora</h3>' +
        '<div data-tabla="log">' + tablaLog() + '</div>';
    }
    function repintar(nombre) {
      var caja = cuerpo.querySelector('[data-tabla="' + nombre + '"]');
      if (caja) caja.innerHTML = nombre === 'gente' ? tablaGente() : tablaLog();
    }

    async function actualizar() {
      var boton = panel.querySelector('[data-vis="recargar"]');
      if (boton) boton.disabled = true;
      try {
        var r = await cargar(db);
        if (!r.listo) {
          cuerpo.innerHTML = '<p class="empty">El contador aún no está activado: falta aplicar la migración <b>0006</b> en Supabase (SQL Editor → pegar → Run). Desde ese momento se empiezan a contar las visitas.</p>';
          return;
        }
        datos = r;
        pintar();
      } catch (e) {
        cuerpo.innerHTML = '<p class="empty">No se pudieron cargar las visitas: ' + esc(e && e.message) + '. Prueba con “Recargar”.</p>';
      } finally {
        if (boton) boton.disabled = false;
      }
    }

    panel.addEventListener('click', function (e) {
      if (e.target.closest('[data-vis="recargar"]')) return actualizar();
      var h = e.target.closest('[data-hoja]');
      if (h && !h.disabled) { tablas[h.dataset.hoja].hoja += Number(h.dataset.d); return repintar(h.dataset.hoja); }
      var th = e.target.closest('[data-tabla] th[data-k]');
      if (th) {
        var nombre = th.closest('[data-tabla]').dataset.tabla, t = tablas[nombre], k = th.dataset.k;
        if (t.orden === k) t.dir = -t.dir;
        else { t.orden = k; t.dir = ['codigo', 'ruta', 'lugar', 'ip', 'dispositivo', 'procedencia'].indexOf(k) !== -1 ? 1 : -1; } // texto: A→Z; números y fechas: mayor primero
        t.hoja = 0;
        repintar(nombre);
      }
    });

    return actualizar();
  }

  var api = { codigo: codigo, agrupar: agrupar, hora: hora, pagina: pagina, aparato: aparato, lugar: lugar, cargar: cargar, montar: montar };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.AuroraVisitas = api;
})(this);
