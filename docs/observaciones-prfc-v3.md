# Observaciones al PRFC-CC8-2026 v3

> [!NOTE]
> Documento histórico de observaciones sobre la implementación probada. No
> sustituye la especificación vigente. Para implementar o resolver
> interoperabilidad se debe consultar
> [erickm13/CC8-Protocolo](https://github.com/erickm13/CC8-Protocolo), rama
> `main`.

Borrador para llevar al equipo. Tres puntos, ordenados por gravedad. Los tres
afectan a **§34 (compatibilidad entre lenguajes)**, que es justo lo que el
protocolo existe para garantizar: no son cuestiones de gusto, son casos en los
que dos implementaciones correctas dan resultados distintos.

Todo lo que se afirma aquí está medido con una implementación completa del
PRFC v3 (códec binario, motor, servidor TCP, descubrimiento UDP y cliente).
Las pruebas que producen estos números están en `test/verify-bots-v3.mjs`.

---

## A — En un duelo, el ganador lo decide la paridad del ciclo

**Secciones implicadas:** §14 (robo), §10 (sin colisión), §21 (una sola velocidad)

**Antes de nada: sí se puede jugar y sí se puede ganar.** Una versión anterior
de este documento decía que la partida "no termina", y eso era una exageración
nacida de mirar solo el comportamiento de nuestros bots. Corregido abajo con
las mediciones.

§14 dice literalmente:

> No existe tiempo de espera. No existe inmunidad. El robo es instantáneo.

§10 añade que *"los jugadores no colisionan entre sí"*, y §21 fija una única
`playerSpeed`. Las tres juntas hacen que dos jugadores pegados puedan robarse
la bandera **en todos y cada uno de los ciclos**, sin que ninguno logre
separarse del otro.

### Lo que eso rompe de verdad

No es que no se pueda ganar: es que **cuando dos jugadores llegan juntos al
borde, quién gana no depende de cómo hayan jugado**. Como la posesión alterna
cada ciclo, gana quien la tenga en el ciclo exacto del cruce, y eso lo decide
la paridad.

Medido en un duelo determinista, dos jugadores en el mismo punto corriendo
hacia el mismo lado, ambos pulsando interactuar:

| Separación inicial | Ciclos | Robos | Gana |
|---|---|---|---|
| 0 unidades | 47 | 47 | **jugador 2** |
| 11 unidades (un paso) | 48 | 48 | **jugador 1** |
| 22 unidades | 48 | 48 | jugador 1 |

**Un solo paso de diferencia al empezar cambia el ganador**, sin que ninguno
de los dos haya jugado distinto. Y el robo ocurre literalmente en cada ciclo:
47 robos en 47 ciclos.

### El bloqueo, y por qué es secundario

Hay un caso en el que la partida sí se queda colgada, pero conviene explicarlo
bien porque **depende de la estrategia**, no solo de la regla:

| Cómo juegan los dos | Resultado |
|---|---|
| Ambos corren hacia fuera | termina en 47 ciclos |
| El portador huye y el otro **le persigue** | **no termina** (600+ ciclos) |
| Persecución, pero empezando a ≥100 de distancia | termina en 47 ciclos |

El bloqueo aparece cuando el perseguidor va *hacia* el portador estando ya
encima: como la posesión alterna cada ciclo, cada jugador cambia de objetivo
—huir / perseguir— en ciclos alternos y el movimiento neto es cero.

Un jugador que se dé cuenta lo evita corriendo siempre hacia fuera, tenga o no
la bandera. Nuestros bots usan la estrategia ingenua y por eso se cuelgan (con
5 jugadores, 15-18 partidas de cada 20). **Eso es tanto una limitación de
nuestros bots como del protocolo**, y así hay que contarlo.

### Propuesta

Añadir un `protectionTimeMs` a §21 y una frase a §14: quien **acaba de
adquirir** la bandera es inmune durante ese tiempo. No es para que el juego
"funcione" —funciona—, sino para que el resultado de un duelo dependa de jugar
mejor y no de la paridad del ciclo.

Valores medidos, con 5 jugadores:

| Inmunidad | Resultado |
|---|---|
| 0 ms (actual) | el duelo lo decide la paridad |
| **200 ms** | termina en 101 ciclos, 13 robos |
| **400 ms** | termina en 92 ciclos, 4 robos |
| 1000 ms | 91 ciclos, **0 robos** — elimina el robo del juego |

**Recomendación: entre 200 y 400 ms.** Por encima de 600 el robo deja de
existir como mecánica.

> Sea cual sea el valor, tiene que ser **el mismo en todos los grupos**. Cambia
> el resultado de la partida, no es un detalle de presentación.

---

## B — §13 no dice quién gana si dos jugadores recogen a la vez

**Secciones implicadas:** §13 (tomar la bandera), §15 (conflictos simultáneos)

§13 está redactado en singular:

> Si un jugador envía `INTERACT`, la bandera está en estado `AVAILABLE` o
> `DROPPED`, y la distancia (…) es ≤ `interactionRadius`: la bandera pertenece
> inmediatamente a ese jugador.

No contempla que **dos jugadores cumplan la condición en el mismo ciclo**.

§15 sí resuelve simultaneidad, pero **solo para el robo** (cuando ya hay un
portador). La recogida queda sin desempate.

### Por qué importa

El arranque de partida es exactamente ese caso: todos aparecen a la misma
distancia del centro (§9: `circleRadius + spawnMargin`) y corren hacia la
bandera, así que **llegar en el mismo ciclo es lo normal, no la excepción**.

Dos servidores escritos por dos equipos distintos darán respuestas distintas
en el primer momento disputado de la partida. A partir de ahí, los estados
divergen y ya no hay forma de reconciliarlos.

### Propuesta

Extender §15 para que cubra también la recogida, con el mismo criterio que ya
usa §30.6 para las interacciones:

> Si varios jugadores cumplen las condiciones de §13 en el mismo ciclo, la
> bandera es para el de `playerId` menor. Los demás no obtienen nada.

**Pregunta adicional para el equipo:** ¿puede haber más de un cambio de dueño
en un mismo ciclo? Como §30.6 resuelve las interacciones en orden ascendente
de `playerId`, tal como está redactado el jugador 1 podría recoger la bandera
y el jugador 3 robársela **en ese mismo ciclo**, dejando la posesión del
primero en cero milisegundos. Nuestra implementación asume **un solo cambio de
dueño por ciclo**, extendiendo el criterio de §15 ("los demás reintentan el
ciclo siguiente"), pero conviene que quede escrito.

---

## C — "20 caracteres" pero el campo se mide en bytes

**Secciones implicadas:** §28.1 (JOIN), §23 (codificación)

§28.1 exige que el nombre tenga *"entre 1 y 20 caracteres"*.
§23 define `str` como `u8` de longitud **+ N bytes UTF-8**.

Carácter y byte no son lo mismo:

| Nombre | Caracteres | Bytes UTF-8 |
|---|---|---|
| `Ana` | 3 | 3 |
| `José` | 4 | **5** |
| `Ñandú` | 5 | **7** |
| `龍` | 1 | **3** |

Y cada lenguaje cuenta distinto:

- **C#** y **Java**: `.Length` cuenta unidades UTF-16
- **Python**: `len()` cuenta puntos de código
- **Go** y **Rust**: la longitud nativa es en bytes

### Consecuencia

Un jugador llamado `José` es aceptado por un servidor y rechazado con
`INVALID_NAME` por otro, dependiendo del lenguaje en que esté escrito. Es el
tipo de fallo que aparece justo en la demo y cuesta horas de encontrar, porque
"funciona en mi máquina".

### Propuesta

Cambiar §28.1 a:

> El nombre debe ocupar entre **1 y 20 bytes** una vez codificado en UTF-8 y
> recortados los espacios. Fuera de ese rango, el servidor responde
> `JOIN_REJECTED` con `INVALID_NAME`.

Es un cambio de una palabra que elimina la ambigüedad por completo. Como
alternativa, si se prefiere razonar en caracteres, basta con subir el límite
del campo a 80 bytes y decirlo explícitamente.

---

## Dos detalles menores

**Sin keepalive ni timeout.** §17 cubre la desconexión limpia, pero no hay nada
que detecte un socket vivo cuyo cliente ya no está (cable desconectado, equipo
suspendido). TCP puede tardar minutos en darse cuenta. Si ese jugador llevaba
la bandera, la partida queda congelada mientras tanto. Bastaría con un
timeout: si un jugador no manda nada en N segundos, se le trata como
desconectado según §17.

**`PLAYER_DISCONNECTED` (§29.9) no lleva `tick`.** Es deducible, porque §30.11
manda los eventos antes del `GAME_STATE` del mismo ciclo, así que es más una
inconsistencia de forma que un problema real. Se menciona solo por
completitud.

---

## Lo que sí está muy bien

Para que no parezca una lista de quejas: comparado con la versión anterior,
esta v3 es bastante mejor ingeniería.

- **La prueba de oro de §28.2** (`11 03 00 07 01`) es la mejor decisión del
  documento. Nos permitió validar el códec sin hablar con nadie, y cualquier
  equipo puede comprobar su implementación en dos minutos.
- **El prefijo de longitud de §23** evita de raíz el problema de enmarcado que
  arrastraba la versión por líneas.
- **Los enteros ×100 de §24** eliminan las discrepancias de coma flotante entre
  lenguajes. (Nota práctica: cuantizan la posición a 0.01, así que dos
  implementaciones pueden diferir hasta ~0.007 al reconstruir una distancia.
  No es un problema, pero conviene saberlo antes de comparar posiciones.)
- **El modo texto de §37** para depurar es una idea excelente.
- **Los tamaños explícitos** (bloque de 12 bytes por jugador, 44 bytes para un
  `GAME_STATE` de dos) sirven de verificación independiente: que nos cuadraran
  sin forzarlos confirmó que habíamos interpretado bien los layouts.
