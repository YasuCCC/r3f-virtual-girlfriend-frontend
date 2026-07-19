import { Stars } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { FormEvent, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CollisionMesh } from "./components/CollisionMesh";
import { GalleryRoom } from "./components/GalleryRoom";
import { Player } from "./components/Player";
import { SparkRendererMount, SplatLayer } from "./components/SplatLayer";
import { SpaceDefinition, SPACES } from "./spaces";

const DEG = Math.PI / 180;

/** Arrivalから移植したスペース(スプラット+衝突メッシュ+ライト)を配置する */
const ArrivalSpace = ({
  def,
  collisionRef,
  onSplatError,
  onSplatLoaded,
  onCollisionError,
}: {
  def: SpaceDefinition;
  collisionRef: React.MutableRefObject<THREE.Object3D | null>;
  onSplatError: (message: string) => void;
  onSplatLoaded: () => void;
  onCollisionError: (message: string) => void;
}) => {
  const lightDir = useMemo(() => {
    const rot = (def.light?.rotationDeg ?? 0) * DEG;
    return [Math.sin(rot) * 10, 10, Math.cos(rot) * 10] as const;
  }, [def.light?.rotationDeg]);

  return (
    <>
      <color attach="background" args={["#0b0d17"]} />
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[lightDir[0], lightDir[1], lightDir[2]]}
        intensity={def.light?.intensity ?? 0.8}
      />
      <Stars radius={80} depth={40} count={1500} factor={4} fade speed={0.3} />
      <group
        position={def.position ?? [0, 0, 0]}
        rotation={[0, (def.rotationYDeg ?? 0) * DEG, 0]}
        scale={def.scale ?? 1}
      >
        {/* スプラットは3DGSの慣習(Y下向き)のためSplatLayer内でX軸180°反転される */}
        <SplatLayer
          url={def.splatUrl}
          onError={onSplatError}
          onLoaded={onSplatLoaded}
        />
        {def.collisionUrl && (
          <group rotation={def.collisionInSplatFrame ? [Math.PI, 0, 0] : [0, 0, 0]}>
            <CollisionMesh
              url={def.collisionUrl}
              collisionRef={collisionRef}
              onError={onCollisionError}
            />
          </group>
        )}
      </group>
    </>
  );
};

export const SpaceApp = () => {
  const [entered, setEntered] = useState(false);
  const [activeSpace, setActiveSpace] = useState<SpaceDefinition | null>(null);
  const [selectedId, setSelectedId] = useState(SPACES[0].id);
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const collisionRef = useRef<THREE.Object3D | null>(null);

  // デバッグ用: ?nolock でポインターロックなしでもWASD移動できる
  const requireLock = useMemo(
    () => !new URLSearchParams(window.location.search).has("nolock"),
    []
  );

  const loadSelected = () => {
    const def = SPACES.find((s) => s.id === selectedId);
    if (!def) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    collisionRef.current = null;
    setActiveSpace(def);
  };

  const loadCustomUrl = (e: FormEvent) => {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    collisionRef.current = null;
    setActiveSpace({
      id: "custom",
      title: "カスタムURL",
      splatUrl: url,
    });
  };

  return (
    <div className="h-full w-full">
      <Canvas camera={{ position: [0, 1.6, 4], fov: 70 }}>
        <SparkRendererMount />
        {activeSpace ? (
          <ArrivalSpace
            def={activeSpace}
            collisionRef={collisionRef}
            onSplatError={(message) => {
              setActiveSpace(null);
              setLoading(false);
              setError(`スプラットの読み込みに失敗しました: ${message}`);
            }}
            onSplatLoaded={() => setLoading(false)}
            onCollisionError={(message) =>
              setNotice(
                `衝突メッシュを読み込めなかったため平面移動になります (${message})`
              )
            }
          />
        ) : (
          <GalleryRoom />
        )}
        <Player
          onLockChange={setEntered}
          collisionRef={collisionRef}
          spawn={activeSpace?.spawn ?? [0, 1.6, 4]}
          requireLock={requireLock}
        />
      </Canvas>

      {/* 入場オーバーレイ */}
      {!entered && (
        <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-black/60">
          <h1 className="text-3xl font-bold text-white">Space Prototype</h1>
          {activeSpace && (
            <p className="text-sm text-indigo-300">
              現在のスペース: {activeSpace.title}
            </p>
          )}
          <button
            id="enter-space"
            className="pointer-events-auto rounded-full bg-indigo-500 px-8 py-3 text-lg font-semibold text-white shadow-lg transition hover:bg-indigo-400"
          >
            クリックして空間に入る
          </button>
          <p className="text-sm text-gray-300">
            WASD / 矢印キー: 移動 ・ Shift: 走る ・ マウス: 視点 ・ Esc: 退出
          </p>

          <div className="pointer-events-auto flex w-full max-w-xl items-center gap-2 px-4">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
            >
              {SPACES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadSelected}
              className="whitespace-nowrap rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              スペース読込
            </button>
          </div>

          <form
            onSubmit={loadCustomUrl}
            className="pointer-events-auto flex w-full max-w-xl items-center gap-2 px-4"
          >
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="または Gaussian Splat のURL (.sog / .ply / .splat / .spz)"
              className="min-w-0 flex-1 rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-400 focus:outline-none"
            />
            <button
              type="submit"
              className="whitespace-nowrap rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-600"
            >
              URL読込
            </button>
          </form>
          {error && <p className="px-4 text-sm text-red-400">{error}</p>}
          {notice && <p className="px-4 text-sm text-yellow-300">{notice}</p>}
        </div>
      )}

      {/* 読み込みインジケータ */}
      {loading && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/70 px-5 py-2.5 text-sm text-white shadow-lg">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-white" />
          スペースを読み込んでいます…(数十MBのデータを取得するため、しばらくお待ちください)
        </div>
      )}

      {/* 入場中のHUD */}
      {entered && (
        <>
          <div className="pointer-events-none fixed left-1/2 top-1/2 z-10 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
          <div className="pointer-events-none fixed bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-xs text-gray-200">
            {activeSpace ? `${activeSpace.title} ・ ` : ""}WASD: 移動 ・ Shift:
            走る ・ Esc: 退出
          </div>
        </>
      )}
    </div>
  );
};
