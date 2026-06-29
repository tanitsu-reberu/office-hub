import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { AGENT_IDS, AGENTS, BLOOM_LAYER, CUBICLES } from './constants';
import { Agent } from './components/Agent';
import { CameraRig, type CameraRigHandle } from './components/CameraRig';
import { Cubicle } from './components/Cubicle';
import { DomLabels } from './components/DomLabels';
import { DeferredPostFX } from './components/DeferredPostFX';
import { Floor } from './components/Floor';
import { Lighting } from './components/Lighting';
import { MeetingPlatform } from './components/MeetingPlatform';
import { OfficeDressing } from './components/OfficeDressing';
import { UserCubicle } from './components/UserCubicle';
import { SceneErrorBoundary } from './components/SceneErrorBoundary';
import { detectQualityTier, getQualityProfile } from './quality';
import { OfficeStore } from './state/officeStore';

function notifySceneReady(gfxTier: string) {
  window.__office3dReady = true;
  window.dispatchEvent(new CustomEvent('office3d-ready', { detail: { gfxTier } }));
}

/** Pause WebGL render loop when tab is hidden — saves GPU/CPU */
function VisibilityPause() {
  const { invalidate, setFrameloop } = useThree();

  useEffect(() => {
    const sync = () => {
      const active = !document.hidden;
      setFrameloop(active ? 'always' : 'never');
      if (active) invalidate();
    };
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => document.removeEventListener('visibilitychange', sync);
  }, [invalidate, setFrameloop]);

  return null;
}

interface SceneContentProps {
  store: OfficeStore;
  cameraRef: React.RefObject<CameraRigHandle | null>;
  onCameraReady: (handle: CameraRigHandle | null) => void;
}

function SceneContent({ store, cameraRef, onCameraReady }: SceneContentProps) {
  const tier = detectQualityTier();
  const profile = getQualityProfile(tier);

  const state = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState(),
    () => store.getState()
  );

  const { gl, camera } = useThree();

  useEffect(() => {
    camera.layers.enable(BLOOM_LAYER);
  }, [camera]);

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = profile.exposure;
    gl.shadowMap.enabled = profile.shadows;
    if (profile.shadows) gl.shadowMap.type = THREE.PCFSoftShadowMap;
  }, [gl, profile]);

  const camReady = useRef(false);
  const sceneReady = useRef(false);

  useFrame((_, dt) => {
    if (!sceneReady.current) {
      sceneReady.current = true;
      notifySceneReady(tier);
    }
    if (!camReady.current && cameraRef.current) {
      onCameraReady(cameraRef.current);
      camReady.current = true;
    }
    const elapsed = performance.now() * 0.001;
    store.tickAllMotion(dt, elapsed);
  });

  return (
    <>
      <Lighting profile={profile} />
      <Floor profile={profile} />
      <OfficeDressing tier={tier} />
      <UserCubicle />
      <MeetingPlatform profile={profile} />
      {CUBICLES.map(([x, z, rot, accent, id]) => (
        <Cubicle
          key={id}
          agentId={id}
          x={x}
          z={z}
          rot={rot}
          accent={accent}
          screenIntensity={state.screenIntensity[id]}
        />
      ))}
      {AGENT_IDS.map((id) => (
        <Agent key={id} agent={state.agents[id]} />
      ))}
      <DomLabels store={store} />
      <CameraRig ref={cameraRef} />
      <DeferredPostFX profile={profile} />
    </>
  );
}

interface OfficeSceneProps {
  store: OfficeStore;
  cameraRef: React.RefObject<CameraRigHandle | null>;
  onCameraReady: (handle: CameraRigHandle | null) => void;
}

export function OfficeScene({ store, cameraRef, onCameraReady }: OfficeSceneProps) {
  const tier = detectQualityTier();
  const profile = getQualityProfile(tier);

  return (
    <Canvas
      frameloop="always"
      shadows={profile.shadows}
      dpr={profile.dpr}
      camera={{ fov: 42, near: 0.1, far: 100, position: [0, 11, 14] }}
      gl={{ antialias: profile.antialias, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%', display: 'block' }}
      onCreated={() => notifySceneReady(tier)}
    >
      <SceneErrorBoundary
        onError={(msg) => {
          window.dispatchEvent(new CustomEvent('office3d-error', { detail: { message: msg } }));
        }}
      >
        <VisibilityPause />
        <SceneContent store={store} cameraRef={cameraRef} onCameraReady={onCameraReady} />
      </SceneErrorBoundary>
    </Canvas>
  );
}