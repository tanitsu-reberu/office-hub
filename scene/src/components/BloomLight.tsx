import { useEffect, useRef } from 'react';
import { PointLight } from 'three';
import { BLOOM_LAYER } from '../constants';
import { registerBloomLight } from '../utils/bloomRegistry';

interface BloomLightProps {
  position: [number, number, number];
  intensity?: number;
  color?: string;
  distance?: number;
  decay?: number;
}

/** Point light registered for SelectiveBloom (layer 1). */
export function BloomLight({ position, intensity = 0.5, color = '#a78bfa', distance = 10, decay = 2 }: BloomLightProps) {
  const ref = useRef<PointLight>(null);

  useEffect(() => {
    const light = ref.current;
    if (light) {
      light.layers.enable(BLOOM_LAYER);
    }
    return registerBloomLight(ref);
  }, []);

  return (
    <pointLight
      ref={ref}
      position={position}
      intensity={intensity}
      color={color}
      distance={distance}
      decay={decay}
    />
  );
}