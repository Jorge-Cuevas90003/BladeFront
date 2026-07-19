# ⚔️ Modo Juggernaut — Arena del Vacío

Juego de arena 3D **100 % web y 100 % procedural**: cero modelos, cero texturas,
cero archivos de audio — todo (personajes, escenario, cosmos, animaciones y
banda sonora) se genera con código sobre **three.js** y **Web Audio API**.

> **CTF corrupto**: 12 templarios estelares compiten por el Ciber-Estandarte.
> Quien lo toca se corrompe en el **Ejecutor del Vacío** — un jefe monstruoso —
> y los otros 11 lo cazan a placajes. El primero en acumular **45 s de Dominio**
> como Juggernaut gana, sobre una arena flotante rodeada de un abismo del que
> es muy fácil salir despedido.

Proyecto para **Computer Science 8 — Proyecto 1 (Juego)**, desarrollado en pair
programming con IA (Claude Code); todo el proceso está documentado prompt a
prompt en [`PROMPTS.md`](PROMPTS.md).

## 🎮 Jugar (local)

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

## 📁 Estructura

```
assets/
  caballero-templario/   Caballero (personaje) + rig + animador procedural
    js/knight.js           createKnight() — malla procedural con pivotes
    js/knight-anim.js      KnightAnimator — marcha, 5 idles, 3 placajes, esquivas…
  arena-vacio/           Escenario
    js/arena.js            createArena() — arena flotante con runas
    js/cosmos.js           createCosmos() — monolitos, Eclipse, ceniza, niebla GPU
  ejecutor-del-vacio/    Enemigo / jefe
    js/executor.js         createExecutor() — verdugo corrupto (vértices a mano)
    js/enemy-system.js     EnemySystem — steering, colisión, knockback
  modo-juggernaut/       EL JUEGO (integra todo lo anterior)
    js/juggernaut-mode.js  Reglas, estados, física, bus de eventos
    js/flag.js             Ciber-Estandarte (onda de vértices)
    js/audio.js            VoidScore — música y SFX procedurales (Web Audio)
    js/main.js             Escena, input, cámara, HUD, efectos
red/                     Multijugador (en desarrollo con el equipo)
    PROTOCOLO.md           VOID-NET v0.1 — especificación del protocolo propio
    servidor.js            Esqueleto de servidor autoritativo (Node + ws)
    cliente-red.js         Adaptador navegador ↔ socket
```

Cada asset es también un **visor de concept art** navegable con botón de
captura PNG (`/caballero-templario/`, `/arena-vacio/`, `/ejecutor-del-vacio/`).

## 🏗️ Decisiones de arquitectura

- **Factories reutilizables**: cada pieza exporta `createX()` que devuelve un
  `THREE.Group` — el concept art *es* el asset del juego.
- **Núcleo motor-agnóstico**: reglas y física no tocan DOM ni React; hay
  wrappers R3F (`VoidExecutor.jsx`, `JuggernautMode.jsx`) listos por si el
  shell final se hace con React Three Fiber, y el servidor podrá correr la
  misma simulación headless en Node.
- **`NetworkBus`** (EventTarget): todos los momentos de juego viajan como
  eventos — la costura exacta donde se enchufa el WebSocket (ver `red/`).
- Sin build step: importmap + CDN (`three@0.180.0`). Abrir y jugar.

## 🌐 Multijugador (roadmap)

Un jugador por computadora vía WebSockets con protocolo propio (**VOID-NET**),
servidor autoritativo con la misma simulación del cliente. Especificación y
esqueletos en [`red/`](red/PROTOCOLO.md) — las decisiones abiertas están
marcadas para resolverse en equipo.

## 🤖 Desarrollo asistido por IA

Construido en sesiones con Claude Code (modelos Claude Fable 5 / Sonnet 5).
Todos los prompts usados están transcritos íntegros y en orden en
[`PROMPTS.md`](PROMPTS.md) como documentación del proceso, junto con lo que
produjo cada uno.

## 📄 Licencia

MIT — ver [`LICENSE`](LICENSE).
