# Cómo correr — Captura la Bandera (protocolo oficial v1.0)

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
# abrir:  http://localhost:8139/assets/captura-bandera/
```

En la página: modo **Local**, elige cuántos bots, y pulsa **Jugar**.
Muévete con WASD/flechas. Ideal para probar cambios del motor sin montar red.

---

## Opción 2 — Red (protocolo TCP oficial, multijugador real)

Tres piezas, en tres terminales:

```bash
# 1) Servidor autoritativo (TCP puro, puerto 5000)
node red/servidor.js --auto

# 2) Bridge WebSocket↔TCP (para que el navegador pueda conectarse)
node red/bridge.js --ws 8140 --tcp-port 5000

# 3) Servir el cliente web (raíz del repo)
npx http-server . -p 8139 -c-1
#    abrir http://localhost:8139/assets/captura-bandera/  → modo "Red" → Jugar
```

Para jugar entre las 12 máquinas por Radmin: el servidor y el bridge corren en
UNA máquina; las demás abren el visor apuntando el campo **Bridge** a la IP de
Radmin de esa máquina, p. ej. `ws://25.1.2.3:8140`.

> Nota: TCP crudo es lo que exige la spec (§23) para interoperar con otros
> grupos. El bridge NO cambia el protocolo hacia el servidor; solo traduce
> WebSocket↔TCP para que el navegador pueda participar.

---

## Opción 3 — Validar el protocolo por consola (prueba mínima §35)

Sin navegador, para confirmar que el transporte y el framing funcionan (útil
para probar interoperabilidad con el servidor/cliente de otro grupo):

```bash
node red/servidor.js --auto                 # terminal 1
node test/cliente-cli.js --auto-play        # terminal 2
```

Deberías ver el cliente hacer JOIN → JOIN_ACCEPTED, recibir GAME_STARTED y un
flujo de GAME_STATE con su posición cambiando cada ciclo.

---

## Piezas

| Archivo | Qué es |
|---|---|
| `assets/captura-bandera/js/juego-captura.js` | Motor autoritativo (rejilla, §30). Corre en navegador y Node |
| `assets/captura-bandera/js/bots.js` | IA simple para el modo local |
| `assets/captura-bandera/index.html` + `js/visor-2d.js` | Visor 2D jugable de prueba |
| `red/protocolo.js` | Tipos de mensaje, versión y framing por `\n` (compartido) |
| `red/servidor.js` | Servidor TCP oficial |
| `red/bridge.js` | Traductor WebSocket↔TCP para el navegador |
| `red/cliente-red.js` | Cliente con modos `local` y `red` (mismo API) |
| `test/cliente-cli.js` | Cliente de consola para la prueba mínima §35 |

## Siguiente paso: render 3D

El cliente 3D de three.js escuchará los **mismos eventos** que el visor 2D
(`GAME_STATE`, `FLAG_STOLEN`, `GAME_OVER`…) sobre el mismo `ClienteCaptura`.
Solo cambia cómo se dibuja cada `[row, column]`: en vez de un círculo en canvas,
un caballero en la arena. Ver decisión #C en `MIGRACION-PROTOCOLO-OFICIAL.md`.
