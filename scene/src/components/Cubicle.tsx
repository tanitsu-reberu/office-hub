import { useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Group } from 'three';
import { BLOOM_LAYER, type AgentId } from '../constants';
import { invokeAgentDeskClick } from '../deskClick';
import { palette } from '../theme/palette';

interface CubicleProps {
  x: number;
  z: number;
  rot: number;
  accent: string;
  screenIntensity: number;
  agentId: AgentId;
}

function onDeskPointerClick(e: ThreeEvent<MouseEvent>, agentId: AgentId) {
  e.stopPropagation();
  invokeAgentDeskClick(agentId);
}

export function Cubicle({ x, z, rot, accent, screenIntensity, agentId }: CubicleProps) {
  const groupRef = useRef<Group>(null);
  const emissive =
    palette.emissive.screenMin +
    Math.min(screenIntensity, 1) * palette.emissive.screenBoost;

  return (
    <group ref={groupRef} position={[x, 0, z]} rotation={[0, rot, 0]} userData={{ agentId }}>
      <mesh
        position={[0, 1.1, 0]}
        onClick={(e) => onDeskPointerClick(e, agentId)}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <boxGeometry args={[3.5, 2.4, 3.1]} />
        <meshBasicMaterial visible={false} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[3.6, 0.08, 3.2]} />
        <meshStandardMaterial
          color={palette.desk}
          roughness={0.58}
          metalness={0.06}
          envMapIntensity={0.55}
        />
      </mesh>

      <mesh position={[0, 1.1, -1.5]} castShadow>
        <boxGeometry args={[3.6, 2.2, 0.12]} />
        <meshStandardMaterial
          color={palette.partition}
          roughness={0.72}
          metalness={0.04}
          envMapIntensity={0.45}
        />
      </mesh>
      <mesh position={[0, 2.2, -1.5]}>
        <boxGeometry args={[3.6, 0.06, 0.14]} />
        <meshStandardMaterial color={palette.partitionTop} roughness={0.65} metalness={0.06} />
      </mesh>

      <mesh position={[-1.74, 1.1, 0]} castShadow>
        <boxGeometry args={[0.12, 2.2, 3.2]} />
        <meshStandardMaterial color={palette.partition} roughness={0.72} metalness={0.04} />
      </mesh>
      <mesh position={[-1.74, 2.2, 0]}>
        <boxGeometry args={[0.14, 0.06, 3.2]} />
        <meshStandardMaterial color={palette.partitionTop} roughness={0.65} metalness={0.06} />
      </mesh>

      <mesh position={[0, 1.5, -1.44]}>
        <planeGeometry args={[2.8, 0.12]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      <mesh position={[-1.68, 1.2, 0]}>
        <planeGeometry args={[0.12, 2.0]} />
        <meshBasicMaterial color={accent} />
      </mesh>

      <mesh position={[0, 0.78, 0.55]} castShadow>
        <boxGeometry args={[1.5, 0.08, 0.7]} />
        <meshStandardMaterial
          color={palette.wood}
          roughness={0.46}
          metalness={0.12}
          envMapIntensity={0.45}
        />
      </mesh>
      <mesh position={[0, 0.39, 0.55]}>
        <boxGeometry args={[1.4, 0.7, 0.6]} />
        <meshStandardMaterial color="#d8d0c4" roughness={0.62} metalness={0.08} />
      </mesh>

      <mesh position={[0, 1.12, 0.35]}>
        <boxGeometry args={[0.7, 0.48, 0.05]} />
        <meshStandardMaterial
          color={palette.monitorBezel}
          roughness={0.32}
          metalness={0.35}
          envMapIntensity={0.55}
        />
      </mesh>

      <mesh position={[0, 1.12, 0.38]} layers={BLOOM_LAYER}>
        <planeGeometry args={[0.62, 0.4]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissive}
          roughness={0.2}
          metalness={0.18}
        />
      </mesh>

      <mesh position={[0, 0.45, 1.15]}>
        <boxGeometry args={[0.55, 0.5, 0.55]} />
        <meshStandardMaterial color={palette.chair} roughness={0.56} metalness={0.1} />
      </mesh>

      <mesh position={[0, 0.14, 1.35]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, 0.28]} />
        <meshBasicMaterial color={accent} transparent opacity={0.28} />
      </mesh>
    </group>
  );
}