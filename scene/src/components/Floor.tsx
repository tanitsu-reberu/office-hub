import { Grid } from '@react-three/drei';
import type { QualityProfile } from '../quality';
import { palette } from '../theme/palette';

interface FloorProps {
  profile: QualityProfile;
}

export function Floor({ profile }: FloorProps) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[28, 22]} />
        {profile.physicalMaterials ? (
          <meshPhysicalMaterial
            color={palette.floor}
            roughness={0.82}
            metalness={0.08}
            clearcoat={0.25}
            clearcoatRoughness={0.5}
            envMapIntensity={0.55}
          />
        ) : (
          <meshStandardMaterial
            color={palette.floor}
            roughness={0.82}
            metalness={0.08}
            envMapIntensity={0.45}
          />
        )}
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[3.2, 32]} />
        <meshBasicMaterial color={palette.floorAccent} transparent opacity={0.12} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <circleGeometry args={[3.4, 32]} />
        <meshBasicMaterial color={palette.carpet} transparent opacity={0.22} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.026, 0]}>
        <ringGeometry args={[3.2, 3.5, 32]} />
        <meshBasicMaterial color={palette.accentPurple} transparent opacity={0.15} />
      </mesh>

      <Grid
        args={[28, 28]}
        position={[0, 0.03, 0]}
        cellSize={1}
        cellThickness={0.35}
        cellColor={palette.floorGrid}
        sectionSize={4}
        sectionThickness={0.7}
        sectionColor={palette.floorGridSection}
        fadeDistance={20}
        fadeStrength={1.4}
        infiniteGrid={false}
      />
    </group>
  );
}