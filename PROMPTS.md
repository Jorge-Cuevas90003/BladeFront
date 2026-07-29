# 📜 Registro de prompts — documentación del proceso con IA
## Proyecto: Captura la Bandera — BladeFront (PRFC-CC8-2026 v3)

Este documento registra los **20 hitos principales de interacción con IA**, los cuales están respaldados por una cronología detallada de **más de 90 commits en el repositorio Git** (desde el diseño inicial de assets hasta la versión oficial v3.0). Cada hito agrupa las consultas y evoluciones técnicas desarrolladas e integradas paso a paso.

---

## 1 · Concept art del caballero (nace el proyecto)

> C:\Users\CM\Desktop\Universidad\Repetidas\Computer Science 8\Proyecto 1 (Juego) ,Estoy creando un jugeo pero necesit primero crear los assets, y quiero hacerlo todo con tecnologias web , pricniplametne three.js pero sanadole el mayor provecho puedes ayudarme creandoe sto? Concept art, full body shot of a Neo-Medieval Space Templar knight. Wearing heavy, layered dark-forged steel sci-fi armor with worn brass trims. The helmet is a modern take on a medieval Great Helm with a glowing, extremely thin vertical cyan laser visor. Holding a heavy futuristic claymore sword. Brutalist, dark fantasy, highly detailed, Unreal Engine 5 render, cinematic lighting, dramatic shadows, 8k resolution. No cyberpunk neon, no pink colors.

**Resultado**: en vez de una imagen, el caballero se modeló procedural en
three.js (`assets/caballero-templario/`) con visor navegable — decisión clave:
el concept art *es* el asset reutilizable del juego.

## 2 · Estética + escenario de la arena (comando /frontend-design)

> , more eastetic, more detailed usa cosas externas si necesitas para el front end par darle este nivel de estilo al mas estilo blender o animacion 3d profesional y con otro agente haz esto tambine para crear el escenario :Environment concept art, wide shot of a massive, dark stone circular floating arena floating in a pitch-black abyss. The perimeter of the circular floor is glowing with ancient, high-intensity golden runes. Below the arena is a sea of dense, dark fog. In the far background, towering monolithic silhouettes of ruined gothic cathedrals and brutalist sci-fi structures float in the void, softly rim-lit by a cold cyan light. Dark fantasy, Souls-like aesthetic mixed with Halo, cinematic overhead lighting, masterpiece, ultra-detailed.

**Resultado**: HUD cinematográfico (Cinzel + Rajdhani, esquinas de visor,
grano de película) y, con un segundo agente en paralelo,
`assets/arena-vacio/` — la arena flotante con runas doradas.

## 3 · El enemigo (Ejecutor del Vacío)

> Ahora dame al enemigo del juego : Act as a Lead Gameplay Programmer and Senior Technical Artist. We are developing the enemy system for our multiplayer "Neo-Medieval / Sci-Fi" 3D arena game using React Three Fiber (`@react-three/fiber` and `@react-three/drei`). [...] THE VOID EXECUTOR ENEMY (Procedural Aggressive Geometry) [...] THE CORRUPTED HORNED HELMET: Generate a dense custom cylinder/box hull. Programmatically manipulate the vertex array to split the upper skull plate into two sharp, elongated geometric horns [...] LOGIC STATE & AI STEERING SYSTEM (The Chase Loop) [...] KINETIC IMPACT & RING-OUT COLLISION MECHANICS [...]

*(Spec completa de 4 secciones: geometría procedural agresiva, IA de
persecución por proximidad euclidiana, knockback con ring-out, y rim carmesí.)*

**Resultado**: `assets/ejecutor-del-vacio/` — el jefe con cuernos generados
manipulando el array de vértices, `EnemySystem` motor-agnóstico y demo en vivo
persiguiendo templarios sobre la arena real. Wrapper R3F incluido.

## 4 · El modo de juego (CTF Juggernaut)

> Act as a Combat Systems Engineer and Senior Gameplay Animator. We are building a high-speed, high-octane Multiplayer Capture the Flag "Juggernaut" mode [...] the player who grabs the central Flag instantly morphs into the "Void Executor" monster boss, and all other 11 players must hunt them down. [...] THE CENTRAL CYBER-BANNER [...] `vertex.z += Math.sin(vertex.y * 2.0 + time * 5.0) * 0.08` [...] TACKLE_DASH [...] CORRUPTION_TRANSFORMATION [...] DODGE_ROLL [...] GROUND_SLAM [...] STATE SYNCHRONIZATION & HITBOXES [...]

