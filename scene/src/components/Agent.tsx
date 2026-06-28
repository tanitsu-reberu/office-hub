import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, Group, Mesh, MeshStandardMaterial } from 'three';
import { BLOOM_LAYER } from '../constants';
import type { AgentRuntime } from '../state/officeStore';

interface AgentProps {
  agent: AgentRuntime;
}

export function Agent({ agent }: AgentProps) {
  const groupRef = useRef<Group>(null);
  const leftArmRef = useRef<Mesh>(null);
  const rightArmRef = useRef<Mesh>(null);
  const headRef = useRef<Mesh>(null);
  const bodyRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);

  const { meta, pos, rot, state, typing, typingPhase, idlePhase, talkingGlow } = agent;

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;

    g.position.set(pos.x, 0, pos.z);
    g.rotation.y = rot;

    let yBob = 0;
    if (state === 'walking' || state === 'visiting') {
      yBob = Math.abs(Math.sin(performance.now() * 0.012)) * 0.06;
    } else if (typing) {
      yBob = Math.sin(typingPhase * 0.5) * 0.02;
    } else {
      yBob = Math.sin(idlePhase * 2) * 0.008;
    }
    g.position.y = yBob;

    if (!typing && state === 'idle') {
      const breath = 1 + Math.sin(idlePhase * 2) * 0.009;
      g.scale.set(1, breath, 1);
      g.rotation.z = Math.sin(idlePhase * 0.8) * 0.018;
    } else {
      g.scale.set(1, 1, 1);
      g.rotation.z *= 0.9;
    }

    if (headRef.current && !typing && state === 'idle') {
      headRef.current.rotation.y = Math.sin(idlePhase * 0.35) * 0.09;
    } else if (headRef.current) {
      headRef.current.rotation.y *= 0.85;
    }

    if (leftArmRef.current && rightArmRef.current) {
      if (typing) {
        leftArmRef.current.rotation.x = -0.6 + Math.sin(typingPhase) * 0.25;
        rightArmRef.current.rotation.x = -0.5 + Math.cos(typingPhase * 1.2) * 0.3;
      } else {
        leftArmRef.current.rotation.x *= 0.9;
        rightArmRef.current.rotation.x *= 0.9;
      }
    }

    if (bodyRef.current && talkingGlow > 0.1) {
      bodyRef.current.position.z = Math.sin(performance.now() * 0.008) * 0.03 * talkingGlow;
    } else if (bodyRef.current) {
      bodyRef.current.position.z *= 0.9;
    }

    if (haloRef.current) {
      const glow = talkingGlow > 0.05 ? talkingGlow : state === 'talking' ? 0.5 : 0;
      if (glow > 0.02) {
        const mat = haloRef.current.material as MeshStandardMaterial;
        mat.emissiveIntensity = glow * (0.9 + Math.sin(performance.now() * 0.006) * 0.15);
        haloRef.current.visible = true;
        haloRef.current.scale.setScalar(1 + glow * 0.12);
      } else if (haloRef.current.visible) {
        haloRef.current.visible = false;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={bodyRef} position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[0.42, 0.5, 0.28]} />
        <meshStandardMaterial color={meta.color} roughness={0.45} metalness={0.18} envMapIntensity={0.85} />
      </mesh>
      <mesh position={[0, 0.38, 0]} castShadow>
        <boxGeometry args={[0.38, 0.45, 0.26]} />
        <meshStandardMaterial color="#1a2336" roughness={0.65} metalness={0.08} />
      </mesh>
      <mesh ref={headRef} position={[0, 1.28, 0]} castShadow>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#f1c9a2" roughness={0.78} />
      </mesh>
      <mesh ref={leftArmRef} position={[-0.3, 0.88, 0]} castShadow>
        <boxGeometry args={[0.1, 0.38, 0.1]} />
        <meshStandardMaterial color={meta.color} roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh ref={rightArmRef} position={[0.3, 0.88, 0]} castShadow>
        <boxGeometry args={[0.1, 0.38, 0.1]} />
        <meshStandardMaterial color={meta.color} roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Emissive halo for selective bloom when agent talks */}
      <mesh ref={haloRef} position={[0, 1.55, 0]} layers={BLOOM_LAYER} visible={false}>
        <ringGeometry args={[0.32, 0.48, 32]} />
        <meshStandardMaterial
          color={meta.color}
          emissive={meta.color}
          emissiveIntensity={0}
          transparent
          opacity={0.85}
          side={DoubleSide}
          roughness={0.2}
          metalness={0.3}
        />
      </mesh>
    </group>
  );
}