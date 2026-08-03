// ============================================================================
//  BladeFront · i18n
//  ----------------------------------------------------------------------
//  Sistema de internacionalización en Vanilla JS, sin dependencias de npm.
//
//  Script clásico (NO type="module") a propósito: los cuatro puntos de
//  entrada (rol.html, servidor.html, captura-v3/index.html,
//  modo-juggernaut/index.html) mezclan <script> inline clásicos con módulos
//  ES (main.js, visor-v3.js). Los módulos siempre se ejecutan después de que
//  termine de parsear el documento, así que si este archivo fuera un módulo
//  cualquier <script> clásico más abajo en el HTML se ejecutaría ANTES y
//  encontraría `window.i18n` sin definir. Como script clásico normal, se
//  ejecuta en cuanto el parser lo alcanza — hay que cargarlo pronto en
//  <head>, antes que cualquier otro <script>, y así queda disponible tanto
//  para los inline de abajo como para los módulos (que igualmente se
//  ejecutan después).
//
//  Uso:
//    <script src="/assets/js/i18n.js"></script>   ← lo primero en <head>
//    ...
//    <span data-i18n="rol.lema">texto de respaldo</span>
//    <input data-i18n="captura.nombre_guerra" data-i18n-attr="placeholder">
//    <p data-i18n="rol.ayuda.cap1.p1" data-i18n-html>texto con <em>...</em></p>
//
//    window.i18n.t('captura.hud.tick')
//    window.i18n.t('captura.aviso_sala', { n: 3 })
//    window.i18n.setLang('en')
//    window.i18n.onChange(() => actualizarAlgoQueYaEstabaPintado())
// ============================================================================

