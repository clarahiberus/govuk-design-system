/* ==========================================================================
   AGILA — Home. "No pretende encajar, sino agitar."
   JavaScript vanilla, sin dependencias.
   ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
   CONSTANTES AJUSTABLES
   -------------------------------------------------------------------------- */
const CONFIG = {
  // Sacudida del móvil
  SHAKE_THRESHOLD: 15,          // m/s² de aceleración (sin gravedad) para contar como sacudida
  SHAKE_DEBOUNCE_MS: 1500,      // tiempo mínimo entre dos sacudidas
  SHAKE_DURATION_MS: 600,       // cuánto tiemblan todas las letras al agitar
  SHAKE_INTENSITY: 1.6,         // multiplicador del temblor al agitar (1 = temblor de hover)
  VIBRATION_PATTERN: [40, 30, 60],

  // Temblor de las letras
  STEP_MS: 50,                  // frecuencia de los saltos (40–60 ms = nervioso)
  TREMBLE_MIN_PX: 2,            // desplazamiento mínimo (px de pantalla)
  TREMBLE_MAX_PX: 6,            // desplazamiento máximo
  TREMBLE_MIN_DEG: 1,           // rotación mínima
  TREMBLE_MAX_DEG: 3,           // rotación máxima
  PROXIMITY_RADIUS_PX: 220,     // a partir de esta distancia, una letra vecina ya no tiembla
  NEIGHBOR_FACTOR: 0.5,         // intensidad máxima de una vecina respecto a la letra bajo el cursor
  FINAL_HIT_FACTOR: 0.8,        // fuerza del "último golpe seco" al salir el cursor

  // Movimiento reducido
  REDUCED_FLASH_MS: 300,        // duración del destello rosa

  // Rutas (relativas para que funcione en subcarpetas)
  CATALOG_URL: 'data/catalogo.json',
  LOGO_URL: 'assets/agila-logo.svg',
};

/* Copia del catálogo para cuando no se puede hacer fetch (abriendo con file://).
   Mantener sincronizada con data/catalogo.json. */
const CATALOGO_RESPALDO = [
  { id: 'AGL-001', artista: 'Encina Brava', titulo: 'Kilómetro Cero', src: 'audio/agl-001.mp3' },
  { id: 'AGL-002', artista: 'Los Jaras', titulo: 'Sur o Nada', src: 'audio/agl-002.mp3' },
  { id: 'AGL-003', artista: 'Dehesa Eléctrica', titulo: 'Periferia Central', src: 'audio/agl-003.mp3' },
  { id: 'AGL-004', artista: 'Corcho', titulo: 'No Encajar', src: 'audio/agl-004.mp3' },
  { id: 'AGL-005', artista: 'La Bellota Negra', titulo: 'Agitar', src: 'audio/agl-005.mp3' },
];

const LETTER_IDS = ['letra-a', 'letra-g', 'letra-i', 'letra-l', 'letra-a2'];

/* --------------------------------------------------------------------------
   Utilidades
   -------------------------------------------------------------------------- */
const $ = (sel) => document.querySelector(sel);
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
/** Valor aleatorio con signo, nunca cerca de 0: saltos bruscos, no deriva suave */
const jolt = (amp) => (Math.random() < 0.5 ? -1 : 1) * rand(amp * 0.4, amp);

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const isReducedMotion = () => reducedMotionQuery.matches;
const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/* --------------------------------------------------------------------------
   Logo: intenta cargar assets/agila-logo.svg y sustituir el placeholder inline
   -------------------------------------------------------------------------- */
