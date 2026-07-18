import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { ElementRef, useEffect, useRef } from "react";
import * as THREE from "three";

const WALK_SPEED = 3;
const RUN_SPEED = 6;
const EYE_HEIGHT = 1.6;
const UP = new THREE.Vector3(0, 1, 0);

type PlayerProps = {
  /** プレイヤーが移動できる範囲(原点から±bounds) */
  bounds?: number;
  onLockChange?: (locked: boolean) => void;
};

export const Player = ({ bounds = 13.5, onLockChange }: PlayerProps) => {
  const controls = useRef<ElementRef<typeof PointerLockControls>>(null);
  const keys = useRef<Record<string, boolean>>({});
  const camera = useThree((state) => state.camera);

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const move = useRef(new THREE.Vector3());

  useEffect(() => {
    camera.position.set(0, EYE_HEIGHT, 4);
    const onKeyDown = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const onKeyUp = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [camera]);

  useFrame((_, delta) => {
    if (!controls.current?.isLocked) return;
    const k = keys.current;
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
    if (move.current.lengthSq() === 0) return;

    move.current.normalize().multiplyScalar(speed * delta);
    camera.position.add(move.current);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -bounds, bounds);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -bounds, bounds);
    camera.position.y = EYE_HEIGHT;
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
