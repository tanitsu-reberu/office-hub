import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Mesh, MeshStandardMaterial } from 'three';
import { BLOOM_LAYER } from '../constants';
import type { QualityProfile } from '../quality';
import { palette } from '../theme/palette';

interface MeetingPlatformProps {
  profile: QualityProfile;
}

export function MeetingPlatform({ profile }: MeetingPlatformProps) {
  const outerRingRef = useRef<Mesh>(null);
  const innerRingRef = useRef<Mesh>(null);
  const segments = profile.physicalMaterials ? 36 : 24;

  useFrame(({ clock }) => {
    const pulse =
      palette.emissive.platformRing +
      Math.sin(clock.elapsedTime * 1.4) * palette.emissive.platformRingPulse;

    if (outerRingRef.current) {
      (outerRingRef.current.material as MeshStandardMaterial).emissiveIntensity = pulse;
    }
    if (innerRingRef.current) {
      (innerRingRef.current.material as MeshStandardMaterial).emissiveIntensity = pulse * 1.25;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow={profile.shadows} receiveShadow>
        <cylinderGeometry args={[2.2, 2.2, 0.12, segments]} />
        {profile.physicalMaterials ? (
          <meshPhysicalMaterial
            color={palette.platform}
            roughness={0.32}
            metalness={0.42}
            clearcoat={0.35}
            clearcoatRoughness={0.32}
            envMapIntensity={0.85}
          />
        ) : (
          <meshStandardMaterial
            color={palette.platform}
            roughness={0.38}
            metalness={0.32}
            envMapIntensity={0.7}
          />
        )}
      </mesh>

      <mesh
        ref={outerRingRef}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0.52, 0]}
        layers={BLOOM_LAYER}
      >
        <torusGeometry args={[2.2, 0.065, 8, segments]} />
        <meshStandardMaterial
          color={palette.platformRing}
          emissive={palette.platformRing}
          emissiveIntensity={palette.emissive.platformRing}
          roughness={0.18}
          metalness={0.55}
        />
      </mesh>

      {profile.innerPlatformRing && (
        <mesh
          ref={innerRingRef}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0.54, 0]}
          layers={BLOOM_LAYER}
        >
          <torusGeometry args={[2.05, 0.022, 6, segments]} />
          <meshStandardMaterial
            color={palette.platformRingInner}
            emissive={palette.platformRingInner}
            emissiveIntensity={palette.emissive.platformRing * 1.2}
            roughness={0.12}
            metalness={0.7}
          />
        </mesh>
      )}
    </group>
  );
}