import { useGLTF } from "@react-three/drei";
import { Component, MutableRefObject, ReactNode, Suspense, useEffect } from "react";
import * as THREE from "three";

type CollisionMeshProps = {
  url: string;
  /** ロード完了後、Playerがレイキャストに使うルートObject3Dを共有する */
  collisionRef: MutableRefObject<THREE.Object3D | null>;
  onError?: (message: string) => void;
};

const CollisionMeshInner = ({
  url,
  collisionRef,
}: Omit<CollisionMeshProps, "onError">) => {
  const { scene } = useGLTF(url);

  useEffect(() => {
    // 裏面ポリゴンでもレイが当たるように全メッシュを両面化する
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = new THREE.MeshBasicMaterial({
          side: THREE.DoubleSide,
        });
      }
    });
    collisionRef.current = scene;
    return () => {
      collisionRef.current = null;
    };
  }, [scene, collisionRef]);

  // visible=falseでも三次元的なレイキャストは有効
  return <primitive object={scene} visible={false} />;
};

type BoundaryProps = {
  children: ReactNode;
  onError?: (message: string) => void;
  resetKey: string;
};

class CollisionErrorBoundary extends Component<
  BoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error.message);
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

/** 衝突判定用GLBを不可視でシーンに配置する。失敗してもシーンは維持される。 */
export const CollisionMesh = ({ url, collisionRef, onError }: CollisionMeshProps) => (
  <CollisionErrorBoundary onError={onError} resetKey={url}>
    <Suspense fallback={null}>
      <CollisionMeshInner url={url} collisionRef={collisionRef} />
    </Suspense>
  </CollisionErrorBoundary>
);
