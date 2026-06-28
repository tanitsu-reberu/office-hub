import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, forwardRef } from 'react';
import { DESK, type AgentId } from '../constants';

export interface CameraRigHandle {
  reset: () => void;
  focusAgent: (id: AgentId) => void;
}

export const CameraRig = forwardRef<CameraRigHandle>(function CameraRig(_, ref) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 11, 14);
    camera.lookAt(0, 0, -1);
  }, [camera]);

  useImperativeHandle(ref, () => ({
    reset() {
      camera.position.set(0, 11, 14);
      camera.lookAt(0, 0, -1);
    },
    focusAgent(id: AgentId) {
      const d = DESK[id];
      camera.position.set(d.x + 2, 7, d.z + 5);
      camera.lookAt(d.x, 1, d.z);
    },
  }));

  return (
    <OrbitControls
      makeDefault
      target={[0, 0, -0.5]}
      enableDamping
      dampingFactor={0.05}
      minDistance={8}
      maxDistance={24}
      maxPolarAngle={1.35}
      minPolarAngle={0.35}
    />
  );
});