async function loadLogo(svg) {
  if (!/^https?:$/.test(location.protocol)) return; // file:// → placeholder inline
  svg.classList.add('is-cargando');
  try {
    const res = await fetch(CONFIG.LOGO_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
    const ext = doc.querySelector('svg');
    const ok = ext && LETTER_IDS.every((id) => ext.querySelector('#' + id));
    if (!ok) {
      console.warn('[Agila] assets/agila-logo.svg no tiene los ids', LETTER_IDS, '— se usa el placeholder.');
      return;
    }
    const viewBox = ext.getAttribute('viewBox');
    if (viewBox) svg.setAttribute('viewBox', viewBox);
    svg.replaceChildren(...Array.from(ext.childNodes, (n) => document.importNode(n, true)));
    LETTER_IDS.forEach((id) => svg.querySelector('#' + id).classList.add('letra'));
    if (!ext.hasAttribute('data-placeholder')) svg.removeAttribute('data-placeholder');
  } catch (err) {
    console.warn('[Agila] No se pudo cargar el logo, se usa el placeholder.', err);
  } finally {
    svg.classList.remove('is-cargando');
  }
}

/* --------------------------------------------------------------------------
   Temblor de letras
   -------------------------------------------------------------------------- */
function createTrembler(svg) {
  const letters = LETTER_IDS.map((id) => ({
    el: svg.querySelector('#' + id),
    rect: null,        // caja en pantalla (sin transformar)
    moving: false,
    finalHit: false,
  }));

  const pointer = { x: 0, y: 0, active: false };
  let shakeUntil = 0;
  let lastStep = 0;
  let rafId = 0;
  let unitsPerPx = 1;

  function measure() {
    letters.forEach((l) => { l.el.style.transform = ''; l.moving = false; l.finalHit = false; });
    const box = svg.getBoundingClientRect();
    unitsPerPx = box.width ? svg.viewBox.baseVal.width / box.width : 1;
    letters.forEach((l) => { l.rect = l.el.getBoundingClientRect(); });
  }

  function distanceToRect(r, x, y) {
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    return Math.hypot(dx, dy);
  }

  function intensityFor(l, now) {
    if (now < shakeUntil) return CONFIG.SHAKE_INTENSITY;
    if (!pointer.active || !l.rect) return 0;
    const d = distanceToRect(l.rect, pointer.x, pointer.y);
    if (d === 0) return 1; // cursor sobre la letra
    return Math.max(0, 1 - d / CONFIG.PROXIMITY_RADIUS_PX) * CONFIG.NEIGHBOR_FACTOR;
  }

  function setTransform(l, px, py, deg) {
    l.el.style.transform =
      `translate(${(px * unitsPerPx).toFixed(2)}px, ${(py * unitsPerPx).toFixed(2)}px) rotate(${deg.toFixed(2)}deg)`;
  }

  function frame(now) {
    rafId = 0;
    if (isReducedMotion()) return;

    let keepGoing = pointer.active || now < shakeUntil;

    // Saltos discretos: solo se actualiza cada STEP_MS (efecto steps(), no easing)
    if (now - lastStep >= CONFIG.STEP_MS) {
      lastStep = now;
      letters.forEach((l) => {
        const i = intensityFor(l, now);
        if (i > 0.02) {
          const amp = CONFIG.TREMBLE_MIN_PX + (CONFIG.TREMBLE_MAX_PX - CONFIG.TREMBLE_MIN_PX) * i;
          const rot = CONFIG.TREMBLE_MIN_DEG + (CONFIG.TREMBLE_MAX_DEG - CONFIG.TREMBLE_MIN_DEG) * i;
          setTransform(l, jolt(amp), jolt(amp), jolt(rot));
          l.moving = true;
          l.finalHit = false;
        } else if (l.moving) {
          // Último golpe seco: un salto hacia abajo y, en el siguiente paso, a su sitio
          const f = CONFIG.FINAL_HIT_FACTOR;
          setTransform(l, jolt(CONFIG.TREMBLE_MAX_PX * f * 0.5), CONFIG.TREMBLE_MAX_PX * f, jolt(CONFIG.TREMBLE_MAX_DEG * f));
          l.moving = false;
          l.finalHit = true;
        } else if (l.finalHit) {
          l.el.style.transform = '';
          l.finalHit = false;
        }
      });
    }

    if (letters.some((l) => l.moving || l.finalHit)) keepGoing = true;
    if (keepGoing) rafId = requestAnimationFrame(frame);
  }

  function wake() {
    if (!rafId && !isReducedMotion()) rafId = requestAnimationFrame(frame);
  }

  // Destello rosa (movimiento reducido)
  const flashTimers = new WeakMap();
  function flash(l) {
    clearTimeout(flashTimers.get(l.el));
    l.el.classList.add('letra--destello');
    flashTimers.set(l.el, setTimeout(() => l.el.classList.remove('letra--destello'), CONFIG.REDUCED_FLASH_MS));
  }

  // Eventos de puntero (solo ratón/lápiz: en táctil no hay hover)
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    wake();
  }, { passive: true });

  document.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget) { pointer.active = false; wake(); } // el cursor sale de la ventana
  });
  window.addEventListener('blur', () => { pointer.active = false; wake(); });

  letters.forEach((l) => {
    l.el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch' && isReducedMotion()) flash(l);
    });
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 100);
  });

  reducedMotionQuery.addEventListener('change', () => {
    cancelAnimationFrame(rafId);
    rafId = 0;
    measure(); // limpia cualquier transform pendiente
  });

  measure();

  return {
    measure,
    /** Todas las letras a la vez, fuerte y desordenado */
    shakeAll() {
      if (isReducedMotion()) {
        letters.forEach(flash);
        return;
      }
      shakeUntil = performance.now() + CONFIG.SHAKE_DURATION_MS;
      lastStep = 0;
      wake();
    },
  };
}

