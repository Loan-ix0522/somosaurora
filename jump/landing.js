import { whatsapp } from "/jump/comunidad/js/normalizar.js";

(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const c01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

  /* ---------- entradas al hacer scroll (una sola vez) ---------- */
  [['.center-head'], ['.incluye-head'], ['.mod-head'], ['.enc-copy'], ['.poll'], ['.jo-copy'], ['.blob-wrap'],
   ['#t-proceso'], ['.postula > div:first-child'], ['#form'], ['.faq-grid > div:first-child'], ['.respaldo .wrap'],
   ['.side', 1], ['.card-in', 1], ['.pad', 1], ['.steps li', 1], ['details', 1]
  ].forEach(([sel, stagger]) => document.querySelectorAll(sel).forEach(el => {
    el.dataset.reveal = '';
    if (stagger) { const it = el.closest('li') || el; el.style.setProperty('--d', [...it.parentElement.children].indexOf(it)); }
  }));
  const revealIO = 'IntersectionObserver' in window ? new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
  }), { rootMargin: '0px 0px -10% 0px', threshold: .12 }) : null;
  document.querySelectorAll('[data-reveal]').forEach(el => {
    // el hero entra siempre al cargar (escalonado por su propio delay); el resto, al llegar con el scroll
    if (!revealIO || el.closest('.hero')) setTimeout(() => el.classList.add('in'), 30);
    else revealIO.observe(el);
  });

  /* ---------- momentos: mosaico de fotos en movimiento ---------- */
  const vive = document.querySelector('.vive');
  if (vive) {
    // cada columna se duplica una vez: al llegar al -50 % el bucle vuelve al inicio sin salto
    vive.querySelectorAll('.mz-col').forEach(col => [...col.children].forEach(c => col.appendChild(c.cloneNode(true))));
    const mega = vive.querySelector('.mega');
    if (reduce || !('IntersectionObserver' in window)) { vive.classList.add('in'); mega.classList.remove('masking'); }
    else {
      const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        vive.classList.add('in'); io.disconnect();
        setTimeout(() => mega.classList.remove('masking'), 1500); // después de la entrada, sin máscara
      }, { threshold: .3 });
      io.observe(vive);
      // fuera de pantalla las columnas se detienen (ahorra batería)
      new IntersectionObserver(([e]) => vive.classList.toggle('off', !e.isIntersecting)).observe(vive);
    }
  }

  /* ---------- el logo cobra vida ---------- */
  const svg = document.getElementById('jumpLogo');
  const glyphs = [...svg.querySelectorAll('.g')];
  const tag = svg.querySelector('.tag');
  const fig = svg.querySelector('.fig');
  const head = svg.querySelector('.head');
  const floor = svg.querySelector('.floor');
  const sparks = [...svg.querySelectorAll('.impact line')];
  const hint = document.getElementById('replayHint');

  const FOOT = [608.97, 603.11];
  const BASE = [[508.92,431.64],[614.17,431.64],[575.47,494.11],[648.07,481.51],[608.97,603.11]];
  const HEAD = { cx: 658.99, by: 426.97 };
  // la figura es un resorte: se comprime y se estira hacia el pie sin cambiar su grosor
  const pose = (ky, kx, dy) => BASE.map(([x, y]) =>
    (FOOT[0] + (x - FOOT[0]) * kx).toFixed(2) + ',' + (FOOT[1] - (FOOT[1] - y) * ky + dy).toFixed(2)).join(' ');

  const E = {
    out: t => 1 - Math.pow(1 - t, 3),
    expo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    in: t => t * t * t,
    inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    lin: t => t
  };
  // keys: [[ms, [valores], ease]]
  const at = (keys, t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e] = keys[i], [t0, v0] = keys[i - 1];
      if (t <= t1) { const p = E[e || 'out']((t - t0) / (t1 - t0)); return v0.map((a, j) => a + (v1[j] - a) * p); }
    }
    return keys[keys.length - 1][1];
  };

  const lens = glyphs.map(g => g.getTotalLength());
  const floorLen = 480;
  const sparkLens = sparks.map(l => Math.hypot(l.x2.baseVal.value - l.x1.baseVal.value, l.y2.baseVal.value - l.y1.baseVal.value));
  floor.style.strokeDasharray = floorLen;
  glyphs.forEach((g, i) => g.style.strokeDasharray = lens[i]);
  sparks.forEach((l, i) => l.style.strokeDasharray = sparkLens[i]);

  const T = {
    floor: [[0,[0,0]],[350,[0,1]],[800,[1,1],'expo'],[2450,[1,1]],[2900,[1,0],'inOut']],
    tag:   [[0,[96]],[760,[96]],[1250,[0],'expo']],
    //       ky    kx    dy  opacidad
    fig:   [[0,[.40,1.12,62,0]],[760,[.40,1.12,62,0]],[860,[.40,1.12,54,1]],[1250,[.40,1.12,0,1],'expo'],
            [1350,[.34,1.17,0,1],'inOut'],[1580,[1.12,.95,-58,1],'out'],[1790,[.9,1.05,0,1],'in'],
            [1930,[1,1,0,1],'out'],[2300,[1,1,0,1]],[2380,[.93,1.03,0,1],'out'],[2540,[1,1,0,1],'out']],
    //       dy   sx   sy   opacidad
    head:  [[0,[-440,1,1,0]],[1880,[-440,1,1,0]],[1900,[-440,1,1,1]],[2300,[0,1,1,1],'in'],
            [2370,[0,1.24,.76,1],'out'],[2470,[-13,.95,1.06,1],'out'],[2590,[0,1,1,1],'in'],[2640,[0,1,1,1]]],
    spark: [[0,[0,0]],[2300,[0,1]],[2440,[1,1],'out'],[2680,[1,0],'out']]
  };
  const END = 2950;

  function render(t) {
    glyphs.forEach((g, i) => {
      const s = i * 130;
      const d = at([[s,[1]],[s + 680,[0],'out']], t)[0];
      const fill = at([[s + 380,[0]],[s + 780,[1],'out']], t)[0];
      const stroke = at([[s,[1]],[s + 700,[1]],[s + 980,[0],'out']], t)[0];
      g.style.strokeDashoffset = (d * lens[i]).toFixed(1);
      g.style.fillOpacity = fill;
      g.style.strokeOpacity = t >= END ? 0 : stroke;
    });
    const [fp, fo] = at(T.floor, t);
    floor.style.strokeDashoffset = ((1 - fp) * floorLen).toFixed(1);
    floor.style.opacity = fo * .55;
    tag.setAttribute('transform', `translate(0 ${at(T.tag, t)[0].toFixed(2)})`);
    const [ky, kx, dy, fop] = at(T.fig, t);
    fig.setAttribute('points', pose(ky, kx, dy));
    fig.style.opacity = fop;
    const [hy, sx, sy, ho] = at(T.head, t);
    head.setAttribute('transform', `translate(0 ${hy.toFixed(2)}) translate(${HEAD.cx} ${HEAD.by}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(${-HEAD.cx} ${-HEAD.by})`);
    head.style.opacity = ho;
    const [sp, so] = at(T.spark, t);
    sparks.forEach((l, i) => { l.style.strokeDashoffset = ((1 - sp) * sparkLens[i]).toFixed(1); l.style.opacity = so; });
  }

  function finish() {
    render(END);
    fig.setAttribute('points', pose(1, 1, 0));
    head.removeAttribute('transform');
    tag.removeAttribute('transform');
  }

  let raf = 0, t0 = 0;
  function play() {
    cancelAnimationFrame(raf);
    hint.classList.remove('on');
    if (reduce) { finish(); return; }
    t0 = performance.now();
    const step = now => {
      const t = now - t0;
      if (t >= END) { finish(); hint.classList.add('on'); return; }
      render(t);
      raf = requestAnimationFrame(step);
    };
    render(0);
    raf = requestAnimationFrame(step);
  }

  if (reduce) finish();
  else {
    render(0);
    // espera la tipografía del lema, sin demorar más de medio segundo
    Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 500))]).then(play);
  }
  document.getElementById('logoBtn').addEventListener('click', play);

  /* ---------- el arco de "antes / después" ---------- */
  const arcSvg = document.getElementById('arcSvg');
  const arcDraw = document.getElementById('arcDraw');
  const arcFig = document.getElementById('arcFig');
  const arcLen = arcDraw.getTotalLength();
  arcDraw.style.strokeDasharray = arcLen;
  const placeArc = p => {
    const pt = arcDraw.getPointAtLength(p * arcLen);
    arcFig.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
    arcDraw.style.strokeDashoffset = ((1 - p) * arcLen).toFixed(1);
  };
  if (reduce) placeArc(1);
  else {
    placeArc(0);
    new IntersectionObserver((entries, io) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      const s = performance.now(), dur = 1500;
      const tick = now => {
        const p = Math.min(1, (now - s) / dur);
        placeArc(E.inOut(p));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: .6 }).observe(arcSvg);
  }

  /* ---------- los escalones suben poco a poco con el scroll y la figura los va saltando ---------- */
  const stairs = document.getElementById('stairs');
  const wrapS = document.getElementById('stairsWrap');
  const items = [...stairs.children];
  const stepEls = items.map(li => li.querySelector('.step'));
  const bars = items.map(li => li.querySelector('.bar'));
  const hopper = document.getElementById('hopper');
  const hopFig = document.getElementById('hopFig');
  const hopHead = document.getElementById('hopHead');
  const narrow = matchMedia('(max-width: 980px)');
  const sec = document.getElementById('incluye');
  const pinBox = sec.querySelector('.wrap');
  let geo = [], hopW = 40, hopH = 53, run = 0, padTop = 0, pinTop = 0;
  const measure = () => {
    geo = items.map(li => ({ x: li.offsetLeft + li.offsetWidth / 2, top: li.offsetTop }));
    hopW = hopper.offsetWidth || 40; hopH = hopW * 290 / 220;
    // en escritorio la caja queda fija con los escalones pegados al borde de abajo de la pantalla
    run = parseFloat(getComputedStyle(sec, '::after').height) || 0;
    padTop = parseFloat(getComputedStyle(sec).paddingTop) || 0;
    pinTop = innerHeight - pinBox.offsetHeight;
    sec.style.setProperty('--pin-top', pinTop + 'px');
  };
  // avance de 0 a 1: desde que los escalones asoman por abajo hasta que la sección se suelta
  const stairsP = () => {
    const vh = innerHeight;
    if (!run) return c01((vh * .92 - wrapS.getBoundingClientRect().top) / (vh * .62));
    const sc = -sec.getBoundingClientRect().top;
    const s0 = padTop + wrapS.offsetTop - vh * .9, s1 = padTop - pinTop + run;
    return c01((sc - s0) / (s1 - s0));
  };
  // el pie de la figura queda sobre el borde del escalón; la cabeza acompaña al hombro
  const placeHopper = (x, top, ky, op) => {
    const kx = 1 + (1 - ky) * .35;
    hopFig.setAttribute('points', pose(ky, kx, 0));
    const sy = FOOT[1] - (FOOT[1] - BASE[1][1]) * ky - BASE[1][1];
    const sx = (BASE[1][0] - FOOT[0]) * (kx - 1);
    hopHead.setAttribute('transform', `translate(${sx.toFixed(2)} ${sy.toFixed(2)})`);
    hopper.style.transform = `translate(${(x - .632 * hopW).toFixed(1)}px, ${(top - .9586 * hopH).toFixed(1)}px)`;
    hopper.style.opacity = op;
  };
  function stairsFrame() {
    const vh = innerHeight;
    if (narrow.matches) {
      items.forEach((li, i) => {
        const p = reduce ? 1 : c01((vh * .95 - li.getBoundingClientRect().top) / (vh * .4));
        bars[i].style.transform = `scaleX(${(.04 + .96 * E.out(p)).toFixed(3)})`;
      });
      return;
    }
    pGoal = reduce ? 1 : stairsP();
    if (pNow < 0) { pNow = pGoal; renderStairs(pNow); return; }   // al cargar, sin deslizar
    if (!glideRaf) { glideT = 0; glideRaf = requestAnimationFrame(glide); }
  }
  // el dibujo sigue al scroll con un poco de inercia, así cada salto se ve completo aunque la rueda vaya a tirones
  let pNow = -1, pGoal = 0, glideRaf = 0, glideT = 0;
  function glide(now) {
    const dt = glideT ? Math.min(64, Math.max(0, now - glideT)) : 16.7;
    const k = 1 - Math.exp(-dt / 110);
    glideT = now;
    const d = pGoal - pNow;
    pNow = Math.abs(d) < .0006 ? pGoal : pNow + d * k;
    renderStairs(pNow);
    glideRaf = pNow === pGoal ? 0 : requestAnimationFrame(glide);
  }
  function renderStairs(p) {
    stepEls.forEach((s, i) => {
      const l = c01((p - i * .13) / .38);
      s.style.transform = l >= 1 ? '' : `translateY(${((1 - E.out(l)) * 100).toFixed(2)}%)`;
    });
    const u = (p - .26) / .13;   // 0 = aterriza en el primer escalón, 4 = en el último
    if (u < 0) {
      const d = c01((p - .17) / .09);
      placeHopper(geo[0].x, geo[0].top - (1 - E.out(d)) * 46, 1, d);
      return;
    }
    const k = Math.min(4, Math.floor(u)), t = u - k;
    if (k >= 4) { placeHopper(geo[4].x, geo[4].top, t < .15 ? 1 - .14 * (1 - t / .15) : 1, 1); return; }
    const h = c01((t - .35) / .65), he = E.inOut(h);
    let ky = 1;
    if (t < .15) ky = 1 - .14 * (1 - t / .15);                                    // aterriza
    else if (h === 0) ky = 1 - .3 * E.inOut(c01((t - .15) / .2));                 // se agacha
    else ky = h < .15 ? .7 + .4 * (h / .15) : 1.1 - .1 * ((h - .15) / .85);       // vuela
    const a = geo[k], b = geo[k + 1];
    placeHopper(a.x + (b.x - a.x) * he, a.top + (b.top - a.top) * he - Math.sin(Math.PI * h) * 70, ky, 1);
  }

  /* ---------- cabecera: sombra al bajar ---------- */
  const top = document.getElementById('top');
  let ticking = false;
  const frame = () => { ticking = false; stairsFrame(); top.classList.toggle('scrolled', scrollY > 8); };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
  addEventListener('resize', () => { measure(); frame(); });
  measure(); frame();
  // las fuentes y las fotos cambian la altura de la caja fija
  addEventListener('load', () => { measure(); frame(); });
  if (document.fonts) document.fonts.ready.then(() => { measure(); frame(); });

  /* ---------- módulos: filtro por tema ---------- */
  const cards = [...document.querySelectorAll('.card')];
  const fBtns = [...document.querySelectorAll('.filters button')];
  let fTimer = 0;
  fBtns.forEach(b => b.addEventListener('click', () => {
    const f = b.dataset.f;
    fBtns.forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    clearTimeout(fTimer);
    const show = c => f === 'all' || c.dataset.cat === f;
    cards.forEach(c => { if (!show(c)) c.classList.add('fade'); });
    fTimer = setTimeout(() => {
      cards.forEach(c => { c.hidden = !show(c); });
      const vis = cards.filter(show);
      vis.forEach(c => c.classList.add('fade'));
      void document.body.offsetWidth;
      vis.forEach((c, i) => { c.style.transitionDelay = (i * 40) + 'ms'; c.classList.remove('fade'); });
      setTimeout(() => vis.forEach(c => c.style.transitionDelay = ''), 500);
    }, reduce ? 0 : 180);
  }));

  /* ---------- formulario «Postula»: se guarda con /api/jump-postular y el equipo lo ve en su panel ---------- */
  const form = document.getElementById('form');
  const btn = document.getElementById('sendBtn');
  const rules = [
    ['f-nombre', 'e-nombre', v => v.trim().length >= 3, 'Escribe tu nombre y apellido.'],
    ['f-wa', 'e-wa', v => !!whatsapp(v), 'Revisa el número: debe ser un celular de Ecuador, por ejemplo 0991234567.'],
    ['f-negocio', 'e-negocio', v => v.trim().length >= 2, 'Escribe el nombre de tu emprendimiento, aunque sea provisional.'],
    ['f-rubro', 'e-rubro', v => v !== '', 'Elige qué vendes. Si no aparece, marca “Otro”.'],
    ['f-sector', 'e-sector', v => v.trim().length >= 2, 'Cuéntanos en qué sector de La Aurora estás.']
  ];
  const setErr = (field, errEl, m) => {
    document.getElementById(errEl).textContent = m;
    const box = document.getElementById(field).closest('.field');
    if (m) box.setAttribute('data-error', ''); else box.removeAttribute('data-error');
  };
  form.addEventListener('submit', e => {
    e.preventDefault();
    let first = null;
    rules.forEach(([id, err, ok, m]) => {
      const el = document.getElementById(id);
      const bad = !ok(el.value);
      setErr(id, err, bad ? m : '');
      if (bad && !first) first = el;
    });
    const ruc = form.querySelector('input[name="ruc"]:checked');
    document.getElementById('e-ruc').textContent = ruc ? '' : 'Elige una opción. No tener RUC no te descalifica.';
    if (!ruc && !first) first = form.querySelector('input[name="ruc"]');
    const aurora = document.getElementById('f-ok').checked;
    document.getElementById('e-ok').textContent = aurora ? '' : 'JUMP es exclusivo para emprendimientos de La Aurora: marca la casilla si es tu caso.';
    if (!aurora && !first) first = document.getElementById('f-ok');
    if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); return; }
    enviar({
      nombres: form.elements.nombre.value, whatsapp: form.elements.whatsapp.value, negocio: form.elements.negocio.value,
      rubro: form.elements.rubro.value, sector: form.elements.sector.value, ruc: ruc.value, aurora, sitio: form.elements.sitio.value,
    });
  });

  // Errores que devuelve el servidor, al lado de su campo.
  const CAMPOS = { nombres: ['f-nombre', 'e-nombre'], whatsapp: ['f-wa', 'e-wa'], negocio: ['f-negocio', 'e-negocio'],
    rubro: ['f-rubro', 'e-rubro'], sector: ['f-sector', 'e-sector'] };
  const formErr = document.getElementById('e-form');
  async function enviar(datos) {
    btn.disabled = true;
    btn.firstChild.textContent = 'Enviando… ';
    formErr.textContent = '';
    let r = null, j = {};
    try {
      r = await fetch('/api/jump-postular', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
      j = await r.json().catch(() => ({}));
    } catch { /* sin conexión: se avisa abajo */ }
    if (r && r.ok && j.ok) {
      if (j.repetida) {
        document.getElementById('okTitulo').textContent = 'Ya teníamos tu postulación.';
        document.getElementById('okTexto').textContent = 'No hace falta enviarla otra vez: te escribiremos por WhatsApp cuando abra la convocatoria.';
      }
      form.classList.add('done');
      btn.firstChild.textContent = 'Postulación enviada ';
      document.getElementById('ok').scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      return;
    }
    btn.disabled = false;
    btn.firstChild.textContent = 'Enviar postulación ';
    if (r && r.status === 400 && CAMPOS[j.campo]) {
      const [id, err] = CAMPOS[j.campo];
      setErr(id, err, j.error);
      document.getElementById(id).focus();
      return;
    }
    if (r && r.status === 400 && (j.campo === 'ruc' || j.campo === 'aurora')) {
      document.getElementById(j.campo === 'ruc' ? 'e-ruc' : 'e-ok').textContent = j.error;
      (j.campo === 'ruc' ? form.querySelector('input[name="ruc"]') : document.getElementById('f-ok')).focus();
      return;
    }
    formErr.textContent = r ? (j.error || 'No se pudo enviar. Intenta de nuevo en unos minutos.') : 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.';
  }
  form.addEventListener('input', e => {
    const r = rules.find(([id]) => id === e.target.id);
    if (r && document.getElementById(r[1]).textContent && r[2](e.target.value)) setErr(r[0], r[1], '');
    if (e.target.name === 'ruc') document.getElementById('e-ruc').textContent = '';
    if (e.target.id === 'f-ok' && e.target.checked) document.getElementById('e-ok').textContent = '';
  });
})();
