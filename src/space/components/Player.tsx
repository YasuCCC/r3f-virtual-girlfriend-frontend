import { useFrame, useThree } from "@react-three/fiber";
import { MutableRefObject, useEffect, useRef } from "react";
import * as THREE from "three";

const WALK_SPEED = 3;
const RUN_SPEED = 6;
const EYE_HEIGHT = 1.6;
/** 壁とみなす距離(プレイヤー半径) */
const WALL_MARGIN = 0.45;
/** 接地レイの開始高さ(目線からの上方向オフセット) */
const GROUND_RAY_UP = 0.5;
const GROUND_RAY_FAR = 8;
/** 追従時にNPCと保つ距離(m) */
const FOLLOW_DISTANCE = 3;
/** ドラッグ視点の感度(rad/px) */
const LOOK_SENSITIVITY = 0.0045;
const PITCH_LIMIT = 1.45;
const UP = new THREE.Vector3(0, 1, 0);

type PlayerProps = {
  /** 空間に入場済みか(falseの間は操作を受け付けない) */
  active: boolean;
  /** 衝突メッシュがないときの移動可能範囲(原点から±bounds) */
  bounds?: number;
  /** レイキャスト対象の衝突メッシュ(CollisionMeshが設定する) */
  collisionRef?: MutableRefObject<THREE.Object3D | null>;
  spawn?: [number, number, number];
  /** スポーン時の向き(Y軸回転・度。0=-Z方向、180=+Z方向) */
  spawnYawDeg?: number;
  /** NPC誘導中の自動追従(activeの間、NPCの後ろを保って移動する) */
  followRef?: MutableRefObject<{ active: boolean; speed: number }>;
  /** 追従対象(NPC)の現在位置 */
  followTargetRef?: MutableRefObject<THREE.Vector3>;
};

/**
 * マウスドラッグで視点回転・WASDで移動する一人称コントローラ。
 * ポインターロックを使わないため、カーソルは常にUI操作に使える。
 * 視点はヨー/ピッチのみで管理し、ロール(傾き)は発生しない。
 */
export const Player = ({
  active,
  bounds = 13.5,
  collisionRef,
  spawn = [0, EYE_HEIGHT, 4],
  spawnYawDeg = 0,
  followRef,
  followTargetRef,
}: PlayerProps) => {
  const keys = useRef<Record<string, boolean>>({});
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  const yaw = useRef(0);
  const pitch = useRef(0);
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const move = useRef(new THREE.Vector3());
  const raycaster = useRef(new THREE.Raycaster());
  const rayOrigin = useRef(new THREE.Vector3());
  const down = useRef(new THREE.Vector3(0, -1, 0));
  const chase = useRef(new THREE.Vector3());

  useEffect(() => {
    camera.rotation.order = "YXZ";
    camera.position.set(spawn[0], spawn[1], spawn[2]);
    yaw.current = (spawnYawDeg * Math.PI) / 180;
    pitch.current = 0;
    camera.rotation.set(0, yaw.current, 0);
  }, [camera, spawn, spawnYawDeg]);

  // キー入力(入力欄にフォーカスがある間は拾わない)
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const el = e.target;
      return (
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      keys.current[e.code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ドラッグ視点回転(canvas上で開始したドラッグのみ)
  useEffect(() => {
    const canvas = gl.domElement;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || e.target !== canvas) return;
      dragging.current = true;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      // 空間クリックでチャット入力のフォーカスを外し、WASDを効かせる
      const el = document.activeElement;
      if (el instanceof HTMLElement && el !== document.body) el.blur();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      yaw.current -= dx * LOOK_SENSITIVITY;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - dy * LOOK_SENSITIVITY,
        -PITCH_LIMIT,
        PITCH_LIMIT
      );
    };
    const onMouseUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [gl]);

  // 接地: 頭上少し上から真下にレイを飛ばして地面の高さに追従する
  const applyGrounding = (
    collision: THREE.Object3D | null,
    delta: number
  ) => {
    if (collision) {
      rayOrigin.current
        .copy(camera.position)
        .setY(camera.position.y + GROUND_RAY_UP);
      raycaster.current.set(rayOrigin.current, down.current);
      raycaster.current.far = GROUND_RAY_FAR;
      const hits = raycaster.current.intersectObject(collision, true);
      if (hits.length > 0) {
        const targetY = hits[0].point.y + EYE_HEIGHT;
        // 1mを超える急な上昇は「屋根に乗った」誤検出とみなして無視する
        // (追従中に建物を横切った際、上空視点になるのを防ぐ)
        if (targetY - camera.position.y <= 1.0) {
          camera.position.y +=
            (targetY - camera.position.y) * Math.min(1, delta * 10);
        }
      }
    } else {
      camera.position.y = EYE_HEIGHT;
    }
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__playerPos =
        camera.position.toArray();
    }
  };

  useFrame((_, rawDelta) => {
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>;
      if (Array.isArray(w.__teleport)) {
        const [x, y, z] = w.__teleport as number[];
        camera.position.set(x, y, z);
        w.__teleport = undefined;
      }
    }
    if (!active) return;
    // 低FPS時にレイ距離・移動量が暴れないようdeltaをクランプする
    const delta = Math.min(rawDelta, 0.1);
    const k = keys.current;
    const collision = collisionRef?.current ?? null;
    const moveKeyPressed = Boolean(
      k.KeyW || k.KeyS || k.KeyA || k.KeyD ||
      k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight
    );

    // NPC誘導の自動追従
    const follow = followRef?.current;
    if (follow?.active && followTargetRef) {
      if (moveKeyPressed) {
        // ユーザーが自分で歩き始めたら追従をやめる
        follow.active = false;
      } else {
        const target = followTargetRef.current;
        chase.current.set(
          target.x - camera.position.x,
          0,
          target.z - camera.position.z
        );
        const dist = chase.current.length();
        if (dist > FOLLOW_DISTANCE) {
          const step = Math.min(
            follow.speed * 1.25 * delta,
            dist - FOLLOW_DISTANCE
          );
          chase.current.normalize().multiplyScalar(step);
          camera.position.x += chase.current.x;
          camera.position.z += chase.current.z;
        }
        // ドラッグ操作中でなければ視線をNPCへ向ける(ヨー/ピッチのみ)
        if (!dragging.current && dist > 0.5) {
          const dy = target.y + 1.4 - camera.position.y;
          const targetYaw = Math.atan2(
            -(target.x - camera.position.x),
            -(target.z - camera.position.z)
          );
          const targetPitch = THREE.MathUtils.clamp(
            Math.atan2(dy, dist),
            -PITCH_LIMIT,
            PITCH_LIMIT
          );
          let yawDiff = targetYaw - yaw.current;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
          const s = Math.min(1, delta * 3);
          yaw.current += yawDiff * s;
          pitch.current += (targetPitch - pitch.current) * s;
        }
        camera.rotation.set(pitch.current, yaw.current, 0);
        applyGrounding(collision, delta);
        return;
      }
    }

    camera.rotation.set(pitch.current, yaw.current, 0);

    const speed = k.ShiftLeft || k.ShiftRight ? RUN_SPEED : WALK_SPEED;
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

    applyGrounding(collision, delta);
  });

  return null;
};
