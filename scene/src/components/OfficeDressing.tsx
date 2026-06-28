import type { QualityTier } from '../constants';
import { palette } from '../theme/palette';

interface OfficeDressingProps {
  tier: QualityTier;
}

const LED_PANELS: Array<{
  pos: [number, number, number];
  size: [number, number];
  intensity: number;
}> = [
  { pos: [0, 3.2, 0], size: [2.4, 1.2], intensity: 0.2 },
  { pos: [-7, 3.2, 3], size: [1.8, 1.0], intensity: 0.18 },
  { pos: [7, 3.2, 3], size: [1.8, 1.0], intensity: 0.18 },
  { pos: [-7, 3.2, -5], size: [1.8, 1.0], intensity: 0.18 },
  { pos: [7, 3.2, -5], size: [1.8, 1.0], intensity: 0.18 },
  { pos: [0, 3.2, -6], size: [2.0, 1.0], intensity: 0.18 },
];

const PLANTS: Array<[number, number]> = [
  [-3.5, 2.5],
  [3.5, 2.5],
  [-10, 0],
  [10, -2],
];

function Plant({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.28, 8]} />
        <meshStandardMaterial color="#c8bfb0" roughness={0.85} metalness={0.02} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 0.35, 6]} />
        <meshStandardMaterial color="#78716c" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.32, 8, 8]} />
        <meshStandardMaterial color="#4ade80" roughness={0.75} metalness={0} />
      </mesh>
    </group>
  );
}

function CeilingPanel({
  pos,
  size,
  intensity,
}: {
  pos: [number, number, number];
  size: [number, number];
  intensity: number;
}) {
  return (
    <group position={pos}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={size} />
        <meshStandardMaterial
          color="#fffef8"
          emissive="#fffef8"
          emissiveIntensity={intensity}
          roughness={0.4}
          metalness={0}
        />
      </mesh>
      <mesh position={[0, -0.04, 0]}>
        <boxGeometry args={[size[0], 0.04, size[1]]} />
        <meshStandardMaterial color={palette.ceiling} roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}

export function OfficeDressing({ tier }: OfficeDressingProps) {
  const showFull = tier === 'high';
  const showStandard = tier === 'medium';
  const showMinimal = tier === 'low';

  const ledPanels =
    showMinimal ? LED_PANELS.slice(0, 1) : LED_PANELS;

  const plants =
    showFull ? PLANTS : showStandard ? PLANTS.slice(0, 2) : [];

  const showArchitecture = showFull || showStandard;

  return (
    <group>
      {ledPanels.map((panel, i) => (
        <CeilingPanel key={`led-${i}`} {...panel} />
      ))}

      {showArchitecture && (
        <>
          <mesh position={[0, 2.0, -10.5]}>
            <planeGeometry args={[14, 4]} />
            <meshStandardMaterial color="#e2e8f4" roughness={0.82} metalness={0.04} />
          </mesh>
          <mesh position={[0, 2.4, -10.48]}>
            <planeGeometry args={[10, 0.35]} />
            <meshBasicMaterial color={palette.accentPurple} transparent opacity={0.55} />
          </mesh>

          <mesh position={[13.5, 2.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[4, 3.5]} />
            <meshBasicMaterial color={palette.keyLight} transparent opacity={0.08} />
          </mesh>
          <mesh position={[-13.5, 2.5, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[4, 3.5]} />
            <meshBasicMaterial color={palette.keyLight} transparent opacity={0.06} />
          </mesh>
        </>
      )}

      {plants.map(([x, z], i) => (
        <Plant key={`plant-${i}`} x={x} z={z} />
      ))}
    </group>
  );
}