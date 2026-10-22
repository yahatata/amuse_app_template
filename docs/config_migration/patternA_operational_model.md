# Pattern A Operational Model

## 1. 運用モデル（固定）

- 前提: 1 Repo をテンプレートとして保守する。
- 店舗ごとに次を分離する。
  - 別アプリ（別 `applicationId` / `bundleId`）
  - 別 Firebase プロジェクト
  - 別 Functions デプロイ対象
- 本ドキュメントは、上記を「店舗単位更新」と「全店舗横展開」の両方で安全に回すための運用モデルを定義する。

## 2. Build / Deploy / Run の責務

### Build（店舗アプリ成果物固定）

- `applicationId` / `bundleId`
- アプリ名 / アイコン
- Firebase 接続先（`google-services.json` / `GoogleService-Info.plist`）
- 生成物: AAB/IPA

### Deploy（店舗 Functions 固定）

- `LINE_CHANNEL_ACCESS_TOKEN`, `QR_SECRET_KEY` 等の秘密値
- Cloud Tasks / URL / SA / region / CRON など環境値
- 反映: `firebase deploy --project <storeProject>`

### Run（店舗運用で可変）

- Firestore `storeMeta/config` の値
- 機能フラグ、営業時間、会計ポリシー、運用パラメータ

## 3. 店舗追加フロー（初回）

1. 店舗キーを採番（例: `storeA`）
2. Play/App Store 側に店舗アプリを作成（別ID）
3. Firebase プロジェクトを作成
4. Android/iOS の Firebase 設定ファイルを配置
5. 店舗 secrets/env を登録
6. Firestore の `storeMeta/config` 初期値を作成
7. 初回ビルド（AAB/IPA）を内部配布
8. 初回 Functions デプロイ

## 4. 更新フロー（店舗1店のみ）

### Flutter

1. 対象店舗 flavor/scheme を指定してビルド
2. 対象店舗アプリへ配布

### Functions

1. 対象店舗 Firebase プロジェクトを指定してデプロイ
2. ログ/監視で正常性確認

## 5. 更新フロー（全店舗横展開）

1. 先行店舗で更新・検証
2. 問題なければ対象店舗リストを確定
3. 店舗ごとに Build/Deploy を順次実行
4. 失敗店舗があれば店舗単位でロールバック

## 6. 互換性ルール（段階展開）

- 追加キーは safe default を必須にする（秘密値は除く）
- 破壊的変更は混在期間を設ける
- 旧参照撤去前に新参照の稼働を確認する
- Functions を最終決定者に保つ

## 7. 重要ポリシー

- 本番で `default-store` / `default-tenant` を残さない
- 秘密値をリポジトリへコミットしない
- 店舗単位更新時は対象店舗を明示する（誤反映防止）
