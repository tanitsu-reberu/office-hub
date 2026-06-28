import { EffectComposer, N8AO, SelectiveBloom, Vignette } from '@react-three/postprocessing';
import { Component, type ReactNode, useEffect, useState } from 'react';
import { BLOOM_LAYER } from '../constants';
import type { QualityProfile } from '../quality';
import { palette } from '../theme/palette';
import { getBloomLights, subscribeBloomLights } from '../utils/bloomRegistry';

interface PostFXProps {
  profile: QualityProfile;
}

class N8AOFallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: Error) {
    console.warn('N8AO disabled:', err.message);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function SelectiveBloomPass({ profile }: { profile: QualityProfile }) {
  const [lights, setLights] = useState(() => getBloomLights());

  useEffect(() => subscribeBloomLights(() => setLights(getBloomLights())), []);

  return (
    <SelectiveBloom
      selectionLayer={BLOOM_LAYER}
      lights={lights}
      luminanceThreshold={0.8}
      luminanceSmoothing={0.88}
      intensity={profile.bloomIntensity}
      mipmapBlur
      radius={0.55}
      levels={3}
    />
  );
}

export function PostFX({ profile }: PostFXProps) {
  if (profile.postfx === 'off') return null;

  return (
    <EffectComposer multisampling={0} enableNormalPass={profile.n8ao}>
      {profile.n8ao && (
        <N8AOFallback>
          <N8AO
            aoRadius={2}
            intensity={2.2}
            aoSamples={6}
            denoiseSamples={3}
            denoiseRadius={8}
            distanceFalloff={0.92}
            halfRes
            depthAwareUpsampling
            quality="low"
            color={palette.bg}
          />
        </N8AOFallback>
      )}
      {profile.selectiveBloom && <SelectiveBloomPass profile={profile} />}
      <Vignette offset={0.32} darkness={0.22} eskil={false} />
    </EffectComposer>
  );
}