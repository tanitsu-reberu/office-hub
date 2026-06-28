import { Component, type ReactNode, useEffect, useState } from 'react';
import type { QualityProfile } from '../quality';
import { PostFX } from './PostFX';

class PostFXErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: Error) {
    console.warn('PostFX disabled:', err.message);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface DeferredPostFXProps {
  profile: QualityProfile;
}

export function DeferredPostFX({ profile }: DeferredPostFXProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const delay = profile.postfx === 'full' ? 500 : profile.postfx === 'selective' ? 350 : 0;
    const id = window.setTimeout(() => setReady(true), delay);
    return () => window.clearTimeout(id);
  }, [profile.postfx]);

  if (!ready || profile.postfx === 'off') return null;

  return (
    <PostFXErrorBoundary>
      <PostFX profile={profile} />
    </PostFXErrorBoundary>
  );
}