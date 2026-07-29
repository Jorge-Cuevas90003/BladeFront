# Cómo correr — Captura la Bandera (PRFC v3)

> [!IMPORTANT]
> La especificación normativa vigente se consulta en
> [erickm13/CC8-Protocolo](https://github.com/erickm13/CC8-Protocolo), rama
> `main` (versión declarada: `3.0.0`). Esta guía explica cómo ejecutar la
> implementación de BladeFront, pero no sustituye el estándar oficial.

Hay **dos formas de jugar**: local (para testear al instante) y en red (real,
protocolo TCP oficial). El motor del juego es el mismo en ambas.

## Requisitos

- Node.js 18+ (para el servidor, el bridge y el cliente CLI).
- Un navegador (para el visor 2D).
- Instalar dependencias del bridge una vez:
  ```bash
  cd red && npm install
  ```

---

## Opción 1 — Local (sin red, para testear siempre)

No necesita servidor ni bridge: el motor corre dentro del navegador con bots.

```bash
# desde la raíz del repo, sirve TODO el repo (el visor usa archivos de red/,
# que está fuera de assets/, por eso se sirve la raíz y no solo assets/)
npx http-server . -p 8139 -c-1
```

Hay **dos vistas** del mismo juego (misma lógica y protocolo, distinto render):

- **Arena 3D** (la nuestra, con los assets de BladeFront):
  `http://localhost:8139/assets/captura-bandera/index-3d.html`
- **Visor 2D** (depuración rápida, tablero plano):
  `http://localhost:8139/assets/captura-bandera/`

En la página: modo **Local**, elige cuántos bots, y pulsa **Entrar/Jugar**.
Muévete con WASD/flechas. Ideal para probar el motor sin montar red.

---

## Opción 2 — Red (protocolo TCP oficial, multijugador real)

Tres piezas, en tres terminales:

```bash
# 1) Servidor autoritativo (TCP puro, puerto 5000, escucha en toda la LAN)
node red/servidor.js --auto
#    Formas de arranque de partida (elige una):
#      --auto        arranca al primer JOIN (cómodo para probar)
#      --min 12      arranca cuando se junten 12 jugadores
#      --wait        el ANFITRIÓN inicia pulsando ENTER en la consola del servidor
#    Otras banderas: --port 5000  --host 0.0.0.0  (0.0.0.0 = accesible por Radmin/LAN)

# 2) Bridge WebSocket↔TCP (para que el navegador pueda conectarse)
node red/bridge.js --ws 8140 --tcp-port 5000

# 3) Servir el cliente web (raíz del repo)
npx http-server . -p 8139 -c-1
#    abrir http://localhost:8139/assets/captura-bandera/index-3d.html → modo "Red" → Jugar
```

Para jugar entre las 12 máquinas por Radmin: el servidor y el bridge corren en
UNA máquina (arranca el servidor con `--host 0.0.0.0`, que ya es el default);
las demás abren el visor apuntando el campo **Bridge** a la IP de Radmin de esa
máquina, p. ej. `ws://25.1.2.3:8140`. El indicador **Conexión** del HUD muestra
CONECTANDO / CONECTADO / DESCONECTADO para saber si el enlace está vivo.

> Nota: TCP crudo es lo que exige la spec (§23) para interoperar con otros
> grupos. El bridge NO cambia el protocolo hacia el servidor; solo traduce
> WebSocket↔TCP para que el navegador pueda participar.

---

## Opción 3 — Validar el protocolo por consola (prueba mínima §35)

Sin navegador, para confirmar que el transporte y el framing funcionan (útil
para probar interoperabilidad con el servidor/cliente de otro grupo):

```bash
node red/servidor.js --auto                 # terminal 1
node test/cliente-cli.js --auto-play        # terminal 2 (cliente JS)
```

Deberías ver el cliente hacer JOIN → JOIN_ACCEPTED, recibir GAME_STARTED y un
flujo de GAME_STATE con su posición cambiando cada ciclo.

### Prueba de interoperabilidad cross-lenguaje (Python)

Para demostrar que **otro lenguaje** habla el protocolo (proxy de "otro grupo"),
hay un cliente de conformidad en **Python puro** (solo `socket` + `json`, cero
código compartido con el JS):

```bash
node red/servidor.js --auto --port 5000          # terminal 1
python test/cliente_conformidad.py --port 5000   # terminal 2
```

Corre la prueba mínima §35 y sale con código 0 si pasa (12 comprobaciones:
conexión, JOIN/JOIN_ACCEPTED, GAME_STARTED, CHANGE_DIRECTION aplicado, varios
GAME_STATE con ticks monótonos, LEAVE). Verificado: **12 OK, 0 FAIL**.

> Sobre `playerId`: nuestro servidor asigna `P001`, `P002`… (el docx usa `P07`
> como *ejemplo*, no como formato obligatorio). Al conectarnos al servidor de
> otro grupo usamos el id que ELLOS nos den; da igual el formato.

---

## Piezas

| Archivo | Qué es |
|---|---|
| `assets/captura-bandera/js/juego-captura.js` | Motor autoritativo (rejilla, §30). Corre en navegador y Node |
| `assets/captura-bandera/js/bots.js` | IA simple para el modo local |
| `assets/captura-bandera/index-3d.html` + `js/visor-3d.js` | **Arena 3D** — reutiliza los assets de BladeFront (arena, cosmos, caballeros, estandarte) |
| `assets/captura-bandera/index.html` + `js/visor-2d.js` | Visor 2D jugable de depuración |
| `test/cliente_conformidad.py` | Cliente Python independiente — prueba interop cross-lenguaje (§35) |
| `red/protocolo.js` | Tipos de mensaje, versión y framing por `\n` (compartido) |
| `red/servidor.js` | Servidor TCP oficial (`--auto`/`--min`/`--wait`, `--host`, `--port`) |
| `red/bridge.js` | Traductor WebSocket↔TCP para el navegador |
| `red/cliente-red.js` | Cliente con modos `local` y `red` (mismo API) |
| `test/cliente-cli.js` | Cliente de consola para la prueba mínima §35 |

## Siguiente paso: render 3D

El cliente 3D de three.js escuchará los **mismos eventos** que el visor 2D
(`GAME_STATE`, `FLAG_STOLEN`, `GAME_OVER`…) sobre el mismo `ClienteCaptura`.
Solo cambia cómo se dibuja cada `[row, column]`: en vez de un círculo en canvas,
un caballero en la arena. Ver decisión #C en `MIGRACION-PROTOCOLO-OFICIAL.md`.
