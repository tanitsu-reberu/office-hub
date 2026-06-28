import type { RefObject } from 'react';
import type { PointLight } from 'three';

const bloomLights = new Set<RefObject<PointLight | null>>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
}

export function registerBloomLight(ref: RefObject<PointLight | null>): () => void {
  bloomLights.add(ref);
  notify();
  return () => {
    bloomLights.delete(ref);
    notify();
  };
}

export function subscribeBloomLights(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getBloomLights(): RefObject<PointLight | null>[] {
  return Array.from(bloomLights);
}