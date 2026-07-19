/**
 * AI-NPCコンシェルジュのバックエンドAPIクライアント。
 * npc-avatar-backend(BeatBop管理画面)と同じAPIを、Arrivalプラグインと
 * 同一のリクエスト形式で呼ぶ。管理画面で設定したNPC設定がそのまま効く。
 */

const BASE = "/npc-api";

export type NpcConfig = {
  language?: string;
  greeting?: { companyName?: string; staffName?: string; message?: string };
  knowledge?: {
    cachedText?: string;
    customQA?: { question: string; answer: string }[];
  };
  voice?: {
    engine?: string;
    voiceId?: string;
    stability?: number;
    similarity?: number;
    speed?: number;
  };
  avatar?: { headLabel?: string; headLabelColor?: string };
  fallback?: { message?: string };
  readings?: Record<string, string>;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function fetchNpcConfig(
  spaceId: string
): Promise<NpcConfig | null> {
  const res = await fetch(
    `${BASE}/api/config?spaceId=${encodeURIComponent(spaceId)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return (data?.config as NpcConfig) ?? null;
}

// プラグイン(npc-avatar.mjs)のbuildSystemPromptと同一ロジック
export function buildSystemPrompt(config: NpcConfig | null): string {
  const greeting = config?.greeting ?? {};
  let prompt = "";
  if (greeting.companyName) prompt += `会社名:${greeting.companyName}\n`;
  if (greeting.staffName) prompt += `担当者名:${greeting.staffName}\n`;
  if (greeting.companyName || greeting.staffName) {
    prompt +=
      "\n【絶対厳守】挨拶はすでに済んでいます。返答の冒頭で「〇〇です」「はじめまして」などの自己紹介を絶対にしないでください。質問への回答内容だけを答えてください。\n";
  }
  return prompt;
}

// プラグインのbuildKnowledgeと同一ロジック
export function buildKnowledge(config: NpcConfig | null): string {
  const knowledge = config?.knowledge ?? {};
  const parts: string[] = [];
  if (knowledge.cachedText) parts.push(knowledge.cachedText);
  if (knowledge.customQA && knowledge.customQA.length > 0) {
    parts.push(
      knowledge.customQA
        .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
        .join("\n\n")
    );
  }
  return parts.join("\n\n---\n\n");
}

export async function sendChat({
  message,
  config,
  history,
}: {
  message: string;
  config: NpcConfig | null;
  history: ChatTurn[];
}): Promise<string> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      language: config?.language,
      systemPrompt: buildSystemPrompt(config),
      knowledge: buildKnowledge(config),
      history,
      guidePoints: [],
    }),
  });
  if (!res.ok) throw new Error(`chat API HTTP ${res.status}`);
  const data = await res.json();
  if (typeof data?.reply !== "string") throw new Error("APIの応答が不正です");
  return data.reply;
}

/** 読み方辞書を適用(音声合成用。長い単語優先で置換) */
function applyReadings(text: string, config: NpcConfig | null): string {
  const readings = config?.readings;
  if (!readings) return text;
  const entries = Object.entries(readings).filter(([k, v]) => k && v);
  entries.sort((a, b) => b[0].length - a[0].length);
  let result = text;
  for (const [word, reading] of entries) {
    result = result.split(word).join(reading);
  }
  return result;
}

/** テキストを音声合成して再生用Audioを返す(失敗時null) */
export async function synthesizeVoice(
  text: string,
  config: NpcConfig | null
): Promise<HTMLAudioElement | null> {
  try {
    const voice = config?.voice ?? {};
    const res = await fetch(`${BASE}/api/voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: applyReadings(text, config),
        engine: voice.engine || "openai",
        voiceId: voice.voiceId || "alloy",
        stability: voice.stability,
        similarity: voice.similarity,
        speed: voice.speed,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.audio) return null;
    const binary = atob(data.audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: data.contentType || "audio/mpeg",
    });
    return new Audio(URL.createObjectURL(blob));
  } catch {
    return null;
  }
}
