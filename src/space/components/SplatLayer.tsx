import { Splat } from "@react-three/drei";
import { Component, ReactNode, Suspense } from "react";

type SplatLayerProps = {
  url: string;
  onError: () => void;
};

type BoundaryProps = {
  children: ReactNode;
  onError: () => void;
  resetKey: string;
};

type BoundaryState = { failed: boolean };

/**
 * Splatの読み込み失敗(不正なURL・ネットワークエラー)でシーン全体が
 * 落ちないようにするエラーバウンダリ。
 */
class SplatErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  componentDidUpdate(prevProps: BoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export const SplatLayer = ({ url, onError }: SplatLayerProps) => (
  <SplatErrorBoundary onError={onError} resetKey={url}>
    <Suspense fallback={null}>
      <Splat src={url} position={[0, 0, 0]} />
    </Suspense>
  </SplatErrorBoundary>
);