**Resultado**: `assets/modo-juggernaut/` — el juego completo: estandarte con
onda de vértices, transformación sin popping, placajes, slam con camera shake,
y el `NetworkBus` de eventos (la futura costura multijugador).

## 5 · Primera ronda de bugs

> muchos bugs, salen volando y el esneacrio parece muy pequyeno a ocmparacion de los jugadores, corrigue y debugea cada cosa siempre

**Resultado**: bug raíz encontrado (faltaba gravedad → knockbacks infinitos),
arena ×1.85, y 5 bugs más cazados releyendo todo (ring-outs injustos,
estandarte que crecía, apiñamientos, deambular sincronizado…).

## 6 · Animaciones y vida

> pero faltan las aniamciones de idle, caminar , tacklair robar bandera y mas efectos para que parezca un mabiente vivo y no estatico , mas gameplay

**Resultado**: rig procedural del caballero (pivotes de piernas/torso/espada),
`KnightAnimator` (idle, marcha, placaje, robo…), motas + chispas + faro +
runas reactivas, control humano de J-1 y marcador de Dominio.

## 7 · El fondo cinematográfico

> Act as a Master Environment Artist and Cinematic Lighting Director from FromSoftware. [...] THE COLOSSAL FLOATING MONOLITHS [...] THE LUNAR ECLIPSE ANOMALY [...] COSMIC ASH PARTICLE FIELD (2500 particles) [...] THE ROILING FOG OCEAN (Procedural Volumetric Clouds) [...]

**Resultado**: `assets/arena-vacio/js/cosmos.js` — 8 monolitos colosales,
Eclipse dorado con luna negra, 2 500 cenizas y océano de niebla con ruido
fbm en vertex shader (GPU). Calibrado sobre captura para no lavar los negros.

## 8 · Pulido de animación, cámara y jugabilidad

> Mejora las aniamciones de los peronsajes para que no parescan tan roboticos agreglaes mas idles y haz que la camara del player fucnione y dame una vewrsion local ya jugable y funcional

**Resultado**: giros suavizados (adiós al snap robótico), pivote de cabeza,
contra-rotación de hombros, 4→5 idles, cámara de seguimiento real (el rig
completo viaja con el avatar), control activo al arrancar, victoria a 45 s
de Dominio y pantalla final.

## 9 · Placaje pro + audio procedural

> la animacion de tyaclkear no me gusta nada refactorizala y que sea mucho mejor la de los caballeros templarios y que sean varias para que alla variedad asi mas variedad de aniamciones de todo bro y puedes genrar musica procedarulas oe fectos de sonidos profesionales de game designer senior nivel hanz zimmer epic ?

**Resultado**: placaje en 3 fases con 3 variantes (hombro / estocada /
plancha), tambaleo al encajar golpes, 2 esquivas, y `VoidScore` — banda
sonora procedural completa con Web Audio (ostinato en re menor, taikos,
BRAAAM al nacer el Juggernaut, stingers por evento, resolución mayor en la
victoria).

## 10 · Puesta en marcha

> Levanta todo par aque pueda probarlo

**Resultado**: servidor levantado y diagnóstico del panel de preview
(rAF congelado del navegador embebido — no del juego).

## 11 · Multijugador + repositorio (este documento)

> Se mira bien , ya identifique algunas mejoras pero ahorit, quiero sabeindo que cada jugador se representara por una computadora aparte osea se usaran web sockets para comunicarse y que se usara un protocolo propio que desarrollaremos con otros companeros puedes dejar una estrucutra general para la comunicacion de esto? es posible? [...] tambien hay que subir al repo y suibir cada promp usado docuemtando todo [...]

**Resultado**: `red/` (protocolo VOID-NET v0.1, servidor y cliente esqueleto),
este registro, README y primer commit del repositorio.

## 12 · Protocolo v3.0 y enmarcado binario TCP (PRFC-CC8-2026)

> Estoy desarrollando un juego multijugador TCP/UDP en Node.js y navegador web (Three.js). Necesito implementar el protocolo PRFC-CC8-2026 v3.0. ¿Cómo estructuro un códec binario compartido con MessagePack y un acumulador TCP que lea el prefijo de longitud UInt16 Big Endian, de modo que funcione sin dependencias pesadas tanto en Node como en el navegador?

