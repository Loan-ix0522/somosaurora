/* Panel "Informe público" del admin de Somos Aurora.
   Muestra el informe que ve el público en la página «Informe ciudadano» (tabla `informe_publico`,
   migración 0007), cuántas opiniones han llegado desde su corte y cuándo toca el próximo automático.
   Deja preparar un informe por fechas (Calcular = vista previa, Publicar = lo deja visible) y retirar uno.
   Las cifras las cuenta el servidor (/api/informe-admin): aquí solo se mandan las fechas.
   El admin lo arranca con AuroraInforme.montar(db, panel) después de entrar. */
(function (raiz) {
  'use strict';

  var DIA = 864e5;
  var DIAS_ENTRE_INFORMES = 5;
  var MINIMO = 10;
  var LIMITE = 50;
  var COLUMNAS = 'id,created_at,origen,periodo_desde,periodo_hasta,total,por_tema';
  var ORIGEN = { automatico: 'Automático', manual: 'Manual (equipo)' };
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // ---------- cálculos (sin pantalla) ----------

  // Fecha y hora de Ecuador (UTC-5, sin horario de verano), sin depender de la zona del aparato.
  function enEcuador(ms) { return new Date(ms - 5 * 3600 * 1000); }
  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function dia(ms) { var d = enEcuador(ms); return d.getUTCDate() + ' ' + MESES[d.getUTCMonth()]; }
  function hora(iso) {
    var ms = Date.parse(iso);
    if (isNaN(ms)) return String(iso || '');
    var d = enEcuador(ms);
    return dia(ms) + ' · ' + dos(d.getUTCHours()) + ':' + dos(d.getUTCMinutes());
  }

  // "2026-10-26": el día de Ecuador de un instante.
  function fechaEc(fecha) { return enEcuador(fecha.getTime()).toISOString().slice(0, 10); }

  // "16 oct – 21 oct" (o "26 oct" si es un solo día). El corte es exclusivo: el último día incluido es el
  // del instante anterior (un informe que corta a la medianoche termina el día anterior).
  function periodo(desde, hasta) {
    var a = Date.parse(desde), b = Date.parse(hasta);
    if (isNaN(a) || isNaN(b)) return '—';
    var d1 = dia(a), d2 = dia(b - 1);
    return d1 === d2 ? d1 : d1 + ' – ' + d2;
  }

  // Cuándo sale el próximo automático (5 días después del corte) o qué le falta si ya tocaba.
  function estadoProximo(ultimo, nuevas, ahora) {
    if (!ultimo) return null;
    var cuando = Date.parse(ultimo.periodo_hasta) + DIAS_ENTRE_INFORMES * DIA;
    if (cuando > ahora.getTime()) return { valor: dia(cuando), nota: 'si llegan al menos ' + MINIMO + ' opiniones nuevas' };
    if (typeof nuevas === 'number' && nuevas >= MINIMO) return { valor: 'Hoy o mañana', nota: 'se publica en la revisión diaria (02:30)' };
    return {
      valor: 'Esperando opiniones',
      nota: typeof nuevas === 'number' ? 'faltan ' + (MINIMO - nuevas) + ' para llegar a ' + MINIMO : 'se publica cuando lleguen al menos ' + MINIMO + ' nuevas',
    };
  }

  // ¿El error dice que la migración 0007 todavía no está aplicada?
  function falta(err) {
    if (!err) return false;
    if (['PGRST205', '42P01'].indexOf(err.code) !== -1) return true;
    return /schema cache|does not exist|could not find/i.test(String(err.message || ''));
  }

  async function cargar(db) {
    var q = await db.from('informe_publico').select(COLUMNAS).order('created_at', { ascending: false }).limit(LIMITE);
    if (q.error) { if (falta(q.error)) return { listo: false }; throw new Error(q.error.message); }
    var informes = q.data || [];
    var nuevas = null;
    if (informes[0]) {
      // Solo se cuenta (head): es un dato de apoyo; si falla, el resto se muestra igual.
      var c = await db.from('submissions').select('id', { count: 'exact', head: true }).gte('created_at', informes[0].periodo_hasta);
      if (!c.error && typeof c.count === 'number') nuevas = c.count;
    }
    return { listo: true, informes: informes, nuevas: nuevas };
  }

  // Calcula o publica en el servidor, con la sesión del admin. Solo viajan las fechas.
  async function llamar(db, accion, desde, hasta, pedir) {
    var s = await db.auth.getSession();
    var token = s && s.data && s.data.session && s.data.session.access_token;
    if (!token) throw new Error('Tu sesión venció. Sal y vuelve a entrar.');
    var r;
    try {
      r = await (pedir || fetch)('/api/informe-admin', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: accion, desde: desde, hasta: hasta }),
      });
    } catch (e) { throw new Error('Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.'); }
    var d = null;
    try { d = await r.json(); } catch (e) { /* respuesta sin cuerpo */ }
    if (!r.ok || !d || d.ok !== true) throw new Error((d && d.error) || 'No se pudo completar la operación. Intenta de nuevo.');
    return d;
  }

  // Retira (borra) un informe. La base solo se lo permite a los admins: si no borró nada, se dice.
  async function retirar(db, id) {
    var r = await db.from('informe_publico').delete().eq('id', id).select('id');
    if (r.error) throw new Error(r.error.message);
    if (!r.data || !r.data.length) throw new Error('No se pudo retirar el informe. ¿Tu cuenta es de administrador?');
  }

  // ---------- pantalla ----------

  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('es-EC'); }
  function opiniones(n) { return num(n) + (Number(n) === 1 ? ' opinión' : ' opiniones'); }

  function barras(temas) {
    var con = (Array.isArray(temas) ? temas : []).filter(function (t) { return t && t.total > 0; });
    return '<div class="inf-lista">' + con.map(function (t) {
      var p = Math.max(0, Math.min(100, Number(t.porcentaje) || 0));
      return '<div class="inf-fila"><span class="inf-tema">' + esc(t.tema) + '</span>' +
        '<span class="inf-barra" role="img" aria-label="' + p + ' por ciento"><i style="width:' + p + '%"></i></span>' +
        '<b class="inf-pct">' + p + '%</b><span class="muted inf-n">' + num(t.total) + '</span></div>';
    }).join('') + '</div>';
  }

  function montar(db, panel, opciones) {
    opciones = opciones || {};
    var ahora = opciones.ahora || function () { return new Date(); };
    var pedir = opciones.fetch || function (u, i) { return fetch(u, i); };
    var confirmar = opciones.confirm || function (t) { return confirm(t); };
    var q = function (k) { return panel.querySelector('[data-inf="' + k + '"]'); };
    var actual = q('actual'), prev = q('prev'), historial = q('historial'), desdeEl = q('desde'), hastaEl = q('hasta');
    var datos = null;
    var vista = null;   // lo último que se calculó: es lo único que "Publicar" publica

    // Fechas del formulario: los últimos 5 días (sin pisar lo que ya haya escrito).
    var hoy = fechaEc(ahora());
    if (!desdeEl.value) desdeEl.value = fechaEc(new Date(ahora().getTime() - (DIAS_ENTRE_INFORMES - 1) * DIA));
    if (!hastaEl.value) hastaEl.value = hoy;
    desdeEl.max = hoy; hastaEl.max = hoy;

    function ocupado(si) {
      ['recargar', 'calcular', 'publicar'].forEach(function (k) { var b = q(k); if (b) b.disabled = si; });
    }
    function aviso(texto, ok) { prev.innerHTML = '<p class="msg ' + (ok ? 'ok' : 'err') + '">' + esc(texto) + '</p>'; }

    function pintar() {
      if (!datos.listo) {
        actual.innerHTML = '<p class="empty">Falta aplicar la migración <b>0007</b> en Supabase (SQL Editor → pegar → Run). Hasta entonces la web muestra el conteo de los últimos 30 días.</p>';
        historial.innerHTML = '';
        return;
      }
      var lista = datos.informes, ultimo = lista[0];
      if (!ultimo) {
        actual.innerHTML = '<p class="empty">Todavía no hay un informe publicado: la web muestra el conteo de los últimos 30 días. El primero sale solo en la revisión diaria si hay al menos ' + MINIMO + ' opiniones, o publica uno tú abajo.</p>';
        historial.innerHTML = '<p class="muted vis-nota">Aquí aparecerán los informes que se vayan publicando.</p>';
        return;
      }
      var prox = estadoProximo(ultimo, datos.nuevas, ahora());
      var tile = function (n, l, nota, txt) {
        return '<div class="stat"><div class="n' + (txt ? ' txt' : '') + '">' + (txt ? esc(n) : num(n)) + '</div><div class="l">' + esc(l) + (nota ? ' · ' + esc(nota) : '') + '</div></div>';
      };
      actual.innerHTML =
        '<div class="grid vis-grid">' +
          tile(ultimo.total, 'Opiniones en este informe') +
          (typeof datos.nuevas === 'number' ? tile(datos.nuevas, 'Llegadas desde su corte') : tile('—', 'Llegadas desde su corte', '', true)) +
          tile(prox.valor, 'Próximo automático', prox.nota, true) + '</div>' +
        '<p class="muted vis-nota">Periodo: <b>' + esc(periodo(ultimo.periodo_desde, ultimo.periodo_hasta)) + '</b> · publicado el ' + esc(hora(ultimo.created_at)) +
          ' · <b>' + esc(ORIGEN[ultimo.origen] || ultimo.origen) + '</b></p>' +
        barras(ultimo.por_tema);

      historial.innerHTML = '<div class="tablebox compact"><table class="xl xl-vis"><thead><tr><th>Publicado</th><th>Periodo</th><th>Origen</th><th>Opiniones</th><th></th></tr></thead><tbody>' +
        lista.map(function (x, i) {
          return '<tr><td>' + esc(hora(x.created_at)) + '</td><td>' + esc(periodo(x.periodo_desde, x.periodo_hasta)) + '</td><td>' + esc(ORIGEN[x.origen] || x.origen) +
            '</td><td>' + num(x.total) + '</td><td>' + (i === 0 ? '<span class="inf-vigente">Se muestra en la web</span> ' : '') +
            '<button type="button" class="btn ghost sm" data-retirar="' + esc(x.id) + '">Retirar</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    async function actualizar() {
      var boton = q('recargar');
      if (boton) boton.disabled = true;
      try {
        datos = await cargar(db);
        pintar();
      } catch (e) {
        actual.innerHTML = '<p class="empty">No se pudo cargar el informe: ' + esc(e && e.message) + '. Prueba con “Recargar”.</p>';
        historial.innerHTML = '';
      } finally {
        if (boton) boton.disabled = false;
      }
    }

    function limpiarVista() { vista = null; prev.innerHTML = ''; }

    async function calcular() {
      var d = desdeEl.value, h = hastaEl.value;
      vista = null;
      prev.innerHTML = '<p class="muted">Calculando…</p>';
      ocupado(true);
      try {
        var r = await llamar(db, 'calcular', d, h, pedir);
        if (!r.total) { prev.innerHTML = '<p class="empty">No hay opiniones en esas fechas.</p>'; return; }
        vista = { desde: d, hasta: h, total: r.total, periodo: periodo(r.desde, r.hasta) };
        prev.innerHTML = '<div class="inf-prev"><p><b>' + esc(opiniones(r.total)) + '</b> · ' + esc(vista.periodo) + '</p>' + barras(r.temas) +
          '<button type="button" class="btn green" data-inf="publicar">Publicar este informe</button>' +
          '<p class="muted vis-nota">Al publicarlo, el público lo ve al instante y reemplaza al actual. El siguiente automático sale 5 días después de su corte.</p></div>';
      } catch (e) {
        aviso(e && e.message, false);
      } finally { ocupado(false); }
    }

    async function publicar() {
      if (!vista) return;
      var v = vista;
      if (!confirmar('Vas a publicar este informe en la web: ' + opiniones(v.total) + ', ' + v.periodo + '.\n\nEl público lo verá al instante y reemplaza al actual. ¿Continuar?')) return;
      ocupado(true);
      try {
        await llamar(db, 'publicar', v.desde, v.hasta, pedir);
        vista = null;
        await actualizar();
        aviso('Informe publicado. Ya lo ve el público.', true);
      } catch (e) {
        aviso(e && e.message, false);
      } finally { ocupado(false); }
    }

    async function quitar(id) {
      var lista = (datos && datos.informes) || [];
      var vigente = lista[0] && lista[0].id === id;
      var siguiente = lista[1];
      var efecto = !vigente ? 'Se quita del historial; el público no lo ve ahora.'
        : siguiente ? 'Es el que ve el público ahora: al retirarlo volverá a verse el informe anterior (' + periodo(siguiente.periodo_desde, siguiente.periodo_hasta) + ').'
        : 'Es el que ve el público ahora: al retirarlo la web mostrará el conteo de los últimos 30 días hasta que salga otro.';
      if (!confirmar('¿Retirar este informe?\n\n' + efecto)) return;
      try { await retirar(db, id); await actualizar(); }
      catch (e) { aviso(e && e.message, false); }
    }

    panel.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-inf="recargar"]')) return actualizar();
      if (t.closest('[data-inf="calcular"]')) return calcular();
      if (t.closest('[data-inf="publicar"]')) return publicar();
      var r = t.closest('[data-retirar]');
      if (r) return quitar(r.dataset.retirar);
    });
    // Si cambian las fechas después de calcular, la vista previa ya no vale: no se publica algo que no se vio.
    ['input', 'change'].forEach(function (ev) {
      panel.addEventListener(ev, function (e) { if (e.target.closest('[data-inf="desde"], [data-inf="hasta"]')) limpiarVista(); });
    });

    return actualizar();
  }

  var api = { fechaEc: fechaEc, periodo: periodo, estadoProximo: estadoProximo, falta: falta, cargar: cargar, llamar: llamar, retirar: retirar, montar: montar };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.AuroraInforme = api;
})(this);
