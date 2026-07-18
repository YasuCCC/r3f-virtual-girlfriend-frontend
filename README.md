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
- 入場前の画面で Gaussian Splat(`.splat`)のURLを指定すると、
  スキャンした実空間を空間内に読み込めます

### コード構成

- `src/space/` — TypeScript製の空間ビューア(新規コードはここにTSで追加)
  - `SpaceApp.tsx` — Canvas と UI オーバーレイ
  - `components/Player.tsx` — 一人称視点の移動・ポインターロック
  - `components/GalleryRoom.tsx` — プロシージャルなギャラリー空間
  - `components/SplatLayer.tsx` — Gaussian Splat の読み込み(エラー時フォールバック付き)
- `yarn typecheck` で型チェックを実行できます

### 今後のロードマップ

1. スプラット空間のコリジョン(見えない衝突用メッシュ)
2. マルチプレイヤー同期(Colyseus / LiveKit などのルームサーバ)
3. アバター表示・同期(VRM / Ready Player Me)
4. 空間内ボイスチャット(WebRTC / spatial audio)
5. ユーザーによる空間アップロードと共有URL
