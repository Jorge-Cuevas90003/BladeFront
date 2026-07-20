# Plan de migración: VOID-NET v0.1 → "Captura la Bandera" v1.0 (oficial)

> **Estado:** solo documentación (no cambia código de juego todavía).
> Rama: `protocolo-oficial-tcp`.
>
> **Meta:** que BladeFront pueda jugar la **misma partida** que otros grupos
> (otros lenguajes, otros motores gráficos) compartiendo el protocolo oficial
> de `CapturaLaBandera.docx` (v1.0). Cada grupo dibuja como quiera; todos
> hablan el mismo protocolo y ven el mismo tablero.

---

## 0. Decisiones ya tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| **¿Cumplir el protocolo del Word?** | **Sí, al 100%** | Hay que interoperar con otros grupos → no es negociable |
| **Transporte** | **TCP + JSON por línea (`\n`)** | Lo exige la spec (§23). WebSocket queda descartado para hablar con el servidor oficial |
| **Juego / reglas** | **Rejilla 2D del Word** (snake + bandera) | Para sincronizar con otros grupos, la lógica debe ser la misma |
| **El 3D de BladeFront** | **Se conserva como capa VISUAL** | El servidor manda `[row, column]`; nuestro cliente lo dibuja en 3D |
| **Dónde corre el cliente** | **Navegador (three.js) + Bridge** | Requisito: que sea **tecnología web** (se abre con URL, no instalador) |

### La idea en una frase
El **juego lógico** es la captura-la-bandera en rejilla del Word. **Cómo lo
pintamos** es nuestro (arena 3D, caballeros, animaciones). Lo que viaja por
la red son posiciones `[row, column]`; three.js las convierte a 3D al dibujar.

---

## 1. Arquitectura elegida: navegador + Bridge

Un navegador **no puede abrir sockets TCP crudos** (solo WebSocket). Para
conservar three.js como app web y aun así hablar TCP con el servidor oficial,
metemos un **puente** (proceso Node) que traduce:

```
  ┌─────────────────┐   WebSocket local    ┌──────────────┐   TCP + JSON\n   ┌──────────────────┐
  │  Cliente web     │ ◀──────────────────▶ │   Bridge     │ ◀──────────────▶ │  Servidor oficial │
  │  (three.js, 3D)  │   (solo navegador↔   │  (Node `net` │   (protocolo     │  (cualquier grupo/ │
  │                  │    bridge)           │   + `ws`)    │    del Word)     │   lenguaje)        │
  └─────────────────┘                       └──────────────┘                  └──────────────────┘
```

- **El protocolo hacia el servidor oficial es el del Word, intacto.** El
  WebSocket solo existe entre el navegador y el bridge (tubería interna
  nuestra), nunca sale a la red compartida.
- El bridge hace el **framing** TCP: acumula bytes y corta por `\n` (un
  `recv` TCP puede traer media línea o varias juntas).
- Para hackathon: **desplegar el bridge** (Render/Fly.io/VPS) para que el
  jurado solo abra una URL, sin instalar Node ni levantar nada a mano.

> Alternativa descartada: **Electron** (TCP directo, sin bridge) — más limpio,
> pero es app de escritorio, no calificaría como "tecnología web".

---

## 2. Transporte y framing (§23, §24)

- **TCP** en el puerto `serverPort` (default **5000**).
- Cada mensaje: **un JSON en una línea**, UTF-8, terminado en **`\n`**.
- Leer **hasta `\n`**; el `\n` no es parte del JSON.
- El bridge debe bufferizar:
  ```
  buffer += chunk
  mientras buffer contenga '\n':
      linea, buffer = split en el primer '\n'
      procesar(JSON.parse(linea))
  ```

## 3. Sobre de mensajes (§26)

- `type` (no `t`), `protocolVersion: "1.0"` (string, no número `v:1`).
- Campos al nivel raíz (sin `data` anidado): `gameId`, `playerId`, `tick`
  cuando aplique.
- Rechazar versiones incompatibles → `UNSUPPORTED_PROTOCOL_VERSION`.

## 4. Mensajes (equivalencia con lo actual)

**Cliente → servidor:** `JOIN {name}` · `CHANGE_DIRECTION {direction}`
(UP/DOWN/LEFT/RIGHT) · `LEAVE`. (El cliente **nunca** manda posiciones.)

