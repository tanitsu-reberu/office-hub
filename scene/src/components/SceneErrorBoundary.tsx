import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onError?: (message: string) => void;
}

interface State {
  error: string | null;
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: Error): State {
    return { error: err.message || 'Неизвестная ошибка WebGL' };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('Office3D scene error:', err, info.componentStack);
    this.props.onError?.(err.message);
  }

  render() {
    if (this.state.error) {
      return (
        <mesh position={[0, 2, 0]}>
          <boxGeometry args={[0.01, 0.01, 0.01]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      );
    }
    return this.props.children;
  }
}