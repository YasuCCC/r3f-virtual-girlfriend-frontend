import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";

/**
 * Spark 2系はSparkRendererを明示的にシーンへ追加しないと描画されない
 * (旧0.1系の自動生成は廃止された)。シーンに1つだけ配置する。
 */
export const SparkRendererMount = () => {
  const gl = useThree((state) => state.gl);
  const spark = useMemo(
    () =>
      new SparkRenderer({
        renderer: gl,
        // 2.0でPlayCanvas(Arrival Space)のスプラット描画とほぼ同じ見え方になる
        // (Spark公式ドキュメント記載)。スプラットがシャープになる
        focalAdjustment: 2.0,
      }),
    [gl]
  );
  return <primitive object={spark} />;
};

type SplatLayerProps = {
  /** .sog / .ply / .splat / .spz / .ksplat のURL(Sparkが拡張子から自動判別) */
  url: string;
  onError: (message: string) => void;
  /** 読み込み完了(表示開始)時に呼ばれる */
  onLoaded?: () => void;
  position?: [number, number, number];
  /** 3DGSデータはY軸下向きの慣習のため、デフォルトでX軸180°回転して表示する */
  rotation?: [number, number, number];
  scale?: number;
};

export const SplatLayer = ({
  url,
  onError,
  onLoaded,
  position = [0, 0, 0],
  rotation = [Math.PI, 0, 0],
  scale = 1,
}: SplatLayerProps) => {
  const [mesh, setMesh] = useState<SplatMesh | null>(null);

  useEffect(() => {
    let disposed = false;
    const splat = new SplatMesh({ url });
    splat.initialized
      .then(() => {
        if (!disposed) {
          setMesh(splat);
          onLoaded?.();
        }
      })
      .catch((e: unknown) => {
        if (!disposed) {
          onError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      disposed = true;
      setMesh(null);
      splat.dispose();
    };
    // onErrorは呼び出し側でインラインで渡されるため依存に含めない(URL変更時のみ再生成)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (!mesh) return null;
  return (
    <primitive
      object={mesh}
      position={position}
      rotation={rotation}
      scale={scale}
    />
  );
};
