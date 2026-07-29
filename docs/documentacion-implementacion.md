# Documentación de implementación — BladeFront

> Documento canónico del proceso de desarrollo. Cubre desde el primer commit
> del 19 de julio de 2026 hasta el estado actual. La evidencia completa y
> auditable se conserva en Git; este documento explica las decisiones que dan
> sentido a esa cronología.

## 1. Propósito y alcance

BladeFront es una implementación de **Captura la Bandera multijugador** para
el protocolo compartido PRFC-CC8-2026 v3. El proyecto combina:

- una arena tridimensional en Three.js;
- un servidor autoritativo con sockets TCP;
- descubrimiento de partidas mediante UDP;
- un bridge WebSocket↔TCP para los clientes que corren en navegador;
- una vista global del servidor sin controles de jugador;
- interoperabilidad con proyectos escritos en otros lenguajes.

La documentación del proyecto se reparte de esta manera:

| Documento | Responsabilidad |
|---|---|
| Este documento | Historia de implementación, decisiones, versiones y evidencia Git |
| [`manual-conexion-red.md`](manual-conexion-red.md) | Arquitectura y comunicación entre proyectos |
| [`../red/PROTOCOLO.md`](../red/PROTOCOLO.md) | Primer protocolo propio, conservado como antecedente |
| [`../red/MIGRACION-PROTOCOLO-OFICIAL.md`](../red/MIGRACION-PROTOCOLO-OFICIAL.md) | Cambio de VOID-NET al protocolo oficial |
| [`observaciones-prfc-v3.md`](observaciones-prfc-v3.md) | Hallazgos y ambigüedades del protocolo |
| [`../PROMPTS.md`](../PROMPTS.md) | Registro de IA y prompts utilizados |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Regla para mantener código y documentación sincronizados |

## 2. Cumplimiento de los requisitos documentales

| Requisito | Dónde se cumple |
|---|---|
| Documentar desde el día 1 hasta el final | Secciones 3 y 4, desde el commit inicial `49872ee` |
| Conservar versiones de cambios de ideas y referenciarlas a Git | Sección 4 y enlaces directos a commits |
| Explicar conexiones con los demás proyectos | Sección 5 y manual de conexión |
| Usar Git como cronología y log | Sección 6 |
| Registrar IA y prompts | Sección 7 y `PROMPTS.md` |

## 3. Evolución de la idea

### Versión conceptual 0 — arena Juggernaut

El proyecto nació como una arena 3D procedural con combate tipo Juggernaut.
Los primeros commits construyeron el escenario, los personajes, las
animaciones y el audio:

- [`49872ee`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/49872ee):
  primera versión jugable;
- [`408efb1`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/408efb1):
  correcciones visuales y de animación;
- [`dcdedfa`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/dcdedfa):
  dirección artística de la Arena del Vacío.

### Versión conceptual 1 — Captura la Bandera oficial

La idea se adaptó al enunciado de Captura la Bandera. Antes de modificar el
juego se escribió un plan explícito de migración:

- [`23721e7`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/23721e7):
  plan VOID-NET → protocolo oficial;
- [`6c1e442`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/6c1e442):
  primer motor, servidor, bridge y visor 2D;
- [`8d590dd`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/8d590dd):
  integración de la arena 3D con Captura la Bandera.

### Versión conceptual 2 — interoperabilidad

El proyecto dejó de ser solamente una demostración local y se preparó para
conectarse con implementaciones externas:

- [`ee6b749`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/ee6b749):
  interoperabilidad entre lenguajes y arranque por anfitrión;
- [`1504f7e`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/1504f7e):
  lanzador y bridge dinámico;
- [`fa163a9`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/fa163a9):
  descubrimiento compatible con binario y JSON.

### Versión conceptual 3 — PRFC v3

La migración definitiva incorporó el códec binario, plano continuo, TCP
enmarcado y UDP sin prefijo de longitud:

- [`f44f2ab`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/f44f2ab):
  códec binario v3;
- [`fb0b3d0`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/fb0b3d0):
  motor continuo;
- [`c31da6f`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/c31da6f):
  servidor TCP y descubrimiento UDP;
