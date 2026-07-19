import { useFrame, useThree } from "@react-three/fiber";
import { MutableRefObject, useEffect, useRef } from "react";
import * as THREE from "three";

const WALK_SPEED = 3;
const RUN_SPEED = 6;
const EYE_HEIGHT = 1.6;
/** 壁とみなす距離(プレイヤー半径) */
const WALL_MARGIN = 0.45;
/** 接地レイの開始高さ(足元からの上方向オフセット) */
const GROUND_RAY_UP = 0.5;
/**
 * 接地レイの探索距離。高い建物の上などに万一飛ばされても、必ず眼下の
 * 地面を見つけて降りて来られるよう長めに取る(短いと地面を見失った時点で
 * 高さが固定され、上空視点から復帰できなくなる)
 */
const GROUND_RAY_FAR = 30;
/**
 * これより低い接地ヒットは地面とみなさない。屋外スキャンの衝突メッシュは
 * 濡れた路面の反射により「地下に鏡像の街」を含んでおり、路面メッシュの
 * 穴を接地レイが素通りすると鏡像を地面と誤認してカメラが地下へ沈む
 * (行き先クリック後に視点が破綻していた根本原因)
 */
const GROUND_MIN_Y = -2;
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
  /**
   * NPCが実際に歩いた足跡(ブレッドクラム)。追従時はNPCへ直線で向かわず
   * この足跡をなぞることで、建物や壁を突き抜けたり、ノイズの多い
   * 衝突メッシュをよじ登って上空視点になるのを防ぐ
   */
  followPathRef?: MutableRefObject<THREE.Vector3[]>;
  /**
   * 一度だけ視線を向けたい対象(店主NPCの登場時など)。向き終わるか
   * ユーザーがドラッグ操作したら自動でクリアされる
   */
  focusRef?: MutableRefObject<{ x: number; y: number; z: number } | null>;
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
  followPathRef,
  focusRef,
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

  // 接地: 膝の高さ(足元+0.5m)から真下にレイを飛ばして地面の高さに追従する。
  // 膝より上の面(屋根・看板・ひさし等)は構造的に拾えないため、ノイズの多い
  // 衝突メッシュを段差としてよじ登り上空視点になることがない
  const applyGrounding = (
    collision: THREE.Object3D | null,
    delta: number
  ) => {
    if (collision) {
      rayOrigin.current
        .copy(camera.position)
        .setY(camera.position.y - EYE_HEIGHT + GROUND_RAY_UP);
      raycaster.current.set(rayOrigin.current, down.current);
      raycaster.current.far = GROUND_RAY_FAR;
      const hits = raycaster.current.intersectObject(collision, true);
      // 地下の鏡像ノイズ(GROUND_MIN_Y未満)を除いた最も近い面を地面とする
      const hit = hits.find((h) => h.point.y >= GROUND_MIN_Y);
      if (hit) {
        const dy = hit.point.y + EYE_HEIGHT - camera.position.y;
        const step = dy * Math.min(1, delta * 10);
        // 上昇は最大3m/sに制限(階段は登れるが、一瞬で高所に飛ばない)
        camera.position.y += dy > 0 ? Math.min(step, 3 * delta) : step;
      } else if (camera.position.y < EYE_HEIGHT - 0.5) {
        // 有効な地面が見つからず地下に沈んでいる場合は路面レベルへ復帰する
        camera.position.y += Math.min(
          (EYE_HEIGHT - camera.position.y) * Math.min(1, delta * 10),
          3 * delta
        );
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
          // NPCの足跡(通過済みの安全な経路)をなぞって移動する。
          // 直線で追うと建物の角を突き抜けてしまうため
          const trail = followPathRef?.current;
          if (trail) {
            while (
              trail.length > 0 &&
              Math.hypot(
                trail[0].x - camera.position.x,
                trail[0].z - camera.position.z
              ) < 0.5
            ) {
              trail.shift();
            }
          }
          const dest = trail && trail.length > 0 ? trail[0] : target;
          chase.current.set(
            dest.x - camera.position.x,
            0,
            dest.z - camera.position.z
          );
          const destDist = chase.current.length();
          const step = Math.min(
            follow.speed * 1.25 * delta,
            dist - FOLLOW_DISTANCE,
            destDist
          );
          if (destDist > 1e-4 && step > 0) {
            chase.current.normalize().multiplyScalar(step);
            camera.position.x += chase.current.x;
            camera.position.z += chase.current.z;
          }
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
        // NPCは登録済みの経路(地面)上を歩くため、追従中のカメラ高さは
        // NPC基準に強制する。衝突メッシュのノイズで接地判定が狂っても
        // 上空・地下視点には絶対にならない(最終保険)
        camera.position.y = THREE.MathUtils.clamp(
          camera.position.y,
          target.y + EYE_HEIGHT - 2,
          target.y + EYE_HEIGHT + 2
        );
        return;
      }
    }

    // 店主NPC登場時などの「一度だけ視線を向ける」処理
    const focus = focusRef?.current;
    if (focus) {
      if (dragging.current) {
        // ユーザーが自分で視点を動かし始めたら任せる
        focusRef.current = null;
      } else {
        const fdx = focus.x - camera.position.x;
        const fdz = focus.z - camera.position.z;
        const fdist = Math.hypot(fdx, fdz);
        const targetYaw = Math.atan2(-fdx, -fdz);
        const targetPitch = THREE.MathUtils.clamp(
          Math.atan2(focus.y - camera.position.y, fdist),
          -PITCH_LIMIT,
          PITCH_LIMIT
        );
        let yawDiff = targetYaw - yaw.current;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        const s = Math.min(1, delta * 4);
        yaw.current += yawDiff * s;
        pitch.current += (targetPitch - pitch.current) * s;
        if (Math.abs(yawDiff) < 0.03) focusRef.current = null;
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