**Servidor → cliente:** `JOIN_ACCEPTED` · `JOIN_REJECTED` · `GAME_STARTED`
(tablero, obstáculos, bandera, jugadores) · `GAME_STATE` (por ciclo) ·
`FLAG_PICKED_UP` · `FLAG_STOLEN` · `PLAYER_DISCONNECTED` · `GAME_OVER` ·
`ERROR`.

Los eventos 3D propios (`JUGGERNAUT_BORN`, `TACKLE_DASH`, `GROUND_SLAM`,
`RING_OUT`) **no viajan** por la red — pueden seguir como efectos **locales**
de render si quieres, pero no son parte del protocolo compartido.

## 5. Lógica de juego = la del Word (resumen)

- Tablero `rows × columns` (20×20), coords `[fila, col]` desde 0, 1 jugador
  por casilla (§4, §5).
- Movimiento **snake**: dirección activa, avanza 1 casilla por ciclo; ciclo
  cada `movementIntervalMs` (200 ms) (§8, §9).
- Obstáculos aleatorios fijos, 10%, sin bloquear rutas; el server valida
  rutas antes de empezar (§10).
- Bandera única cerca del centro; estados AVAILABLE/CARRIED/DROPPED/OUTSIDE
  (§11).
- Robo al chocar con el portador (sin protección); protección 1000 ms tras
  robar; empates por `playerId` ascendente (§13–§16).
- Gana el portador que sale por un borde (§17, §18).
- **Orden exacto del ciclo del servidor: implementar §30 tal cual**, todos
  los movimientos del ciclo sobre el **mismo estado inicial** (§16, §31).

## 6. Impacto archivo por archivo

| Archivo | Acción |
|---|---|
| `red/servidor.js` | Reescritura: `ws` → `net` (TCP), framing `\n`, ciclo 200 ms con §30, puerto 5000. **Solo si implementamos servidor** (ver decisión abierta #B) |
| `red/bridge.js` | **Nuevo**: TCP (`net`) ↔ WebSocket (`ws`) local para el navegador |
| `red/cliente-red.js` | Reescritura: en vez de hablar TCP, habla con el **bridge** por WS; traduce `GAME_STATE` → estado local; mapea eventos oficiales al `NetworkBus` |
| `assets/captura-bandera/js/tablero.js` | **Nuevo** (opcional): motor de rejilla headless si hacemos servidor propio |
| `assets/…/main.js` (render) | Adaptar: leer `GAME_STATE`, mapear `[row,col]`→3D, dibujar caballeros/arena sobre eso |
| `red/PROTOCOLO.md` | Marcar VOID-NET como obsoleto; apuntar aquí |
| `red/package.json` | Deps: `ws` (bridge↔navegador) + `net` (nativo). Renombrar |
| `red/legacy/` | Mover ahí el VOID-NET viejo (WebSocket + Juggernaut) |

## 7. Prueba mínima de compatibilidad (§35)

- [ ] Conexión TCP al servidor (puerto 5000) — desde el **bridge**
- [ ] `JOIN` → `JOIN_ACCEPTED`
- [ ] `CHANGE_DIRECTION` → `GAME_STATE`
- [ ] Leer varios mensajes seguidos (framing `\n` correcto)
- [ ] Cierre correcto (`LEAVE` / socket close)

Hacer esto **antes** que el juego completo: valida transporte + framing, que
es donde más se rompe la interoperabilidad entre lenguajes.

## 8. Decisiones abiertas del equipo

- [ ] **#A** ¿El bridge lo despliega el equipo (URL pública) o cada quien lo
  corre local con Radmin?
- [ ] **#B** ¿Este repo hace **su propio servidor** oficial, o **solo el
  cliente** que se conecta al servidor de otro grupo? (La spec es de
  interop; quizá solo necesitas el cliente + bridge.)
- [ ] **#C** Mapeo `[row, column]` → escena 3D (una casilla = una posición
  3D; escala, altura, cámara).
- [ ] **#D** `gameId`/lobbies: `CREAR PARTIDA` / `UNIRSE A PARTIDA` (§3).

## 9. Orden de trabajo sugerido

1. Cerrar decisiones #A y #B (definen casi todo).
2. **Bridge** TCP↔WS + pasar la **prueba mínima §35**.
3. Adaptar `cliente-red.js` para hablar con el bridge.
4. Adaptar el render: `GAME_STATE` → 3D (mapeo `[row,col]`).
5. (Si hacemos servidor) motor de rejilla §30 headless + conectar.
6. Interoperar con otro grupo / cliente de referencia.