**Resultado**: creación de `red/v3/protocolo-v3.js` con el protocolo binario oficial, `AcumuladorTCP` y enmarcado u16 portable.

## 13 · Descubrimiento UDP multiformato e interoperabilidad en Radmin VPN

> En Windows con Radmin VPN, los paquetes de broadcast UDP globales (255.255.255.255) a veces son bloqueados por el firewall o el adaptador virtual. ¿Cómo puedo diseñar un servicio de descubrimiento UDP que escuche en múltiples puertos (5001, 5000, 5100) y que responda tanto en binario MessagePack v3 como en texto JSON (v2.0/v1.0), enviando respuestas por broadcast y por ráfagas unicast directas a los vecinos de Radmin para asegurar que todos nos detecten?

**Resultado**: módulo `red/v3/descubrimiento.js` con soporte multi-puerto (5001, 5000, 5100, 5101), respuestas duales JSON/MessagePack y ráfagas unicast dirigidas a IPs de Radmin.

**Evolución posterior**: el experimento multi-puerto se descartó porque la
materia exige UDP 5001. Desde `e5d91e7`, la compatibilidad de formatos se
conserva, pero el descubrimiento se limita al puerto oficial.

## 14 · Mapeo de loopback para eliminar ETIMEDOUT en Windows

> Al conectarme por TCP a 127.0.0.1 en Windows teniendo activa la interfaz de Radmin VPN (26.x.x.x), la pila de red de Windows genera un retraso por timeout ETIMEDOUT. ¿Por qué ocurre esta resolución en la tabla de rutas de Windows y cómo puedo resolver la dirección en el WebSocket bridge para que conecte de forma instantánea en 0.01s?

**Resultado**: parche en `red/v3/bridge-v3.js` que detecta conexiones a 127.0.0.1 y las redirige instantáneamente a la interfaz local de Radmin VPN.

## 15 · Compatibilidad con deserializadores estrictos de Rust (serde_json)

> Los clientes escritos en Rust usan serde y requieren nombres de campo específicos en JSON. ¿Puedes ayudarme a expandir el payload de respuesta de descubrimiento UDP agregando alias en snake_case y PascalCase (como tcp_port, server_name, protocol_version, player_count, maximum_players) sin romper la estructura de Java ni C#?

**Resultado**: inclusión de alias de campos exhaustivos en `payloadBase` dentro de `descubrimiento.js` garantizando deserialización limpia en clientes de Rust, Java y C#.

## 16 · Predicción en cliente y renderizado suave sin input lag

> El servidor autoritativo corre a 10 Hz (100ms por tick). Aunque la posición oficial se valida en el servidor, quiero que la representación gráfica 3D en el navegador sea instantánea a 60-140 FPS sin esperar el paquete de red. ¿Cómo implemento Client-Side Prediction y reconciliación suave en Three.js para que la cámara y el caballero respondan en 0ms sin sufrir tirones de rubberband?

**Resultado**: predicción de fotogramas e interpolación limpia en `assets/captura-v3/js/visor-v3.js`.

## 17 · Estabilidad de sala de espera y nombres duplicados

> Si un cliente se conecta a la sala de espera utilizando el mismo nombre que otro jugador ya conectado, ¿cómo manejamos la asignación de playerId de manera autoritativa en el servidor sin expulsar al anfitrión ni desordenar el estado WAITING?

**Resultado**: suite de 26 pruebas en `test/verify-lobby-v3.mjs` con resolución autoritativa de IDs de jugador.

## 18 · Auditoría y verificación de reglas oficiales de robo de bandera

> ¿Según el código actual quién puede quitar la bandera? ¿Y sin presionar la tecla puede robar? ¿Y según las instrucciones del PDF oficial de la materia cómo debería de ser?

**Resultado**: verificación estricta de las secciones §13 y §14 del protocolo PRFC-CC8-2026 y la guía del proyecto. Confirmación de que el robo exige cercanía (<60 unidades) y envío explícito de `INTERACT` (`E` / `Espacio`).

## 19 · Verificación punto por punto contra el PDF de reglamento de la materia

> Haz un análisis minucioso punto por punto de las 5 páginas del PDF del proyecto y verifica si cumplimos estrictamente con todas las limitaciones, entregables y recomendaciones.

