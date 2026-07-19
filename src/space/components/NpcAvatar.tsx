import { Html, useAnimations, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Component, ReactNode, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

const AVATAR_URL = "/models/64f1a714fe61576b46f27ca2.glb";
const ANIMATIONS_URL = "/models/animations.glb";
/** ポインターロック中の照準クリックで会話開始できる最大距離(m) */
const ACTIVATE_DISTANCE = 30;

type NpcAvatarProps = {
  position: [number, number, number];
  headLabel?: string;
  headLabelColor?: string;
  /** 発話中はTalkingアニメーションに切り替える */
  speaking: boolean;
  /** 吹き出しに表示するメッセージ(最新のNPC発言) */
  bubbleText?: string | null;
  thinking?: boolean;
  /** NPCがクリックされた(=会話を開始したい)ときに呼ばれる */
  onActivate?: () => void;
};

const NpcAvatarInner = ({
  position,
  headLabel,
  headLabelColor,
  speaking,
  bubbleText,
  thinking,
  onActivate,
}: NpcAvatarProps) => {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const { scene } = useGLTF(AVATAR_URL);
  // 既存アバターアプリと同じGLBを使うため、シーンを複製して干渉を避ける
  const avatar = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { animations } = useGLTF(ANIMATIONS_URL);
  const { actions } = useAnimations(animations, group);

  const animationName = useMemo(() => {
    const wanted = speaking ? "Talking_1" : "Idle";
    if (animations.some((a) => a.name === wanted)) return wanted;
    return animations[0]?.name;
  }, [speaking, animations]);

  useEffect(() => {
    if (!animationName) return;
    const action = actions[animationName];
    action?.reset().fadeIn(0.4).play();
    return () => {
      action?.fadeOut(0.4);
    };
  }, [animationName, actions]);

  // NPCへのクリック判定(自前レイキャスト)。
  // - ポインターロック中: 画面中央の照準がNPCに合った状態でクリック
  // - 非ロック時: マウスカーソル位置でクリック(canvas上のみ)
  useEffect(() => {
    if (!onActivate) return;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onMouseDown = (e: MouseEvent) => {
      if (!group.current) return;
      if (document.pointerLockElement) {
        pointer.set(0, 0);
      } else {
        // DOMボタン等へのクリックは無視し、canvas直上のクリックだけを拾う
        if (!(e.target instanceof HTMLCanvasElement)) return;
        pointer.set(
          (e.clientX / window.innerWidth) * 2 - 1,
          -(e.clientY / window.innerHeight) * 2 + 1
        );
      }
      raycaster.setFromCamera(pointer, camera);
      raycaster.far = ACTIVATE_DISTANCE;
      const hits = raycaster.intersectObject(group.current, true);
      if (hits.length > 0) {
        document.exitPointerLock?.();
        onActivate();
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [camera, onActivate]);

  // プレイヤー(カメラ)の方をゆっくり向く(水平のみ)
  useFrame((_, delta) => {
    if (!group.current) return;
    const dx = camera.position.x - position[0];
    const dz = camera.position.z - position[2];
    const target = Math.atan2(dx, dz);
    const current = group.current.rotation.y;
    let diff = target - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    group.current.rotation.y = current + diff * Math.min(1, delta * 5);
  });

  return (
    <group ref={group} position={position}>
      <primitive object={avatar} />
      {(headLabel || bubbleText || thinking) && (
        <Html
          position={[0, 2.05, 0]}
          center
          distanceFactor={6}
          style={{ pointerEvents: "none" }}
        >
          <div className="flex w-64 flex-col items-center gap-1">
            {(bubbleText || thinking) && (
              <div className="max-h-40 w-full overflow-hidden rounded-xl bg-white/95 px-3 py-2 text-xs leading-relaxed text-gray-900 shadow-lg">
                {thinking ? "考え中…" : bubbleText}
              </div>
            )}
            {headLabel && (
              <div
                className="rounded-full px-3 py-0.5 text-xs font-semibold text-white shadow"
                style={{ backgroundColor: headLabelColor || "#4f46e5" }}
              >
                {headLabel}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
};

class NpcErrorBoundary extends Component<
  { children: ReactNode; onError?: (message: string) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError?.(error.message);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** NPC内部のエラーでシーン全体が止まらないようにバウンダリで包む */
export const NpcAvatar = (
  props: NpcAvatarProps & { onError?: (message: string) => void }
) => (
  <NpcErrorBoundary onError={props.onError}>
    <NpcAvatarInner {...props} />
  </NpcErrorBoundary>
);

useGLTF.preload(AVATAR_URL);
useGLTF.preload(ANIMATIONS_URL);
