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
  /**
   * ArrivalのLOD分割配信(lod-meta.json)。指定するとsplatUrlの代わりに
   * 指定レベルのシャード一式を読み込む(0=最精細)
   */
  lod?: { metaUrl: string; level?: number };
  /** AI-NPCコンシェルジュ(npc-avatar-backendのspaceId設定を使用) */
  npc?: { position: [number, number, number]; spaceId: string };
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
    splatUrl: `${import.meta.env.BASE_URL}splats/sample_room.sog`,
    collisionUrl: `${import.meta.env.BASE_URL}splats/sample_room_collision.glb`,
    position: [0, 0, 0],
    rotationYDeg: 0,
    scale: 1,
    spawn: [0, 1.6, 3],
  },
  {
    // https://live.arrival.space/k_hall_entrance1 (55732136_9974) — LODなしのSOG直配信
    id: "k_hall_entrance1",
    title: "k_hall_entrance1",
    splatUrl:
      "/arrival-ugc/55732136/a174688799e9be26cefd446d75a3d482c8012b4572cd94a42b5ab88a8b932eb3_i_k_h2f.sog",
    collisionUrl:
      "/arrival-ugc/55732136/44182eef88df8c9b5b2dced3bf99c87615ee68e58f3484dea72cf0cc7dd23f39_a174688799e9be26cefd446d75a3d482c8012b4572cd94a42b5ab88a8b932eb3_i_k_h2f_collision.glb",
    // centerPosition (7.46, 2.068, 5.069) + assetYOffset 0.2
    position: [7.46, 2.268, 5.069],
    // centerRotation (x=-180は上下反転として適用済み, y=89.02)
    rotationYDeg: 89.02,
    scale: 4,
    spawn: [0, 1.6, 0],
    light: { type: "directional", rotationDeg: 275, intensity: 1.3 },
    npc: { position: [0, 0, -3], spaceId: "55732136_9974" },
  },
  {
    // https://live.arrival.space/east_street01 (Yokohama East Avenue01 / 55732136_2242)
    id: "east_street01",
    title: "Yokohama East Avenue01",
    // CORS回避のためVite開発サーバのプロキシ(/arrival-cdn)経由で取得する
    splatUrl:
      "/arrival-cdn/55732136/49c18498ea8c26252e629c1418df9d505cbbcf57f81fbbfe72b42167992dc0ec_yokohama-2.sog",
    // Arrival本番と同じLOD分割データ。レベル2=約180万スプラット
    // (レベル0=最精細730万は重いので必要に応じて ?lodlevel=0〜4 で変更可)
    lod: {
      metaUrl:
        "/arrival-cdn/55732136/49c18498ea8c26252e629c1418df9d505cbbcf57f81fbbfe72b42167992dc0ec_yokohama-2_1783432850003_LOD/lod-meta.json",
      level: 2,
    },
    collisionUrl:
      "/arrival-cdn/55732136/881dbc6cb75073296b30763e89ad95464030f9389664c20edce6d1569838d920_49c18498ea8c26252e629c1418df9d505cbbcf57f81fbbfe72b42167992dc0ec_yokohama-2_collision.glb",
    // centerPosition (-0.366, -0.341, 19.899) + assetYOffset 0.2
    position: [-0.366, -0.141, 19.899],
    // Arrivalの centerRotation は (x=0, y=53.13, z=180)。
    // PlayCanvasのオイラー角(ZYX順)を「X軸180°反転+Y回転」に変換すると
    // Rz(180)·Ry(y) = Ry(180-y)·Rx(180) なので Y回転 = 180 - 53.13
    // (k_hallのように x=±180, z=0 の場合は Y回転 = y をそのまま使う)
    rotationYDeg: 180 - 53.13,
    scale: 1.25,
    // Arrivalで実測したスポーン位置 (0.08, -0.15, -7.00) + 目線1.6m
    spawn: [0.08, 1.45, -7.0],
    light: { type: "directional", rotationDeg: 275, intensity: 1.3 },
    npc: { position: [0, 0, -3], spaceId: "55732136_2242" },
  },
];
