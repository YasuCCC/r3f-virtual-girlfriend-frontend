/**
 * Arrival Spaceから移植したスペースの定義。
 * 値はArrival SpaceのMCP API(get_space / list_entities)から取得したもの。
 */
export type SpaceDefinition = {
  id: string;
  title: string;
  /** Gaussian Splat本体(.sog / .ply / .splat / .spz) */
  splatUrl: string;
  /** 衝突判定用GLB(省略時は平面フロア扱い) */
  collisionUrl?: string;
  /** 衝突GLBがスプラットと同じ生座標系(Y下向き)で作られている場合true */
  collisionInSplatFrame?: boolean;
  /** スペース内でのスプラット配置(ArrivalのcenterPosition + assetYOffset相当) */
  position?: [number, number, number];
  /** Y軸回転(度。ArrivalのcenterRotation.y相当) */
  rotationYDeg?: number;
  /** スケール(ArrivalのassetScale相当) */
  scale?: number;
  /** プレイヤーの初期位置 */
  spawn?: [number, number, number];
  light?: {
    type: "directional";
    rotationDeg: number;
    intensity: number;
  };
};

export const SPACES: SpaceDefinition[] = [
  {
    id: "sample_room",
    title: "サンプルルーム(ローカル)",
    splatUrl: "/splats/sample_room.sog",
    collisionUrl: "/splats/sample_room_collision.glb",
    position: [0, 0, 0],
    rotationYDeg: 0,
    scale: 1,
    spawn: [0, 1.6, 3],
  },
  {
    // https://live.arrival.space/east_street01 (Yokohama East Avenue01 / 55732136_2242)
    id: "east_street01",
    title: "Yokohama East Avenue01",
    splatUrl:
      "https://dzrmwng2ae8bq.cloudfront.net/55732136/49c18498ea8c26252e629c1418df9d505cbbcf57f81fbbfe72b42167992dc0ec_yokohama-2.sog",
    collisionUrl:
      "https://dzrmwng2ae8bq.cloudfront.net/55732136/881dbc6cb75073296b30763e89ad95464030f9389664c20edce6d1569838d920_49c18498ea8c26252e629c1418df9d505cbbcf57f81fbbfe72b42167992dc0ec_yokohama-2_collision.glb",
    // centerPosition (-0.366, -0.341, 19.899) + assetYOffset 0.2
    position: [-0.366, -0.141, 19.899],
    // centerRotation.y = 53.13 (z=180はスプラットの上下反転として適用済み)
    rotationYDeg: 53.13,
    scale: 1.25,
    spawn: [0, 1.6, 0],
    light: { type: "directional", rotationDeg: 275, intensity: 1.3 },
  },
];
