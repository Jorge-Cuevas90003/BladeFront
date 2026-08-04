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
  const SUPPORTED = ['es', 'en', 'pt', 'ja', 'fr', 'de', 'it', 'zh', 'ko'];
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

    fr: {
      common: {
        dificultad: { bajo: 'Faible', medio: 'Moyen', alto: 'Élevé' },
        bandera: { libre: 'LIBRE', en_juego: 'PORTÉ', caida: 'TOMBÉ', extraida: 'EXTRAIT' },
        conexion: {
          conectando: 'Connexion…', conectado: 'Connecté', local: 'Local',
          rechazado: 'Rejeté', cerrada: 'Partie fermée', error: 'Erreur',
        },
        menu: '☰ Menu', victoria: 'VICTOIRE', derrota: 'DÉFAITE',
      },
      rol: {
        titulo_pestana: 'BladeFront · Arène du Vide',
        lema: 'Arène du Vide · Computer Science 8',
        seccion_red: 'En ligne · avec vos coéquipiers',
        seccion_solo: 'Solo · hors ligne',
        servidor: {
          marca: 'Capture le Drapeau', h2: 'Serveur',
          p: 'Héberge la partie et affiche tous les joueurs vus d’en haut. Cet ordinateur ne joue pas et ne contrôle pas de personnage : il donne le départ une fois que tout le monde est entré.',
          pie: 'Héberger l’arène',
        },
        cliente: {
          marca: 'Capture le Drapeau', h2: 'Client',
          p: 'Recherche des parties sur le réseau et rejoint en tant que templier. Cet ordinateur n’héberge pas son propre serveur ; il lui faut juste que quelqu’un d’autre en ait déjà lancé un.',
          pie: 'Entrer dans l’arène',
        },
        juggernaut: {
          marca: 'Le jeu original', h2: 'Mode Juggernaut',
          p: 'Onze templiers contre un boss monstrueux sur une île flottant au-dessus de l’abîme. Quiconque touche l’étendard se corrompt. Ni serveur, ni bridge, ni coéquipiers nécessaires : ça se joue instantanément.',
          pie: 'Descendre dans le vide',
        },
        como_se_juega: 'Comment jouer',
        configurando: 'Configuration en cours',
        ayuda: {
          titulo: 'Comment jouer',
          intro: 'Deux jeux sur la même arène et les mêmes chevaliers, avec des règles différentes. L’un se joue seul ; l’autre, contre les implémentations des autres équipes du cours.',
          cap1: {
            titulo: 'Mode Juggernaut',
            p1: 'Quiconque touche la Cyber-Bannière au centre se corrompt instantanément en <em>Exécuteur du Vide</em>, un boss énorme. Les onze autres doivent le plaquer avant qu’il n’accumule <em>45 secondes de Domination</em>. S’il y parvient, il remporte la manche.',
            p2: 'Tout se passe sur une île flottant au-dessus d’un abîme, donc <em>tomber du bord, c’est aussi perdre</em>. Un plaquage bien placé envoie voler l’adversaire : mieux vaut combattre loin du bord.',
            mover: 'Se déplacer, relatif à la caméra',
            placaje: 'Plaquage — ou <em>Ground Slam</em> si vous êtes le Juggernaut',
            esquiva: 'Esquive : roulade ou glissade',
            ceder: 'Céder ou reprendre le contrôle de votre templier à l’IA',
            pausa: 'Pause · couper la musique · redémarrer à la fin',
            raton: 'Orbiter et zoomer la caméra',
            raton_lbl: 'Souris',
            p3: 'La <em>difficulté de l’IA</em> se choisit en haut à droite pendant la partie et peut être changée sans perdre la manche en cours. Elle affecte les adversaires, pas vous : votre templier se déplace pareil aux trois niveaux.',
          },
          cap2: {
            titulo: 'Capture le Drapeau',
            p1: 'Toutes les équipes du cours parlent le même protocole, donc on joue entre implémentations différentes. Il y a <em>un seul drapeau</em> au centre du cercle : prenez-le et <em>sortez du cercle doré</em> avec pour gagner.',
            p2: 'Quiconque le porte peut se le faire <em>voler</em> par n’importe qui s’approchant, donc courir tout droit vers le bord ne marche presque jamais.',
            mover: 'Se déplacer, relatif à la caméra',
            tomar: 'Prendre le drapeau, ou le voler à celui qui le porte',
            vista2d: 'Vue 2D avec les données brutes du protocole',
          },
          cap3: {
            titulo: 'Organiser une partie en réseau',
            una_pc_t: 'Un ordinateur', una_pc_d: 'Choisissez <em>Serveur</em> : il héberge la partie et ne joue pas. Depuis son écran, on donne le départ une fois tout le monde entré.',
            demas_t: 'Les autres', demas_d: 'Choisissent <em>Client</em>. Ils cherchent la partie sur le réseau seuls ; si elle n’apparaît pas, on peut saisir l’IP à la main.',
            radmin_t: 'Radmin VPN', radmin_d: 'Doit être actif sur toutes les machines pour qu’elles se voient entre elles.',
          },
          cerrar: 'Fermer le codex',
        },
      },
      servidor: {
        titulo: 'BladeFront · Serveur',
        titulo_pestana: 'BladeFront · Vue serveur',
        subtitulo: 'Vue globale en lecture seule · sans contrôles de jeu',
        conectando: 'Connexion…',
        iniciar_partida: 'Démarrer la partie', jugar_de_nuevo: 'Rejouer', cambiar_config: 'Changer la configuration',
        ganador_partida: 'Vainqueur de la partie',
        dt_servidor: 'Serveur', dt_estado: 'État', dt_tick: 'Tick', dt_jugadores: 'Joueurs', dt_bandera: 'Drapeau',
        todos_jugadores: 'Tous les joueurs', nadie_conectado: 'Personne connecté',
        pie_nota: 'Cet écran n’est pas enregistré comme joueur, n’envoie aucune entrée et ne fait qu’interroger le serveur via 127.0.0.1.',
        activo: 'Serveur actif', no_disponible: 'Serveur indisponible',
        error_iniciar: 'Impossible de démarrer la partie : {{msg}}',
        error_cambiar: 'Impossible de changer la configuration : {{msg}}',
        estados: { esperando: 'EN ATTENTE', iniciando: 'DÉMARRAGE', en_partida: 'EN PARTIE', finalizada: 'TERMINÉE', cancelada: 'ANNULÉE' },
        banderas: { libre: 'LIBRE', llevada: 'PORTÉ', caida: 'TOMBÉ', fuera: 'SORTI' },
        bandera_jugador: 'drapeau',
      },
      captura: {
        titulo: 'Capture le Drapeau', subtitulo: 'Arène du Vide · PRFC v3',
        titulo_pestana: 'Capture le Drapeau · Arène du Vide',
        nombre_guerra: 'Nom de guerre',
        modo_label: 'Mode',
        modo_practica_t: 'Pratique', modo_practica_d: 'Moteur local + bots. Sans réseau ni bridge.',
        modo_red_t: 'En ligne', modo_red_d: 'Serveur TCP officiel via le bridge.',
        bots_label: 'Bots',
        inmunidad_label: 'Immunité après le vol',
        inmunidad_0: '0 ms — selon le PRFC', inmunidad_300: '300 ms — jouable', inmunidad_600: '600 ms — permissif',
        nota_inmunidad: 'Le §14 dit qu’<b>il n’existe aucune immunité</b>. À 0 ms avec deux joueurs ou plus qui se disputent le drapeau, il change de propriétaire à chaque cycle et la partie <b>ne se termine jamais</b>. C’est mesuré dans <code>test/verify-bots-v3.mjs</code>. Pour jouer réellement il faut l’augmenter ; le serveur réseau reste à 0.',
        bridge_label: 'Bridge WebSocket', servidor_ip_label: 'Serveur (IP)', puerto_label: 'Port TCP',
        partidas_red: 'Parties sur le réseau', buscando: 'recherche…', buscando_lista: 'Recherche sur le réseau local…',
        ip_manual_placeholder: 'Collez ici les IP Radmin (une par ligne)',
        ip_manual_title: 'Interroger directement ces adresses',
        nota_bridge: 'Le navigateur ne peut pas ouvrir de TCP ni envoyer d’UDP, donc le bridge le fait à sa place. Démarrez-le d’abord : <b>node red/v3/servidor-v3.js --auto</b> et <b>node red/v3/bridge-v3.js</b>.',
        entrar_arena: 'Entrer dans l’Arène', cambiar_config: 'Changer la configuration Serveur / Client',
        footline_regla: 'un drapeau · sortez du cercle', hint_mover: 'déplacer', hint_tomar: 'prendre',
        hud_titulo: 'État de la partie',
        hud_conexion: 'Connexion', hud_tu: 'Vous', hud_jugadores: 'Joueurs', hud_bandera: 'Drapeau',
        hud_portador: 'Porteur', hud_tick: 'Tick', hud_fps: 'FPS',
        fin_ganador: 'Vainqueur', fin_id: 'Identifiant', fin_motivo: 'Motif', fin_motivo_valor: 'Extraction du cercle', fin_ticks: 'Ticks',
        fin_jugar_otra: '🎮 Rejouer (Menu)', fin_menu: '☰ Menu',
        sala_titulo: 'Salle d’attente', sala_esperando_inicio: 'En attente que le serveur démarre la partie…',
        sala_salir: '☰ Quitter', sala_nadie: 'personne encore…', sala_tu_tag: 'VOUS', sala_local: 'partie locale', sala_eres: 'vous êtes #{{id}}',
        panel2d_titulo: 'Vue brute',
        hint: '<kbd>E</kbd> prendre ou voler · <kbd>M</kbd> vue 2D · prenez le drapeau du centre et sortez du cercle doré',
        reset_boton: '☰ Menu',
        comienza_en: 'Démarre dans {{s}}…',
        aviso_sala: 'Salle : {{n}} joueur(s)',
        aviso_rechazado: 'Rejeté : {{motivo}}',
        victoria_exclam: 'VICTOIRE !', gana_x: '{{name}} gagne', fin_gana_x: 'Fin · {{name}} gagne',
        partida_terminada: 'La partie est terminée', error_prefijo: 'Erreur : {{msg}}', error_red: 'Erreur réseau',
        aviso_modo_local: 'Mode local · {{bots}} bots · immunité {{ms}} ms', aviso_conectando_por: 'Connexion via {{url}}',
        srv_sin_servicio: 'AUCUN SERVICE SUR 5000', srv_llena: 'PLEINE', srv_abierta: 'OUVERTE', srv_en_juego: 'EN PARTIE',
        srv_encontradas: '{{n}} trouvée(s)', srv_sin_bridge: 'le bridge ne répond pas',
        srv_arranca_bridge: 'Démarrez le bridge : node red/v3/bridge-v3.js',
        banda_a_la_arena: 'Dans l’arène !', aviso_partida_iniciada: 'Partie démarrée · {{n}} chevaliers',
        aviso_toma_bandera: '{{name}} prend le drapeau', banda_tienes_bandera: 'Vous avez le drapeau ! Sortez du cercle',
        aviso_roba_bandera: '{{name}} le vole à {{otro}}', banda_se_la_robaste: 'Vous l’avez volé !',
        banda_te_robaron: 'On vous a volé le drapeau !', aviso_abandona: '{{name}} quitte la partie',
        motivo_1: 'la partie a déjà commencé', motivo_2: 'la partie est pleine',
        motivo_3: 'nom invalide', motivo_4: 'version de protocole incompatible',
      },
      jug: {
        titulo: 'Mode Juggernaut', subtitulo: 'CTF corrompu · three.js · Projet 1',
        titulo_pestana: 'Mode Juggernaut — CTF Corrompu',
        spec_titulo: 'État de la partie', dificultad_label: 'Difficulté IA',
        dt_portador: 'Porteur', dt_dominio: 'Domination', dt_cazadores: 'Chasseurs', dt_fps: 'FPS',
        cazadores_valor: '11 templiers',
        hint_html: 'Vous contrôlez <b>J-1</b> · <b>WASD</b> déplacer · <b>Espace/F</b> plaquage / slam · <b>Shift/Q</b> esquive · <b>C</b> céder à l’IA · <b>M</b> son · <b>P</b> pause · <b>45s de Domination</b> gagne',
        win_titulo: 'Fin de la manche', win_reiniciar_html: 'Appuyez sur <b>R</b> pour une autre manche',
        volver_menu: '← Retour au menu', menu_link: '← Menu', capturar_png: 'Capturer PNG',
        libre: 'LIBRE', dominas: 'Vous dominez le Vide !', domina_otro: '{{name}} domine le Vide',
        feed: {
          flag_captured: '⚑ Drapeau capturé → {{id}}',
          juggernaut_born: '☠ {{id}} est le JUGGERNAUT',
          flag_dropped: '⚑ Drapeau tombé : {{by}} a plaqué {{from}}',
          tackle_dash: '→ {{id}} lance un plaquage',
          ground_slam: '✹ GROUND SLAM de {{id}}',
          ring_out: '↓ {{id}} est tombé dans l’abîme',
        },
      },
    },

    de: {
      common: {
        dificultad: { bajo: 'Niedrig', medio: 'Mittel', alto: 'Hoch' },
        bandera: { libre: 'FREI', en_juego: 'GETRAGEN', caida: 'GEFALLEN', extraida: 'EXTRAHIERT' },
        conexion: {
          conectando: 'Verbindung…', conectado: 'Verbunden', local: 'Lokal',
          rechazado: 'Abgelehnt', cerrada: 'Partie geschlossen', error: 'Fehler',
        },
        menu: '☰ Menü', victoria: 'SIEG', derrota: 'NIEDERLAGE',
      },
      rol: {
        titulo_pestana: 'BladeFront · Arena der Leere',
        lema: 'Arena der Leere · Computer Science 8',
        seccion_red: 'Online · mit deinem Team',
        seccion_solo: 'Einzelspieler · offline',
        servidor: {
          marca: 'Capture the Flag', h2: 'Server',
          p: 'Hostet die Partie und zeigt alle Spieler von oben. Dieser Computer spielt nicht mit und steuert keine Figur — er gibt den Start, sobald alle beigetreten sind.',
          pie: 'Arena hosten',
        },
        cliente: {
          marca: 'Capture the Flag', h2: 'Client',
          p: 'Sucht Partien im Netzwerk und tritt als Ritter bei. Dieser Computer hostet keinen eigenen Server — es braucht nur jemanden, der schon einen gestartet hat.',
          pie: 'Arena betreten',
        },
        juggernaut: {
          marca: 'Das Originalspiel', h2: 'Juggernaut-Modus',
          p: 'Elf Ritter gegen einen monströsen Boss auf einer Insel über dem Abgrund. Wer das Banner berührt, wird korrumpiert. Kein Server, keine Bridge, kein Team nötig — sofort spielbar.',
          pie: 'In die Leere hinabsteigen',
        },
        como_se_juega: 'Spielanleitung',
        configurando: 'Wird eingerichtet',
        ayuda: {
          titulo: 'Spielanleitung',
          intro: 'Zwei Spiele auf derselben Arena mit denselben Rittern, aber unterschiedlichen Regeln. Eines spielt man allein; das andere gegen die Implementierungen der anderen Kursteams.',
          cap1: {
            titulo: 'Juggernaut-Modus',
            p1: 'Wer das Cyber-Banner in der Mitte berührt, verwandelt sich sofort in den <em>Vollstrecker der Leere</em>, einen riesigen Boss. Die anderen elf müssen ihn niederringen, bevor er <em>45 Sekunden Dominanz</em> ansammelt. Schafft er das, gewinnt er die Runde.',
            p2: 'Alles spielt sich auf einer über einem Abgrund schwebenden Insel ab, also ist <em>Herunterfallen ebenfalls eine Niederlage</em>. Ein gut platzierter Tackle schleudert den Gegner davon — besser weit vom Rand kämpfen.',
            mover: 'Bewegen, relativ zur Kamera',
            placaje: 'Tackle — oder <em>Ground Slam</em>, falls du der Juggernaut bist',
            esquiva: 'Ausweichen: Rolle oder Rutsche',
            ceder: 'Steuerung deines Ritters an die KI abgeben oder zurücknehmen',
            pausa: 'Pause · Musik stummschalten · nach Ende neustarten',
            raton: 'Kamera drehen und zoomen',
            raton_lbl: 'Maus',
            p3: 'Die <em>KI-Schwierigkeit</em> wird oben rechts während der Partie gewählt und kann geändert werden, ohne die laufende Runde zu verlieren. Sie betrifft nur die Gegner — dein Ritter läuft bei allen drei Stufen gleich.',
          },
          cap2: {
            titulo: 'Capture the Flag',
            p1: 'Alle Kursteams sprechen dasselbe Protokoll, gespielt wird also zwischen verschiedenen Implementierungen. Es gibt <em>eine einzige Flagge</em> in der Kreismitte: nimm sie und <em>verlasse den goldenen Kreis</em> damit, um zu gewinnen.',
            p2: 'Wer sie trägt, kann sie sich von jedem, der nahekommt, <em>stehlen</em> lassen — geradewegs zum Rand rennen funktioniert also fast nie.',
            mover: 'Bewegen, relativ zur Kamera',
            tomar: 'Die Flagge aufnehmen oder sie dem Träger stehlen',
            vista2d: '2D-Ansicht mit den rohen Protokolldaten',
          },
          cap3: {
            titulo: 'Eine Netzwerkpartie einrichten',
            una_pc_t: 'Ein Computer', una_pc_d: 'Wählt <em>Server</em>: hostet die Partie und spielt nicht mit. Von diesem Bildschirm aus wird gestartet, sobald alle beigetreten sind.',
            demas_t: 'Alle anderen', demas_d: 'Wählen <em>Client</em>. Sie suchen die Partie selbst im Netzwerk; erscheint sie nicht, kann die IP manuell eingegeben werden.',
            radmin_t: 'Radmin VPN', radmin_d: 'Muss auf allen Rechnern laufen, damit sie sich gegenseitig sehen.',
          },
          cerrar: 'Kodex schließen',
        },
      },
      servidor: {
        titulo: 'BladeFront · Server',
        titulo_pestana: 'BladeFront · Serveransicht',
        subtitulo: 'Nur lesbare Gesamtansicht · keine Spielsteuerung',
        conectando: 'Verbindung…',
        iniciar_partida: 'Partie starten', jugar_de_nuevo: 'Erneut spielen', cambiar_config: 'Konfiguration ändern',
        ganador_partida: 'Sieger der Partie',
        dt_servidor: 'Server', dt_estado: 'Status', dt_tick: 'Tick', dt_jugadores: 'Spieler', dt_bandera: 'Flagge',
        todos_jugadores: 'Alle Spieler', nadie_conectado: 'Niemand verbunden',
        pie_nota: 'Dieser Bildschirm ist nicht als Spieler registriert, sendet keine Eingaben und fragt den Server nur über 127.0.0.1 ab.',
        activo: 'Server aktiv', no_disponible: 'Server nicht verfügbar',
        error_iniciar: 'Partie konnte nicht gestartet werden: {{msg}}',
        error_cambiar: 'Konfiguration konnte nicht geändert werden: {{msg}}',
        estados: { esperando: 'WARTEND', iniciando: 'STARTET', en_partida: 'IN PARTIE', finalizada: 'BEENDET', cancelada: 'ABGEBROCHEN' },
        banderas: { libre: 'FREI', llevada: 'GETRAGEN', caida: 'GEFALLEN', fuera: 'DRAUSSEN' },
        bandera_jugador: 'Flagge',
      },
      captura: {
        titulo: 'Capture the Flag', subtitulo: 'Arena der Leere · PRFC v3',
        titulo_pestana: 'Capture the Flag · Arena der Leere',
        nombre_guerra: 'Kriegsname',
        modo_label: 'Modus',
        modo_practica_t: 'Übung', modo_practica_d: 'Lokale Engine + Bots. Ohne Netzwerk oder Bridge.',
        modo_red_t: 'Online', modo_red_d: 'Offizieller TCP-Server über die Bridge.',
        bots_label: 'Bots',
        inmunidad_label: 'Immunität nach Diebstahl',
        inmunidad_0: '0 ms — laut PRFC', inmunidad_300: '300 ms — spielbar', inmunidad_600: '600 ms — nachsichtig',
        nota_inmunidad: '§14 sagt, es <b>gibt keine Immunität</b>. Bei 0 ms und zwei oder mehr Spielern, die um die Flagge kämpfen, wechselt sie in jedem Zyklus den Besitzer, und die Partie <b>endet nie</b>. Gemessen in <code>test/verify-bots-v3.mjs</code>. Um wirklich zu spielen, muss der Wert erhöht werden; der Netzwerkserver bleibt bei 0.',
        bridge_label: 'WebSocket-Bridge', servidor_ip_label: 'Server (IP)', puerto_label: 'TCP-Port',
        partidas_red: 'Partien im Netzwerk', buscando: 'suche…', buscando_lista: 'Suche im lokalen Netzwerk…',
        ip_manual_placeholder: 'Radmin-IPs hier einfügen (eine pro Zeile)',
        ip_manual_title: 'Diese Adressen direkt anfragen',
        nota_bridge: 'Der Browser kann kein TCP öffnen oder UDP senden, deshalb übernimmt das die Bridge. Zuerst starten: <b>node red/v3/servidor-v3.js --auto</b> und <b>node red/v3/bridge-v3.js</b>.',
        entrar_arena: 'Arena betreten', cambiar_config: 'Server-/Client-Konfiguration ändern',
        footline_regla: 'eine Flagge · verlasse den Kreis', hint_mover: 'bewegen', hint_tomar: 'nehmen',
        hud_titulo: 'Partiestatus',
        hud_conexion: 'Verbindung', hud_tu: 'Du', hud_jugadores: 'Spieler', hud_bandera: 'Flagge',
        hud_portador: 'Träger', hud_tick: 'Tick', hud_fps: 'FPS',
        fin_ganador: 'Sieger', fin_id: 'Kennung', fin_motivo: 'Grund', fin_motivo_valor: 'Extraktion aus dem Kreis', fin_ticks: 'Ticks',
        fin_jugar_otra: '🎮 Nochmal spielen (Menü)', fin_menu: '☰ Menü',
        sala_titulo: 'Warteraum', sala_esperando_inicio: 'Warte darauf, dass der Server die Partie startet…',
        sala_salir: '☰ Verlassen', sala_nadie: 'noch niemand…', sala_tu_tag: 'DU', sala_local: 'lokale Partie', sala_eres: 'du bist #{{id}}',
        panel2d_titulo: 'Rohansicht',
        hint: '<kbd>E</kbd> nehmen oder stehlen · <kbd>M</kbd> 2D-Ansicht · nimm die Flagge in der Mitte und verlasse den goldenen Kreis',
        reset_boton: '☰ Menü',
        comienza_en: 'Beginnt in {{s}}…',
        aviso_sala: 'Raum: {{n}} Spieler',
        aviso_rechazado: 'Abgelehnt: {{motivo}}',
        victoria_exclam: 'SIEG!', gana_x: '{{name}} gewinnt', fin_gana_x: 'Ende · {{name}} gewinnt',
        partida_terminada: 'Die Partie ist beendet', error_prefijo: 'Fehler: {{msg}}', error_red: 'Netzwerkfehler',
        aviso_modo_local: 'Lokaler Modus · {{bots}} Bots · {{ms}} ms Immunität', aviso_conectando_por: 'Verbindung über {{url}}',
        srv_sin_servicio: 'KEIN DIENST AUF 5000', srv_llena: 'VOLL', srv_abierta: 'OFFEN', srv_en_juego: 'IN PARTIE',
        srv_encontradas: '{{n}} gefunden', srv_sin_bridge: 'Bridge antwortet nicht',
        srv_arranca_bridge: 'Bridge starten: node red/v3/bridge-v3.js',
        banda_a_la_arena: 'In die Arena!', aviso_partida_iniciada: 'Partie gestartet · {{n}} Ritter',
        aviso_toma_bandera: '{{name}} nimmt die Flagge', banda_tienes_bandera: 'Du hast die Flagge! Verlasse den Kreis',
        aviso_roba_bandera: '{{name}} stiehlt sie {{otro}}', banda_se_la_robaste: 'Du hast sie gestohlen!',
        banda_te_robaron: 'Deine Flagge wurde gestohlen!', aviso_abandona: '{{name}} verlässt die Partie',
        motivo_1: 'die Partie hat bereits begonnen', motivo_2: 'die Partie ist voll',
        motivo_3: 'ungültiger Name', motivo_4: 'inkompatible Protokollversion',
      },
      jug: {
        titulo: 'Juggernaut-Modus', subtitulo: 'Korrumpiertes CTF · three.js · Projekt 1',
        titulo_pestana: 'Juggernaut-Modus — Korrumpiertes CTF',
        spec_titulo: 'Partiestatus', dificultad_label: 'KI-Schwierigkeit',
        dt_portador: 'Träger', dt_dominio: 'Dominanz', dt_cazadores: 'Jäger', dt_fps: 'FPS',
        cazadores_valor: '11 Ritter',
        hint_html: 'Du steuerst <b>J-1</b> · <b>WASD</b> bewegen · <b>Leertaste/F</b> Tackle / Slam · <b>Shift/Q</b> Ausweichen · <b>C</b> an KI abgeben · <b>M</b> Ton · <b>P</b> Pause · <b>45s Dominanz</b> gewinnt',
        win_titulo: 'Runde beendet', win_reiniciar_html: 'Drücke <b>R</b> für eine weitere Runde',
        volver_menu: '← Zurück zum Menü', menu_link: '← Menü', capturar_png: 'PNG speichern',
        libre: 'FREI', dominas: 'Du beherrschst die Leere!', domina_otro: '{{name}} beherrscht die Leere',
        feed: {
          flag_captured: '⚑ Flagge erobert → {{id}}',
          juggernaut_born: '☠ {{id}} ist der JUGGERNAUT',
          flag_dropped: '⚑ Flagge gefallen: {{by}} tacklete {{from}}',
          tackle_dash: '→ {{id}} startet einen Tackle',
          ground_slam: '✹ GROUND SLAM von {{id}}',
          ring_out: '↓ {{id}} fiel in den Abgrund',
        },
      },
    },

    it: {
      common: {
        dificultad: { bajo: 'Basso', medio: 'Medio', alto: 'Alto' },
        bandera: { libre: 'LIBERA', en_juego: 'PORTATA', caida: 'CADUTA', extraida: 'ESTRATTA' },
        conexion: {
          conectando: 'Connessione…', conectado: 'Connesso', local: 'Locale',
          rechazado: 'Rifiutato', cerrada: 'Partita chiusa', error: 'Errore',
        },
        menu: '☰ Menu', victoria: 'VITTORIA', derrota: 'SCONFITTA',
      },
      rol: {
        titulo_pestana: 'BladeFront · Arena del Vuoto',
        lema: 'Arena del Vuoto · Computer Science 8',
        seccion_red: 'Online · con i tuoi compagni',
        seccion_solo: 'Un giocatore · offline',
        servidor: {
          marca: 'Cattura la Bandiera', h2: 'Server',
          p: 'Ospita la partita e mostra tutti i giocatori dall’alto. Questo computer non gioca né controlla un personaggio: dà il via quando tutti sono entrati.',
          pie: 'Ospitare l’arena',
        },
        cliente: {
          marca: 'Cattura la Bandiera', h2: 'Client',
          p: 'Cerca partite in rete ed entra come templare. Questo computer non ospita un proprio server; ha solo bisogno che qualcun altro ne abbia già avviato uno.',
          pie: 'Entrare nell’arena',
        },
        juggernaut: {
          marca: 'Il gioco originale', h2: 'Modalità Juggernaut',
          p: 'Undici templari contro un boss mostruoso su un’isola sospesa sull’abisso. Chi tocca lo stendardo si corrompe. Non serve server, bridge né compagni: si gioca all’istante.',
          pie: 'Scendere nel vuoto',
        },
        como_se_juega: 'Come si gioca',
        configurando: 'Configurazione in corso',
        ayuda: {
          titulo: 'Come si gioca',
          intro: 'Due giochi sulla stessa arena e con gli stessi cavalieri, con regole diverse. Uno si gioca da soli; l’altro contro le implementazioni delle altre squadre del corso.',
          cap1: {
            titulo: 'Modalità Juggernaut',
            p1: 'Chi tocca il Ciber-Stendardo al centro si corrompe istantaneamente nell’<em>Esecutore del Vuoto</em>, un boss enorme. Gli altri undici devono placcarlo prima che accumuli <em>45 secondi di Dominio</em>. Se ci riesce, vince il round.',
            p2: 'Tutto avviene su un’isola sospesa su un abisso, quindi <em>cadere dal bordo significa perdere</em>. Un placcaggio ben piazzato manda l’avversario a volare: meglio combattere lontano dal bordo.',
            mover: 'Muoversi, relativo alla telecamera',
            placaje: 'Placcaggio — o <em>Ground Slam</em> se sei il Juggernaut',
            esquiva: 'Schivata: capriola o scivolata',
            ceder: 'Cedere o riprendere il controllo del tuo templare all’IA',
            pausa: 'Pausa · silenzia la musica · riavvia alla fine',
            raton: 'Orbitare e zoomare la telecamera',
            raton_lbl: 'Mouse',
            p3: 'La <em>difficoltà dell’IA</em> si sceglie in alto a destra durante la partita e può essere cambiata senza perdere il round in corso. Influisce sugli avversari, non su di te: il tuo templare corre uguale a tutti e tre i livelli.',
          },
          cap2: {
            titulo: 'Cattura la Bandiera',
            p1: 'Tutte le squadre del corso parlano lo stesso protocollo, quindi si gioca tra implementazioni diverse. C’è <em>una sola bandiera</em> al centro del cerchio: prendila ed <em>esci dal cerchio dorato</em> con essa per vincere.',
            p2: 'A chi la porta può essere <em>rubata</em> da chiunque si avvicini, quindi correre dritti verso il bordo quasi non funziona mai.',
            mover: 'Muoversi, relativo alla telecamera',
            tomar: 'Prendere la bandiera, o rubarla a chi la porta',
            vista2d: 'Vista 2D con i dati grezzi del protocollo',
          },
          cap3: {
            titulo: 'Organizzare una partita in rete',
            una_pc_t: 'Un computer', una_pc_d: 'Scegli <em>Server</em>: ospita la partita e non gioca. Dal suo schermo si dà il via quando tutti sono entrati.',
            demas_t: 'Tutti gli altri', demas_d: 'Scelgono <em>Client</em>. Cercano la partita in rete da soli; se non appare, si può digitare l’IP a mano.',
            radmin_t: 'Radmin VPN', radmin_d: 'Deve essere attivo su tutte le macchine perché si vedano tra loro.',
          },
          cerrar: 'Chiudere il codice',
        },
      },
      servidor: {
        titulo: 'BladeFront · Server',
        titulo_pestana: 'BladeFront · Vista server',
        subtitulo: 'Vista globale in sola lettura · senza controlli di gioco',
        conectando: 'Connessione…',
        iniciar_partida: 'Avvia partita', jugar_de_nuevo: 'Gioca di nuovo', cambiar_config: 'Cambia configurazione',
        ganador_partida: 'Vincitore della partita',
        dt_servidor: 'Server', dt_estado: 'Stato', dt_tick: 'Tick', dt_jugadores: 'Giocatori', dt_bandera: 'Bandiera',
        todos_jugadores: 'Tutti i giocatori', nadie_conectado: 'Nessuno connesso',
        pie_nota: 'Questa schermata non è registrata come giocatore, non invia input e interroga il server solo tramite 127.0.0.1.',
        activo: 'Server attivo', no_disponible: 'Server non disponibile',
        error_iniciar: 'Impossibile avviare la partita: {{msg}}',
        error_cambiar: 'Impossibile cambiare la configurazione: {{msg}}',
        estados: { esperando: 'IN ATTESA', iniciando: 'AVVIO', en_partida: 'IN PARTITA', finalizada: 'TERMINATA', cancelada: 'ANNULLATA' },
        banderas: { libre: 'LIBERA', llevada: 'PORTATA', caida: 'CADUTA', fuera: 'FUORI' },
        bandera_jugador: 'bandiera',
      },
      captura: {
        titulo: 'Cattura la Bandiera', subtitulo: 'Arena del Vuoto · PRFC v3',
        titulo_pestana: 'Cattura la Bandiera · Arena del Vuoto',
        nombre_guerra: 'Nome di guerra',
        modo_label: 'Modalità',
        modo_practica_t: 'Pratica', modo_practica_d: 'Motore locale + bot. Senza rete né bridge.',
        modo_red_t: 'Online', modo_red_d: 'Server TCP ufficiale tramite il bridge.',
        bots_label: 'Bot',
        inmunidad_label: 'Immunità dopo il furto',
        inmunidad_0: '0 ms — secondo il PRFC', inmunidad_300: '300 ms — giocabile', inmunidad_600: '600 ms — permissivo',
        nota_inmunidad: 'Il §14 dice che <b>non esiste immunità</b>. Con 0 ms e due o più giocatori in contesa, la bandiera cambia proprietario a ogni ciclo e la partita <b>non finisce mai</b>. È misurato in <code>test/verify-bots-v3.mjs</code>. Per giocare davvero bisogna alzarlo; il server di rete resta a 0.',
        bridge_label: 'Bridge WebSocket', servidor_ip_label: 'Server (IP)', puerto_label: 'Porta TCP',
        partidas_red: 'Partite in rete', buscando: 'ricerca…', buscando_lista: 'Ricerca nella rete locale…',
        ip_manual_placeholder: 'Incolla qui gli IP Radmin (uno per riga)',
        ip_manual_title: 'Interrogare direttamente questi indirizzi',
        nota_bridge: 'Il browser non può aprire TCP né inviare UDP, quindi ci pensa il bridge. Avvialo prima: <b>node red/v3/servidor-v3.js --auto</b> e <b>node red/v3/bridge-v3.js</b>.',
        entrar_arena: 'Entra nell’Arena', cambiar_config: 'Cambia configurazione Server / Client',
        footline_regla: 'una bandiera · esci dal cerchio', hint_mover: 'muovi', hint_tomar: 'prendi',
        hud_titulo: 'Stato partita',
        hud_conexion: 'Connessione', hud_tu: 'Tu', hud_jugadores: 'Giocatori', hud_bandera: 'Bandiera',
        hud_portador: 'Portatore', hud_tick: 'Tick', hud_fps: 'FPS',
        fin_ganador: 'Vincitore', fin_id: 'Identificativo', fin_motivo: 'Motivo', fin_motivo_valor: 'Estrazione dal cerchio', fin_ticks: 'Tick',
        fin_jugar_otra: '🎮 Gioca di nuovo (Menu)', fin_menu: '☰ Menu',
        sala_titulo: 'Sala d’attesa', sala_esperando_inicio: 'In attesa che il server avvii la partita…',
        sala_salir: '☰ Esci', sala_nadie: 'ancora nessuno…', sala_tu_tag: 'TU', sala_local: 'partita locale', sala_eres: 'sei #{{id}}',
        panel2d_titulo: 'Vista grezza',
        hint: '<kbd>E</kbd> prendi o ruba · <kbd>M</kbd> vista 2D · prendi la bandiera al centro ed esci dal cerchio dorato',
        reset_boton: '☰ Menu',
        comienza_en: 'Inizia tra {{s}}…',
        aviso_sala: 'Sala: {{n}} giocatore/i',
        aviso_rechazado: 'Rifiutato: {{motivo}}',
        victoria_exclam: 'VITTORIA!', gana_x: '{{name}} vince', fin_gana_x: 'Fine · vince {{name}}',
        partida_terminada: 'La partita è terminata', error_prefijo: 'Errore: {{msg}}', error_red: 'Errore di rete',
        aviso_modo_local: 'Modalità locale · {{bots}} bot · immunità {{ms}} ms', aviso_conectando_por: 'Connessione tramite {{url}}',
        srv_sin_servicio: 'NESSUN SERVIZIO SULLA 5000', srv_llena: 'PIENA', srv_abierta: 'APERTA', srv_en_juego: 'IN PARTITA',
        srv_encontradas: '{{n}} trovata/e', srv_sin_bridge: 'il bridge non risponde',
        srv_arranca_bridge: 'Avvia il bridge: node red/v3/bridge-v3.js',
        banda_a_la_arena: 'Nell’arena!', aviso_partida_iniciada: 'Partita avviata · {{n}} cavalieri',
        aviso_toma_bandera: '{{name}} prende la bandiera', banda_tienes_bandera: 'Hai la bandiera! Esci dal cerchio',
        aviso_roba_bandera: '{{name}} la ruba a {{otro}}', banda_se_la_robaste: 'L’hai rubata!',
        banda_te_robaron: 'Ti hanno rubato la bandiera!', aviso_abandona: '{{name}} abbandona',
        motivo_1: 'la partita è già iniziata', motivo_2: 'la partita è piena',
        motivo_3: 'nome non valido', motivo_4: 'versione del protocollo incompatibile',
      },
      jug: {
        titulo: 'Modalità Juggernaut', subtitulo: 'CTF corrotto · three.js · Progetto 1',
        titulo_pestana: 'Modalità Juggernaut — CTF Corrotto',
        spec_titulo: 'Stato partita', dificultad_label: 'Difficoltà IA',
        dt_portador: 'Portatore', dt_dominio: 'Dominio', dt_cazadores: 'Cacciatori', dt_fps: 'FPS',
        cazadores_valor: '11 templari',
        hint_html: 'Controlli <b>J-1</b> · <b>WASD</b> muovi · <b>Spazio/F</b> placcaggio / slam · <b>Shift/Q</b> schivata · <b>C</b> cedi all’IA · <b>M</b> audio · <b>P</b> pausa · <b>45s Dominio</b> vince',
        win_titulo: 'Fine del round', win_reiniciar_html: 'Premi <b>R</b> per un altro round',
        volver_menu: '← Torna al menu', menu_link: '← Menu', capturar_png: 'Cattura PNG',
        libre: 'LIBERA', dominas: 'Domini il Vuoto!', domina_otro: '{{name}} domina il Vuoto',
        feed: {
          flag_captured: '⚑ Bandiera catturata → {{id}}',
          juggernaut_born: '☠ {{id}} è il JUGGERNAUT',
          flag_dropped: '⚑ Bandiera caduta: {{by}} ha placcato {{from}}',
          tackle_dash: '→ {{id}} lancia un placcaggio',
          ground_slam: '✹ GROUND SLAM di {{id}}',
          ring_out: '↓ {{id}} è caduto nell’abisso',
        },
      },
    },

    zh: {
      common: {
        dificultad: { bajo: '低', medio: '中', alto: '高' },
        bandera: { libre: '空闲', en_juego: '持有中', caida: '掉落', extraida: '已夺出' },
        conexion: {
          conectando: '连接中…', conectado: '已连接', local: '本地',
          rechazado: '已拒绝', cerrada: '对局已关闭', error: '错误',
        },
        menu: '☰ 菜单', victoria: '胜利', derrota: '失败',
      },
      rol: {
        titulo_pestana: 'BladeFront · 虚空竞技场',
        lema: '虚空竞技场 · Computer Science 8',
        seccion_red: '联机 · 与队友一起',
        seccion_solo: '单人 · 离线',
        servidor: {
          marca: '夺旗战', h2: '服务器',
          p: '托管对局并从上方显示所有玩家。此电脑不参与游戏也不控制角色——所有人加入后由它下达开始指令。',
          pie: '托管竞技场',
        },
        cliente: {
          marca: '夺旗战', h2: '客户端',
          p: '在网络上寻找对局并以骑士身份加入。此电脑不托管自己的服务器——只需要有人已经建立了一个。',
          pie: '进入竞技场',
        },
        juggernaut: {
          marca: '原版游戏', h2: '主宰模式',
          p: '十一名骑士对抗漂浮在深渊之上的巨大首领。触碰旗帜者立即堕落。无需服务器、桥接或队友——即刻可玩。',
          pie: '降入虚空',
        },
        como_se_juega: '玩法说明',
        configurando: '设置中',
        ayuda: {
          titulo: '玩法说明',
          intro: '同一竞技场、同样的骑士，规则却不同的两种游戏。一种单人游玩；另一种则与课程中其他团队的实现对战。',
          cap1: {
            titulo: '主宰模式',
            p1: '触碰中央赛博旗帜的人会立即堕落为<em>虚空处刑者</em>，一个巨大的首领。其余十一人必须在它累计<em>45秒支配时间</em>之前将其擒抱击倒。若被它累计满，则本回合它获胜。',
            p2: '一切都发生在悬浮于深渊之上的岛屿，因此<em>掉出边缘同样算作失败</em>。一次精准的擒抱能把人撞飞——最好远离边缘作战。',
            mover: '移动（以摄像机为基准）',
            placaje: '擒抱——若你是主宰则为<em>地面猛击</em>',
            esquiva: '闪避：翻滚或滑铲',
            ceder: '将你骑士的控制权交给AI，或重新取回',
            pausa: '暂停 · 静音音乐 · 结束后重新开始',
            raton: '旋转并缩放摄像机',
            raton_lbl: '鼠标',
            p3: '<em>AI难度</em>可在对局中于右上角选择，更改时不会丢失当前回合。它只影响对手——你的骑士在三个难度下表现相同。',
          },
          cap2: {
            titulo: '夺旗战',
            p1: '课程中所有团队使用相同协议，因此在不同实现之间对战。圆心处只有<em>一面旗帜</em>：拿到它并<em>带着它离开金色圆圈</em>即可获胜。',
            p2: '持旗者会被任何靠近的人<em>抢夺</em>，所以直冲边缘的打法几乎从不奏效。',
            mover: '移动（以摄像机为基准）',
            tomar: '拾取旗帜，或从持有者手中抢夺',
            vista2d: '显示协议原始数据的2D视图',
          },
          cap3: {
            titulo: '搭建联机对局',
            una_pc_t: '一台电脑', una_pc_d: '选择<em>服务器</em>：托管对局且不参与游戏。所有人加入后从该屏幕下达开始指令。',
            demas_t: '其余所有人', demas_d: '选择<em>客户端</em>。各自在网络上搜索对局；若未出现，可手动输入IP。',
            radmin_t: 'Radmin VPN', radmin_d: '必须在所有机器上运行，它们才能互相识别。',
          },
          cerrar: '关闭典籍',
        },
      },
      servidor: {
        titulo: 'BladeFront · 服务器',
        titulo_pestana: 'BladeFront · 服务器视图',
        subtitulo: '只读全局视图 · 无游戏控制',
        conectando: '连接中…',
        iniciar_partida: '开始对局', jugar_de_nuevo: '再玩一局', cambiar_config: '更改配置',
        ganador_partida: '本局获胜者',
        dt_servidor: '服务器', dt_estado: '状态', dt_tick: 'Tick', dt_jugadores: '玩家', dt_bandera: '旗帜',
        todos_jugadores: '全部玩家', nadie_conectado: '无人连接',
        pie_nota: '此屏幕不会注册为玩家，不发送任何输入，仅通过127.0.0.1查询服务器。',
        activo: '服务器在线', no_disponible: '服务器不可用',
        error_iniciar: '无法开始对局：{{msg}}',
        error_cambiar: '无法更改配置：{{msg}}',
        estados: { esperando: '等待中', iniciando: '启动中', en_partida: '对局中', finalizada: '已结束', cancelada: '已取消' },
        banderas: { libre: '空闲', llevada: '持有中', caida: '掉落', fuera: '已夺出' },
        bandera_jugador: '旗帜',
      },
      captura: {
        titulo: '夺旗战', subtitulo: '虚空竞技场 · PRFC v3',
        titulo_pestana: '夺旗战 · 虚空竞技场',
        nombre_guerra: '战名',
        modo_label: '模式',
        modo_practica_t: '练习', modo_practica_d: '本地引擎 + 机器人。无需网络或桥接。',
        modo_red_t: '联机', modo_red_d: '通过桥接连接官方TCP服务器。',
        bots_label: '机器人数量',
        inmunidad_label: '被夺后的无敌时间',
        inmunidad_0: '0 ms — 按PRFC规定', inmunidad_300: '300 ms — 可玩', inmunidad_600: '600 ms — 宽松',
        nota_inmunidad: '§14规定<b>不存在无敌时间</b>。在0 ms且两名以上玩家争夺时，旗帜每个周期都会易主，对局<b>永远不会结束</b>。这一点已在<code>test/verify-bots-v3.mjs</code>中测得。要真正游玩需要调高该值；网络服务器保持为0。',
        bridge_label: 'WebSocket桥接', servidor_ip_label: '服务器（IP）', puerto_label: 'TCP端口',
        partidas_red: '网络上的对局', buscando: '搜索中…', buscando_lista: '正在搜索本地网络…',
        ip_manual_placeholder: '在此粘贴Radmin的IP（每行一个）',
        ip_manual_title: '直接查询这些地址',
        nota_bridge: '浏览器无法打开TCP或发送UDP，因此由桥接代为完成。请先启动：<b>node red/v3/servidor-v3.js --auto</b> 和 <b>node red/v3/bridge-v3.js</b>。',
        entrar_arena: '进入竞技场', cambiar_config: '更改服务器/客户端配置',
        footline_regla: '一面旗帜 · 离开圆圈', hint_mover: '移动', hint_tomar: '拾取',
        hud_titulo: '对局状态',
        hud_conexion: '连接', hud_tu: '你', hud_jugadores: '玩家', hud_bandera: '旗帜',
        hud_portador: '持有者', hud_tick: 'Tick', hud_fps: 'FPS',
        fin_ganador: '获胜者', fin_id: '标识符', fin_motivo: '原因', fin_motivo_valor: '夺出圆圈', fin_ticks: 'Tick数',
        fin_jugar_otra: '🎮 再玩一局（菜单）', fin_menu: '☰ 菜单',
        sala_titulo: '等待室', sala_esperando_inicio: '等待服务器开始对局…',
        sala_salir: '☰ 离开', sala_nadie: '暂无人…', sala_tu_tag: '你', sala_local: '本地对局', sala_eres: '你是 #{{id}}',
        panel2d_titulo: '原始视图',
        hint: '<kbd>E</kbd> 拾取或抢夺 · <kbd>M</kbd> 2D视图 · 拿到中央旗帜并离开金色圆圈',
        reset_boton: '☰ 菜单',
        comienza_en: '{{s}}秒后开始…',
        aviso_sala: '房间：{{n}}名玩家',
        aviso_rechazado: '已拒绝：{{motivo}}',
        victoria_exclam: '胜利！', gana_x: '{{name}} 获胜', fin_gana_x: '结束 · {{name}} 获胜',
        partida_terminada: '对局已结束', error_prefijo: '错误：{{msg}}', error_red: '网络错误',
        aviso_modo_local: '本地模式 · {{bots}}个机器人 · {{ms}}ms无敌时间', aviso_conectando_por: '正通过{{url}}连接',
        srv_sin_servicio: '5000端口无服务', srv_llena: '已满', srv_abierta: '开放中', srv_en_juego: '对局中',
        srv_encontradas: '找到{{n}}个', srv_sin_bridge: '桥接无响应',
        srv_arranca_bridge: '启动桥接：node red/v3/bridge-v3.js',
        banda_a_la_arena: '进入竞技场！', aviso_partida_iniciada: '对局开始 · {{n}}名骑士',
        aviso_toma_bandera: '{{name}} 拾取了旗帜', banda_tienes_bandera: '你拿到了旗帜！离开圆圈',
        aviso_roba_bandera: '{{name}} 从{{otro}}手中抢夺', banda_se_la_robaste: '你抢到了！',
        banda_te_robaron: '你的旗帜被抢了！', aviso_abandona: '{{name}} 退出了',
        motivo_1: '对局已经开始', motivo_2: '对局已满',
        motivo_3: '名称无效', motivo_4: '协议版本不兼容',
      },
      jug: {
        titulo: '主宰模式', subtitulo: '堕落夺旗战 · three.js · 项目1',
        titulo_pestana: '主宰模式 — 堕落夺旗战',
        spec_titulo: '对局状态', dificultad_label: 'AI难度',
        dt_portador: '持有者', dt_dominio: '支配值', dt_cazadores: '猎手', dt_fps: 'FPS',
        cazadores_valor: '11名骑士',
        hint_html: '你操控 <b>J-1</b> · <b>WASD</b> 移动 · <b>空格/F</b> 擒抱/猛击 · <b>Shift/Q</b> 闪避 · <b>C</b> 交给AI · <b>M</b> 声音 · <b>P</b> 暂停 · <b>支配45秒</b>获胜',
        win_titulo: '本回合结束', win_reiniciar_html: '按 <b>R</b> 进行下一回合',
        volver_menu: '← 返回菜单', menu_link: '← 菜单', capturar_png: '保存PNG',
        libre: '空闲', dominas: '你支配了虚空！', domina_otro: '{{name}} 支配了虚空',
        feed: {
          flag_captured: '⚑ 旗帜已夺取 → {{id}}',
          juggernaut_born: '☠ {{id}} 成为了主宰',
          flag_dropped: '⚑ 旗帜掉落：{{by}} 擒抱了{{from}}',
          tackle_dash: '→ {{id}} 发起擒抱',
          ground_slam: '✹ {{id}} 的地面猛击',
          ring_out: '↓ {{id}} 坠入深渊',
        },
      },
    },

    ko: {
      common: {
        dificultad: { bajo: '낮음', medio: '보통', alto: '높음' },
        bandera: { libre: '자유', en_juego: '소지 중', caida: '낙하', extraida: '탈출' },
        conexion: {
          conectando: '연결 중…', conectado: '연결됨', local: '로컬',
          rechazado: '거부됨', cerrada: '경기 종료', error: '오류',
        },
        menu: '☰ 메뉴', victoria: '승리', derrota: '패배',
      },
      rol: {
        titulo_pestana: 'BladeFront · 공허의 아레나',
        lema: '공허의 아레나 · Computer Science 8',
        seccion_red: '온라인 · 팀원과 함께',
        seccion_solo: '싱글 플레이 · 오프라인',
        servidor: {
          marca: '깃발 뺏기', h2: '서버',
          p: '경기를 호스팅하고 모든 플레이어를 위에서 보여줍니다. 이 컴퓨터는 플레이하거나 캐릭터를 조작하지 않습니다 — 모두가 입장하면 시작을 알립니다.',
          pie: '아레나 호스팅하기',
        },
        cliente: {
          marca: '깃발 뺏기', h2: '클라이언트',
          p: '네트워크에서 경기를 찾아 기사로 참가합니다. 이 컴퓨터는 자체 서버를 호스팅하지 않습니다 — 누군가 이미 서버를 열어두기만 하면 됩니다.',
          pie: '아레나 입장하기',
        },
        juggernaut: {
          marca: '오리지널 게임', h2: '저거넛 모드',
          p: '심연 위에 떠 있는 섬에서 열한 명의 기사가 거대한 보스와 싸웁니다. 깃발을 만진 자는 즉시 타락합니다. 서버도, 브리지도, 팀원도 필요 없이 즉시 플레이할 수 있습니다.',
          pie: '공허로 내려가기',
        },
        como_se_juega: '게임 방법',
        configurando: '설정 중',
        ayuda: {
          titulo: '게임 방법',
          intro: '같은 아레나와 같은 기사를 사용하지만 규칙이 다른 두 가지 게임입니다. 하나는 혼자 플레이하고, 다른 하나는 수업의 다른 팀 구현물과 대결합니다.',
          cap1: {
            titulo: '저거넛 모드',
            p1: '중앙의 사이버 깃발을 만진 자는 즉시 거대한 보스인 <em>공허의 처형자</em>로 타락합니다. 나머지 열한 명은 그가 <em>45초간의 지배</em>를 쌓기 전에 태클로 쓰러뜨려야 합니다. 쌓이면 그 라운드는 보스가 승리합니다.',
            p2: '모든 것이 심연 위에 떠 있는 섬에서 벌어지므로 <em>가장자리에서 떨어지는 것도 패배</em>입니다. 제대로 들어간 태클은 상대를 멀리 날려버리므로 가장자리에서 멀리 떨어져 싸우는 것이 좋습니다.',
            mover: '이동 (카메라 기준)',
            placaje: '태클 — 저거넛이라면 <em>그라운드 슬램</em>',
            esquiva: '회피: 구르기 또는 슬라이딩',
            ceder: 'AI에게 기사의 조작권을 넘기거나 다시 가져오기',
            pausa: '일시정지 · 음악 음소거 · 종료 후 재시작',
            raton: '카메라 회전 및 확대/축소',
            raton_lbl: '마우스',
            p3: '<em>AI 난이도</em>는 경기 중 우측 상단에서 선택할 수 있으며, 현재 라운드를 잃지 않고 변경할 수 있습니다. 상대에게만 영향을 미치며, 당신의 기사는 세 난이도에서 동일하게 움직입니다.',
          },
          cap2: {
            titulo: '깃발 뺏기',
            p1: '수업의 모든 팀이 같은 프로토콜을 사용하므로 서로 다른 구현물끼리 경기를 치릅니다. 원의 중앙에는 <em>단 하나의 깃발</em>이 있습니다: 그것을 들고 <em>황금 원 밖으로 나가면</em> 승리합니다.',
            p2: '깃발을 든 사람은 가까이 오는 누구에게든 <em>빼앗길</em> 수 있으므로, 가장자리로 일직선으로 달리는 전략은 거의 통하지 않습니다.',
            mover: '이동 (카메라 기준)',
            tomar: '깃발을 줍거나 소지자에게서 빼앗기',
            vista2d: '프로토콜 원시 데이터를 보여주는 2D 뷰',
          },
          cap3: {
            titulo: '네트워크 경기 준비하기',
            una_pc_t: '컴퓨터 한 대', una_pc_d: '<em>서버</em>를 선택하세요: 경기를 호스팅하고 플레이하지 않습니다. 모두 입장하면 이 화면에서 시작을 알립니다.',
            demas_t: '나머지 모두', demas_d: '<em>클라이언트</em>를 선택합니다. 각자 네트워크에서 경기를 검색하며, 나타나지 않으면 IP를 직접 입력할 수 있습니다.',
            radmin_t: 'Radmin VPN', radmin_d: '서로를 인식하려면 모든 기기에서 실행 중이어야 합니다.',
          },
          cerrar: '기록서 닫기',
        },
      },
      servidor: {
        titulo: 'BladeFront · 서버',
        titulo_pestana: 'BladeFront · 서버 화면',
        subtitulo: '읽기 전용 전체 화면 · 게임 조작 없음',
        conectando: '연결 중…',
        iniciar_partida: '경기 시작', jugar_de_nuevo: '다시 플레이', cambiar_config: '설정 변경',
        ganador_partida: '경기 승자',
        dt_servidor: '서버', dt_estado: '상태', dt_tick: '틱', dt_jugadores: '플레이어', dt_bandera: '깃발',
        todos_jugadores: '전체 플레이어', nadie_conectado: '연결된 사람 없음',
        pie_nota: '이 화면은 플레이어로 등록되지 않으며 입력을 전송하지 않고 127.0.0.1을 통해서만 서버를 조회합니다.',
        activo: '서버 활성', no_disponible: '서버 사용 불가',
        error_iniciar: '경기를 시작할 수 없습니다: {{msg}}',
        error_cambiar: '설정을 변경할 수 없습니다: {{msg}}',
        estados: { esperando: '대기 중', iniciando: '시작 중', en_partida: '경기 중', finalizada: '종료됨', cancelada: '취소됨' },
        banderas: { libre: '자유', llevada: '소지 중', caida: '낙하', fuera: '탈출' },
        bandera_jugador: '깃발',
      },
      captura: {
        titulo: '깃발 뺏기', subtitulo: '공허의 아레나 · PRFC v3',
        titulo_pestana: '깃발 뺏기 · 공허의 아레나',
        nombre_guerra: '전투명',
        modo_label: '모드',
        modo_practica_t: '연습', modo_practica_d: '로컬 엔진 + 봇. 네트워크나 브리지 없음.',
        modo_red_t: '온라인', modo_red_d: '브리지를 통한 공식 TCP 서버.',
        bots_label: '봇 수',
        inmunidad_label: '탈취 후 무적 시간',
        inmunidad_0: '0 ms — PRFC 기준', inmunidad_300: '300 ms — 플레이 가능', inmunidad_600: '600 ms — 관대함',
        nota_inmunidad: '§14에 따르면 <b>무적 시간은 존재하지 않습니다</b>. 0 ms에서 두 명 이상이 다투면 깃발이 매 사이클마다 주인이 바뀌어 경기가 <b>절대 끝나지 않습니다</b>. 이는 <code>test/verify-bots-v3.mjs</code>에서 측정되었습니다. 실제로 플레이하려면 값을 올려야 하며, 네트워크 서버는 0으로 유지됩니다.',
        bridge_label: 'WebSocket 브리지', servidor_ip_label: '서버 (IP)', puerto_label: 'TCP 포트',
        partidas_red: '네트워크상의 경기', buscando: '검색 중…', buscando_lista: '로컬 네트워크 검색 중…',
        ip_manual_placeholder: 'Radmin IP를 여기에 붙여넣으세요 (한 줄에 하나씩)',
        ip_manual_title: '이 주소로 직접 문의하기',
        nota_bridge: '브라우저는 TCP를 열거나 UDP를 보낼 수 없으므로 브리지가 대신합니다. 먼저 실행하세요: <b>node red/v3/servidor-v3.js --auto</b> 및 <b>node red/v3/bridge-v3.js</b>.',
        entrar_arena: '아레나 입장', cambiar_config: '서버/클라이언트 설정 변경',
        footline_regla: '깃발 하나 · 원을 벗어나기', hint_mover: '이동', hint_tomar: '줍기',
        hud_titulo: '경기 상태',
        hud_conexion: '연결', hud_tu: '나', hud_jugadores: '플레이어', hud_bandera: '깃발',
        hud_portador: '소지자', hud_tick: '틱', hud_fps: 'FPS',
        fin_ganador: '승자', fin_id: '식별자', fin_motivo: '사유', fin_motivo_valor: '원에서 탈출', fin_ticks: '틱 수',
        fin_jugar_otra: '🎮 다시 플레이 (메뉴)', fin_menu: '☰ 메뉴',
        sala_titulo: '대기실', sala_esperando_inicio: '서버가 경기를 시작하기를 기다리는 중…',
        sala_salir: '☰ 나가기', sala_nadie: '아직 아무도 없음…', sala_tu_tag: '나', sala_local: '로컬 경기', sala_eres: '당신은 #{{id}}입니다',
        panel2d_titulo: '원시 데이터 보기',
        hint: '<kbd>E</kbd> 줍기/빼앗기 · <kbd>M</kbd> 2D 보기 · 중앙 깃발을 들고 황금 원을 벗어나세요',
        reset_boton: '☰ 메뉴',
        comienza_en: '{{s}}초 후 시작…',
        aviso_sala: '방: 플레이어 {{n}}명',
        aviso_rechazado: '거부됨: {{motivo}}',
        victoria_exclam: '승리!', gana_x: '{{name}} 승리', fin_gana_x: '종료 · {{name}} 승리',
        partida_terminada: '경기가 종료되었습니다', error_prefijo: '오류: {{msg}}', error_red: '네트워크 오류',
        aviso_modo_local: '로컬 모드 · 봇 {{bots}}개 · 무적 시간 {{ms}}ms', aviso_conectando_por: '{{url}}을(를) 통해 연결 중',
        srv_sin_servicio: '5000번 포트에 서비스 없음', srv_llena: '가득 참', srv_abierta: '열림', srv_en_juego: '경기 중',
        srv_encontradas: '{{n}}개 발견됨', srv_sin_bridge: '브리지가 응답하지 않음',
        srv_arranca_bridge: '브리지를 실행하세요: node red/v3/bridge-v3.js',
        banda_a_la_arena: '아레나로!', aviso_partida_iniciada: '경기 시작 · 기사 {{n}}명',
        aviso_toma_bandera: '{{name}}이(가) 깃발을 주웠습니다', banda_tienes_bandera: '깃발을 가지고 있습니다! 원을 벗어나세요',
        aviso_roba_bandera: '{{name}}이(가) {{otro}}에게서 빼앗았습니다', banda_se_la_robaste: '빼앗았습니다!',
        banda_te_robaron: '깃발을 빼앗겼습니다!', aviso_abandona: '{{name}}이(가) 나갔습니다',
        motivo_1: '경기가 이미 시작되었습니다', motivo_2: '경기가 가득 찼습니다',
        motivo_3: '유효하지 않은 이름', motivo_4: '호환되지 않는 프로토콜 버전',
      },
      jug: {
        titulo: '저거넛 모드', subtitulo: '타락한 CTF · three.js · 프로젝트 1',
        titulo_pestana: '저거넛 모드 — 타락한 CTF',
        spec_titulo: '경기 상태', dificultad_label: 'AI 난이도',
        dt_portador: '소지자', dt_dominio: '지배', dt_cazadores: '사냥꾼', dt_fps: 'FPS',
        cazadores_valor: '기사 11명',
        hint_html: '<b>J-1</b> 조작 중 · <b>WASD</b> 이동 · <b>스페이스/F</b> 태클/슬램 · <b>Shift/Q</b> 회피 · <b>C</b> AI에게 넘기기 · <b>M</b> 소리 · <b>P</b> 일시정지 · <b>지배 45초</b>로 승리',
        win_titulo: '라운드 종료', win_reiniciar_html: '<b>R</b>을 눌러 다음 라운드로',
        volver_menu: '← 메뉴로 돌아가기', menu_link: '← 메뉴', capturar_png: 'PNG 저장',
        libre: '자유', dominas: '공허를 지배했습니다!', domina_otro: '{{name}}이(가) 공허를 지배합니다',
        feed: {
          flag_captured: '⚑ 깃발 획득 → {{id}}',
          juggernaut_born: '☠ {{id}}이(가) 저거넛이 되었습니다',
          flag_dropped: '⚑ 깃발 낙하: {{by}}이(가) {{from}}을(를) 태클했습니다',
          tackle_dash: '→ {{id}}이(가) 태클을 시도합니다',
          ground_slam: '✹ {{id}}의 그라운드 슬램',
          ring_out: '↓ {{id}}이(가) 심연으로 떨어졌습니다',
        },
      },
    },
  };

  const ETIQUETAS = {
    es: 'ES', en: 'EN', pt: 'PT', ja: '日本語',
    fr: 'FR', de: 'DE', it: 'IT', zh: '中文', ko: '한국어',
  };

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
