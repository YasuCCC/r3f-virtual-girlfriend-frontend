/**
 * Ready Player Me / Mixamo系リグのアニメーションクリップをVRMヒューマノイドへ
 * リターゲットする(three-vrm公式のloadMixamoAnimationサンプルと同じ手法)。
 * これにより歩行・会話などのモーション資産をGLB/VRMの両方で共有できる。
 */
import * as THREE from "three";
import { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

/** RPM/Mixamoのボーン名(mixamorigプレフィックスなし) → VRMヒューマノイド名 */
const RPM_TO_VRM: Record<string, VRMHumanBoneName> = {
  Hips: "hips",
  Spine: "spine",
  Spine1: "chest",
  Spine2: "upperChest",
  Neck: "neck",
  Head: "head",
  LeftEye: "leftEye",
  RightEye: "rightEye",
  LeftShoulder: "leftShoulder",
  LeftArm: "leftUpperArm",
  LeftForeArm: "leftLowerArm",
  LeftHand: "leftHand",
  RightShoulder: "rightShoulder",
  RightArm: "rightUpperArm",
  RightForeArm: "rightLowerArm",
  RightHand: "rightHand",
  LeftUpLeg: "leftUpperLeg",
  LeftLeg: "leftLowerLeg",
  LeftFoot: "leftFoot",
  LeftToeBase: "leftToes",
  RightUpLeg: "rightUpperLeg",
  RightLeg: "rightLowerLeg",
  RightFoot: "rightFoot",
  RightToeBase: "rightToes",
  LeftHandThumb1: "leftThumbMetacarpal",
  LeftHandThumb2: "leftThumbProximal",
  LeftHandThumb3: "leftThumbDistal",
  LeftHandIndex1: "leftIndexProximal",
  LeftHandIndex2: "leftIndexIntermediate",
  LeftHandIndex3: "leftIndexDistal",
  LeftHandMiddle1: "leftMiddleProximal",
  LeftHandMiddle2: "leftMiddleIntermediate",
  LeftHandMiddle3: "leftMiddleDistal",
  LeftHandRing1: "leftRingProximal",
  LeftHandRing2: "leftRingIntermediate",
  LeftHandRing3: "leftRingDistal",
  LeftHandPinky1: "leftLittleProximal",
  LeftHandPinky2: "leftLittleIntermediate",
  LeftHandPinky3: "leftLittleDistal",
  RightHandThumb1: "rightThumbMetacarpal",
  RightHandThumb2: "rightThumbProximal",
  RightHandThumb3: "rightThumbDistal",
  RightHandIndex1: "rightIndexProximal",
  RightHandIndex2: "rightIndexIntermediate",
  RightHandIndex3: "rightIndexDistal",
  RightHandMiddle1: "rightMiddleProximal",
  RightHandMiddle2: "rightMiddleIntermediate",
  RightHandMiddle3: "rightMiddleDistal",
  RightHandRing1: "rightRingProximal",
  RightHandRing2: "rightRingIntermediate",
  RightHandRing3: "rightRingDistal",
  RightHandPinky1: "rightLittleProximal",
  RightHandPinky2: "rightLittleIntermediate",
  RightHandPinky3: "rightLittleDistal",
};

/** "mixamorigHips"のようなプレフィックス付きにも対応する */
const normalizeBoneName = (name: string) => name.replace(/^mixamorig:?/, "");

/**
 * クリップをVRM用に変換した新しいクリップを返す。
 * sourceRootはクリップの元リグ(レストポーズのままのシーン)であること。
 */
export function retargetClipToVrm(
  clip: THREE.AnimationClip,
  sourceRoot: THREE.Object3D,
  vrm: VRM
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const quat = new THREE.Quaternion();
  const vec = new THREE.Vector3();

  // 腰の高さの比でルート移動(上下の弾み)をスケールする
  const sourceHips = sourceRoot.getObjectByName("Hips");
  const motionHipsHeight = sourceHips?.getWorldPosition(vec).y ?? 1;
  const vrmHipsNode = vrm.humanoid.getNormalizedBoneNode("hips");
  const vrmHipsY = vrmHipsNode?.getWorldPosition(vec).y ?? 1;
  const hipsScale = motionHipsHeight > 0 ? vrmHipsY / motionHipsHeight : 1;

  for (const track of clip.tracks) {
    const [rawName, property] = track.name.split(".");
    const boneName = normalizeBoneName(rawName);
    const vrmBoneName = RPM_TO_VRM[boneName];
    if (!vrmBoneName) continue;
    const vrmNode = vrm.humanoid.getNormalizedBoneNode(vrmBoneName);
    const sourceNode = sourceRoot.getObjectByName(rawName);
    if (!vrmNode || !sourceNode || !sourceNode.parent) continue;

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      // 元リグのレスト姿勢の差を打ち消してから正規化ボーンへ適用する
      sourceNode.getWorldQuaternion(restRotationInverse).invert();
      sourceNode.parent.getWorldQuaternion(parentRestWorldRotation);
      const values = Float32Array.from(track.values);
      for (let i = 0; i < values.length; i += 4) {
        quat.fromArray(values, i);
        quat.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
        quat.toArray(values, i);
      }
      // VRM0はモデルが180°反転しているためX/Z成分の符号を反転する
      if (vrm.meta.metaVersion === "0") {
        for (let i = 0; i < values.length; i += 4) {
          values[i] = -values[i];
          values[i + 2] = -values[i + 2];
        }
      }
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmNode.name}.${property}`,
          Array.from(track.times),
          Array.from(values)
        )
      );
    } else if (
      track instanceof THREE.VectorKeyframeTrack &&
      property === "position" &&
      boneName === "Hips"
    ) {
      // 位置トラックは腰(ルートモーション)のみ転送する。他のボーンの位置を
      // 適用するとRPMリグの骨格比率がVRM側を上書きし、首が縮むなど
      // プロポーションが崩れてしまう(回転のみが正しいリターゲット)
      const values = Float32Array.from(track.values);
      for (let i = 0; i < values.length; i += 3) {
        const flip = vrm.meta.metaVersion === "0" ? -1 : 1;
        values[i] = values[i] * hipsScale * flip;
        values[i + 1] = values[i + 1] * hipsScale;
        values[i + 2] = values[i + 2] * hipsScale * flip;
      }
      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${vrmNode.name}.${property}`,
          Array.from(track.times),
          Array.from(values)
        )
      );
    }
  }

  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
