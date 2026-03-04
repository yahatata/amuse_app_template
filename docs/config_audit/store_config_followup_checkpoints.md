# 追加確認観点の精査（Follow-up）

## 1. 目的 / 前提（最終判断はCursor）

- 目的: `docs/config_audit/store_config_classification.md` の追補として、追加観点 A〜G を実コードベースで再検証し、見落とし/事故可能性を明確化する。
- 前提: 本書は「修正案の断定」ではなく、根拠付きの確認結果と選択肢を提示する。最終判断（採否/優先順位）は Cursor 側で実施する。
- 制約: 本作業では既存ファイル編集は行わず、追補ドキュメント新規作成のみ実施。

## 2. 追加確認の結果サマリ（重要度 High/Med/Low）

- High
  - Secrets/平文defaultが依然存在（`LINE_CHANNEL_ACCESS_TOKEN` default、`QR_SECRET_KEY` fallback）。
  - SSoT分散（会計/営業時間/必要人数/営業日境界）のまま Run-time化すると整合性事故が起きやすい。
- Med
  - `storeMeta/config` は未実装。`storeMeta/currentBusinessDay` 読み取り基盤はあるため拡張余地はある。
  - `region: 'us-central1'` は複数ファイルに散在（少なくとも17ヒット）し、環境差分としての管理論点がある。
  - Storageまわりに公開設定とプロジェクト直書きがあり、店舗分離時に確認が必要。
- Low
  - iOS/macOS設定ファイルは存在するが、Android運用前提なら当面優先度は下げられる（ただし誤更新混入には注意）。
  - `--dart-define` は実コード実装が未確認で、現時点は docs 起点の設計情報。

## 3. 観点別の確認結果（根拠付き）

### A. Runへ寄せる項目の実装可能性（存在確認）

- `storeMeta/config` 読み取り実装
  - 現状: `storeMeta/config` を直接読む実装は未検出。
  - 根拠: `storeMeta/config` の検索で実コードヒットなし（分類ドキュメント自体を除く）。
- 既存の `storeMeta` 読み取り基盤
  - Flutter: `lib/services/store_meta_service.dart` が `storeMeta/currentBusinessDay` を単一リスナーで購読（`StoreMetaService.instance.stream`）。
  - Functions: `functions/src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts` ほか複数箇所で `storeMeta/currentBusinessDay` を参照。
- 既存パターンの再利用可能性
  - `StoreMetaService`（Flutter）と `getCurrentBusinessDateKeyOrThrow`（Functions）の読み取りパターンは、そのまま `config` ドキュメント拡張に流用可能。
- Cursor判断コメント
  - Run-time化する場合の SSoT は Functions 側（サーバ）に置くのが妥当。Flutterは表示/入力補助に寄せる方が安全。

### B. 整合性モデル（SSoT/最終決定権）事故の可能性

- 会計計算の最終決定
  - `functions/src/domains/bills/callables/verifyPaymentSplit.ts` でサーバ再計算（`calculatePaymentSplit`）し、クライアント結果と照合。
  - サーバ最終判定が存在するため、SSoTをサーバへ寄せる方向は実装整合が取りやすい。
- 営業日確定の最終決定
  - `functions/src/domains/bills/repos/calcBusinessDate.ts` に「Functionsが確定」「クライアント値を無視」と明記。
  - `createBillWithActiveStay.ts` / `getOpenBills.ts` / `getUserOrderHistory.ts` 等も Functions で営業日を取得。
- キャッシュ起因の不整合リスク
  - `lib/services/device_service.dart` が `SharedPreferences` と `_cachedDevice` を使用（`device_id`, `device_name`, `device_role`）。
  - Firestore更新反映の遅延/不整合を運用で考慮する必要あり（特に権限/role変更直後）。

### C. Secrets/平文デフォルトの安全性（緊急度 High）

- `defineString` default に機密相当
  - `functions/src/domains/webhook/callables/lineWebhook.ts` と `functions/src/domains/webhook/services/lineMessaging.ts` の双方で `LINE_CHANNEL_ACCESS_TOKEN` default が平文。
- `process.env` fallback の弱い秘密値
  - `functions/src/domains/user/services/qrCodeUtils.ts` で `process.env.QR_SECRET_KEY || "default-secret-key"`。
