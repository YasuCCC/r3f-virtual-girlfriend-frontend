import { Canvas } from "@react-three/fiber";
import { FormEvent, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CollisionMesh } from "./components/CollisionMesh";
import { GalleryRoom } from "./components/GalleryRoom";
import { LodSplatLayer } from "./components/LodSplatLayer";
import { NpcAvatar, NpcWalkCommand } from "./components/NpcAvatar";
import { Player } from "./components/Player";
import { SparkRendererMount, SplatLayer } from "./components/SplatLayer";
import {
  buildGuidePath,
  buildGuideTargets,
  buildShopPersonaConfig,
  ChatTurn,
  fetchNpcConfig,
  GuideTarget,
  NpcConfig,
  sendChat,
  ShopNpc,
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
type Speaker = "concierge" | "shop";

export const SpaceApp = () => {
  // 「クリックして空間に入る」を押したか(押した後は常に歩行・UI操作が可能)
  const [started, setStarted] = useState(false);
  const [activeSpace, setActiveSpace] = useState<SpaceDefinition | null>(null);
  const [selectedId, setSelectedId] = useState(SPACES[0].id);
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<string[]>([]);
  const collisionRef = useRef<THREE.Object3D | null>(null);

  // NPCコンシェルジュの状態
  const [npcPhase, setNpcPhase] = useState<NpcPhase>("hidden");
  const [npcStarted, setNpcStarted] = useState(false);
  const [npcConfig, setNpcConfig] = useState<NpcConfig | null>(null);
  const [npcBubble, setNpcBubble] = useState<string | null>(null);
  const [npcThinking, setNpcThinking] = useState(false);
  const [npcSpeaking, setNpcSpeaking] = useState(false);
  const [speaker, setSpeaker] = useState<Speaker>("concierge");
  const [chatInput, setChatInput] = useState("");
  const npcHistory = useRef<ChatTurn[]>([]);
  const npcAudio = useRef<HTMLAudioElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const summonSeq = useRef(0);
  const [npcWalk, setNpcWalk] = useState<NpcWalkCommand | null>(null);
  const walkSeq = useRef(0);
  const activeGuide = useRef<GuideTarget | null>(null);
  // 店舗到着後は店主NPCが応対する
  const [activeShop, setActiveShop] = useState<ShopNpc | null>(null);
  const [shopBubble, setShopBubble] = useState<string | null>(null);
  const activeShopRef = useRef<ShopNpc | null>(null);
  // 誘導中のユーザー自動追従(WASD操作で解除)
  const followRef = useRef({ active: false, speed: 3 });
  const npcPosRef = useRef(new THREE.Vector3());
  // NPCの足跡。プレイヤーはこれをなぞって追従する(建物を突き抜けない)
  const npcTrailRef = useRef<THREE.Vector3[]>([]);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  // ?lodlevel=0〜4 でLODレベルを上書き(0=最精細)
  const lodLevelOverride = useMemo(() => {
    const v = new URLSearchParams(window.location.search).get("lodlevel");
    return v === null ? undefined : Number(v);
  }, []);

  const pushToast = (message: string) => {
    setToasts((prev) => [...prev.slice(-3), message]);
    setTimeout(() => setToasts((prev) => prev.slice(1)), 8000);
  };

  // playNpcAudio内で最新configを参照するためのref
  const npcConfigRef = useRef<NpcConfig | null>(null);

  const currentPersona = (): NpcConfig | null =>
    activeShopRef.current
      ? buildShopPersonaConfig(activeShopRef.current, npcConfigRef.current)
      : npcConfigRef.current;

  const playNpcAudio = async (text: string, who: Speaker) => {
    try {
      const audio = await synthesizeVoice(text, currentPersona());
      if (!audio) return;
      npcAudio.current?.pause();
      npcAudio.current = audio;
      setSpeaker(who);
      setNpcSpeaking(true);
      audio.onended = () => setNpcSpeaking(false);
      audio.onerror = () => setNpcSpeaking(false);
      await audio.play();
    } catch {
      setNpcSpeaking(false);
    }
  };

  const resetNpc = () => {
    summonSeq.current++;
    npcAudio.current?.pause();
    npcAudio.current = null;
    npcHistory.current = [];
    npcConfigRef.current = null;
    npcStartedRef.current = false;
    activeGuide.current = null;
    activeShopRef.current = null;
    followRef.current.active = false;
    npcTrailRef.current.length = 0;
    recognitionRef.current?.stop();
    setNpcWalk(null);
    setNpcPhase("hidden");
    setNpcStarted(false);
    setNpcConfig(null);
    setNpcBubble(null);
    setActiveShop(null);
    setShopBubble(null);
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
      void playNpcAudio(greet, "concierge");
    }
    setTimeout(() => chatInputRef.current?.focus(), 100);
  };

  /** 店主NPCクリック: 入力欄にフォーカス(応対はすでに店舗ペルソナ) */
  const handleShopActivate = () => {
    setTimeout(() => chatInputRef.current?.focus(), 100);
  };

  /** 店主との会話を終えてコンシェルジュに戻る */
  const returnToConcierge = () => {
    activeShopRef.current = null;
    setActiveShop(null);
    setShopBubble(null);
    setNpcBubble("他にご案内できることはありますか?");
  };

  /** 行き先案内: walkはNPCが誘導歩行、spaceUrlはスペース移動/リンク */
  const startGuide = (gp: GuideTarget) => {
    if (gp.type === "spaceUrl" && gp.spaceUrl) {
      const slug = gp.spaceUrl.replace(/\/+$/, "").split("/").pop() ?? "";
      const target = SPACES.find((s) => s.id === slug);
      if (target) {
        loadSpace(target);
      } else {
        window.open(gp.spaceUrl, "_blank", "noopener");
      }
      return;
    }
    const path = buildGuidePath(gp);
    if (path.length === 0) return;
    // 新しい誘導を始めたら店舗応対は解除
    activeShopRef.current = null;
    setActiveShop(null);
    setShopBubble(null);
    activeGuide.current = gp;
    if (gp.guideMessage) {
      setNpcBubble(gp.guideMessage);
      void playNpcAudio(gp.guideMessage, "concierge");
    }
    const speed = npcConfigRef.current?.walkSpeed ?? 3;
    npcTrailRef.current.length = 0;
    setNpcWalk({ id: ++walkSeq.current, path, speed });
    // ユーザー視点もNPCについて行く(WASDを押すと解除)
    followRef.current = { active: true, speed };
  };

  const onNpcWalkDone = () => {
    followRef.current.active = false;
    const gp = activeGuide.current;
    activeGuide.current = null;
    if (!gp) return;
    if (gp.shop) {
      // 店舗に到着: 店主NPCが現れて挨拶し、以降の質問は店主が回答する
      activeShopRef.current = gp.shop;
      setActiveShop(gp.shop);
      setNpcBubble(null);
      const greet = gp.shop.greeting || `いらっしゃいませ。${gp.shop.name}です。`;
      setShopBubble(greet);
      void playNpcAudio(greet, "shop");
    } else if (gp.arrivalMessage) {
      setNpcBubble(gp.arrivalMessage);
      void playNpcAudio(gp.arrivalMessage, "concierge");
    }
  };

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

  /** 音声入力(Web Speech API)。認識結果をそのまま質問として送信する */
  const toggleVoiceInput = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => {
          lang: string;
          interimResults: boolean;
          onresult: (e: {
            results: { [i: number]: { [j: number]: { transcript: string } } };
          }) => void;
          onend: () => void;
          onerror: (e: { error?: string }) => void;
          start: () => void;
          stop: () => void;
        })
      | undefined;
    if (!Ctor) {
      pushToast(
        "このブラウザは音声入力(Web Speech API)に対応していません。Chromeをお試しください"
      );
      return;
    }
    const rec = new Ctor();
    const lang = npcConfigRef.current?.language;
    rec.lang = !lang || lang === "auto" ? "ja-JP" : lang;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setChatInput(transcript);
        void submitNpcMessage(transcript);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      if (e.error && e.error !== "no-speech" && e.error !== "aborted") {
        pushToast(`音声入力エラー: ${e.error}`);
      }
    };
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const sendNpcMessage = async (e: FormEvent) => {
    e.preventDefault();
    await submitNpcMessage(chatInput);
  };

  const submitNpcMessage = async (raw: string) => {
    const message = raw.trim();
    if (!message || npcThinking || npcPhase !== "active") return;
    const shopAtSend = activeShopRef.current;
    setChatInput("");
    setNpcThinking(true);
    try {
      const reply = await sendChat({
        message,
        config: currentPersona(),
        history: npcHistory.current,
      });
      npcHistory.current = [
        ...npcHistory.current,
        { role: "user", content: message },
        { role: "assistant", content: reply },
      ];
      setNpcThinking(false);
      if (shopAtSend) {
        setShopBubble(reply);
        void playNpcAudio(reply, "shop");
      } else {
        setNpcBubble(reply);
        void playNpcAudio(reply, "concierge");
      }
    } catch (err) {
      setNpcThinking(false);
      const detail = err instanceof Error ? err.message : String(err);
      const fallback = npcConfig?.fallback?.message ?? "申し訳ありません。";
      if (shopAtSend) setShopBubble(fallback);
      else setNpcBubble(fallback);
      pushToast(`チャットAPIエラー: ${detail}`);
    }
  };

  const npcAvailable = Boolean(activeSpace?.npc);
  const guideTargets = useMemo(() => buildGuideTargets(npcConfig), [npcConfig]);

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
            speaking={npcSpeaking && speaker === "concierge"}
            bubbleText={npcBubble}
            thinking={npcThinking && !activeShop}
            onActivate={handleNpcActivate}
            onError={(message) => pushToast(`NPC表示エラー: ${message}`)}
            walk={npcWalk}
            onWalkDone={onNpcWalkDone}
            positionRef={npcPosRef}
            trailRef={npcTrailRef}
          />
        )}
        {activeShop && (
          <NpcAvatar
            position={[
              activeShop.x ?? 0,
              activeShop.y ?? 0,
              activeShop.z ?? 0,
            ]}
            headLabel={activeShop.name}
            headLabelColor="#d97706"
            speaking={npcSpeaking && speaker === "shop"}
            bubbleText={shopBubble}
            thinking={npcThinking && Boolean(activeShop)}
            onActivate={handleShopActivate}
            onError={(message) => pushToast(`店舗NPC表示エラー: ${message}`)}
          />
        )}
        <Player
          active={started}
          collisionRef={collisionRef}
          spawn={activeSpace?.spawn ?? [0, 1.6, 4]}
          spawnYawDeg={activeSpace?.spawnYawDeg ?? 0}
          followRef={followRef}
          followTargetRef={npcPosRef}
          followPathRef={npcTrailRef}
        />
      </Canvas>

      {/* 入場前のフルオーバーレイ */}
      {!started && (
        <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-black/60">
          <h1 className="text-3xl font-bold text-white">Space Prototype</h1>
          {activeSpace && (
            <p className="text-sm text-indigo-300">
              現在のスペース: {activeSpace.title}
            </p>
          )}
          <button
            type="button"
            onClick={() => setStarted(true)}
            className="pointer-events-auto rounded-full bg-indigo-500 px-8 py-3 text-lg font-semibold text-white shadow-lg transition hover:bg-indigo-400"
          >
            クリックして空間に入る
          </button>
          <p className="text-sm text-gray-300">
            ドラッグ: 視点 ・ WASD / 矢印キー: 移動 ・ Shift: 走る
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

      {/* 入場後の下部バー(カーソルは常に使えるので開閉不要) */}
      {started && (
        <div className="fixed inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 p-4">
          {error && (
            <p className="rounded bg-black/60 px-3 py-1 text-sm text-red-400">
              {error}
            </p>
          )}
          <div className="flex w-full max-w-2xl items-center gap-2">
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
                  placeholder={
                    activeShop
                      ? `${activeShop.name}に質問する…`
                      : "コンシェルジュに質問する…"
                  }
                  className="min-w-0 flex-1 rounded-full border border-gray-600 bg-gray-900/90 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-indigo-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={npcThinking}
                  className="whitespace-nowrap rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {npcThinking ? "…" : "送信"}
                </button>
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  title="音声で質問する"
                  className={`whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium text-white transition ${
                    listening
                      ? "animate-pulse bg-red-600 hover:bg-red-500"
                      : "bg-gray-700/90 hover:bg-gray-600"
                  }`}
                >
                  🎤
                </button>
                {activeShop && (
                  <button
                    type="button"
                    onClick={returnToConcierge}
                    className="whitespace-nowrap rounded-full bg-gray-700/90 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-600"
                  >
                    案内人に戻る
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      {/* 中央の呼び出しバナー(Arrivalの「タップしてAIコンシェルジュを呼び出す」相当) */}
      {started &&
        npcAvailable &&
        (npcPhase !== "active" || !npcStarted) &&
        !loading && (
          <div className="pointer-events-none fixed left-1/2 top-16 z-20 -translate-x-1/2">
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

      {/* 操作ヒント */}
      {started && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-xs text-gray-200">
          {activeSpace ? `${activeSpace.title} ・ ` : ""}
          ドラッグ: 視点 ・ WASD: 移動 ・ Shift: 走る
        </div>
      )}

      {/* 行き先パネル(guidePoints + 誘導ONの店舗NPC) */}
      {started &&
        npcPhase === "active" &&
        npcStarted &&
        guideTargets.length > 0 && (
          <div className="fixed left-4 top-20 z-10 w-56 rounded-2xl bg-black/70 p-3 shadow-xl backdrop-blur">
            <p className="mb-2 px-1 text-xs font-semibold text-gray-300">
              📍 行き先
            </p>
            <div className="flex flex-col gap-1.5">
              {guideTargets.map((gp, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => startGuide(gp)}
                  className="flex items-center justify-between rounded-lg bg-gray-800/80 px-3 py-2 text-left text-xs text-white transition hover:bg-gray-700"
                >
                  <span className="truncate">
                    {gp.buttonLabel || gp.name || `行き先${i + 1}`}
                  </span>
                  <span className="ml-2 shrink-0 text-cyan-300">
                    {gp.type === "spaceUrl" ? "↗" : "🚶"}
                  </span>
                </button>
              ))}
            </div>
          </div>
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
