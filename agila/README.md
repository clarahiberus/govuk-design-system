# Agila — Home

Home del sello extremeño Agila. Una sola idea: **AGITAR**. HTML + CSS + JS vanilla, sin dependencias.

```
agila/
├── index.html
├── styles.css
├── main.js              ← constantes ajustables al principio (CONFIG)
├── data/catalogo.json   ← temas de ejemplo (ficticios)
├── assets/agila-logo.svg← ⚠️ TODO: logo PROVISIONAL
└── audio/               ← aquí van los mp3 (vacía de momento)
```

## Arrancar

Abre `index.html` directamente (usará el logo inline y el catálogo de respaldo de `main.js`) o, mejor, con un servidor estático:

```bash
npx serve agila
```

## Sustituir el logo

1. Sustituye `assets/agila-logo.svg` por el wordmark oficial.
2. Cada letra debe ir en su propio `<g>` con estos ids: `letra-a`, `letra-g`, `letra-i`, `letra-l`, `letra-a2`. Usa `fill="currentColor"` y quita el atributo `data-placeholder`.
3. Con servidor http, `main.js` carga ese archivo y sustituye el placeholder. Para que también funcione con `file://`, pega el mismo `<svg>` dentro de `index.html` (en `#logo`, conservando `role="img"` y `aria-label="Agila"`).

## Sustituir los audios

Copia los mp3 en `audio/` y edita `data/catalogo.json` (`id`, `artista`, `titulo`, `src`). Las rutas son relativas (`audio/agl-001.mp3`) para que funcione en subcarpetas y con `file://`. Si cambias el catálogo, actualiza también `CATALOGO_RESPALDO` en `main.js`. Si un archivo falta, el reproductor muestra **SIN SEÑAL** y sigue funcionando.

## Probar la sacudida en el móvil

`DeviceMotionEvent` solo funciona con **HTTPS**. Opciones:

- Servidor local + túnel:
  ```bash
  npx serve agila -l 3000
  ```
  ```bash
  npx localtunnel --port 3000
  ```
  (o `cloudflared tunnel --url http://localhost:3000`) y abre la URL https en el móvil.
- O arrastra la carpeta `agila/` a [Netlify Drop](https://app.netlify.com/drop).

En el móvil, toca **TOCA PARA ACTIVAR · LUEGO AGITA** (en iOS pide permiso al sensor; en todos desbloquea el audio) y agita. Si no salta, baja `SHAKE_THRESHOLD` en `main.js`. En desktop: botón **AGITAR** o tecla **Espacio**.

## Accesibilidad

- `prefers-reduced-motion: reduce` → no hay ningún temblor; las letras se ponen en rosa 300 ms y el tema sigue sonando.
- Textos de esquina ≥ 20 px en negrita (24 px en desktop) en negro sobre rojo; los textos pequeños (nav en móvil, reproductor) van en banda negra con texto rosa.
- El audio solo arranca tras una acción del usuario y siempre se puede pausar. El botón AGITAR es la alternativa a la sacudida.
