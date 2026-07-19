import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { ElementRef, MutableRefObject, useEffect, useRef } from "react";
import * as THREE from "three";

const WALK_SPEED = 3;
const RUN_SPEED = 6;
const EYE_HEIGHT = 1.6;
/** 壁とみなす距離(プレイヤー半径) */
const WALL_MARGIN = 0.45;
/** 接地レイの開始高さ(目線からの上方向オフセット) */
const GROUND_RAY_UP = 0.5;
const GROUND_RAY_FAR = 8;
const UP = new THREE.Vector3(0, 1, 0);

type PlayerProps = {
  /** 衝突メッシュがないときの移動可能範囲(原点から±bounds) */
  bounds?: number;
  onLockChange?: (locked: boolean) => void;
  /** レイキャスト対象の衝突メッシュ(CollisionMeshが設定する) */
  collisionRef?: MutableRefObject<THREE.Object3D | null>;
  spawn?: [number, number, number];
  /** デバッグ用: ポインターロックなしでも移動を許可(?nolock) */
  requireLock?: boolean;
};

export const Player = ({
  bounds = 13.5,
  onLockChange,
  collisionRef,
  spawn = [0, EYE_HEIGHT, 4],
  requireLock = true,
}: PlayerProps) => {
  const controls = useRef<ElementRef<typeof PointerLockControls>>(null);
  const keys = useRef<Record<string, boolean>>({});
  const camera = useThree((state) => state.camera);

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const move = useRef(new THREE.Vector3());
  const raycaster = useRef(new THREE.Raycaster());
  const rayOrigin = useRef(new THREE.Vector3());
  const down = useRef(new THREE.Vector3(0, -1, 0));

  useEffect(() => {
    camera.position.set(spawn[0], spawn[1], spawn[2]);
  }, [camera, spawn]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const onKeyUp = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useFrame((_, rawDelta) => {
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>;
      if (Array.isArray(w.__teleport)) {
        const [x, y, z] = w.__teleport as number[];
        camera.position.set(x, y, z);
        w.__teleport = undefined;
      }
    }
    if (requireLock && !controls.current?.isLocked) return;
    // 低FPS時にレイ距離・移動量が暴れないようdeltaをクランプする
    const delta = Math.min(rawDelta, 0.1);
    const k = keys.current;
    const speed = k.ShiftLeft || k.ShiftRight ? RUN_SPEED : WALK_SPEED;
    const collision = collisionRef?.current ?? null;

    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    right.current.crossVectors(forward.current, UP);

    move.current.set(0, 0, 0);
    if (k.KeyW || k.ArrowUp) move.current.add(forward.current);
    if (k.KeyS || k.ArrowDown) move.current.sub(forward.current);
    if (k.KeyD || k.ArrowRight) move.current.add(right.current);
    if (k.KeyA || k.ArrowLeft) move.current.sub(right.current);

    if (move.current.lengthSq() > 0) {
      move.current.normalize();

      // 壁チェック: 腰の高さから進行方向へレイを飛ばす
      let blocked = false;
      if (collision) {
        rayOrigin.current
          .copy(camera.position)
          .setY(camera.position.y - EYE_HEIGHT * 0.5);
        raycaster.current.set(rayOrigin.current, move.current);
        raycaster.current.far = WALL_MARGIN + speed * delta;
        const hits = raycaster.current.intersectObject(collision, true);
        if (hits.length > 0) blocked = true;
      }

      if (!blocked) {
        move.current.multiplyScalar(speed * delta);
        camera.position.x += move.current.x;
        camera.position.z += move.current.z;
        if (!collision) {
          camera.position.x = THREE.MathUtils.clamp(
            camera.position.x,
            -bounds,
            bounds
          );
          camera.position.z = THREE.MathUtils.clamp(
            camera.position.z,
            -bounds,
            bounds
          );
        }
      }
    }

    // 接地: 頭上少し上から真下にレイを飛ばして地面の高さに追従する
    if (collision) {
      rayOrigin.current
        .copy(camera.position)
        .setY(camera.position.y + GROUND_RAY_UP);
      raycaster.current.set(rayOrigin.current, down.current);
      raycaster.current.far = GROUND_RAY_FAR;
      const hits = raycaster.current.intersectObject(collision, true);
      if (hits.length > 0) {
        const targetY = hits[0].point.y + EYE_HEIGHT;
        camera.position.y +=
          (targetY - camera.position.y) * Math.min(1, delta * 10);
      }
    } else {
      camera.position.y = EYE_HEIGHT;
    }

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__playerPos =
        camera.position.toArray();
    }
  });

  return (
    <PointerLockControls
      ref={controls}
      selector="#enter-space"
      onLock={() => onLockChange?.(true)}
      onUnlock={() => onLockChange?.(false)}
    />
  );
};
