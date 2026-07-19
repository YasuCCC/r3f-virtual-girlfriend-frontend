/**
 * 再生中の音声をWebAudioで解析し、音量(0..1)を返す関数を作る。
 * NPCのリップシンク(口の開き)に使う。タイムスタンプ付きのビゼーム情報が
 * ないTTS音声でも、言語を問わず自然に口が動く
 */
let sharedCtx: AudioContext | null = null;

export function createSpeechLevelSource(
  audio: HTMLAudioElement
): (() => number) | null {
  try {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    sharedCtx ??= new Ctor();
    void sharedCtx.resume();
    const source = sharedCtx.createMediaElementSource(audio);
    const analyser = sharedCtx.createAnalyser();
    analyser.fftSize = 256;
    // 解析を挟んでもスピーカーへは今までどおり出力する
    source.connect(analyser);
    analyser.connect(sharedCtx.destination);
    const data = new Uint8Array(analyser.fftSize);
    return () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const d = (data[i] - 128) / 128;
        sum += d * d;
      }
      // RMSを少し持ち上げて0..1に(通常の話し声で0.5前後になる係数)
      return Math.min(1, Math.sqrt(sum / data.length) * 4);
    };
  } catch {
    return null;
  }
}
