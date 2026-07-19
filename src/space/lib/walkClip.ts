import * as THREE from "three";

export const WALK_CLIP_NAME = "ProceduralWalk";
/** このクリップが表現する歩行速度(m/s)。actionのtimeScale調整に使う */
export const WALK_CLIP_BASE_SPEED = 1.5;

const CYCLE = 0.9; // 1歩行サイクルの秒数(左右1歩ずつ)
const SAMPLES = 24;

type BoneMotion = {
  name: string;
  /** θ(0..2π)に対するオイラー角の差分(rad) */
  delta: (theta: number) => [number, number, number];
};

// 各ボーンの基準ポーズからの相対的な揺れ。腕は脚と逆位相で振る
const MOTIONS: BoneMotion[] = [
  { name: "LeftUpLeg", delta: (t) => [0.55 * Math.sin(t), 0, 0] },
  { name: "RightUpLeg", delta: (t) => [0.55 * Math.sin(t + Math.PI), 0, 0] },
  { name: "LeftLeg", delta: (t) => [0.75 * Math.max(0, Math.sin(t + 2.2)), 0, 0] },
  {
    name: "RightLeg",
    delta: (t) => [0.75 * Math.max(0, Math.sin(t + Math.PI + 2.2)), 0, 0],
  },
  { name: "LeftArm", delta: (t) => [0.35 * Math.sin(t + Math.PI), 0, 0] },
  { name: "RightArm", delta: (t) => [0.35 * Math.sin(t), 0, 0] },
  { name: "LeftForeArm", delta: () => [0.2, 0, 0] },
  { name: "RightForeArm", delta: () => [0.2, 0, 0] },
];

/**
 * アバターのボーン基準ポーズに歩行の揺れを重ねたループクリップを生成する。
 * (リポジトリのアニメーション資産に歩行モーションがないため、コードで合成)
 */
export function buildWalkClip(root: THREE.Object3D): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const times = Array.from(
    { length: SAMPLES + 1 },
    (_, i) => (i / SAMPLES) * CYCLE
  );

  const euler = new THREE.Euler();
  const qDelta = new THREE.Quaternion();
  const qOut = new THREE.Quaternion();

  for (const motion of MOTIONS) {
    const bone = root.getObjectByName(motion.name);
    if (!bone) continue;
    const qBase = bone.quaternion.clone();
    const values: number[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const theta = (i / SAMPLES) * Math.PI * 2;
      const [x, y, z] = motion.delta(theta);
      euler.set(x, y, z);
      qDelta.setFromEuler(euler);
      qOut.copy(qBase).multiply(qDelta);
      values.push(qOut.x, qOut.y, qOut.z, qOut.w);
    }
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${motion.name}.quaternion`,
        times,
        values
      )
    );
  }

  // 腰の上下(1サイクルに2回沈む)
  const hips = root.getObjectByName("Hips");
  if (hips) {
    const base = hips.position.clone();
    const values: number[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const theta = (i / SAMPLES) * Math.PI * 2;
      const bob = -0.02 + 0.02 * Math.cos(theta * 2);
      values.push(base.x, base.y + bob, base.z);
    }
    tracks.push(
      new THREE.VectorKeyframeTrack("Hips.position", times, values)
    );
  }

  return new THREE.AnimationClip(WALK_CLIP_NAME, CYCLE, tracks);
}
