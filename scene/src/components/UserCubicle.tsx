import { palette } from '../theme/palette';

/** Заказчик — кабинет перед meeting platform */
export function UserCubicle() {
  const accent = '#94a3b8';
  return (
    <group position={[0, 0, 5.5]} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[3.8, 0.08, 3.2]} />
        <meshStandardMaterial color={palette.desk} roughness={0.58} metalness={0.06} />
      </mesh>

      <mesh position={[0, 1.1, -1.5]} castShadow>
        <boxGeometry args={[3.8, 2.2, 0.12]} />
        <meshStandardMaterial color={palette.partition} roughness={0.72} metalness={0.04} />
      </mesh>
      <mesh position={[0, 2.2, -1.5]}>
        <boxGeometry args={[3.8, 0.06, 0.14]} />
        <meshStandardMaterial color={palette.partitionTop} roughness={0.65} metalness={0.06} />
      </mesh>

      <mesh position={[0, 1.55, -1.44]}>
        <planeGeometry args={[2.2, 0.14]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      <mesh position={[0, 1.75, -1.43]}>
        <planeGeometry args={[1.6, 0.22]} />
        <meshBasicMaterial color="#64748b" transparent opacity={0.85} />
      </mesh>

      <mesh position={[0, 0.78, 0.2]}>
        <boxGeometry args={[1.2, 0.06, 0.8]} />
        <meshStandardMaterial color={palette.wood} roughness={0.5} metalness={0.1} />
      </mesh>

      <mesh position={[0, 0.5, 0.55]} rotation={[-0.1, 0, 0]}>
        <boxGeometry args={[0.9, 0.02, 0.6]} />
        <meshStandardMaterial color="#e8edf4" roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}