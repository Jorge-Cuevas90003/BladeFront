#!/usr/bin/env python3
# ============================================================================
#  Cliente de CONFORMIDAD en Python — implementación TOTALMENTE independiente
#  del código JS (solo stdlib `socket` + `json`). Sirve para dos cosas:
#
#   1. Probar la INTEROPERABILIDAD cross-lenguaje: si este cliente Python juega
#      contra nuestro servidor Node, cualquier grupo en cualquier lenguaje que
#      respete el docx también podrá. Es el proxy más honesto de "otro grupo".
#
#   2. Ejecutar la PRUEBA MÍNIMA de compatibilidad del docx (§35):
#      conectar TCP · JOIN → JOIN_ACCEPTED · CHANGE_DIRECTION · leer GAME_STATE
#      · leer varios mensajes seguidos · cerrar.
#
#  Uso (con el servidor levantado):
#    python test/cliente_conformidad.py --host 127.0.0.1 --port 5000 --name PyBot
#
#  Sale con código 0 si TODAS las comprobaciones §35 pasan, 1 si alguna falla.
# ============================================================================

import argparse
import json
import socket
import sys
import time

PROTOCOL_VERSION = "1.0"


class LectorLineas:
    """Un socket TCP no respeta límites de mensaje: acumulamos y cortamos por \\n."""
    def __init__(self, sock):
        self.sock = sock
        self.buf = b""

    def leer_mensaje(self, timeout=5.0):
        self.sock.settimeout(timeout)
        while b"\n" not in self.buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                return None  # conexión cerrada
            self.buf += chunk
        linea, self.buf = self.buf.split(b"\n", 1)
        return json.loads(linea.decode("utf-8"))


def enmarcar(tipo, **campos):
    """Serializa a 'JSON + \\n' — el framing exacto que exige el docx (§24)."""
    campos["type"] = tipo
    campos["protocolVersion"] = PROTOCOL_VERSION
    return (json.dumps(campos) + "\n").encode("utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5000)
    ap.add_argument("--name", default="PyBot")
    ap.add_argument("--ticks", type=int, default=10, help="cuántos GAME_STATE observar")
    args = ap.parse_args()

    ok = 0
    fail = 0

    def check(cond, msg):
        nonlocal ok, fail
        if cond:
            ok += 1
            print(f"  [OK]   {msg}")
        else:
            fail += 1
            print(f"  [FAIL] {msg}")

    print(f"Cliente de conformidad Python (protocolo v{PROTOCOL_VERSION})")

    # (1) conectar TCP
    sock = socket.create_connection((args.host, args.port), timeout=5)
    lector = LectorLineas(sock)
    check(True, f"(1) Conectado por TCP a {args.host}:{args.port}")

    # (2) JOIN → JOIN_ACCEPTED
    sock.sendall(enmarcar("JOIN", name=args.name))
    msg = lector.leer_mensaje()
    check(msg is not None and msg.get("type") == "JOIN_ACCEPTED",
          f"(2) JOIN_ACCEPTED recibido (type={msg.get('type') if msg else None})")
    player_id = msg.get("playerId") if msg else None
    game_id = msg.get("gameId") if msg else None
    check(bool(player_id), f"    playerId asignado: {player_id}")
    check(bool(game_id), f"    gameId asignado: {game_id}")

    # esperar GAME_STARTED (config completa del tablero)
    started = None
    for _ in range(5):
        m = lector.leer_mensaje()
        if m and m.get("type") == "GAME_STARTED":
            started = m
            break
    check(started is not None, "(2b) GAME_STARTED recibido")
    if started:
        check("rows" in started and "columns" in started,
              f"    tablero {started.get('rows')}x{started.get('columns')}")
        check("obstacles" in started and "flag" in started and "players" in started,
              "    incluye obstacles/flag/players")

    # (3) CHANGE_DIRECTION
    sock.sendall(enmarcar("CHANGE_DIRECTION", gameId=game_id, playerId=player_id, direction="UP"))
    check(True, "(3) CHANGE_DIRECTION (UP) enviado")

    # (4)(5) leer VARIOS GAME_STATE seguidos y confirmar que la dirección se aplicó
    estados = 0
    dir_aplicada = False
    ticks_vistos = []
    for _ in range(args.ticks * 3):
        m = lector.leer_mensaje()
        if not m:
            break
        t = m.get("type")
        if t == "GAME_STATE":
            estados += 1
            ticks_vistos.append(m.get("tick"))
            yo = next((p for p in m.get("players", []) if p.get("playerId") == player_id), None)
            if yo and yo.get("direction") == "UP":
                dir_aplicada = True
            if estados >= args.ticks:
                break
        elif t == "GAME_OVER":
            break

    check(estados >= 3, f"(4)(5) Recibidos {estados} GAME_STATE consecutivos")
    check(dir_aplicada, "    El servidor aplicó mi CHANGE_DIRECTION (dir=UP visto)")
    # los ticks deben ser monótonos crecientes (§31)
    monotono = all(b is None or a is None or b >= a for a, b in zip(ticks_vistos, ticks_vistos[1:]))
    check(monotono, f"    Ticks monótonos crecientes: {ticks_vistos[:6]}...")

    # (6) cerrar limpio con LEAVE
    sock.sendall(enmarcar("LEAVE", gameId=game_id, playerId=player_id))
    time.sleep(0.2)
    sock.close()
    check(True, "(6) LEAVE enviado y conexión cerrada")

    print(f"\nResultado conformidad: {ok} OK, {fail} FAIL")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
