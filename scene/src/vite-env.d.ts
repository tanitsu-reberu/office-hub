/// <reference types="vite/client" />

interface Window {
  Office3D?: import('./bridge-api').Office3DApi;
  __office3dReady?: boolean;
}