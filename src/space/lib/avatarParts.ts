/**
 * モジュラーアバター: 標準リグ(Ready Player Me互換)に合わせて作成した
 * パーツGLB(髪・服・小物)の着せ替えと、企業ロゴなどのテクスチャ差し替え。
 *
 * パーツの作り方(Blender):
 *  - 標準リグ(Hips/Spine/…のボーン名)にスキニングしてGLBで書き出すだけ。
 *    VRM形式への変換は不要
 *  - ロゴを差し替え可能にしたい服は、ロゴ部分を別メッシュ(または別マテリアル)
 *    にして名前に "logo" を含めておく(例: LogoPatch)
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type AvatarCustomization = {
  /** 追加パーツGLBのURL(標準リグに合わせたもの) */
  parts?: string[];
  /**
   * ロゴ差し替え。ロゴ用スロット(名前にlogoを含むメッシュ/マテリアル)が
   * あればそのテクスチャを置き換え、なければrect(UV座標 x,y,w,h 0..1)で
   * 対象メッシュのテクスチャへ合成する
   */
  logo?: {
    url: string;
    mesh?: string;
    rect?: [number, number, number, number];
  };
  /** メッシュ名(部分一致)→色の上書き。カラーバリエーション用 */
  colors?: Record<string, string>;
};

const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

/** パーツのスキンメッシュをベースアバターの骨格へ結合して着せる */
async function attachPart(root: THREE.Object3D, url: string): Promise<void> {
  const gltf = await loader.loadAsync(url);
  const boneByName = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) boneByName.set(o.name, o as THREE.Bone);
  });
  const meshes: THREE.SkinnedMesh[] = [];
  gltf.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh)
      meshes.push(o as THREE.SkinnedMesh);
  });
  const container = new THREE.Group();
  container.name = `part:${url.split("/").pop()}`;
  for (const mesh of meshes) {
    const cloned = mesh.clone();
    // 同名ボーンでベース骨格に結び直す(全ボーンが揃う場合のみ)
    const bones = mesh.skeleton.bones.map((b) => boneByName.get(b.name));
    if (bones.every((b): b is THREE.Bone => Boolean(b))) {
      cloned.skeleton = new THREE.Skeleton(bones, mesh.skeleton.boneInverses);
    }
    cloned.frustumCulled = false;
    container.add(cloned);
  }
  if (container.children.length > 0) root.add(container);
}

/** ロゴ画像をアバターに適用する(スロット優先、なければUV合成) */
async function applyLogo(
  root: THREE.Object3D,
  logo: NonNullable<AvatarCustomization["logo"]>
): Promise<void> {
  const texture = await textureLoader.loadAsync(logo.url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;

  // 1) ロゴ用スロット(名前にlogoを含むメッシュ/マテリアル)を探す
  let slotMesh: THREE.Mesh | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || slotMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (/logo/i.test(mesh.name) || mats.some((m) => /logo/i.test(m.name))) {
      slotMesh = mesh;
    }
  });
  if (slotMesh) {
    const mesh = slotMesh as THREE.Mesh;
    const mat = (
      Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    ).clone() as THREE.MeshStandardMaterial;
    mat.map = texture;
    mat.transparent = true;
    mat.needsUpdate = true;
    mesh.material = mat;
    return;
  }

  // 2) 指定メッシュのテクスチャへUV座標で合成する
  const targetName = logo.mesh ?? "Wolf3D_Outfit_Top";
  let target: THREE.Mesh | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.name === targetName) target ??= mesh;
  });
  if (!target) return;
  const mesh = target as THREE.Mesh;
  const baseMat = (
    Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  ) as THREE.MeshStandardMaterial;
  const baseImage = baseMat.map?.image as CanvasImageSource | undefined;
  if (!baseImage) return;
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(baseImage, 0, 0, size, size);
  const [x, y, w, h] = logo.rect ?? [0.35, 0.15, 0.3, 0.25];
  ctx.drawImage(texture.image, x * size, y * size, w * size, h * size);
  const composed = new THREE.CanvasTexture(canvas);
  composed.colorSpace = THREE.SRGBColorSpace;
  composed.flipY = baseMat.map?.flipY ?? false;
  composed.wrapS = baseMat.map?.wrapS ?? THREE.RepeatWrapping;
  composed.wrapT = baseMat.map?.wrapT ?? THREE.RepeatWrapping;
  // マテリアルは複製してから差し替える(同モデルの他の個体へ影響させない)
  const mat = baseMat.clone();
  mat.map = composed;
  mat.needsUpdate = true;
  mesh.material = mat;
}

/** メッシュ名(部分一致)で色を上書きする */
function applyColors(
  root: THREE.Object3D,
  colors: Record<string, string>
): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const [namePart, color] of Object.entries(colors)) {
      if (!mesh.name.toLowerCase().includes(namePart.toLowerCase())) continue;
      const baseMat = (
        Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      ) as THREE.MeshStandardMaterial;
      const mat = baseMat.clone();
      mat.color.set(color);
      mat.needsUpdate = true;
      mesh.material = mat;
    }
  });
}

/** カスタマイズ一式をアバターへ適用する */
export async function applyCustomization(
  root: THREE.Object3D,
  cfg: AvatarCustomization
): Promise<void> {
  for (const url of cfg.parts ?? []) {
    try {
      await attachPart(root, url);
    } catch {
      // パーツ単位の失敗は無視して他を続行する
    }
  }
  if (cfg.logo) {
    try {
      await applyLogo(root, cfg.logo);
    } catch {
      // ロゴが読めなくても表示自体は続行する
    }
  }
  if (cfg.colors) applyColors(root, cfg.colors);
}