- [`4a171c2`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/4a171c2):
  bridge WebSocket↔TCP;
- [`603c9d9`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/603c9d9):
  visor 3D y cierre de la migración.

### Versión conceptual 4 — red real sobre Radmin VPN

Las pruebas con varias computadoras mostraron que el broadcast global no
siempre atraviesa el adaptador virtual. La solución evolucionó hacia difusión
dirigida por interfaz y sondeo unicast:

- [`ca5c1e8`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/ca5c1e8):
  primera integración con Radmin;
- [`b84691e`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/b84691e):
  broadcast calculado por interfaz;
- [`fc64d40`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/fc64d40):
  detección de vecinos de la VPN;
- [`d3c1180`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/d3c1180):
  roster unificado y sondeo dirigido;
- [`b7f84f8`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/b7f84f8):
  eliminación del bucle de auto-respuesta UDP.

### Versión conceptual 5 — estabilidad de juego

Las pruebas entre Santiago y Jorge hicieron visibles problemas que no
aparecían en una prueba local: desconexiones, movimiento entrecortado,
rubber-banding y desincronización de la bandera:

- [`9b5b175`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/9b5b175):
  diagnóstico de conexión y timeout de JOIN;
- [`92a8358`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/92a8358):
  respeto del host configurado;
- [`968cbc8`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/968cbc8):
  sincronización de movimiento;
- [`b2c9d7a`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/b2c9d7a):
  suavizado remoto e interacción con la bandera;
- [`5b6d496`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/5b6d496):
  eliminación del rubber-banding;
- [`dff048c`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/dff048c):
  reducción de tráfico UDP;
- [`46939a8`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/46939a8):
  restauración del listado de Radmin sin saturar la red.

### Versión conceptual 6 — roles servidor y cliente

Para cumplir la limitación de que la computadora configurada como servidor
observe, pero no participe como jugador, se separaron los roles:

- [`154f53a`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/154f53a):
  vista global y separación inicial;
- [`97c12d6`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/97c12d6):
  el primer cliente es el anfitrión jugable;
- [`ea873b5`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/ea873b5):
  puertos oficiales estrictos;
