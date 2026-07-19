import { SplatFileType, SplatMesh } from "@sparkjsdev/spark";
import { useEffect, useState } from "react";
import { buildStoreZip, ZipEntry } from "../lib/zipStore";

type LodMeta = {
  lodLevels: number;
  /** "0_0/meta.json" 形式。先頭の数字がLODレベル(0=最精細) */
  filenames: string[];
};

/** SOGSシャード(meta.json+webp群)を取得して無圧縮ZIP(=.sog相当)にまとめる */
async function fetchShardAsZip(metaJsonUrl: string): Promise<Uint8Array> {
  const res = await fetch(metaJsonUrl);
  if (!res.ok) throw new Error(`${metaJsonUrl}: HTTP ${res.status}`);
  const metaText = await res.text();
  const meta = JSON.parse(metaText) as Record<
    string,
    { files?: string[] } | unknown
  >;

  const fileNames = new Set<string>();
  for (const value of Object.values(meta)) {
    const files = (value as { files?: unknown })?.files;
    if (Array.isArray(files)) {
      for (const f of files) {
        if (typeof f === "string") fileNames.add(f);
      }
    }
  }

  const base = metaJsonUrl.slice(0, metaJsonUrl.lastIndexOf("/") + 1);
  const entries: ZipEntry[] = [
    { name: "meta.json", data: new TextEncoder().encode(metaText) },
  ];
  await Promise.all(
    [...fileNames].map(async (name) => {
      const r = await fetch(base + name);
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      entries.push({ name, data: new Uint8Array(await r.arrayBuffer()) });
    })
  );
  return buildStoreZip(entries);
}

type LodSplatLayerProps = {
  /** Arrival Space形式の lod-meta.json のURL */
  metaUrl: string;
  /** 読み込むLODレベル(0=最精細)。省略時は2 */
  level?: number;
  onError: (message: string) => void;
  onLoaded?: (info: { level: number; shards: number }) => void;
  rotation?: [number, number, number];
};

/**
 * ArrivalのLOD分割スプラット(空間ツリー+レベル別SOGSシャード)を、
 * 指定レベルのシャード一式として読み込む。各シャードは標準SOGSなので
 * SparkのSplatMeshでそのまま描画できる。
 * (距離に応じた動的ストリーミングは未対応。レベル一括読み込みのMVP)
 */
export const LodSplatLayer = ({
  metaUrl,
  level = 2,
  onError,
  onLoaded,
  rotation = [Math.PI, 0, 0],
}: LodSplatLayerProps) => {
  const [meshes, setMeshes] = useState<SplatMesh[]>([]);

  useEffect(() => {
    let disposed = false;
    const created: SplatMesh[] = [];

    (async () => {
      const res = await fetch(metaUrl);
      if (!res.ok) throw new Error(`lod-meta.json HTTP ${res.status}`);
      const meta = (await res.json()) as LodMeta;
      if (!Array.isArray(meta.filenames) || meta.filenames.length === 0) {
        throw new Error("lod-meta.jsonにfilenamesがありません");
      }

      const levels = [
        ...new Set(meta.filenames.map((f) => Number(f.split("_")[0]))),
      ].filter((n) => Number.isFinite(n));
      const maxLevel = Math.max(...levels);
      const lv = Math.min(Math.max(level, 0), maxLevel);

      const base = metaUrl.slice(0, metaUrl.lastIndexOf("/") + 1);
      const shardUrls = meta.filenames
        .filter((f) => f.startsWith(`${lv}_`))
        .map((f) => base + f);
      if (shardUrls.length === 0) {
        throw new Error(`レベル${lv}のシャードが見つかりません`);
      }

      // Sparkはバラのmeta.json+webp群を直接fetchできないため、シャードを
      // ブラウザ内で無圧縮ZIPに詰めて .sog(PCSOGSZIP)として渡す
      const results = await Promise.allSettled(
        shardUrls.map(async (url) => {
          const zip = await fetchShardAsZip(url);
          const mesh = new SplatMesh({
            fileBytes: zip,
            fileType: SplatFileType.PCSOGSZIP,
          });
          created.push(mesh);
          await mesh.initialized;
          return mesh;
        })
      );
      if (disposed) return;

      const ok = results
        .filter(
          (r): r is PromiseFulfilledResult<SplatMesh> =>
            r.status === "fulfilled"
        )
        .map((r) => r.value);
      const failed = results.length - ok.length;
      if (ok.length === 0) {
        const first = results.find((r) => r.status === "rejected") as
          | PromiseRejectedResult
          | undefined;
        throw new Error(
          `全シャードの読み込みに失敗しました (${String(first?.reason ?? "")})`
        );
      }
      if (failed > 0) {
        console.warn(`LODシャード ${failed}/${results.length} 件が読み込み失敗`);
      }
      setMeshes(ok);
      onLoaded?.({ level: lv, shards: ok.length });
    })().catch((e: unknown) => {
      if (!disposed) {
        onError(e instanceof Error ? e.message : String(e));
      }
    });

    return () => {
      disposed = true;
      setMeshes([]);
      created.forEach((m) => m.dispose());
    };
    // onError/onLoadedはインラインで渡されるため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaUrl, level]);

  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} rotation={rotation} />
      ))}
    </>
  );
};