(function () {
  'use strict';

  const CLAVE_STORAGE = 'bladefront_lang';
  const SUPPORTED = ['es', 'en', 'pt', 'ja'];
  const IDIOMA_POR_DEFECTO = 'es';

  // --------------------------------------------------------------------
  //  Diccionarios
  // --------------------------------------------------------------------
  const DICTS = {
    es: {
      common: {
        dificultad: { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' },
        bandera: { libre: 'LIBRE', en_juego: 'EN JUEGO', caida: 'CAÍDA', extraida: 'EXTRAÍDA' },
        conexion: {
          conectando: 'Conectando…', conectado: 'Conectado', local: 'Local',
          rechazado: 'Rechazado', cerrada: 'Partida cerrada', error: 'Error',
        },
        menu: '☰ Menú', victoria: 'VICTORIA', derrota: 'DERROTA',
      },
      rol: {
        titulo_pestana: 'BladeFront · Arena del Vacío',
        lema: 'Arena del Vacío · Computer Science 8',
        seccion_red: 'En red · con tus compañeros',
        seccion_solo: 'Un solo jugador · sin red',
        servidor: {
          marca: 'Captura la Bandera', h2: 'Servidor',
          p: 'Aloja la partida y muestra a todos los jugadores desde arriba. Esta computadora no participa ni controla un personaje: da la salida cuando ya entraron todos.',
          pie: 'Alojar la arena',
        },
        cliente: {
          marca: 'Captura la Bandera', h2: 'Cliente',
          p: 'Busca partidas en la red y entra a jugar como templario. Esta computadora no aloja un servidor propio; solo necesita que alguien más lo haya levantado.',
          pie: 'Entrar a la arena',
        },
        juggernaut: {
          marca: 'El juego original', h2: 'Modo Juggernaut',
          p: 'Once templarios contra un jefe monstruoso sobre una isla que flota en el abismo. Quien toca el estandarte se corrompe. No necesita servidor, bridge ni compañeros: se juega al instante.',
          pie: 'Descender al vacío',
        },
        como_se_juega: 'Cómo se juega',
        configurando: 'Configurando',
        ayuda: {
          titulo: 'Cómo se juega',
          intro: 'Dos juegos sobre la misma arena y los mismos caballeros, con reglas distintas. Uno se juega solo; el otro, contra las implementaciones de los demás equipos del curso.',
          cap1: {
            titulo: 'Modo Juggernaut',
            p1: 'Quien toca el Ciber-Estandarte del centro se corrompe al instante en el <em>Ejecutor del Vacío</em>, un jefe enorme. Los otros once tienen que derribarlo a placajes antes de que acumule <em>45 segundos de Dominio</em>. Si los acumula, gana la ronda.',
            p2: 'Todo pasa sobre una isla flotando en un abismo, así que <em>caerse del borde también es perder</em>. Un placaje bien puesto manda por los aires: conviene pelear lejos del filo.',
            mover: 'Moverse, relativo a la cámara',
            placaje: 'Placaje — o <em>Ground Slam</em> si eres el Juggernaut',
            esquiva: 'Esquiva: voltereta o deslizamiento',
            ceder: 'Ceder o retomar el control de tu templario a la IA',
            pausa: 'Pausa · silenciar la música · reiniciar al terminar',
            raton: 'Orbitar y acercar la cámara',
            raton_lbl: 'Ratón',
            p3: 'La <em>dificultad de la IA</em> se elige arriba a la derecha durante la partida y se puede cambiar sin perder la ronda que llevas. Afecta a los rivales, no a ti: tu templario corre igual en los tres niveles.',
          },
          cap2: {
            titulo: 'Captura la Bandera',
            p1: 'Todos los equipos del curso hablan el mismo protocolo, así que se juega entre implementaciones distintas. Hay <em>una sola bandera</em> en el centro del círculo: tómala y <em>sal del círculo dorado</em> con ella para ganar.',
            p2: 'A quien la lleva se la puede <em>robar</em> cualquiera que se le acerque, así que correr en línea recta hacia el borde casi nunca funciona.',
            mover: 'Moverse, relativo a la cámara',
            tomar: 'Tomar la bandera, o robársela a quien la lleve',
            vista2d: 'Vista 2D con los datos crudos del protocolo',
          },
          cap3: {
            titulo: 'Montar una partida en red',
            una_pc_t: 'Una computadora', una_pc_d: 'Elige <em>Servidor</em>: aloja la partida y no juega. Desde su pantalla se da la salida cuando ya entraron todos.',
            demas_t: 'Las demás', demas_d: 'Eligen <em>Cliente</em>. Buscan la partida en la red solas; si no aparece, se puede escribir la IP a mano.',
            radmin_t: 'Radmin VPN', radmin_d: 'Tiene que estar encendido en todas las máquinas para que se vean entre sí.',
          },
          cerrar: 'Cerrar el códice',
        },
      },
      servidor: {
        titulo: 'BladeFront · Servidor',
        titulo_pestana: 'BladeFront · Vista del servidor',
        subtitulo: 'Vista global de solo lectura · sin controles de juego',
        conectando: 'Conectando…',
        iniciar_partida: 'Iniciar partida',
        jugar_de_nuevo: 'Jugar de nuevo',
        cambiar_config: 'Cambiar configuración',
        ganador_partida: 'Ganador de la partida',
        dt_servidor: 'Servidor', dt_estado: 'Estado', dt_tick: 'Tick', dt_jugadores: 'Jugadores', dt_bandera: 'Bandera',
        todos_jugadores: 'Todos los jugadores',
        nadie_conectado: 'Nadie conectado',
        pie_nota: 'Esta pantalla no se registra como jugador, no envía entradas y solo consulta el servidor mediante 127.0.0.1.',
        activo: 'Servidor activo', no_disponible: 'Servidor no disponible',
        error_iniciar: 'No se pudo iniciar la partida: {{msg}}',
        error_cambiar: 'No se pudo cambiar la configuración: {{msg}}',
        estados: { esperando: 'ESPERANDO', iniciando: 'INICIANDO', en_partida: 'EN PARTIDA', finalizada: 'FINALIZADA', cancelada: 'CANCELADA' },
        banderas: { libre: 'LIBRE', llevada: 'LLEVADA', caida: 'CAÍDA', fuera: 'FUERA' },
        bandera_jugador: 'bandera',
      },
      captura: {
        titulo: 'Captura la Bandera', subtitulo: 'Arena del Vacío · PRFC v3',
        titulo_pestana: 'Captura la Bandera · Arena del Vacío',
        nombre_guerra: 'Nombre de guerra',
        modo_label: 'Modo',
        modo_practica_t: 'Práctica', modo_practica_d: 'Motor local + bots. Sin red ni bridge.',
        modo_red_t: 'Red', modo_red_d: 'Servidor TCP oficial a través del bridge.',
        bots_label: 'Bots',
        inmunidad_label: 'Inmunidad tras robo',
        inmunidad_0: '0 ms — según el PRFC', inmunidad_300: '300 ms — jugable', inmunidad_600: '600 ms — permisiva',
        nota_inmunidad: '§14 dice que <b>no existe inmunidad</b>. Con 0 ms y dos o más jugadores disputando, la bandera cambia de dueño cada ciclo y la partida <b>no termina nunca</b>. Está medido en <code>test/verify-bots-v3.mjs</code>. Para jugar de verdad hace falta subirlo; el servidor de red sigue en 0.',
        bridge_label: 'Bridge WebSocket', servidor_ip_label: 'Servidor (IP)', puerto_label: 'Puerto TCP',
        partidas_red: 'Partidas en la red', buscando: 'buscando…', buscando_lista: 'Buscando en la red local…',
        ip_manual_placeholder: 'Pega aquí las IPs de Radmin (una por línea)',
        ip_manual_title: 'Preguntar directamente a esas direcciones',
        nota_bridge: 'El navegador no puede abrir TCP ni mandar UDP, así que el bridge lo hace por él. Arranca antes: <b>node red/v3/servidor-v3.js --auto</b> y <b>node red/v3/bridge-v3.js</b>.',
        entrar_arena: 'Entrar a la Arena', cambiar_config: 'Cambiar configuración Servidor / Cliente',
        footline_regla: 'una bandera · sal del círculo', hint_mover: 'mover', hint_tomar: 'tomar',
        hud_titulo: 'Estado de partida',
        hud_conexion: 'Conexión', hud_tu: 'Tú', hud_jugadores: 'Jugadores', hud_bandera: 'Bandera',
        hud_portador: 'Portador', hud_tick: 'Tick', hud_fps: 'FPS',
        fin_ganador: 'Ganador', fin_id: 'Identificador', fin_motivo: 'Motivo', fin_motivo_valor: 'Extracción del círculo', fin_ticks: 'Ticks',
        fin_jugar_otra: '🎮 Jugar Otra (Menú)', fin_menu: '☰ Menú',
        sala_titulo: 'Sala de espera', sala_esperando_inicio: 'Esperando a que el servidor inicie la partida…',
        sala_salir: '☰ Salir', sala_nadie: 'nadie todavía…', sala_tu_tag: 'TÚ', sala_local: 'partida local', sala_eres: 'eres #{{id}}',
        panel2d_titulo: 'Vista cruda',
        hint: '<kbd>E</kbd> tomar o robar · <kbd>M</kbd> vista 2D · toma la bandera del centro y sal del círculo dorado',
        reset_boton: '☰ Menú',
        comienza_en: 'Comienza en {{s}}…',
        aviso_sala: 'Sala: {{n}} jugador(es)',
        aviso_rechazado: 'Rechazado: {{motivo}}',
        victoria_exclam: '¡VICTORIA!', gana_x: 'Gana {{name}}', fin_gana_x: 'Fin · gana {{name}}',
        partida_terminada: 'La partida ha terminado', error_prefijo: 'Error: {{msg}}', error_red: 'Error de red',
        aviso_modo_local: 'Modo local · {{bots}} bots · inmunidad {{ms}} ms', aviso_conectando_por: 'Conectando por {{url}}',
        srv_sin_servicio: 'SIN SERVICIO EN 5000', srv_llena: 'LLENA', srv_abierta: 'ABIERTA', srv_en_juego: 'EN JUEGO',
        srv_encontradas: '{{n}} encontrada(s)', srv_sin_bridge: 'bridge no responde',
        srv_arranca_bridge: 'Arranca el bridge: node red/v3/bridge-v3.js',
        banda_a_la_arena: '¡A la arena!', aviso_partida_iniciada: 'Partida iniciada · {{n}} caballeros',
        aviso_toma_bandera: '{{name}} toma la bandera', banda_tienes_bandera: '¡Tienes la bandera! Sal del círculo',
        aviso_roba_bandera: '{{name}} se la roba a {{otro}}', banda_se_la_robaste: '¡Se la robaste!',
        banda_te_robaron: '¡Te robaron la bandera!', aviso_abandona: '{{name}} abandona',
        motivo_1: 'la partida ya empezó', motivo_2: 'la partida está llena',
        motivo_3: 'nombre inválido', motivo_4: 'versión de protocolo incompatible',
      },
      jug: {
        titulo: 'Modo Juggernaut', subtitulo: 'CTF corrupto · three.js · Proyecto 1',
        titulo_pestana: 'Modo Juggernaut — CTF Corrupto',
        spec_titulo: 'Estado de partida', dificultad_label: 'Dificultad IA',
        dt_portador: 'Portador', dt_dominio: 'Dominio', dt_cazadores: 'Cazadores', dt_fps: 'FPS',
        cazadores_valor: '11 templarios',
        hint_html: 'Controlas a <b>J-1</b> · <b>WASD</b> mover · <b>Espacio/F</b> placaje / slam · <b>Shift/Q</b> rodada · <b>C</b> ceder a la IA · <b>M</b> sonido · <b>P</b> pausa · <b>Dominio 45s</b> gana',
        win_titulo: 'Fin de la ronda', win_reiniciar_html: 'Pulsa <b>R</b> para otra ronda',
        volver_menu: '← Volver al menú', menu_link: '← Menú', capturar_png: 'Capturar PNG',
        libre: 'LIBRE', dominas: '¡Dominas el Vacío!', domina_otro: '{{name}} domina el Vacío',
        feed: {
          flag_captured: '⚑ Bandera capturada → {{id}}',
          juggernaut_born: '☠ {{id}} es el JUGGERNAUT',
          flag_dropped: '⚑ Bandera caída: {{by}} placó a {{from}}',
          tackle_dash: '→ {{id}} lanza un placaje',
          ground_slam: '✹ GROUND_SLAM de {{id}}',
          ring_out: '↓ {{id}} cayó al abismo',
        },
      },
    },

    en: {
      common: {
        dificultad: { bajo: 'Low', medio: 'Medium', alto: 'High' },
        bandera: { libre: 'FREE', en_juego: 'CARRIED', caida: 'DROPPED', extraida: 'EXTRACTED' },
        conexion: {
          conectando: 'Connecting…', conectado: 'Connected', local: 'Local',
          rechazado: 'Rejected', cerrada: 'Match closed', error: 'Error',
        },
        menu: '☰ Menu', victoria: 'VICTORY', derrota: 'DEFEAT',
      },
      rol: {
        titulo_pestana: 'BladeFront · Arena of the Void',
        lema: 'Arena of the Void · Computer Science 8',
        seccion_red: 'Online · with your teammates',
        seccion_solo: 'Single player · offline',
        servidor: {
          marca: 'Capture the Flag', h2: 'Server',
          p: 'Hosts the match and shows every player from above. This computer doesn’t play or control a character — it starts the match once everyone has joined.',
          pie: 'Host the arena',
        },
        cliente: {
          marca: 'Capture the Flag', h2: 'Client',
          p: 'Finds matches on the network and joins as a knight. This computer doesn’t host its own server — it just needs someone else to have started one.',
          pie: 'Enter the arena',
        },
        juggernaut: {
          marca: 'The original game', h2: 'Juggernaut Mode',
          p: 'Eleven knights against a monstrous boss on an island floating over the abyss. Whoever touches the banner is corrupted. No server, bridge, or teammates needed — it plays instantly.',
          pie: 'Descend into the void',
        },
        como_se_juega: 'How to play',
        configurando: 'Setting up',
        ayuda: {
          titulo: 'How to play',
          intro: 'Two games on the same arena with the same knights, but different rules. One is played solo; the other against the other course teams’ implementations.',
          cap1: {
            titulo: 'Juggernaut Mode',
            p1: 'Whoever touches the Cyber-Banner in the center instantly corrupts into the <em>Void Executor</em>, a huge boss. The other eleven must tackle him down before he accumulates <em>45 seconds of Domination</em>. If he does, he wins the round.',
            p2: 'It all happens on an island floating over an abyss, so <em>falling off the edge is also a loss</em>. A well-placed tackle sends someone flying — better to fight away from the edge.',
            mover: 'Move, relative to the camera',
            placaje: 'Tackle — or <em>Ground Slam</em> if you’re the Juggernaut',
            esquiva: 'Dodge: roll or slide',
            ceder: 'Hand control of your knight to the AI, or take it back',
            pausa: 'Pause · mute the music · restart when it ends',
            raton: 'Orbit and zoom the camera',
            raton_lbl: 'Mouse',
            p3: 'The <em>AI difficulty</em> is chosen top-right during the match and can be changed without losing your current round. It only affects opponents — your knight runs the same at all three levels.',
          },
          cap2: {
            titulo: 'Capture the Flag',
            p1: 'Every team in the course speaks the same protocol, so matches are played between different implementations. There is <em>a single flag</em> at the center of the circle: grab it and <em>leave the golden circle</em> with it to win.',
            p2: 'Whoever carries it can be <em>stolen from</em> by anyone who gets close, so running straight for the edge almost never works.',
            mover: 'Move, relative to the camera',
            tomar: 'Pick up the flag, or steal it from whoever is carrying it',
            vista2d: '2D view with the raw protocol data',
          },
          cap3: {
            titulo: 'Setting up a networked match',
            una_pc_t: 'One computer', una_pc_d: 'Choose <em>Server</em>: it hosts the match and doesn’t play. From its screen, it starts the match once everyone has joined.',
            demas_t: 'Everyone else', demas_d: 'Choose <em>Client</em>. They search for the match on their own; if it doesn’t show up, the IP can be entered by hand.',
            radmin_t: 'Radmin VPN', radmin_d: 'It has to be running on every machine so they can see each other.',
          },
          cerrar: 'Close the codex',
        },
      },
      servidor: {
        titulo: 'BladeFront · Server',
        titulo_pestana: 'BladeFront · Server view',
        subtitulo: 'Read-only global view · no game controls',
        conectando: 'Connecting…',
        iniciar_partida: 'Start match', jugar_de_nuevo: 'Play again', cambiar_config: 'Change configuration',
        ganador_partida: 'Match winner',
        dt_servidor: 'Server', dt_estado: 'Status', dt_tick: 'Tick', dt_jugadores: 'Players', dt_bandera: 'Flag',
        todos_jugadores: 'All players', nadie_conectado: 'No one connected',
        pie_nota: 'This screen isn’t registered as a player, sends no input, and only queries the server via 127.0.0.1.',
        activo: 'Server online', no_disponible: 'Server unavailable',
        error_iniciar: 'Couldn’t start the match: {{msg}}',
        error_cambiar: 'Couldn’t change the configuration: {{msg}}',
        estados: { esperando: 'WAITING', iniciando: 'STARTING', en_partida: 'IN MATCH', finalizada: 'FINISHED', cancelada: 'CANCELLED' },
        banderas: { libre: 'FREE', llevada: 'CARRIED', caida: 'DROPPED', fuera: 'EXTRACTED' },
        bandera_jugador: 'flag',
      },
      captura: {
        titulo: 'Capture the Flag', subtitulo: 'Arena of the Void · PRFC v3',
        titulo_pestana: 'Capture the Flag · Arena of the Void',
        nombre_guerra: 'War name',
        modo_label: 'Mode',
        modo_practica_t: 'Practice', modo_practica_d: 'Local engine + bots. No network, no bridge.',
        modo_red_t: 'Online', modo_red_d: 'Official TCP server through the bridge.',
        bots_label: 'Bots',
        inmunidad_label: 'Post-steal immunity',
        inmunidad_0: '0 ms — per the PRFC', inmunidad_300: '300 ms — playable', inmunidad_600: '600 ms — lenient',
        nota_inmunidad: '§14 says <b>there is no immunity</b>. At 0 ms with two or more players contesting, the flag changes hands every cycle and the match <b>never ends</b>. It’s measured in <code>test/verify-bots-v3.mjs</code>. Raising it is needed to actually play; the network server stays at 0.',
        bridge_label: 'WebSocket bridge', servidor_ip_label: 'Server (IP)', puerto_label: 'TCP port',
        partidas_red: 'Matches on the network', buscando: 'searching…', buscando_lista: 'Searching the local network…',
        ip_manual_placeholder: 'Paste Radmin IPs here (one per line)',
        ip_manual_title: 'Ask those addresses directly',
        nota_bridge: 'The browser can’t open TCP or send UDP, so the bridge does it instead. Start it first: <b>node red/v3/servidor-v3.js --auto</b> and <b>node red/v3/bridge-v3.js</b>.',
        entrar_arena: 'Enter the Arena', cambiar_config: 'Change Server / Client configuration',
        footline_regla: 'one flag · leave the circle', hint_mover: 'move', hint_tomar: 'take',
        hud_titulo: 'Match status',
        hud_conexion: 'Connection', hud_tu: 'You', hud_jugadores: 'Players', hud_bandera: 'Flag',
        hud_portador: 'Carrier', hud_tick: 'Tick', hud_fps: 'FPS',
        fin_ganador: 'Winner', fin_id: 'ID', fin_motivo: 'Reason', fin_motivo_valor: 'Extracted the circle', fin_ticks: 'Ticks',
        fin_jugar_otra: '🎮 Play Again (Menu)', fin_menu: '☰ Menu',
        sala_titulo: 'Waiting room', sala_esperando_inicio: 'Waiting for the server to start the match…',
        sala_salir: '☰ Leave', sala_nadie: 'no one yet…', sala_tu_tag: 'YOU', sala_local: 'local match', sala_eres: 'you are #{{id}}',
        panel2d_titulo: 'Raw view',
        hint: '<kbd>E</kbd> take or steal · <kbd>M</kbd> 2D view · grab the center flag and leave the golden circle',
        reset_boton: '☰ Menu',
        comienza_en: 'Starting in {{s}}…',
        aviso_sala: 'Room: {{n}} player(s)',
        aviso_rechazado: 'Rejected: {{motivo}}',
        victoria_exclam: 'VICTORY!', gana_x: '{{name}} wins', fin_gana_x: 'Over · {{name}} wins',
        partida_terminada: 'The match has ended', error_prefijo: 'Error: {{msg}}', error_red: 'Network error',
        aviso_modo_local: 'Local mode · {{bots}} bots · {{ms}} ms immunity', aviso_conectando_por: 'Connecting via {{url}}',
        srv_sin_servicio: 'NO SERVICE ON 5000', srv_llena: 'FULL', srv_abierta: 'OPEN', srv_en_juego: 'IN MATCH',
        srv_encontradas: '{{n}} found', srv_sin_bridge: 'bridge not responding',
        srv_arranca_bridge: 'Start the bridge: node red/v3/bridge-v3.js',
        banda_a_la_arena: 'Into the arena!', aviso_partida_iniciada: 'Match started · {{n}} knights',
        aviso_toma_bandera: '{{name}} picks up the flag', banda_tienes_bandera: 'You have the flag! Leave the circle',
        aviso_roba_bandera: '{{name}} steals it from {{otro}}', banda_se_la_robaste: 'You stole it!',
        banda_te_robaron: 'Your flag was stolen!', aviso_abandona: '{{name}} leaves',
        motivo_1: 'the match already started', motivo_2: 'the match is full',
        motivo_3: 'invalid name', motivo_4: 'incompatible protocol version',
      },
      jug: {
        titulo: 'Juggernaut Mode', subtitulo: 'Corrupted CTF · three.js · Project 1',
        titulo_pestana: 'Juggernaut Mode — Corrupted CTF',
        spec_titulo: 'Match status', dificultad_label: 'AI difficulty',
        dt_portador: 'Carrier', dt_dominio: 'Domination', dt_cazadores: 'Hunters', dt_fps: 'FPS',
        cazadores_valor: '11 knights',
        hint_html: 'You control <b>J-1</b> · <b>WASD</b> move · <b>Space/F</b> tackle / slam · <b>Shift/Q</b> dodge · <b>C</b> hand off to AI · <b>M</b> sound · <b>P</b> pause · <b>45s Domination</b> wins',
        win_titulo: 'Round over', win_reiniciar_html: 'Press <b>R</b> for another round',
        volver_menu: '← Back to menu', menu_link: '← Menu', capturar_png: 'Capture PNG',
        libre: 'FREE', dominas: 'You dominate the Void!', domina_otro: '{{name}} dominates the Void',
        feed: {
          flag_captured: '⚑ Flag captured → {{id}}',
          juggernaut_born: '☠ {{id}} is the JUGGERNAUT',
          flag_dropped: '⚑ Flag dropped: {{by}} tackled {{from}}',
          tackle_dash: '→ {{id}} throws a tackle',
          ground_slam: '✹ GROUND SLAM by {{id}}',
          ring_out: '↓ {{id}} fell into the abyss',
        },
      },
    },

    pt: {
      common: {
        dificultad: { bajo: 'Baixo', medio: 'Médio', alto: 'Alto' },
        bandera: { libre: 'LIVRE', en_juego: 'CARREGADA', caida: 'CAÍDA', extraida: 'EXTRAÍDA' },
        conexion: {
          conectando: 'Conectando…', conectado: 'Conectado', local: 'Local',
          rechazado: 'Rejeitado', cerrada: 'Partida encerrada', error: 'Erro',
        },
        menu: '☰ Menu', victoria: 'VITÓRIA', derrota: 'DERROTA',
      },
      rol: {
        titulo_pestana: 'BladeFront · Arena do Vazio',
        lema: 'Arena do Vazio · Computer Science 8',
        seccion_red: 'Online · com seus colegas',
        seccion_solo: 'Um jogador · sem rede',
        servidor: {
          marca: 'Capture a Bandeira', h2: 'Servidor',
          p: 'Hospeda a partida e mostra todos os jogadores vistos de cima. Este computador não joga nem controla um personagem: dá a largada quando todos já entraram.',
          pie: 'Hospedar a arena',
        },
        cliente: {
          marca: 'Capture a Bandeira', h2: 'Cliente',
          p: 'Busca partidas na rede e entra para jogar como templário. Este computador não hospeda um servidor próprio; só precisa que alguém já tenha aberto um.',
          pie: 'Entrar na arena',
        },
        juggernaut: {
          marca: 'O jogo original', h2: 'Modo Juggernaut',
          p: 'Onze templários contra um chefe monstruoso numa ilha flutuando sobre o abismo. Quem toca o estandarte se corrompe. Não precisa de servidor, bridge nem colegas: joga-se na hora.',
          pie: 'Descer ao vazio',
        },
        como_se_juega: 'Como se joga',
        configurando: 'Configurando',
        ayuda: {
          titulo: 'Como se joga',
          intro: 'Dois jogos na mesma arena e com os mesmos cavaleiros, com regras diferentes. Um se joga sozinho; o outro, contra as implementações das outras equipes do curso.',
          cap1: {
            titulo: 'Modo Juggernaut',
            p1: 'Quem toca o Ciber-Estandarte do centro se corrompe instantaneamente no <em>Executor do Vazio</em>, um chefe enorme. Os outros onze precisam derrubá-lo com placagens antes que ele acumule <em>45 segundos de Domínio</em>. Se conseguir, vence a rodada.',
            p2: 'Tudo acontece numa ilha flutuando num abismo, então <em>cair da borda também é perder</em>. Uma placagem bem colocada manda pelos ares: melhor lutar longe da borda.',
            mover: 'Mover-se, relativo à câmera',
            placaje: 'Placagem — ou <em>Ground Slam</em> se você for o Juggernaut',
            esquiva: 'Esquiva: rolamento ou deslizamento',
            ceder: 'Ceder ou retomar o controle do seu templário para a IA',
            pausa: 'Pausa · silenciar a música · reiniciar ao terminar',
            raton: 'Orbitar e aproximar a câmera',
            raton_lbl: 'Mouse',
            p3: 'A <em>dificuldade da IA</em> é escolhida no canto superior direito durante a partida e pode ser trocada sem perder a rodada atual. Afeta os adversários, não você: seu templário corre igual nos três níveis.',
          },
          cap2: {
            titulo: 'Capture a Bandeira',
            p1: 'Todas as equipes do curso falam o mesmo protocolo, então joga-se entre implementações diferentes. Há <em>uma única bandeira</em> no centro do círculo: pegue-a e <em>saia do círculo dourado</em> com ela para vencer.',
            p2: 'Quem carrega a bandeira pode <em>tê-la roubada</em> por qualquer um que se aproxime, então correr em linha reta até a borda quase nunca funciona.',
            mover: 'Mover-se, relativo à câmera',
            tomar: 'Pegar a bandeira, ou roubá-la de quem a carrega',
            vista2d: 'Vista 2D com os dados crus do protocolo',
          },
          cap3: {
            titulo: 'Montar uma partida em rede',
            una_pc_t: 'Um computador', una_pc_d: 'Escolha <em>Servidor</em>: hospeda a partida e não joga. Da sua tela se dá a largada quando todos já entraram.',
            demas_t: 'Os demais', demas_d: 'Escolhem <em>Cliente</em>. Buscam a partida na rede sozinhos; se não aparecer, dá para digitar o IP manualmente.',
            radmin_t: 'Radmin VPN', radmin_d: 'Precisa estar ligado em todas as máquinas para que se enxerguem.',
          },
          cerrar: 'Fechar o códice',
        },
      },
      servidor: {
        titulo: 'BladeFront · Servidor',
        titulo_pestana: 'BladeFront · Vista do servidor',
        subtitulo: 'Vista global somente leitura · sem controles de jogo',
        conectando: 'Conectando…',
        iniciar_partida: 'Iniciar partida', jugar_de_nuevo: 'Jogar de novo', cambiar_config: 'Trocar configuração',
        ganador_partida: 'Vencedor da partida',
        dt_servidor: 'Servidor', dt_estado: 'Estado', dt_tick: 'Tick', dt_jugadores: 'Jogadores', dt_bandera: 'Bandeira',
        todos_jugadores: 'Todos os jogadores', nadie_conectado: 'Ninguém conectado',
        pie_nota: 'Esta tela não se registra como jogador, não envia entradas e apenas consulta o servidor via 127.0.0.1.',
        activo: 'Servidor ativo', no_disponible: 'Servidor indisponível',
        error_iniciar: 'Não foi possível iniciar a partida: {{msg}}',
        error_cambiar: 'Não foi possível trocar a configuração: {{msg}}',
        estados: { esperando: 'AGUARDANDO', iniciando: 'INICIANDO', en_partida: 'EM PARTIDA', finalizada: 'FINALIZADA', cancelada: 'CANCELADA' },
        banderas: { libre: 'LIVRE', llevada: 'CARREGADA', caida: 'CAÍDA', fuera: 'FORA' },
        bandera_jugador: 'bandeira',
      },
      captura: {
        titulo: 'Capture a Bandeira', subtitulo: 'Arena do Vazio · PRFC v3',
        titulo_pestana: 'Capture a Bandeira · Arena do Vazio',
        nombre_guerra: 'Nome de guerra',
        modo_label: 'Modo',
        modo_practica_t: 'Prática', modo_practica_d: 'Motor local + bots. Sem rede nem bridge.',
        modo_red_t: 'Rede', modo_red_d: 'Servidor TCP oficial através do bridge.',
        bots_label: 'Bots',
        inmunidad_label: 'Imunidade após roubo',
        inmunidad_0: '0 ms — conforme o PRFC', inmunidad_300: '300 ms — jogável', inmunidad_600: '600 ms — permissiva',
        nota_inmunidad: 'O §14 diz que <b>não existe imunidade</b>. Com 0 ms e dois ou mais jogadores disputando, a bandeira muda de dono a cada ciclo e a partida <b>nunca termina</b>. Isso está medido em <code>test/verify-bots-v3.mjs</code>. Para jogar de verdade é preciso aumentar; o servidor de rede permanece em 0.',
        bridge_label: 'Bridge WebSocket', servidor_ip_label: 'Servidor (IP)', puerto_label: 'Porta TCP',
        partidas_red: 'Partidas na rede', buscando: 'buscando…', buscando_lista: 'Buscando na rede local…',
        ip_manual_placeholder: 'Cole aqui os IPs do Radmin (um por linha)',
        ip_manual_title: 'Perguntar diretamente a esses endereços',
        nota_bridge: 'O navegador não pode abrir TCP nem enviar UDP, então o bridge faz isso por ele. Inicie antes: <b>node red/v3/servidor-v3.js --auto</b> e <b>node red/v3/bridge-v3.js</b>.',
        entrar_arena: 'Entrar na Arena', cambiar_config: 'Trocar configuração Servidor / Cliente',
        footline_regla: 'uma bandeira · saia do círculo', hint_mover: 'mover', hint_tomar: 'pegar',
        hud_titulo: 'Estado da partida',
        hud_conexion: 'Conexão', hud_tu: 'Você', hud_jugadores: 'Jogadores', hud_bandera: 'Bandeira',
        hud_portador: 'Portador', hud_tick: 'Tick', hud_fps: 'FPS',
        fin_ganador: 'Vencedor', fin_id: 'Identificador', fin_motivo: 'Motivo', fin_motivo_valor: 'Extração do círculo', fin_ticks: 'Ticks',
        fin_jugar_otra: '🎮 Jogar de Novo (Menu)', fin_menu: '☰ Menu',
        sala_titulo: 'Sala de espera', sala_esperando_inicio: 'Aguardando o servidor iniciar a partida…',
        sala_salir: '☰ Sair', sala_nadie: 'ninguém ainda…', sala_tu_tag: 'VOCÊ', sala_local: 'partida local', sala_eres: 'você é #{{id}}',
        panel2d_titulo: 'Vista crua',
        hint: '<kbd>E</kbd> pegar ou roubar · <kbd>M</kbd> vista 2D · pegue a bandeira do centro e saia do círculo dourado',
        reset_boton: '☰ Menu',
        comienza_en: 'Começa em {{s}}…',
        aviso_sala: 'Sala: {{n}} jogador(es)',
        aviso_rechazado: 'Rejeitado: {{motivo}}',
        victoria_exclam: 'VITÓRIA!', gana_x: '{{name}} vence', fin_gana_x: 'Fim · vence {{name}}',
        partida_terminada: 'A partida terminou', error_prefijo: 'Erro: {{msg}}', error_red: 'Erro de rede',
        aviso_modo_local: 'Modo local · {{bots}} bots · imunidade {{ms}} ms', aviso_conectando_por: 'Conectando via {{url}}',
        srv_sin_servicio: 'SEM SERVIÇO NA 5000', srv_llena: 'CHEIA', srv_abierta: 'ABERTA', srv_en_juego: 'EM PARTIDA',
        srv_encontradas: '{{n}} encontrada(s)', srv_sin_bridge: 'bridge não responde',
        srv_arranca_bridge: 'Inicie o bridge: node red/v3/bridge-v3.js',
        banda_a_la_arena: 'À arena!', aviso_partida_iniciada: 'Partida iniciada · {{n}} cavaleiros',
        aviso_toma_bandera: '{{name}} pega a bandeira', banda_tienes_bandera: 'Você tem a bandeira! Saia do círculo',
        aviso_roba_bandera: '{{name}} rouba de {{otro}}', banda_se_la_robaste: 'Você a roubou!',
        banda_te_robaron: 'Roubaram sua bandeira!', aviso_abandona: '{{name}} sai',
        motivo_1: 'a partida já começou', motivo_2: 'a partida está cheia',
        motivo_3: 'nome inválido', motivo_4: 'versão de protocolo incompatível',
      },
      jug: {
        titulo: 'Modo Juggernaut', subtitulo: 'CTF corrompido · three.js · Projeto 1',
        titulo_pestana: 'Modo Juggernaut — CTF Corrompido',
        spec_titulo: 'Estado da partida', dificultad_label: 'Dificuldade da IA',
        dt_portador: 'Portador', dt_dominio: 'Domínio', dt_cazadores: 'Caçadores', dt_fps: 'FPS',
        cazadores_valor: '11 templários',
        hint_html: 'Você controla <b>J-1</b> · <b>WASD</b> mover · <b>Espaço/F</b> placagem / slam · <b>Shift/Q</b> esquiva · <b>C</b> ceder à IA · <b>M</b> som · <b>P</b> pausa · <b>45s de Domínio</b> vence',
        win_titulo: 'Fim da rodada', win_reiniciar_html: 'Pressione <b>R</b> para outra rodada',
        volver_menu: '← Voltar ao menu', menu_link: '← Menu', capturar_png: 'Capturar PNG',
        libre: 'LIVRE', dominas: 'Você domina o Vazio!', domina_otro: '{{name}} domina o Vazio',
        feed: {
          flag_captured: '⚑ Bandeira capturada → {{id}}',
          juggernaut_born: '☠ {{id}} é o JUGGERNAUT',
          flag_dropped: '⚑ Bandeira caiu: {{by}} placou {{from}}',
          tackle_dash: '→ {{id}} avança numa placagem',
          ground_slam: '✹ GROUND SLAM de {{id}}',
          ring_out: '↓ {{id}} caiu no abismo',
        },
      },
    },

    ja: {
      common: {
        dificultad: { bajo: '低', medio: '中', alto: '高' },
        bandera: { libre: 'フリー', en_juego: '保持中', caida: '落下', extraida: '脱出' },
        conexion: {
          conectando: '接続中…', conectado: '接続済み', local: 'ローカル',
          rechazado: '拒否されました', cerrada: '試合終了', error: 'エラー',
        },
        menu: '☰ メニュー', victoria: '勝利', derrota: '敗北',
      },
      rol: {
        titulo_pestana: 'BladeFront · 虚無のアリーナ',
        lema: '虚無のアリーナ · Computer Science 8',
        seccion_red: 'オンライン · 仲間と一緒に',
        seccion_solo: 'シングルプレイ · オフライン',
        servidor: {
          marca: 'キャプチャー・ザ・フラッグ', h2: 'サーバー',
          p: '試合をホストし、全プレイヤーを上空から映します。このPCはプレイもキャラクター操作もしません — 全員が入室したら開始を告げます。',
          pie: 'アリーナをホストする',
        },
        cliente: {
          marca: 'キャプチャー・ザ・フラッグ', h2: 'クライアント',
          p: 'ネットワーク上の試合を探し、騎士として参加します。このPCは自分でサーバーをホストしません — 誰かがすでに立てたサーバーが必要です。',
          pie: 'アリーナへ入る',
        },
        juggernaut: {
          marca: 'オリジナルゲーム', h2: 'ジャガーノート・モード',
          p: '11人の騎士対、深淵に浮かぶ島の上の巨大なボス。旗に触れた者は即座に堕落します。サーバーもブリッジも仲間も不要 — すぐにプレイできます。',
          pie: '虚無へ降りる',
        },
        como_se_juega: '遊び方',
        configurando: '設定中',
        ayuda: {
          titulo: '遊び方',
          intro: '同じアリーナと同じ騎士を使う、ルールの異なる2つのゲーム。一方はひとりで遊び、もう一方はコース内の他チームの実装と対戦します。',
          cap1: {
            titulo: 'ジャガーノート・モード',
            p1: '中央のサイバー・バナーに触れた者は即座に<em>虚無の処刑者</em>という巨大なボスへと堕落します。残る11人は、処刑者が<em>45秒間の支配</em>を蓄積する前にタックルで倒さなければなりません。蓄積されればそのラウンドはボスの勝ちです。',
            p2: 'すべては深淵に浮かぶ島の上で起こるため、<em>端から落ちることも敗北</em>になります。うまく決まったタックルは相手を吹き飛ばすので、端から離れて戦うのが得策です。',
            mover: '移動（カメラ基準）',
            placaje: 'タックル — ジャガーノートなら<em>グラウンドスラム</em>',
            esquiva: '回避：ローリングまたはスライディング',
            ceder: '自分の騎士の操作をAIに譲る／取り戻す',
            pausa: 'ポーズ · 音楽をミュート · 終了後にリスタート',
            raton: 'カメラを回転・ズーム',
            raton_lbl: 'マウス',
            p3: '<em>AIの難易度</em>は試合中に右上で選択でき、現在のラウンドを失うことなく変更できます。影響するのは対戦相手のみで、あなたの騎士はどの難易度でも同じ動きです。',
          },
          cap2: {
            titulo: 'キャプチャー・ザ・フラッグ',
            p1: 'コースの全チームが同じプロトコルを話すため、異なる実装同士で対戦します。円の中心には<em>旗が1つだけ</em>あります。旗を取り、<em>黄金の円の外に出れば</em>勝利です。',
            p2: '旗を持つ者は近づいてきた誰にでも<em>奪われる</em>可能性があるため、端まで一直線に走る戦法はほとんど通用しません。',
            mover: '移動（カメラ基準）',
            tomar: '旗を取る、または保持者から奪う',
            vista2d: 'プロトコルの生データを表示する2Dビュー',
          },
          cap3: {
            titulo: 'ネットワーク対戦の準備',
            una_pc_t: '1台のPC', una_pc_d: '<em>サーバー</em>を選択：試合をホストし、プレイはしません。全員が入室したら、その画面から開始を告げます。',
            demas_t: '他の全員', demas_d: '<em>クライアント</em>を選択。各自でネットワーク上の試合を検索します。見つからない場合はIPを手入力できます。',
            radmin_t: 'Radmin VPN', radmin_d: '全PCで起動している必要があります。そうでないと互いを認識できません。',
          },
          cerrar: '書物を閉じる',
        },
      },
      servidor: {
        titulo: 'BladeFront · サーバー',
        titulo_pestana: 'BladeFront · サーバービュー',
        subtitulo: '読み取り専用の全体表示 · ゲーム操作なし',
        conectando: '接続中…',
        iniciar_partida: '試合を開始', jugar_de_nuevo: 'もう一度プレイ', cambiar_config: '設定を変更',
        ganador_partida: '試合の勝者',
        dt_servidor: 'サーバー', dt_estado: '状態', dt_tick: 'ティック', dt_jugadores: 'プレイヤー', dt_bandera: '旗',
        todos_jugadores: '全プレイヤー', nadie_conectado: '接続者なし',
        pie_nota: 'この画面はプレイヤーとして登録されず、入力も送信しません。127.0.0.1経由でサーバーを参照するだけです。',
        activo: 'サーバー稼働中', no_disponible: 'サーバー利用不可',
        error_iniciar: '試合を開始できませんでした：{{msg}}',
        error_cambiar: '設定を変更できませんでした：{{msg}}',
        estados: { esperando: '待機中', iniciando: '開始中', en_partida: '試合中', finalizada: '終了', cancelada: 'キャンセル' },
        banderas: { libre: 'フリー', llevada: '保持中', caida: '落下', fuera: '脱出' },
        bandera_jugador: '旗',
      },
      captura: {
        titulo: 'キャプチャー・ザ・フラッグ', subtitulo: '虚無のアリーナ · PRFC v3',
        titulo_pestana: 'キャプチャー・ザ・フラッグ · 虚無のアリーナ',
        nombre_guerra: '戦士名',
        modo_label: 'モード',
        modo_practica_t: '練習', modo_practica_d: 'ローカルエンジン + ボット。ネットワーク・ブリッジなし。',
        modo_red_t: 'オンライン', modo_red_d: 'ブリッジ経由の公式TCPサーバー。',
        bots_label: 'ボット数',
        inmunidad_label: '奪取後の無敵時間',
        inmunidad_0: '0 ms — PRFC準拠', inmunidad_300: '300 ms — プレイ向き', inmunidad_600: '600 ms — 緩め',
        nota_inmunidad: '§14には<b>無敵時間は存在しない</b>と記されています。0msで2人以上が旗を争うと、旗はサイクルごとに持ち主を変え、試合が<b>永遠に終わりません</b>。これは<code>test/verify-bots-v3.mjs</code>で計測済みです。実際にプレイするには値を上げる必要があります — ネットワークサーバーは0のままです。',
        bridge_label: 'WebSocketブリッジ', servidor_ip_label: 'サーバー（IP）', puerto_label: 'TCPポート',
        partidas_red: 'ネットワーク上の試合', buscando: '検索中…', buscando_lista: 'ローカルネットワークを検索中…',
        ip_manual_placeholder: 'RadminのIPをここに貼り付け（1行に1つ）',
        ip_manual_title: 'それらのアドレスに直接問い合わせる',
        nota_bridge: 'ブラウザはTCPを開いたりUDPを送信したりできないため、代わりにブリッジが行います。先に起動してください：<b>node red/v3/servidor-v3.js --auto</b> と <b>node red/v3/bridge-v3.js</b>。',
        entrar_arena: 'アリーナへ入る', cambiar_config: 'サーバー／クライアント設定を変更',
        footline_regla: '旗は1つ · 円の外へ出よ', hint_mover: '移動', hint_tomar: '取得',
        hud_titulo: '試合の状態',
        hud_conexion: '接続', hud_tu: 'あなた', hud_jugadores: 'プレイヤー', hud_bandera: '旗',
        hud_portador: '保持者', hud_tick: 'ティック', hud_fps: 'FPS',
        fin_ganador: '勝者', fin_id: 'ID', fin_motivo: '理由', fin_motivo_valor: '円からの脱出', fin_ticks: 'ティック数',
        fin_jugar_otra: '🎮 もう一度（メニュー）', fin_menu: '☰ メニュー',
        sala_titulo: '待機ルーム', sala_esperando_inicio: 'サーバーが試合を開始するのを待っています…',
        sala_salir: '☰ 退出', sala_nadie: 'まだ誰もいません…', sala_tu_tag: 'あなた', sala_local: 'ローカル試合', sala_eres: 'あなたは #{{id}}',
        panel2d_titulo: '生データ表示',
        hint: '<kbd>E</kbd> 取得／奪取 · <kbd>M</kbd> 2D表示 · 中央の旗を取り、黄金の円から出よ',
        reset_boton: '☰ メニュー',
        comienza_en: '{{s}}秒後に開始…',
        aviso_sala: 'ルーム：{{n}}人',
        aviso_rechazado: '拒否されました：{{motivo}}',
        victoria_exclam: '勝利！', gana_x: '{{name}} の勝利', fin_gana_x: '終了 · {{name}} の勝利',
        partida_terminada: '試合が終了しました', error_prefijo: 'エラー：{{msg}}', error_red: 'ネットワークエラー',
        aviso_modo_local: 'ローカルモード · ボット{{bots}}体 · 無敵時間{{ms}}ms', aviso_conectando_por: '{{url}} 経由で接続中',
        srv_sin_servicio: '5000番ポート未対応', srv_llena: '満員', srv_abierta: '募集中', srv_en_juego: '試合中',
        srv_encontradas: '{{n}}件見つかりました', srv_sin_bridge: 'ブリッジが応答しません',
        srv_arranca_bridge: 'ブリッジを起動してください：node red/v3/bridge-v3.js',
        banda_a_la_arena: 'アリーナへ！', aviso_partida_iniciada: '試合開始 · 騎士{{n}}人',
        aviso_toma_bandera: '{{name}} が旗を取得', banda_tienes_bandera: '旗を持っている！円の外へ出よ',
        aviso_roba_bandera: '{{name}} が {{otro}} から奪取', banda_se_la_robaste: '奪取した！',
        banda_te_robaron: '旗を奪われた！', aviso_abandona: '{{name}} が退出',
        motivo_1: '試合はすでに開始されています', motivo_2: '試合は満員です',
        motivo_3: '名前が無効です', motivo_4: 'プロトコルのバージョンが非互換です',
      },
      jug: {
        titulo: 'ジャガーノート・モード', subtitulo: '堕落したCTF · three.js · プロジェクト1',
        titulo_pestana: 'ジャガーノート・モード — 堕落したCTF',
        spec_titulo: '試合の状態', dificultad_label: 'AI難易度',
        dt_portador: '保持者', dt_dominio: '支配', dt_cazadores: 'ハンター', dt_fps: 'FPS',
        cazadores_valor: '騎士11人',
        hint_html: '操作対象は<b>J-1</b> · <b>WASD</b>移動 · <b>スペース/F</b>タックル／スラム · <b>Shift/Q</b>回避 · <b>C</b>AIに譲る · <b>M</b>音声 · <b>P</b>ポーズ · <b>支配45秒</b>で勝利',
        win_titulo: 'ラウンド終了', win_reiniciar_html: '<b>R</b>を押して次のラウンドへ',
        volver_menu: '← メニューへ戻る', menu_link: '← メニュー', capturar_png: 'PNGを保存',
        libre: 'フリー', dominas: '虚無を支配した！', domina_otro: '{{name}} が虚無を支配した',
        feed: {
          flag_captured: '⚑ 旗を獲得 → {{id}}',
          juggernaut_born: '☠ {{id}} がジャガーノートに',
          flag_dropped: '⚑ 旗が落下：{{by}} が {{from}} をタックル',
          tackle_dash: '→ {{id}} がタックル',
          ground_slam: '✹ {{id}} のグラウンドスラム',
          ring_out: '↓ {{id}} が深淵へ落下',
        },
      },
    },
  };

  const ETIQUETAS = { es: 'ES', en: 'EN', pt: 'PT', ja: '日本語' };

  // --------------------------------------------------------------------
  //  Estado + resolución de claves
  // --------------------------------------------------------------------
  let idiomaActual = detectar();
  const oyentes = new Set();

  function detectar() {
    try {
      const guardado = localStorage.getItem(CLAVE_STORAGE);
      if (guardado && SUPPORTED.includes(guardado)) return guardado;
    } catch { /* localStorage puede fallar en modo privado; seguimos */ }
    const nav = (navigator.language || IDIOMA_POR_DEFECTO).slice(0, 2).toLowerCase();
    return SUPPORTED.includes(nav) ? nav : IDIOMA_POR_DEFECTO;
  }

  function resolver(dict, clave) {
    let n = dict;
    for (const parte of clave.split('.')) {
      if (n == null || typeof n !== 'object') return undefined;
      n = n[parte];
    }
    return typeof n === 'string' ? n : undefined;
  }

  // t('captura.aviso_sala', { n: 3 }) → interpola {{n}} con params.n.
  // Si falta la clave en el idioma actual, cae a español; si tampoco está
  // ahí, devuelve la clave tal cual para que un texto roto se note al vuelo
  // en vez de desaparecer en silencio.
  function t(clave, params) {
    let texto = resolver(DICTS[idiomaActual], clave);
    if (texto === undefined && idiomaActual !== IDIOMA_POR_DEFECTO) {
      texto = resolver(DICTS[IDIOMA_POR_DEFECTO], clave);
    }
    if (texto === undefined) return clave;
    if (params) {
      for (const k of Object.keys(params)) {
        texto = texto.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), String(params[k]));
      }
    }
    return texto;
  }

  function getLang() { return idiomaActual; }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang) || lang === idiomaActual) return;
    idiomaActual = lang;
    try { localStorage.setItem(CLAVE_STORAGE, lang); } catch { /* da igual */ }
    document.documentElement.lang = lang;
    updateDOM();
    for (const fn of oyentes) { try { fn(lang); } catch (e) { console.error('[i18n] listener falló', e); } }
  }

  function onChange(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }

  // --------------------------------------------------------------------
  //  DOM: data-i18n / data-i18n-attr / data-i18n-html
  // --------------------------------------------------------------------
  function updateDOM(root) {
    const base = root || document;
    base.querySelectorAll('[data-i18n]').forEach((el) => {
      const clave = el.getAttribute('data-i18n');
      if (!clave) return;
      const texto = t(clave);
      const attr = el.getAttribute('data-i18n-attr');
      if (attr) {
        el.setAttribute(attr, texto);
      } else if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = texto;
      } else {
        el.textContent = texto;
      }
    });
  }

  // --------------------------------------------------------------------
  //  Selector de idioma discreto: ES · EN · PT · 日本語
  // --------------------------------------------------------------------
  function mountSwitcher(el) {
    if (!el) return;
    el.innerHTML = '';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Idioma / Language');
    const botones = new Map();
    for (const lang of SUPPORTED) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = ETIQUETAS[lang];
      b.dataset.lang = lang;
      b.lang = lang; // el lector de pantalla pronuncia la etiqueta con las reglas de SU idioma, no el activo
      b.setAttribute('aria-pressed', String(lang === idiomaActual));
      b.addEventListener('click', () => setLang(lang));
      el.appendChild(b);
      botones.set(lang, b);
    }
    onChange((lang) => {
      for (const [l, b] of botones) b.setAttribute('aria-pressed', String(l === lang));
    });
  }

  // --------------------------------------------------------------------
  window.i18n = { SUPPORTED, t, getLang, setLang, onChange, updateDOM, mountSwitcher };

  document.documentElement.lang = idiomaActual;
  const arrancar = () => updateDOM();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
