import { SplatMesh } from "@sparkjsdev/spark";
import { useEffect, useState } from "react";

type SplatLayerProps = {
  /** .sog / .ply / .splat / .spz / .ksplat のURL(Sparkが拡張子から自動判別) */
  url: string;
  onError: (message: string) => void;
  position?: [number, number, number];
  /** 3DGSデータはY軸下向きの慣習のため、デフォルトでX軸180°回転して表示する */
  rotation?: [number, number, number];
  scale?: number;
};

export const SplatLayer = ({
  url,
  onError,
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
        if (!disposed) setMesh(splat);
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
