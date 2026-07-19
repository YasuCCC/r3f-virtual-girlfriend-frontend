import { Html, useAnimations, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Component,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

// Ready Player Me公式アニメーションライブラリの歩行モーション
// (https://github.com/readyplayerme/animation-library)
const WALK_URL = "/animations/F_Walk_002.glb";
const WALK_CLIP_NAME = "F_Walk_002";
/**
 * F_Walk_002の実際の歩行速度(m/s)。クリップ内の腰の前進量(4.4m/3.125s)から
 * 算出した値で、timeScale同期に使う
 */
const WALK_CLIP_BASE_SPEED = 1.4;

const AVATAR_URL = "/models/64f1a714fe61576b46f27ca2.glb";
const ANIMATIONS_URL = "/models/animations.glb";
/** ポインターロック中の照準クリックで会話開始できる最大距離(m) */
const ACTIVATE_DISTANCE = 30;

/**
 * 未会話のNPCを囲む光のバリア。脈動して目立たせ、クリックを促す
 * (会話開始とともに消える)
 */
const ConciergeBeacon = () => {
  const wallMat = useRef<THREE.MeshBasicMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const pulse = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 2.5);
    if (wallMat.current) wallMat.current.opacity = 0.06 + 0.1 * pulse;
    if (ring.current) {
      const s = 1 + 0.18 * pulse;
      ring.current.scale.set(s, s, 1);
      (ring.current.material as THREE.MeshBasicMaterial).opacity =
        0.35 + 0.45 * pulse;
    }
  });
  return (
    <group>
      <mesh position={[0, 1.05, 0]}>
        <cylinderGeometry args={[0.85, 0.85, 2.1, 32, 1, true]} />
        <meshBasicMaterial
          ref={wallMat}
          color="#22d3ee"
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.72, 0.95, 48]} />
        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export type NpcWalkCommand = {
  /** 変わるたびに新しい歩行として実行される */
  id: number;
  path: [number, number, number][];
  /** m/s */
  speed: number;
};

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
  /** 誘導歩行の指示(guidePoints) */
  walk?: NpcWalkCommand | null;
  onWalkDone?: (id: number) => void;
  /** 現在位置を毎フレーム共有するref(プレイヤーの自動追従に使う) */
  positionRef?: React.MutableRefObject<THREE.Vector3>;
  /** 歩行中に足跡を積むref(プレイヤーはこの足跡をなぞって追従する) */
  trailRef?: React.MutableRefObject<THREE.Vector3[]>;
  /** 光のバリアで囲んで目立たせる(会話開始前のクリック誘導) */
  highlight?: boolean;
};

