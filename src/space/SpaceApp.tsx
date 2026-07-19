import { Canvas } from "@react-three/fiber";
import { FormEvent, useState } from "react";
import { GalleryRoom } from "./components/GalleryRoom";
import { Player } from "./components/Player";
import { SplatLayer } from "./components/SplatLayer";

// ローカル同梱のサンプルSOG(splat-transformでPLYから変換したもの)。
// Arrival SpaceのCDN上の .sog URL などもそのまま指定できる。
const SAMPLE_SPLAT_URL = "/splats/sample_room.sog";

export const SpaceApp = () => {
  const [entered, setEntered] = useState(false);
  const [splatUrl, setSplatUrl] = useState<string | null>(null);
  const [splatError, setSplatError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState(SAMPLE_SPLAT_URL);

  const loadSplat = (e: FormEvent) => {
    e.preventDefault();
    setSplatError(null);
    setSplatUrl(urlInput.trim() || null);
  };

  return (
    <div className="h-full w-full">
      <Canvas camera={{ position: [0, 1.6, 4], fov: 70 }}>
        <GalleryRoom />
        {splatUrl && (
          <SplatLayer
            url={splatUrl}
            onError={(message) => {
              setSplatUrl(null);
              setSplatError(`スプラットの読み込みに失敗しました: ${message}`);
            }}
          />
        )}
        <Player
          onLockChange={setEntered}
        />
      </Canvas>

      {/* 入場オーバーレイ */}
      {!entered && (
        <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-black/60">
          <h1 className="text-3xl font-bold text-white">Space Prototype</h1>
          <button
            id="enter-space"
            className="pointer-events-auto rounded-full bg-indigo-500 px-8 py-3 text-lg font-semibold text-white shadow-lg transition hover:bg-indigo-400"
          >
            クリックして空間に入る
          </button>
          <p className="text-sm text-gray-300">
            WASD / 矢印キー: 移動 ・ Shift: 走る ・ マウス: 視点 ・ Esc: 退出
          </p>
          <form
            onSubmit={loadSplat}
            className="pointer-events-auto flex w-full max-w-xl items-center gap-2 px-4"
          >
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Gaussian Splat のURL (.sog / .ply / .splat / .spz)"
              className="min-w-0 flex-1 rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-400 focus:outline-none"
            />
            <button
              type="submit"
              className="whitespace-nowrap rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-600"
            >
              スプラット読込
            </button>
          </form>
          {splatError && (
            <p className="text-sm text-red-400">{splatError}</p>
          )}
        </div>
      )}

      {/* 入場中のHUD */}
      {entered && (
        <>
          <div className="pointer-events-none fixed left-1/2 top-1/2 z-10 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
          <div className="pointer-events-none fixed bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-xs text-gray-200">
            WASD: 移動 ・ Shift: 走る ・ Esc: 退出
          </div>
        </>
      )}
    </div>
  );
};
