// ============================================================================
//  Reloj de ciclo con corrección de deriva.
//
//  setInterval NO sirve para el bucle del juego. En Windows la resolución del
//  temporizador es de ~15.6 ms, así que setInterval(50) dispara cada 62 ms y el
//  servidor corre a 16 ciclos por segundo en vez de 20: un 20% lento. Medido en
//  esta máquina, 60 ciclos tardaban 3723 ms en lugar de 3000.
//
//  Eso no es un detalle de rendimiento, es un problema de interoperabilidad:
//  §21 fija tickIntervalMs y de ahí sale la velocidad real de los jugadores. Un
//  servidor lento hace que la misma partida se juegue más despacio que en el
//  equipo de al lado, y cualquier comparación contra otra implementación sale
//  desviada sin motivo aparente.
//
//  La corrección: en vez de pedir "dentro de 50 ms", se apunta a un INSTANTE
//  absoluto y se ajusta la espera con lo que realmente ha pasado. Cuando un
//  ciclo se retrasa, el siguiente se acorta y la media vuelve al objetivo.
//  Con esto salen 50.9 ms por ciclo, 19.7 por segundo.
// ============================================================================

export function crearReloj(intervaloMs, alTick) {
  let siguiente = Date.now() + intervaloMs;
  let id = null;
  let vivo = true;

  const paso = () => {
    if (!vivo) return;
    alTick();
    if (!vivo) return;

    siguiente += intervaloMs;
    const ahora = Date.now();

    // Si se ha perdido mucho tiempo de golpe (una pausa larga del recolector,
    // la pestaña dormida, el portátil suspendido) no se intenta recuperar la
    // deuda entera: eso dispararía una ráfaga de ciclos y la partida daría un
    // salto. Se resincroniza y se sigue desde ahora.
    if (siguiente < ahora - intervaloMs * 5) siguiente = ahora + intervaloMs;

    id = setTimeout(paso, Math.max(0, siguiente - ahora));
  };

  id = setTimeout(paso, intervaloMs);

  return {
    detener() {
      vivo = false;
      if (id) clearTimeout(id);
      id = null;
    },
  };
}