const NpcAvatarInner = ({
  position,
  headLabel,
  headLabelColor,
  speaking,
  bubbleText,
  thinking,
  onActivate,
  walk,
  onWalkDone,
  positionRef,
  trailRef,
  highlight,
}: NpcAvatarProps) => {
  const group = useRef<THREE.Group>(null);
  // 誘導歩行の進行状態(経路の残りウェイポイント)
  const walkQueue = useRef<THREE.Vector3[]>([]);
  const walkId = useRef<number | null>(null);
  const walkSpeed = useRef(3);
  // 最後に足跡を落とした位置(0.7mごとに追加する)
  const lastCrumb = useRef<THREE.Vector3 | null>(null);
  const camera = useThree((state) => state.camera);
  const { scene } = useGLTF(AVATAR_URL);
  // 既存アバターアプリと同じGLBを使うため、シーンを複製して干渉を避ける
  const avatar = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { animations } = useGLTF(ANIMATIONS_URL);
  const { animations: walkAnimationsRaw } = useGLTF(WALK_URL);
  // 歩行クリップにはルートモーション(腰が前へ4.4m進んでループ先頭に戻る)が
  // 含まれており、コード側の移動と二重になってガクッと戻る原因になるため、
  // 腰の水平移動成分を除去する(上下の弾みは残す)
  const walkAnimations = useMemo(
    () =>
      walkAnimationsRaw.map((clip) => {
        const cloned = clip.clone();
        for (const track of cloned.tracks) {
          if (track.name.endsWith("Hips.position")) {
            for (let i = 0; i < track.values.length; i += 3) {
              track.values[i] = 0;
              track.values[i + 2] = 0;
            }
          }
        }
        return cloned;
      }),
    [walkAnimationsRaw]
  );
  const allAnimations = useMemo(
    () => [...animations, ...walkAnimations],
    [animations, walkAnimations]
  );
  const { actions } = useAnimations(allAnimations, group);
  const [isWalking, setIsWalking] = useState(false);

  const animationName = useMemo(() => {
    if (isWalking) return WALK_CLIP_NAME;
    const wanted = speaking ? "Talking_1" : "Idle";
    if (animations.some((a) => a.name === wanted)) return wanted;
    return animations[0]?.name;
  }, [isWalking, speaking, animations]);

  useEffect(() => {
    if (!animationName) return;
    const action = actions[animationName];
    if (!action) return;
    if (animationName === WALK_CLIP_NAME) {
      // 歩行速度に合わせて足の回転速度を同期させる(不自然な高速回転は抑える)
      action.timeScale = THREE.MathUtils.clamp(
        walkSpeed.current / WALK_CLIP_BASE_SPEED,
        0.6,
        1.6
      );
    }
    action.reset().fadeIn(0.3).play();
    return () => {
      action.fadeOut(0.3);
    };
  }, [animationName, actions]);

  // NPCへのクリック判定(自前レイキャスト)。
  // ドラッグ視点回転と区別するため「ほぼ動かないmousedown→mouseup」だけを
  // クリックとして扱う
  useEffect(() => {
    if (!onActivate) return;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt: { x: number; y: number } | null = null;
    const hitTest = (e: MouseEvent) => {
      if (!group.current) return false;
      pointer.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      raycaster.far = ACTIVATE_DISTANCE;
      return raycaster.intersectObject(group.current, true).length > 0;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) return;
      downAt = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!downAt) return;
      const moved =
        Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y);
      downAt = null;
      if (moved > 6) return; // ドラッグは視点回転
      if (hitTest(e)) onActivate();
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [camera, onActivate]);

  // 誘導歩行コマンドを受け取ったら経路をセットする
  useEffect(() => {
    if (!walk || walk.id === walkId.current) return;
    walkId.current = walk.id;
    walkQueue.current = walk.path.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    walkSpeed.current = walk.speed;
    lastCrumb.current = null;
    setIsWalking(true);
  }, [walk]);

  // 歩行中は進行方向へ移動、待機中はプレイヤー(カメラ)の方をゆっくり向く
  useFrame((_, rawDelta) => {
    if (!group.current) return;
    const delta = Math.min(rawDelta, 0.1);
    let targetYaw: number;

    if (walkQueue.current.length > 0) {
      const pos = group.current.position;
      const next = walkQueue.current[0];
      const dir = next.clone().sub(pos);
      const dist = dir.length();
      const step = walkSpeed.current * delta;
      if (dist <= step) {
        pos.copy(next);
        walkQueue.current.shift();
        if (walkQueue.current.length === 0 && walkId.current !== null) {
          setIsWalking(false);
          onWalkDone?.(walkId.current);
        }
      } else {
        dir.normalize().multiplyScalar(step);
        pos.add(dir);
      }
      // 通過点を足跡として残す(プレイヤーはこの足跡をなぞって安全に追従する)
      if (trailRef) {
        if (!lastCrumb.current) {
          lastCrumb.current = pos.clone();
          trailRef.current.push(pos.clone());
        } else if (pos.distanceTo(lastCrumb.current) >= 0.7) {
          lastCrumb.current.copy(pos);
          trailRef.current.push(pos.clone());
        }
      }
      targetYaw = Math.atan2(dir.x, dir.z);
    } else {
      const dx = camera.position.x - group.current.position.x;
      const dz = camera.position.z - group.current.position.z;
      targetYaw = Math.atan2(dx, dz);
    }

    const current = group.current.rotation.y;
    let diff = targetYaw - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    group.current.rotation.y = current + diff * Math.min(1, delta * 5);

    positionRef?.current.copy(group.current.position);
  });

  return (
    <group ref={group} position={position}>
      <primitive object={avatar} />
      {highlight && <ConciergeBeacon />}
      {headLabel && (
        <Html
          position={[0, 2.05, 0]}
          center
          distanceFactor={6}
          style={{ pointerEvents: "none" }}
        >
          <div
            className="whitespace-nowrap rounded-full px-3 py-0.5 text-xs font-semibold text-white shadow"
            style={{ backgroundColor: headLabelColor || "#4f46e5" }}
          >
            {headLabel}
          </div>
        </Html>
      )}
      {/* 会話の吹き出し: 顔を隠さないよう口の横に出す。半透明で背後も見える */}
      {(bubbleText || thinking) && (
        <Html
          position={[0.35, 1.85, 0]}
          distanceFactor={6}
          style={{ pointerEvents: "none" }}
        >
          <div className="relative ml-3 w-60">
            <div className="absolute -left-1.5 top-4 h-3 w-3 rotate-45 rounded-sm bg-white/80" />
            <div className="max-h-44 overflow-hidden rounded-2xl bg-white/80 px-3 py-2 text-xs leading-relaxed text-gray-900 shadow-lg backdrop-blur-sm">
              {thinking ? "考え中…" : bubbleText}
            </div>
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
