import { Environment } from '@react-three/drei';
import { Suspense } from 'react';
import type { QualityProfile } from '../quality';
import { palette } from '../theme/palette';
import { BloomLight } from './BloomLight';

interface LightingProps {
  profile: QualityProfile;
}

function HdriEnvironment({ profile }: { profile: QualityProfile }) {
  return (
    <Environment
      preset={profile.envPreset}
      environmentIntensity={profile.envIntensity}
      background={false}
    />
  );
}

export function Lighting({ profile }: LightingProps) {
  const shadowSize = profile.shadowMapSize;

  return (
    <>
      <color attach="background" args={[palette.bg]} />
      {profile.fog && <fog attach="fog" args={[palette.fog, 28, 48]} />}

      <Suspense fallback={null}>
        <HdriEnvironment profile={profile} />
      </Suspense>

      <hemisphereLight args={[palette.fillLight, palette.fillGround, 0.36]} />
      <ambientLight intensity={0.22} color={palette.bg} />

      <directionalLight
        position={[12, 22, 8]}
        intensity={1.38}
        color={palette.keyLight}
        castShadow={profile.shadows}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0002}
        shadow-camera-far={40}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <directionalLight position={[-6, 14, 10]} intensity={0.48} color={palette.fillLight} />
      <directionalLight position={[0, 8, -16]} intensity={0.28} color={palette.rimLight} />

      {profile.selectiveBloom && (
        <BloomLight position={[0, 2.6, 0]} intensity={0.55} color={palette.platformGlow} distance={11} />
      )}
    </>
  );
}