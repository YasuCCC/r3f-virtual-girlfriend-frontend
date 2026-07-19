import { Html, useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

const AVATAR_URL = "/models/64f1a714fe61576b46f27ca2.glb";
const ANIMATIONS_URL = "/models/animations.glb";

type NpcAvatarProps = {
  position: [number, number, number];
  headLabel?: string;
  headLabelColor?: string;
  /** 発話中はTalkingアニメーションに切り替える */
  speaking: boolean;
  /** 吹き出しに表示するメッセージ(最新のNPC発言) */
  bubbleText?: string | null;
  thinking?: boolean;
};

export const NpcAvatar = ({
  position,
  headLabel,
  headLabelColor,
  speaking,
  bubbleText,
  thinking,
}: NpcAvatarProps) => {
  const group = useRef<THREE.Group>(null);
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

  // プレイヤー(カメラ)の方をゆっくり向く(水平のみ)
  useFrame(({ camera }, delta) => {
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

useGLTF.preload(AVATAR_URL);
useGLTF.preload(ANIMATIONS_URL);