/* --------------------------------------------------------------------------
   Reproductor
   -------------------------------------------------------------------------- */
function createPlayer() {
  const audio = $('#player');
  const texto = $('#sonando-texto');
  const btn = $('#btn-pausa');
  const anuncio = $('#anuncio');

  let catalogo = CATALOGO_RESPALDO;
  let current = null;   // tema cargado
  let lastId = null;
  let token = 0;        // invalida eventos de cargas anteriores
  let silentUrl = null;
  let unlocked = false;

  const label = (t) => `${t.id} — ${t.artista} — ${t.titulo}`;

  function render(state) {
    switch (state) {
      case 'playing':
        texto.textContent = '▶ ' + label(current);
        btn.textContent = 'Pausa';
        btn.setAttribute('aria-label', 'Pausar ' + current.titulo);
        btn.setAttribute('aria-disabled', 'false');
        break;
      case 'paused':
        texto.textContent = '❚❚ ' + label(current);
        btn.textContent = 'Play';
        btn.setAttribute('aria-label', 'Reanudar ' + current.titulo);
        btn.setAttribute('aria-disabled', 'false');
        break;
      case 'loading':
        texto.textContent = '… ' + label(current);
        btn.textContent = 'Stop';
        btn.setAttribute('aria-label', 'Detener');
        btn.setAttribute('aria-disabled', 'false');
        break;
      case 'nosignal':
        texto.textContent = '✕ Sin señal' + (current ? ' · ' + current.id : '');
        btn.textContent = 'Pausa';
        btn.removeAttribute('aria-label');
        btn.setAttribute('aria-disabled', 'true');
        break;
      default: // idle
        texto.textContent = '■ En silencio';
        btn.textContent = 'Pausa';
        btn.removeAttribute('aria-label');
        btn.setAttribute('aria-disabled', 'true');
    }
  }

  function announce(msg) {
    // Vaciar primero para que se repita el anuncio aunque el texto coincida
    anuncio.textContent = '';
    setTimeout(() => { anuncio.textContent = msg; }, 50);
  }

  function noSignal(myToken) {
    if (myToken !== token) return;
    audio.removeAttribute('src');
    audio.load();
    render('nosignal');
    announce(`Sin señal: ${current ? current.id + ', ' + current.titulo : 'tema'} no disponible.`);
  }

  async function loadCatalog() {
    if (!/^https?:$/.test(location.protocol)) return; // file:// → respaldo
    try {
      const res = await fetch(CONFIG.CATALOG_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      if (Array.isArray(data) && data.length) catalogo = data.filter((t) => t && t.id && t.src);
    } catch (err) {
      console.warn('[Agila] No se pudo cargar el catálogo, se usa el respaldo.', err);
    }
  }

  function pickRandom() {
    if (catalogo.length < 2) return catalogo[0] || null;
    let t;
    do { t = catalogo[Math.floor(Math.random() * catalogo.length)]; } while (t.id === lastId);
    return t;
  }

  /** Audio WAV de silencio para desbloquear el elemento <audio> con un gesto */
  function makeSilentUrl() {
    const n = 800, sr = 8000;
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  audio.addEventListener('error', () => { if (current) noSignal(token); });
  audio.addEventListener('playing', () => { if (current) render('playing'); });
  audio.addEventListener('pause', () => { if (current && audio.src && !audio.ended) render('paused'); });
  audio.addEventListener('ended', () => {
    if (!current) return;
    current = null;
    render('idle');
  });

  btn.addEventListener('click', () => {
    if (btn.getAttribute('aria-disabled') === 'true' || !current) return;
    if (audio.paused && audio.src) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
      if (audio.readyState < 2) { // aún cargando → stop
        token++;
        audio.removeAttribute('src');
        audio.load();
        current = null;
        render('idle');
      }
    }
  });

  render('idle');

  return {
    loadCatalog,

    /** Desbloquea el audio dentro de un gesto del usuario (iOS / autoplay) */
    unlock() {
      if (unlocked) return;
      unlocked = true;
      if (current) return; // ya hay algo sonando por un gesto
      silentUrl = silentUrl || makeSilentUrl();
      audio.src = silentUrl;
      audio.play()
        .then(() => { if (audio.src === silentUrl) { audio.pause(); audio.removeAttribute('src'); audio.load(); } })
        .catch(() => {});
    },

    /** Reproduce un tema aleatorio, distinto del anterior */
    playRandom() {
      const t = pickRandom();
      if (!t) { current = null; render('nosignal'); announce('Sin señal: catálogo vacío.'); return; }
      const myToken = ++token;
      current = t;
      lastId = t.id;
      unlocked = true;
      audio.src = t.src;
      render('loading');
      announce(`Suena ${t.id}: ${t.artista}, ${t.titulo}.`);
      audio.play().catch((err) => {
        if (myToken !== token) return;
        if (err && err.name === 'NotAllowedError') {
          // El navegador bloqueó el audio: queda en pausa, el usuario puede darle a Play
          render('paused');
        } else if (err && err.name !== 'AbortError') {
          noSignal(myToken);
        }
      });
    },
  };
}

/* --------------------------------------------------------------------------
   Sacudida (DeviceMotion) + fallbacks
   -------------------------------------------------------------------------- */
function createShakeDetector(onShake) {
  let last = 0;
  let listening = false;

  function handle(e) {
    let mag = 0;
    const a = e.acceleration;
    if (a && a.x != null) {
      mag = Math.hypot(a.x, a.y, a.z);
    } else if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.x != null) {
      const g = e.accelerationIncludingGravity;
      mag = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
    }
    if (mag < CONFIG.SHAKE_THRESHOLD) return;
    const now = Date.now();
    if (now - last < CONFIG.SHAKE_DEBOUNCE_MS) return;
    last = now;
    onShake('sacudida');
  }

  return {
    supported: 'DeviceMotionEvent' in window,
    needsPermission: 'DeviceMotionEvent' in window && typeof DeviceMotionEvent.requestPermission === 'function',
    async start() {
      if (listening || !this.supported) return listening;
      try {
        if (this.needsPermission) {
          const state = await DeviceMotionEvent.requestPermission();
          if (state !== 'granted') return false;
        }
        window.addEventListener('devicemotion', handle, { passive: true });
        listening = true;
      } catch (err) {
        console.warn('[Agila] Sin acceso al sensor de movimiento.', err);
      }
      return listening;
    },
  };
}

