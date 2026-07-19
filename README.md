![Video Thumbnail](https://img.youtube.com/vi/EzzcEL_1o9o/maxresdefault.jpg)

[Video tutorial](https://youtu.be/EzzcEL_1o9o)

The backend is [here](https://github.com/wass08/r3f-virtual-girlfriend-backend).

Start the development server with
```
yarn
yarn dev
```

---

## Space Prototype (React + TypeScript)

Arrival Space のような「ブラウザで歩き回れる3D空間」サービスのプロトタイプを
React + TypeScript(React Three Fiber)で実装しています。

### 起動方法

```
yarn
yarn dev
```

を実行し、ブラウザで `http://localhost:5173/space.html` を開きます。
(従来のアバターチャットアプリは `http://localhost:5173/` のまま動作します)

### 操作方法

- 「クリックして空間に入る」ボタンで入場(ポインターロック)
- WASD / 矢印キー: 移動、Shift: 走る、マウス: 視点、Esc: 退出
- 入場前の画面で Gaussian Splat のURLを指定すると、スキャンした実空間を
  空間内に読み込めます。**SOG(`.sog`)/ `.ply` / `.splat` / `.spz` / `.ksplat`
  に対応**([Spark](https://sparkjs.dev/) による描画)
- サンプルとして `public/splats/sample_room.sog` を同梱
  (`@playcanvas/splat-transform` でPLYから変換したもの)。
  Arrival Space のCDN上の `.sog` URLもそのまま指定できます
  (別オリジンから読む場合はCORS許可が必要)

### コード構成

- `src/space/` — TypeScript製の空間ビューア(新規コードはここにTSで追加)
  - `SpaceApp.tsx` — Canvas と UI オーバーレイ
  - `components/Player.tsx` — 一人称視点の移動・ポインターロック
  - `components/GalleryRoom.tsx` — プロシージャルなギャラリー空間
  - `components/SplatLayer.tsx` — Spark(`@sparkjsdev/spark`)によるGaussian Splat読み込み
    (SOG対応・エラー時フォールバック付き)

### 移植済みスペース

`src/space/spaces.ts` にスペース定義(SOG URL・衝突GLB・配置・ライト)を登録すると、
入場画面のドロップダウンから読み込めます。

- **sample_room** — ローカル同梱のサンプル(衝突メッシュ付き。壁・スロープで衝突判定を確認できる)
- **east_street01** — [Yokohama East Avenue01](https://live.arrival.space/east_street01)
  (Arrival Space 55732136_2242 から移植。SOG・衝突GLB・配置トランスフォームは
  Arrival の実データを使用)

衝突GLBがあるスペースでは、レイキャストによる壁ブロックと地面追従(スロープ・段差)が
効きます。デバッグ用に `?nolock` を付けるとポインターロックなしでWASD移動できます。

### Arrival Space からの移植メモ

- Arrival Space のスペースは「スプラット本体(`.sog`)+ 衝突判定用 `collision.glb` +
  エンティティ(Gate / NPC / パネル等)」で構成されている
- `.sog` と `collision.glb` はCDN(`ugc.arrival.space`)からダウンロードでき、
  `.sog` は本ビューアでそのまま読み込める
- Gate・NPC・情報パネルなどのプラグイン(Vibes)は Arrival Space 固有のため、
  React コンポーネントとして再実装が必要
- `yarn typecheck` で型チェックを実行できます

### 今後のロードマップ

1. スプラット空間のコリジョン(見えない衝突用メッシュ)
2. マルチプレイヤー同期(Colyseus / LiveKit などのルームサーバ)
3. アバター表示・同期(VRM / Ready Player Me)
4. 空間内ボイスチャット(WebRTC / spatial audio)
5. ユーザーによる空間アップロードと共有URL