- `functions.config()` 依存
  - `functions/src/shared/time/configOps.ts` と `functions/src/domains/bills/repos/dualWrite.ts` で fallback 利用。
- Cursor判断コメント
  - 機密は `defineSecret`/Secret Manager に統一し、`default` 廃止が優先。
  - `functions.config()` は段階廃止し params/Secret に寄せる方針が安全。

### D. `region` 散在と「環境差分」扱いの妥当性

- 散在状況
  - `functions/src` で `region: 'us-central1'` / `"us-central1"` のヒットは少なくとも17箇所（attendance/storeMeta/tournament_activeTournament等）。
- 店舗差分か環境差分か
  - region は基本的に店舗差分ではなく「環境差分（インフラ方針）」として扱うのが妥当。
- Cursor判断コメント
  - 店舗設定ドキュメントでは「共通固定値（Deploy環境設定）」として扱い、店舗別分類からは分離するのが実務的。

### E. Storage（`storage.rules` / bucket）とプロジェクト分離影響

- ルール内容
  - `storage.rules` は `match /b/{bucket}/o`。パスは `qr-codes/{type}/{fileName}` と `menuImages/{fileName}` を許可。
  - 特定店舗ID直書きはなし。
- コード上のbucket指定
  - Functionsは `storage.bucket()` / `admin.storage().bucket()` を使用（デフォルトbucket依存）。
  - 画像URL生成は `https://storage.googleapis.com/${bucket.name}/...`。
- 追加で見つかった設定起点
  - `public/staff/config.js`, `public/user/config.js` に `firebaseConfig.storageBucket` と `projectId` が直書き。
- Cursor判断コメント
  - Firebaseプロジェクト分離時は `public/*/config.js` と `firebase_options.dart`/`google-services` 群の同時整合確認が必要。

### F. Build-time項目の優先度（Androidのみ前提）

- iOS/macOSファイル存在
  - `ios/Runner/GoogleService-Info.plist`
  - `macos/Runner/GoogleService-Info.plist`
  - `ios/Runner/Info.plist`（`CFBundleDisplayName` あり）
  - `firebase.json` も iOS/macOS 出力定義を保持。
- Android only 前提の実装状況
  - 明示的な「Androidのみビルド/配布」自動化定義（repo内 workflow 等）は確認できず。
- Cursor判断コメント
  - 当面Androidのみ運用でも、生成物に iOS/macOS 設定が残るため「更新時に巻き込まない運用ルール」を決めるべき。

### G. docs起点の `--dart-define` が実装されているか（実体確認）

- 実コード（`lib/**`）での `String.fromEnvironment` / `bool.fromEnvironment`
  - 未検出（docs配下を除く）。
- `--dart-define` の実行パイプライン
  - repo内に `flutter build ... --dart-define ...` の実行定義は未検出（CI/workflow明示なし）。
- 参考
  - `docs/table_device/tobe_spec.md` と `docs/bills_migration/ui_compatibility_plan.md` には記述あり（設計/計画段階）。
- Cursor判断コメント
  - 現時点では「実装済み設定」ではなく「設計上の予定値」と扱うのが妥当。

## 4. 追加で修正・設計検討が必要そうな論点（Cursor判断）

- 高優先で是正候補
  - Secretsの平文default排除（LINE token / QR secret fallback）。
  - SSoT統一方針の明文化（会計・営業日・営業時間・必要人数は Functions を最終決定に寄せる）。
- 既存分類ドキュメントへの追記候補（編集時）
  - `region` は「店舗差分」より「環境共通設定」と明示。
  - `public/staff/config.js` / `public/user/config.js` の Firebase設定直書きを候補に追加。
  - `--dart-define` は「現状未実装（docs記載のみ）」タグを強調。
- 実装前に決めるべき設計選択肢
  - `storeMeta/config` をクライアント直読みにするか、Callable経由に制限するか。
  - Run-time値の反映タイミング（リスナー購読/キャッシュ無効化/TTL）をどう統一するか。

## 5. 未確認範囲と理由（あれば）

- デプロイ環境の実値（Firebase Console側の params/secrets/functions config）
  - リポジトリ外情報のため未確認。
- CI/CD 外部基盤（GitHub Actions 以外、社内パイプライン）
  - repo内に該当定義が見当たらず未確認。
- 本番運用上の Android-only 方針の正式ドキュメント
  - コードからは断定できないため未確認。
