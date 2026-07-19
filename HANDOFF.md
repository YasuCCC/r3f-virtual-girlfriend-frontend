# 開発引き継ぎ書 (HANDOFF)

Arrival Space類似の3D空間サービス開発の引き継ぎドキュメント。
新しいセッションはまずこのファイルを読んでから作業を続けること。

## プロジェクト概要

- 目的: live.arrival.space の代替となる自前サービス。Gaussian Splat空間の
  ウォークスルー + AI-NPCコンシェルジュ(案内・会話・音声) + 店舗NPC
- 技術: React + TypeScript + three.js(@react-three/fiber) + Spark(@sparkjsdev/spark)
- 本体コードはこのリポジトリの `src/space/` 以下(このリポジトリの元の
  アバター会話アプリ`src/`直下は学習用コンテンツで無関係。ただし
  `public/models/`のアバターGLB・アニメーションは流用している)
- 起動: `yarn dev` → http://localhost:5173/space.html
- 画面右下にビルドタグ(b0719-19など)とカメラ座標のデバッグ表示(DEVのみ)

## バックエンド

- https://npc-avatar-backend.vercel.app (リポジトリ: YasuCCC/npc-avatar-backend)
- 管理画面: /admin-app/ (本番でお客様が利用中 — 直接変更しないこと)
- API: GET /api/config?spaceId=スラッグ, POST /api/chat, POST /api/voice
- 開発サーバのプロキシ設定はvite.config.ts (/npc-api, /arrival-cdn, /arrival-ugc)

## 完了済みの主要機能 (src/space/)

1. SOG/SOGSスプラット表示(Spark, focalAdjustment 2.0)・ArrivalのLOD分割配信対応
2. スペース定義(spaces.ts): k_hall_entrance1, east_street01 (Arrivalと同配置)
3. ドラッグ視点+WASD移動(ポインターロック不使用)・衝突判定・
   「床は連続的にしか変化しない」モデルの接地判定(床下の鏡像ノイズ対策済み)
4. AI-NPCコンシェルジュ: 呼び出しバナー→バリア演出+クリックで会話開始→
   テキスト/音声質問。設定・ナレッジ・音声は管理画面のconfigそのまま
5. 行き先パネル+誘導歩行(話し終えてから歩く)+ユーザー自動追従(足跡トレース)
6. 周遊ルート(config.routes)・店舗NPC(到着で店主が応対、案内人は店主の
   後ろへ控える、次の店へ移動時は店主が見送り8mで消える)
7. VRM/GLB両対応ローダー+リターゲット(lib/vrmRetarget.ts)
   - 回転のみ転送・腰位置は身長比スケール(骨格比率を壊さない)
   - mixamorigプレフィックス付きリグ対応(Avaturn等)
8. リップシンク(音量解析 lib/lipsync.ts)+まばたき
   - Arrival変換GLBはモーフ名が消えているためindex 0フォールバックあり
   - Arrival変換GLBはまぶたモーフ自体が無く、まばたき不可(データの問題)
9. 着せ替えランタイム(lib/avatarParts.ts): パーツGLB結合(attachPart)+
   ロゴ差し替え(logoスロット or UV rect合成)+色替え
   - config形式: avatarCustomization {parts[], logo{url,mesh,rect}, colors{}}
10. 試着用URLパラメータ: space.html?avatar=/models/xxx.glb

## Arrivalアバターシステム調査結果(MCP経由で取得済み)

- パーツカタログ: 12カテゴリ342パーツ。フォルダ名はWolf3D_*(RPM互換規約)
  カタログJSON: {baseUrl, categories: {hair: {folder, displayName, parts: [
  {id, name, glbUrl, thumbnailUrl, appearance}]}}}
- アバター = {parts: {hair: "male-hair-63.glb", ...}, tints: {hairColor, skinColor}}
  をサーバー合成 → 単一GLB(この合成でモーフ名が消える)
- 当システムはクライアント側合成(attachPart)なのでモーフを保持できる=差別化点
- Ready Player Meは2026-01-31でサービス終了(Netflix買収)。利用不可
- Avaturn(avaturn.me)は写真からGLB生成、ARKitブレンドシェイプ+ビゼーム付き
  で当システムのリップシンク・まばたき対応。ただし写真前提なので
  パーツ式ビルダーが別途必要(ユーザー方針)

## 次のタスク(未着手/進行中)

A. 【最優先】npc-avatar-backend の admin-app を admin-app-v2 としてコピー
   (本番のadmin-appは触らない)。v2に以下を追加:
   - 「アバター」タブ: パーツGLBアップロード+カタログ管理
     (上記Arrival互換カタログJSONスキーマを採用)
   - NPCへのアバター割り当てUI+3Dプレビュー
   - 制服+企業ロゴプリセット(avatarCustomization設定UI, rect位置調整)
B. ユーザー向けアバタービルダーUI(このリポジトリ側):
   カタログAPIからパーツ選択→プレビュー→保存({parts,tints}をバックエンドへ)
C. パーツ資産の制作(Blender: 標準リグに合わせたGLB。スーツ・和装・日本人顔。
   ロゴ対応服は"logo"を名前に含むメッシュを入れる) — コンテンツ制作
D. エモート/ジェスチャー(お辞儀等)・フォトモード・VRMエクスポート
E. デプロイ(Vercel推奨: CDNプロキシが必要なため)・ゲート・マルチプレイヤー

## 作業ルール

- ブランチ: このリポジトリは claude/arrival-space-playcanvas-94mvoe に
  コミット/プッシュ。npc-avatar-backendでは新規ブランチを作成し、
  mainには直接プッシュしない
- 変更のたびにBUILD_TAG(SpaceApp.tsx)を上げる(ユーザーがビルド確認に使う)
- 機能追加時はサンドボックス(Playwright + --enable-unsafe-swiftshader)で
  検証してからコミット。TEMP-TESTコードは必ず除去してからコミット
- ユーザーへの報告は日本語。更新手順(git pull / yarn / Ctrl+F5)を明記