/* --------------------------------------------------------------------------
   Arranque
   -------------------------------------------------------------------------- */
(async function init() {
  const svg = $('#logo');
  const player = createPlayer();

  await Promise.all([loadLogo(svg), player.loadCatalog()]);

  const trembler = createTrembler(svg);

  function agitar() {
    trembler.shakeAll();
    if (navigator.vibrate) {
      try { navigator.vibrate(CONFIG.VIBRATION_PATTERN); } catch (_) { /* ignorado */ }
    }
    player.playRandom();
  }

  const shake = createShakeDetector(agitar);

  // Botón AGITAR (siempre disponible: alternativa a la sacudida, WCAG 2.5.4)
  $('#btn-agitar').addEventListener('click', agitar);

  // Tecla Espacio, salvo si el foco está en un control (allí Espacio lo activa)
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('button, a, input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    agitar();
  });

  // Táctil: un toque desbloquea el sensor (iOS) y el audio (autoplay)
  const btnActivar = $('#btn-activar');
  if (isTouch && shake.supported) {
    btnActivar.hidden = false;
    btnActivar.addEventListener('click', async () => {
      player.unlock();          // primero, dentro del gesto
      const ok = await shake.start();
      btnActivar.hidden = true;
      if (!ok) console.warn('[Agila] Sacudida no disponible: usa el botón AGITAR.');
    });
  } else if (shake.supported && !shake.needsPermission) {
    // Desktop con sensor (portátiles convertibles): escuchar sin pedir nada
    shake.start();
  }

  if (svg.hasAttribute('data-placeholder')) {
    console.info('%c[Agila] TODO: el logo es un PLACEHOLDER. Sustituye assets/agila-logo.svg (ver README).',
      'font-weight:bold');
  }
})();
