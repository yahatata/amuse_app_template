# Store Onboarding And Release Checklist

## 1. 店舗追加チェックリスト（初回）

- [ ] 店舗キーを決めた（例: `storeA`）
- [ ] Android `applicationId` / iOS `bundleId` を確定した
- [ ] Firebase プロジェクトを作成した
- [ ] Android `google-services.json` を配置した
- [ ] iOS `GoogleService-Info.plist` を配置した
- [ ] アプリ名・アイコン差分を反映した
- [ ] 店舗の環境変数・Secrets をコマンドまたはコンソールで登録した（env ファイルは使用しない）
- [ ] `storeMeta/config` 初期値を投入した（管理者画面→詳細設定→storeMeta/config 初期セットアップ、または initializeStoreConfigCallable を呼び出し）

## 2. Flutter リリース前チェック（店舗単位）

- [ ] 対象店舗 flavor/scheme でビルドした
- [ ] `applicationId` / `bundleId` が対象店舗用になっている
- [ ] Firebase 接続先が対象店舗プロジェクトを向いている
- [ ] 内部テストで起動・認証・主要導線を確認した

## 3. Functions デプロイ前チェック（店舗単位）

- [ ] `--project <storeProject>` 指定で対象店舗を明示した
- [ ] 環境変数・Secrets がコマンド/コンソールで設定済みであることを確認した
- [ ] 本番で `default-store` / `default-tenant` が使われないことを確認した
- [ ] 失敗時のロールバック手順を確認した

## 4. 単店舗更新フロー（推奨）

1. 対象店舗を1店だけ選ぶ
2. Flutter 配布または Functions デプロイを実施
3. 監視・動作確認を実施
4. 問題なければ横展開対象に追加

## 5. 全店舗横展開フロー

1. 対象店舗一覧を確定
2. 各店舗で Build/Deploy を順次実行
3. 店舗ごとに結果記録（成功/失敗/ロールバック）
4. 変更履歴を `CHANGE_LOG.md` に記録

## 6. 互換性チェック

- [ ] 追加キーは safe default を持つ（秘密値除く）
- [ ] storeMeta/config 移行では旧参照は差し替え完了即削除（fallback 維持しない）。他移行では混在期間を定義する場合は明記する
- [ ] 秘密値に default/fallback がない
- [ ] Functions 最終決定原則に反しない
