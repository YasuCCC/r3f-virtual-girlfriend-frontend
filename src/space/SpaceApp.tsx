import { Canvas } from "@react-three/fiber";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CollisionMesh } from "./components/CollisionMesh";
import { GalleryRoom } from "./components/GalleryRoom";
import { LodSplatLayer } from "./components/LodSplatLayer";
import { NpcAvatar } from "./components/NpcAvatar";
import { Player } from "./components/Player";
import { SparkRendererMount, SplatLayer } from "./components/SplatLayer";
import {
  ChatTurn,
  fetchNpcConfig,
  NpcConfig,
  sendChat,
  synthesizeVoice,
} from "./npc/api";
import { SpaceDefinition, SPACES } from "./spaces";

const DEG = Math.PI / 180;

/** Arrivalから移植したスペース(スプラット+衝突メッシュ+ライト)を配置する */
const ArrivalSpace = ({
  def,
  collisionRef,
  onSplatError,
  onSplatLoaded,
  onCollisionError,
  lodLevelOverride,
}: {
  def: SpaceDefinition;
  collisionRef: React.MutableRefObject<THREE.Object3D | null>;
  onSplatError: (message: string) => void;
  onSplatLoaded: () => void;
  onCollisionError: (message: string) => void;
  lodLevelOverride?: number;
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
      <group
        position={def.position ?? [0, 0, 0]}
        rotation={[0, (def.rotationYDeg ?? 0) * DEG, 0]}
        scale={def.scale ?? 1}
      >
        {/* スプラットは3DGSの慣習(Y下向き)のため各Layer内でX軸180°反転される */}
        {def.lod ? (
          <LodSplatLayer
            metaUrl={def.lod.metaUrl}
            level={lodLevelOverride ?? def.lod.level}
            onError={onSplatError}
            onLoaded={() => onSplatLoaded()}
          />
        ) : (
          <SplatLayer
            url={def.splatUrl}
            onError={onSplatError}
            onLoaded={onSplatLoaded}
          />
        )}
        {def.collisionUrl && (
          <group
            rotation={def.collisionInSplatFrame ? [Math.PI, 0, 0] : [0, 0, 0]}
          >
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

type NpcPhase = "hidden" | "summoning" | "active";

export const SpaceApp = () => {
  const [entered, setEntered] = useState(false);
  const [enteredOnce, setEnteredOnce] = useState(false);
  const [activeSpace, setActiveSpace] = useState<SpaceDefinition | null>(null);
  const [selectedId, setSelectedId] = useState(SPACES[0].id);
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<string[]>([]);
  const collisionRef = useRef<THREE.Object3D | null>(null);
  const lockRef = useRef<(() => void) | null>(null);

  // NPCコンシェルジュの状態
  const [npcPhase, setNpcPhase] = useState<NpcPhase>("hidden");
  const [npcStarted, setNpcStarted] = useState(false);
  const [npcConfig, setNpcConfig] = useState<NpcConfig | null>(null);
  const [npcBubble, setNpcBubble] = useState<string | null>(null);
  const [npcThinking, setNpcThinking] = useState(false);
  const [npcSpeaking, setNpcSpeaking] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const npcHistory = useRef<ChatTurn[]>([]);
  const npcAudio = useRef<HTMLAudioElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const summonSeq = useRef(0);

  // デバッグ用: ?nolock でポインターロックなしでもWASD移動できる
  const requireLock = useMemo(
    () => !new URLSearchParams(window.location.search).has("nolock"),
    []
  );
  // ?lodlevel=0〜4 でLODレベルを上書き(0=最精細)
  const lodLevelOverride = useMemo(() => {
    const v = new URLSearchParams(window.location.search).get("lodlevel");
    return v === null ? undefined : Number(v);
  }, []);

  const pushToast = (message: string) => {
    setToasts((prev) => [...prev.slice(-3), message]);
    setTimeout(() => setToasts((prev) => prev.slice(1)), 8000);
  };

  const playNpcAudio = async (text: string) => {
    try {
      const audio = await synthesizeVoice(text, npcConfigRef.current);
      if (!audio) return;
      npcAudio.current?.pause();
      npcAudio.current = audio;
      setNpcSpeaking(true);
      audio.onended = () => setNpcSpeaking(false);
      audio.onerror = () => setNpcSpeaking(false);
      await audio.play();
    } catch {
      setNpcSpeaking(false);
    }
  };
  // playNpcAudio内で最新configを参照するためのref
  const npcConfigRef = useRef<NpcConfig | null>(null);

  const resetNpc = () => {
    summonSeq.current++;
    npcAudio.current?.pause();
    npcAudio.current = null;
    npcHistory.current = [];
    npcConfigRef.current = null;
    npcStartedRef.current = false;
    setNpcPhase("hidden");
    setNpcStarted(false);
    setNpcConfig(null);
    setNpcBubble(null);
    setNpcThinking(false);
    setNpcSpeaking(false);
  };

  /** ②のボタン: AI-NPCコンシェルジュを呼び出す */
  const summonNpc = async () => {
    if (!activeSpace?.npc || npcPhase !== "hidden") return;
    const seq = ++summonSeq.current;
    setNpcPhase("summoning");
    try {
      const cfg = await fetchNpcConfig(activeSpace.npc.spaceId);
      if (seq !== summonSeq.current) return;
      setNpcConfig(cfg);
      npcConfigRef.current = cfg;
      // Arrivalと同じく少し「呼び出し」の間を置いてから登場させる
      const delay = (cfg?.spawn?.delaySeconds ?? 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (seq !== summonSeq.current) return;
      // NPCは登場するだけで、挨拶は④(ユーザーがNPCをクリック)まで待つ
      setNpcPhase("active");
    } catch (err) {
      if (seq !== summonSeq.current) return;
      setNpcPhase("hidden");
      pushToast(
        `コンシェルジュの呼び出しに失敗しました: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  /** ③④: NPCクリックで会話開始。初回クリックで挨拶(テキスト+音声)が始まる */
  const npcStartedRef = useRef(false);
  const handleNpcActivate = () => {
    if (!npcStartedRef.current) {
      npcStartedRef.current = true;
      setNpcStarted(true);
      const cfg = npcConfigRef.current;
      const staff = cfg?.greeting?.staffName;
      const greet =
        (staff ? `こんにちは。${staff}です。` : "こんにちは。") +
        (cfg?.greeting?.message ?? "");
      setNpcBubble(greet);
      void playNpcAudio(greet);
    }
    setTimeout(() => chatInputRef.current?.focus(), 100);
  };

  // 歩行中(ポインターロック中)はクリックできないため、Cキーでも呼び出せる
  const summonRef = useRef(summonNpc);
  summonRef.current = summonNpc;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyC") return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
        return;
      // 歩行(ポインターロック)は維持したままNPCを登場させる
      void summonRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 空間(canvas)クリックで歩行を再開できるようにする。
  // NPCへのクリックはNpcAvatar側がcaptureで先に処理して止めるため、ここには来ない。
  const enteredOnceRef = useRef(false);
  enteredOnceRef.current = enteredOnce;
  useEffect(() => {
    if (!requireLock) return;
    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement) return;
      if (!enteredOnceRef.current) return;
      if (!(e.target instanceof HTMLCanvasElement)) return;
      lockRef.current?.();
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [requireLock]);

  const loadSpace = (def: SpaceDefinition) => {
    setError(null);
    setNotice(null);
    setLoading(true);
    collisionRef.current = null;
    resetNpc();
    setActiveSpace(def);
  };

  const loadSelected = () => {
    const def = SPACES.find((s) => s.id === selectedId);
    if (!def) return;
    if (activeSpace?.id === def.id) return;
    loadSpace(def);
  };

  const loadCustomUrl = (e: FormEvent) => {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url) return;
    if (activeSpace?.id === "custom" && activeSpace.splatUrl === url) return;
    loadSpace({ id: "custom", title: "カスタムURL", splatUrl: url });
  };

  const sendNpcMessage = async (e: FormEvent) => {
    e.preventDefault();
    const message = chatInput.trim();
    if (!message || npcThinking || npcPhase !== "active") return;
    setChatInput("");
    setNpcThinking(true);
    try {
      const reply = await sendChat({
        message,
        config: npcConfig,
        history: npcHistory.current,
      });
      npcHistory.current = [
        ...npcHistory.current,
        { role: "user", content: message },
        { role: "assistant", content: reply },
      ];
      setNpcBubble(reply);
      setNpcThinking(false);
      void playNpcAudio(reply);
    } catch (err) {
      setNpcThinking(false);
      const detail = err instanceof Error ? err.message : String(err);
      setNpcBubble(npcConfig?.fallback?.message ?? "申し訳ありません。");
      pushToast(`チャットAPIエラー: ${detail}`);
    }
  };

  const npcAvailable = Boolean(activeSpace?.npc);

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
            lodLevelOverride={lodLevelOverride}
            onCollisionError={(message) =>
              setNotice(
                `衝突メッシュを読み込めなかったため平面移動になります (${message})`
              )
            }
          />
        ) : (
          <GalleryRoom />
        )}
        {activeSpace?.npc && npcPhase === "active" && (
          <NpcAvatar
            position={activeSpace.npc.position}
            headLabel={npcConfig?.avatar?.headLabel}
            headLabelColor={npcConfig?.avatar?.headLabelColor}
            speaking={npcSpeaking}
            bubbleText={npcBubble}
            thinking={npcThinking}
            onActivate={handleNpcActivate}
            onError={(message) => pushToast(`NPC表示エラー: ${message}`)}
          />
        )}
        <Player
          onLockChange={(locked) => {
            setEntered(locked);
            if (locked) {
              setEnteredOnce(true);
              // 歩行再開時にチャット入力へのキー入力が流れないようフォーカスを外す
              chatInputRef.current?.blur();
            }
          }}
          collisionRef={collisionRef}
          spawn={activeSpace?.spawn ?? [0, 1.6, 4]}
          spawnYawDeg={activeSpace?.spawnYawDeg ?? 0}
          requireLock={requireLock}
          lockRef={lockRef}
        />
      </Canvas>

      {/* 初回入場前のフルオーバーレイ */}
      {!entered && !enteredOnce && (
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
            WASD / 矢印キー: 移動 ・ Shift: 走る ・ マウス: 視点 ・ Esc: メニュー
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

      {/* 入場後にEscで抜けたとき: シーンを隠さないコンパクトバー
          (?nolockデバッグ時はスペース読込後に常時表示) */}
      {!entered && (enteredOnce || (!requireLock && activeSpace)) && (
        <div className="fixed inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 p-4">
          {error && (
            <p className="rounded bg-black/60 px-3 py-1 text-sm text-red-400">
              {error}
            </p>
          )}
          <div className="flex w-full max-w-2xl items-center justify-end gap-2">
            {npcAvailable && npcPhase === "active" && npcStarted && (
              <form
                onSubmit={sendNpcMessage}
                className="flex min-w-0 flex-1 gap-2"
              >
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="コンシェルジュに質問する…"
                  className="min-w-0 flex-1 rounded-full border border-gray-600 bg-gray-900/90 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-indigo-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={npcThinking}
                  className="whitespace-nowrap rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {npcThinking ? "…" : "送信"}
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={() => lockRef.current?.()}
              className="whitespace-nowrap rounded-full bg-gray-700/90 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-600"
            >
              移動を再開
            </button>
          </div>
        </div>
      )}

      {/* 中央の呼び出しバナー(Arrivalの「タップしてAIコンシェルジュを呼び出す」相当) */}
      {npcAvailable &&
        (npcPhase !== "active" || !npcStarted) &&
        !loading &&
        (entered || enteredOnce || !requireLock) && (
          <div className="pointer-events-none fixed left-1/2 top-24 z-20 -translate-x-1/2">
            {npcPhase === "active" ? (
              <div className="rounded-full border-2 border-cyan-400/80 bg-black/75 px-6 py-3 text-center text-sm text-white shadow-xl">
                💬 AIコンシェルジュをクリックして会話をはじめてください
              </div>
            ) : npcPhase === "summoning" ? (
              <div className="flex items-center gap-3 rounded-full border-2 border-cyan-400/80 bg-black/75 px-6 py-3 text-sm text-white shadow-xl">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-cyan-300" />
                {npcConfig?.spawn?.loadingMessage ??
                  "ただいま担当者を呼び出しています…"}
              </div>
            ) : entered ? (
              <div className="rounded-full border-2 border-cyan-400/80 bg-black/75 px-6 py-3 text-center text-sm text-white shadow-xl">
                🤖{" "}
                <span className="mx-1 rounded bg-cyan-500/30 px-1.5 py-0.5 font-bold text-cyan-200">
                  C
                </span>
                キーでAIコンシェルジュを呼び出す
              </div>
            ) : (
              <button
                type="button"
                onClick={summonNpc}
                className="pointer-events-auto rounded-full border-2 border-cyan-400/80 bg-black/75 px-6 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-cyan-900/80"
              >
                🤖 クリックしてAIコンシェルジュを呼び出す
                <span className="mt-0.5 block text-xs font-normal text-gray-300">
                  AIコンシェルジュに質問をしたり、空間内を案内してもらえます
                </span>
              </button>
            )}
          </div>
        )}

      {/* 入場中のHUD */}
      {entered && (
        <>
          <div className="pointer-events-none fixed left-1/2 top-1/2 z-10 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
          <div className="pointer-events-none fixed bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-xs text-gray-200">
            {activeSpace ? `${activeSpace.title} ・ ` : ""}WASD: 移動
            {npcPhase === "active"
              ? " ・ NPCに照準を合わせてクリックで会話 ・ Esc: メニュー"
              : npcAvailable && npcPhase === "hidden"
                ? " ・ C: コンシェルジュ呼び出し ・ Esc: メニュー"
                : " ・ Esc: メニュー"}
          </div>
        </>
      )}

      {/* エラートースト */}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed right-4 top-4 z-30 flex w-80 flex-col gap-2">
          {toasts.map((t, i) => (
            <div
              key={i}
              className="rounded-lg bg-red-900/90 px-4 py-2 text-xs text-red-100 shadow-lg"
            >
              {t}
            </div>
          ))}
        </div>
      )}

      {/* 読み込みインジケータ */}
      {loading && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/70 px-5 py-2.5 text-sm text-white shadow-lg">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-white" />
          スペースを読み込んでいます…(数十MBのデータを取得するため、しばらくお待ちください)
        </div>
      )}
    </div>
  );
};
