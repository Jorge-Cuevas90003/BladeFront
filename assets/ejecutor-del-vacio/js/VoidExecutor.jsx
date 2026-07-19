// VoidExecutor.jsx — wrapper React Three Fiber del Ejecutor del Vacío.
// ⚠ Este archivo NO se usa en la demo vanilla (index.html): es la pieza lista
// para cuando el juego se monte con @react-three/fiber. El núcleo (malla
// procedural + IA + knockback) vive en executor.js / enemy-system.js, que son
// motor-agnósticos — este componente solo los conecta al ciclo de React.
//
// Uso:
//   <Canvas shadows>
//     <VoidExecutor players={playersRef} arenaRadius={ARENA_RADIUS} />
//   </Canvas>
//
// `players` es un ref a un array [{ id, position, velocity, radius, falling }]
// (las físicas de los jugadores reciben el knockback directamente en velocity).

import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { createExecutor } from './executor.js';
import { EnemySystem } from './enemy-system.js';

export function VoidExecutor({
  players,                 // ref → array de jugadores conectados
  arenaRadius = 11,
  spawn = [0, 0, -8.5],
  speed = 2.7,
  knockbackForce = 13,
}) {
  // Malla procedural: se construye una sola vez
  const executor = useMemo(() => createExecutor(), []);

  // Estado espacial en refs (posición/velocidad/objetivo viven en el sistema,
  // nunca en state de React: cero re-renders por frame)
  const system = useRef(null);
  if (!system.current) {
    system.current = new EnemySystem(executor, {
      speed,
      arenaRadius,
      collisionRadius: 0.8,
      knockbackForce,
    });
  }

  useEffect(() => {
    executor.position.set(...spawn);
  }, [executor, spawn]);

  // Bucle principal: steering por proximidad + colisión cinética + flash de visor
  useFrame((state, delta) => {
    const list = players?.current ?? [];
    system.current.update(Math.min(delta, 0.05), state.clock.elapsedTime, list);
  });

  return (
    <group>
      {/* El grupo jerárquico completo (sombras ya activadas malla a malla) */}
      <primitive object={executor} />
      {/* Rim carmesí dedicado tras la zona de spawn: recorta cuernos y
          obsidiana dentada contra la niebla baja */}
      <spotLight
        color="#ff1a0d"
        intensity={2600}
        distance={90}
        angle={0.6}
        penumbra={0.5}
        decay={1.7}
        position={[spawn[0], 7, spawn[2] - 10]}
      />
    </group>
  );
}

export default VoidExecutor;
