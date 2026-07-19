// JuggernautMode.jsx — arquitectura React Three Fiber del modo Juggernaut.
// ⚠ No se usa en la demo vanilla: es la pieza para el juego final en R3F.
// El núcleo (reglas, estados TACKLE_DASH / DODGE_ROLL / CORRUPTION_TRANSFORMATION /
// GROUND_SLAM, física del knockback y bus de eventos) vive en juggernaut-mode.js
// y flag.js, motor-agnósticos: este componente solo los conecta al ciclo React.
//
// Uso:
//   <Canvas shadows>
//     <ArenaDelVacio />
//     <JuggernautGame hunterCount={11} arenaRadius={ARENA_RADIUS} />
//   </Canvas>
//
// Red real: NetworkBus es un EventTarget. Un adaptador websocket se suscribe a
// FLAG_CAPTURED / FLAG_DROPPED / GROUND_SLAM / RING_OUT para publicarlos al
// servidor, y reproduce los eventos remotos llamando a los mismos handlers.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { createKnight } from '../../caballero-templario/js/knight.js';
import { createExecutor } from '../../ejecutor-del-vacio/js/executor.js';
import { createCyberBanner } from './flag.js';
import { JuggernautMode, NetworkBus, STATES } from './juggernaut-mode.js';

export { NetworkBus, STATES };

export function JuggernautGame({ hunterCount = 11, arenaRadius = 11 }) {
  const { scene, camera } = useThree();

  // El estandarte y el modo se construyen UNA vez; las mallas se reutilizan
  // durante toda la partida (transformaciones sin popping ni fugas de memoria)
  const flag = useMemo(() => createCyberBanner(), []);
  const modeRef = useRef(null);

  useEffect(() => {
    scene.add(flag);
    modeRef.current = new JuggernautMode(scene, {
      arenaRadius,
      hunterCount,
      knightFactory: createKnight,
      executorFactory: createExecutor,
      flag,
    });
    const mode = modeRef.current;
    return () => {
      // limpieza al desmontar: quitar grupos de la escena (las geometrías son
      // compartidas por diseño; el GC las libera con la escena)
      for (const h of mode.hunters) scene.remove(h.group);
      scene.remove(mode.executor);
      if (mode.slamRing) scene.remove(mode.slamRing);
      scene.remove(flag);
    };
  }, [scene, flag, arenaRadius, hunterCount]);

  // Bucle: estados de animación procedural + shake de cámara del GROUND_SLAM
  const shake = useRef({ x: 0, y: 0, z: 0 });
  useFrame((state, delta) => {
    const mode = modeRef.current;
    if (!mode) return;
    const dt = Math.min(delta, 0.05);
    mode.update(dt, state.clock.elapsedTime);

    // revierte el micro-offset del frame anterior y aplica el nuevo si toca
    camera.position.x -= shake.current.x;
    camera.position.y -= shake.current.y;
    camera.position.z -= shake.current.z;
    if (mode.shakeFrames > 0) {
      mode.shakeFrames--;
      shake.current = {
        x: (Math.random() - 0.5) * 0.22,
        y: (Math.random() - 0.5) * 0.16,
        z: (Math.random() - 0.5) * 0.22,
      };
      camera.position.x += shake.current.x;
      camera.position.y += shake.current.y;
      camera.position.z += shake.current.z;
    } else {
      shake.current = { x: 0, y: 0, z: 0 };
    }
  });

  return null; // todo vive en la escena imperativa: cero re-renders por frame
}

export default JuggernautGame;
