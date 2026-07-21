# VOID-NET v0.1 — Protocolo de red del Modo Juggernaut

> ⚠️ **OBSOLETO — no describe el sistema actual.** Este era el borrador interno
> del modo Juggernaut (WebSocket, envelope `{v,t,seq,ts,data}`, 60 Hz). El
> proyecto migró al **protocolo oficial "Captura la Bandera" v1.0** (TCP + JSON
> por línea, envelope `{type, protocolVersion}`) para interoperar con otros
> grupos. La implementación real está en `servidor.js`, `bridge.js`,
> `cliente-red.js` y `protocolo.js`; el plan y las reglas, en
> [`MIGRACION-PROTOCOLO-OFICIAL.md`](MIGRACION-PROTOCOLO-OFICIAL.md) y
> `docs/spec/CapturaLaBandera.docx`. Se conserva este archivo solo como
> referencia histórica del diseño anterior.

> Borrador de trabajo. Las **decisiones abiertas** del final las define el equipo.

## Modelo general

- **Transporte**: WebSocket (`ws://` en LAN, `wss://` en producción). Mensajes JSON
  en v0 (legible para depurar); binario (ArrayBuffer) como optimización futura.
- **Autoridad**: **servidor autoritativo**. Los clientes solo envían *intención*
  (input); el servidor corre la simulación real (puede reutilizar
  `juggernaut-mode.js` en Node con `npm i three` — el núcleo es motor-agnóstico
  y no toca el DOM) y publica el estado. Esto evita trampas y resuelve empates
  (dos jugadores tocando el estandarte el mismo tick).
- **Cadencia**: simulación del servidor a 60 Hz; `SNAPSHOT` a los clientes a
  20 Hz; los clientes **interpolan** entre snapshots con ~100 ms de búfer.
- **Eventos fiables**: los momentos discretos (captura, derribo, slam…) viajan
  como `EVENT` aparte de los snapshots, y mapean **1:1 al `NetworkBus`** que el
  juego ya usa — la integración es suscribirse y re-emitir.

## Sobre (envelope) común

```json
{ "v": 1, "t": "TIPO", "seq": 123, "ts": 1710000000000, "data": { } }
```

- `v` versión de protocolo · `t` tipo · `seq` contador por emisor · `ts` epoch ms.

## Mensajes cliente → servidor

| t | data | Notas |
|---|---|---|
| `HELLO` | `{ nombre }` | primer mensaje tras conectar |
| `INPUT` | `{ seq, mov: [x, z], acciones }` | 30–60 Hz; `mov` normalizado; `acciones` bitmask: TACKLE=1, DODGE=2, SLAM=4 |
| `PING` | `{ }` | medición de latencia |

## Mensajes servidor → cliente

| t | data |
|---|---|
| `WELCOME` | `{ id, config: { arenaRadius, winDominio, tickRate } }` |
| `SNAPSHOT` | `{ tick, jugadores: [{ id, p: [x,y,z], ry, estado, esJefe }], estandarte: { estado: "LIBRE"\|"PORTADO", pos?, portador? }, dominio: { id: seg } }` |
| `EVENT` | `{ tipo: "FLAG_CAPTURED"\|"JUGGERNAUT_BORN"\|"FLAG_DROPPED"\|"TACKLE_DASH"\|"GROUND_SLAM"\|"RING_OUT"\|"FIN_RONDA", ...detalle }` |
| `PONG` | `{ ts }` (eco del PING) |
| `ADIOS` | `{ id, motivo }` (jugador desconectado) |

## Flujo de una partida

```
cliente                     servidor
   │── ws connect ─────────────▶│
   │── HELLO {nombre} ─────────▶│  registra, asigna id
   │◀───────── WELCOME ─────────│
   │◀───────── SNAPSHOT (20Hz) ─│  (bucle)
   │── INPUT (30-60Hz) ────────▶│  aplica al Hunter correspondiente
   │◀───────── EVENT ───────────│  al ocurrir (re-emitir en NetworkBus local)
   │◀───────── EVENT FIN_RONDA ─│  dominio ≥ objetivo
```

## Lado cliente (resumen de implementación)

1. `ClienteRed` (ver `cliente-red.js`) abre el socket y hace el handshake.
2. Cada frame: empaqueta el input local (el mismo `inputVec` + flags que ya
   existen en `main.js`) → `INPUT`.
3. Al recibir `SNAPSHOT`: guarda en un búfer con timestamp; el render usa el
   estado interpolado en `t - 100ms`. Los knights remotos siguen usando
   `KnightAnimator` con la velocidad derivada del snapshot (la animación es
   local, solo viaja la posición).
4. Al recibir `EVENT`: `NetworkBus.dispatchEvent(...)` → el HUD, las chispas,
   las runas y el audio reaccionan sin cambiar ni una línea.

## Decisiones abiertas (equipo)

- [ ] Tick de snapshot definitivo (20 Hz propuesto) y ¿deltas o estado completo?
- [ ] Predicción local del propio avatar + reconciliación por `seq` (fase 2)
- [ ] Formato binario (Float32Array) cuando el JSON se quede corto
- [ ] Reconexión y re-sincronización (¿WELCOME con snapshot completo?)
- [ ] Salas/lobbies (¿una arena por sala?) y límite de 12 jugadores
- [ ] Anti-flood de INPUT y validación de rangos en servidor