**Resultado**: auditoría de 14 puntos (objetivo, spawn aleatorio, $100$ conexiones máximas, visualizador 3D/2D, broadcast UDP, tabla de desempate `playerId`, victoria fuera del círculo central) confirmando 100% de cumplimiento.

## 20 · Consolidación final de la bitácora de documentación e IA

> Agrega la bitácora completa de prompts e interacción con IA para documentar el proceso de desarrollo en el repositorio Git.

**Resultado**: actualización de `PROMPTS.md` y `README.md` alineados con la cronología de commits en GitHub.

## 21 · Auditoría documental contra los requisitos de entrega

> El proyecto necesita documentación de implementación desde el primer día,
> versiones de cambios de ideas referenciadas a Git, explicación de conexiones
> entre proyectos, cronología como LOG y registro de IA/prompts. Audita lo que
> ya existe, completa lo faltante y establece que los cambios futuros mantengan
> actualizada la documentación.

**Resultado**: creación de `docs/documentacion-implementacion.md` como
documento canónico, incorporación de una matriz de cumplimiento y cronología
con commits reales, actualización del manual de red a la separación actual de
roles, y creación de `CONTRIBUTING.md` con la definición documental de
terminado.

## 22 · Diagnóstico de interoperabilidad UDP con otro grupo

**Solicitud:** comparar la documentación PRFC-CC8-2026 y la evidencia de una
prueba entre proyectos para explicar por qué BladeFront era alcanzable por
TCP pero no aparecía en el descubrimiento UDP.

**Resultado:** se detectó que `DISCOVER_RESPONSE` enviaba los conteos de
jugadores como `u8`, en contradicción con §27.2, que define ambos como `u16`
big-endian. Se corrigió el códec, se respetó la regla de responder únicamente
en `WAITING` y se añadió una prueba binaria exacta.

## 23 · Vista final del servidor y limpieza del cliente

**Solicitud:** mostrar en el servidor quién ganó, reemplazar su mapa 2D por la
arena 3D del cliente sin permitir que el servidor juegue y eliminar del cliente
la opción “Mi Propio Servidor (Host Local)”, conservando todo lo funcional.

**Resultado:** monitor 3D independiente alimentado solo por `/estado`, cartel
persistente con nombre e ID del ganador y eliminación aislada de la fila local.
Las pruebas verifican que el monitor no contiene controles ni crea un cliente
de juego.

## 24 · Adopción de la fuente canónica externa del protocolo

**Solicitud:** actualizar la bitácora y toda la documentación para notificar
que la especificación local previa del protocolo queda obsoleta y que la
referencia canónica viva se mantiene en el repositorio oficial
`https://github.com/erickm13/CC8-Protocolo`.

**Resultado:** se verificó el repositorio oficial, su rama predeterminada
`main`, la versión vigente `3.0.0` y el commit oficial consultado `b0f3657`.
Se actualizaron README, manual de red, documentación de implementación, guía
de contribución, observaciones y el archivo histórico del protocolo. Quedó
documentada la separación entre la especificación normativa externa y el códec
local que la implementa, además del procedimiento obligatorio para sincronizar
futuros cambios mediante revisión de la fuente oficial, pruebas y actualización
documental conjunta.

## 25 · Inicio exclusivo desde la vista del servidor

**Solicitud:** retirar del cliente el botón para empezar la partida y mantener
el inicio únicamente en la vista administrativa del servidor, sin alterar las
demás funciones del juego.

**Resultado:** se eliminó el control de inicio de la sala del cliente y su
emisión de `HOST_START`. En el modo de servidor estricto también se rechaza
cualquier intento de inicio procedente de un cliente. El botón administrativo
del servidor conserva el flujo existente mediante `/empezar`; movimiento,
bandera, descubrimiento y transporte permanecen sin cambios.

## 26 · Identidad correcta del servidor en la sala

**Solicitud:** impedir que el primer jugador conectado aparezca etiquetado
como anfitrión, porque el servidor es quien aloja y controla la partida.

**Resultado:** se retiraron del cliente la etiqueta `ANFITRIÓN` y el mensaje
que atribuía ese papel a un jugador. La sala conserva la marca `TÚ` y espera el
inicio administrativo del servidor, sin modificar conexiones ni reglas.

---

*Nota: la cronología se mantiene sincronizada con los commits del repositorio Git.*