- [`e5d91e7`](https://github.com/Jorge-Cuevas90003/BladeFront/commit/e5d91e7):
  restauración de roles y uso exclusivo de los puertos oficiales.

### Versión conceptual 7 — interoperabilidad binaria de descubrimiento

Durante la prueba con otro grupo, el servidor BladeFront era alcanzable por
TCP 5000, pero su partida no aparecía mediante UDP. La comparación con
PRFC-CC8-2026 §27.2 reveló que la respuesta `DISCOVER_RESPONSE` codificaba
`playerCount` y `maximumPlayers` como `u8`, cuando el formato común exige
`u16` big-endian para ambos. Esto producía un datagrama dos bytes más corto
que un cliente estricto descartaba.

Se corrigió el códec sin modificar la partida TCP ni el motor del juego. Se
añadió una prueba que compara el datagrama byte por byte con el PRFC y se
limitó la respuesta de descubrimiento al estado `WAITING`, como exige §19.

## 4. Cronología resumida por día

| Fecha | Resultado principal | Evidencia Git |
|---|---|---|
| 2026-07-19 | Arena Juggernaut procedural, animaciones y arte inicial | `49872ee`–`dd03c2c` |
| 2026-07-20 | Migración conceptual y primera versión de Captura la Bandera | `23721e7`–`814d04c` |
| 2026-07-21 | Motor endurecido, interoperabilidad y menú de entrada | `ba0987e`–`138b389` |
| 2026-07-22 | Lanzador automático y bridge configurable | `1504f7e` |
| 2026-07-25 | Implementación completa PRFC v3 y pruebas | `f44f2ab`–`d0272ca` |
| 2026-07-26 | Descubrimiento Radmin, lobby, firewall, compatibilidad y fluidez | `abe77a7`–`f062e4b` |
| 2026-07-27 | Roster unificado y corrección UDP colaborativa | `d3c1180`–`b7f84f8` |
| 2026-07-28 | Diagnóstico TCP, movimiento, bandera, roles estrictos y documentación | `9b5b175`–`e5d91e7` |

Los rangos anteriores son un índice temático. El historial completo, incluidos
merges y correcciones intermedias, se obtiene con:

```powershell
git log --reverse --date=short --pretty=format:"%h | %ad | %an | %s"
```

## 5. Cómo se comunican los proyectos

### Descubrimiento

1. El cliente envía `DISCOVER_REQUEST` mediante UDP al puerto **5001**.
2. El servidor escucha en UDP `0.0.0.0:5001`.
3. El servidor devuelve `DISCOVER_RESPONSE` al origen de la consulta.
4. La IP del servidor se toma del origen real del datagrama; no se confía en
   una IP declarada dentro del mensaje.
5. Sobre Radmin se usa la difusión dirigida `26.255.255.255` y, como respaldo
   de transporte —no de puerto—, sondeo unicast a direcciones conocidas.

El puerto de descubrimiento es exclusivamente **UDP 5001**. No se cambia a
5101/5201 ni se utiliza TCP 5000 para descubrir.

### Entrada y partida

1. Después de descubrir una partida, el cliente abre TCP al servidor en el
   puerto **5000**.
2. El navegador no puede crear sockets TCP crudos; por eso se conecta mediante
   WebSocket al bridge local en `ws://localhost:8146`.
3. El bridge reenvía bytes sin reinterpretar el protocolo.
4. TCP utiliza un prefijo `u16` big-endian; UDP utiliza un datagrama completo
   sin prefijo.
5. El servidor valida JOIN, INPUT e INTERACT y publica el estado autoritativo.

### Roles actuales

- **Servidor:** levanta servidor TCP 5000, respondedor UDP 5001 y vista global.
  No crea un personaje ni acepta controles de movimiento.
- **Cliente:** levanta el bridge local y participa como jugador.
- El primer cliente conectado es el anfitrión jugable y puede iniciar.
- La vista del servidor conserva un inicio administrativo.

Los detalles de tipos, campos, errores y diagramas están en
[`manual-conexion-red.md`](manual-conexion-red.md).

## 6. Git como cronología y log

Git es la fuente de verdad de la evolución. Cada cambio funcional debe tener:

1. un commit pequeño con mensaje que explique el resultado;
2. pruebas proporcionales al riesgo;
3. actualización documental en el mismo commit cuando cambien arquitectura,
   protocolo, interfaz, comandos, puertos o comportamiento;
4. revisión mediante `git diff` antes de publicar.

Comandos de auditoría:

```powershell
git status
git diff
git log --oneline --decorate --graph --all
git show <commit>
```

Los commits de merge se conservan porque también evidencian colaboración. Los
commits intermedios que luego fueron corregidos no se ocultan: documentan los
experimentos, fallos y decisiones que llevaron al estado actual.

## 7. Inteligencia Artificial y prompts

Se utilizó Codex/ChatGPT como apoyo para:

- ideación visual y diseño inicial;
- construcción del escenario procedural;
- migración al protocolo oficial;
- creación de códecs, bridge y pruebas;
- diagnóstico de sockets, firewall y Radmin VPN;
- sincronización de movimiento y bandera;
- auditoría de requisitos y documentación.

Los prompts temáticos, su intención y el resultado producido están registrados
en [`PROMPTS.md`](../PROMPTS.md). La evidencia de qué código terminó aceptado
está en los commits vinculados en las secciones anteriores. La IA fue una
herramienta de asistencia: las decisiones se verificaron mediante pruebas,
revisión del código y ensayos entre computadoras.

## 8. Estado actual y mantenimiento

Esta documentación toma `e5d91e7` como línea base funcional e incorpora en el
mismo cambio la auditoría y corrección documental. Para evitar que vuelva a
quedar desactualizada, toda contribución debe seguir
[`CONTRIBUTING.md`](../CONTRIBUTING.md). En particular:

- cambio de red/protocolo → actualizar este documento y el manual de conexión;
- cambio de comandos o arranque → actualizar README y este documento;
- uso relevante de IA → agregar entrada en `PROMPTS.md`;
- cambio de decisión arquitectónica → agregar versión y commit a la sección 3;
- corrección sin impacto documental → indicarlo expresamente en el commit o PR.
