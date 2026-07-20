# ⚔️ BladeFront — Arena del Vacío

Un CTF de 12 jugadores construido enteramente sobre **three.js**: sin modelos
importados, sin texturas, sin pistas de audio. La armadura de cada caballero,
la isla flotante, las animaciones y hasta la banda sonora salen de código —
geometría generada en tiempo de ejecución y **Web Audio API** para el sonido.

> Alguien agarra el Ciber-Estandarte del centro y se corrompe al instante en
> el **Ejecutor del Vacío**, un jefe monstruoso. Los otros once tienen que
> derribarlo a placajes antes de que acumule **45 s de Dominio** — si lo
> logra, gana la ronda. Todo pasa sobre una isla flotando en un abismo, así
> que perder el equilibrio también cuenta como perder.

Proyecto para **Computer Science 8 — Proyecto 1 (Juego)**.

<p align="center">
  <img src="docs/screenshots/executor-frente.jpg" width="90%" alt="El Ejecutor del Vacío de frente, retroiluminado por el Eclipse" />
</p>
<p align="center">
  <img src="docs/screenshots/arena-overview.jpg" width="44%" alt="Vista general de la Arena del Vacío flotando bajo el Eclipse" />
  <img src="docs/screenshots/caballero-retrato.jpg" width="44%" alt="Retrato del Caballero Templario Estelar" />
</p>

## Jugarlo

```bash
npx http-server "assets" -p 8139 -c-1
# → abrir http://localhost:8139/modo-juggernaut/
```

| Tecla | Acción |
|---|---|
| `WASD` | Moverse (relativo a cámara) |
| `Espacio` / `F` | Placaje — o **Ground Slam** si eres el Juggernaut |
| `Shift` / `Q` | Esquiva (voltereta o deslizamiento) |
| `C` | Ceder / retomar el control (IA ↔ humano) |
| `M` | Silenciar la música |
| `P` | Pausa · `R` reinicia tras la victoria |

## Cómo está armado

```
assets/
  caballero-templario/   El personaje: malla + rig + animador
    js/knight.js            createKnight() — geometría procedural con pivotes
    js/knight-anim.js       KnightAnimator — marcha, 5 idles, 3 placajes, esquivas…
  arena-vacio/            El escenario
    js/arena.js              createArena() — isla flotante con runas
    js/cosmos.js             createCosmos() — monolitos, Eclipse, niebla en GPU
    js/titans.js             Guerra de titanes de fondo (Arconte vs. Behemoth)
  ejecutor-del-vacio/     El jefe
    js/executor.js           createExecutor() — verdugo corrupto (vértices a mano)
    js/enemy-system.js       EnemySystem — steering, colisión, knockback
  modo-juggernaut/        Donde todo se junta
    js/juggernaut-mode.js    Reglas, estados, física, bus de eventos
    js/flag.js               Ciber-Estandarte (onda de vértices)
    js/audio.js              VoidScore — música y SFX procedurales
    js/main.js               Escena, input, cámara, HUD, efectos
red/                      Multijugador (en construcción)
    PROTOCOLO.md             VOID-NET v0.1 — protocolo propio
    servidor.js              Esqueleto de servidor autoritativo (Node + ws)
    cliente-red.js           Adaptador navegador ↔ socket
```

Cada carpeta de `assets/` funciona también sola, como visor con botón de
captura PNG (`/caballero-templario/`, `/arena-vacio/`, `/ejecutor-del-vacio/`).

## Por qué está organizado así

Cada pieza exporta un `createX()` que devuelve un `THREE.Group` — nada vive
atado a una escena en particular, así que se pueden mezclar libremente (el
Ejecutor camina sobre la Arena, el Caballero se reutiliza como los 11
cazadores, etc). Las reglas del juego tampoco tocan el DOM ni dependen de
three.js directamente: viven en clases planas que reciben posiciones y
devuelven física, lo que deja la puerta abierta a correr la misma simulación
en un servidor Node sin reescribir nada. Los eventos importantes de una
partida (captura, derribo, slam, caída) pasan por un `EventTarget` compartido
— ahí es donde se engancha el HUD, el audio, y donde se enganchará la red.

Sin paso de build: todo carga por `<script type="module">` + importmap
apuntando a un CDN. Se abre el HTML y ya está corriendo.

## Multijugador (en construcción)

La idea es un jugador por computadora, comunicados por WebSockets con un
protocolo propio que estamos definiendo en equipo (**VOID-NET**). El
servidor sería autoritativo y correría la misma simulación que ya existe en
el cliente. El borrador del protocolo y los esqueletos de servidor/cliente
están en [`red/`](red/PROTOCOLO.md), con las decisiones que todavía faltan
resolver marcadas ahí mismo.

## Licencia

MIT — ver [`LICENSE`](LICENSE).
