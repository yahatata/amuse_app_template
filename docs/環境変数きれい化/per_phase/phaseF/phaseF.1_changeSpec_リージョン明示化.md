# phaseF.1 changeSpec（全関数リージョン明示化）

作成日: 2026-04-02  
最終更新: 2026-04-02  
ステータス: 完了（phaseF 本流へ復帰）

## 0. phaseF.1 の位置づけ

- phaseF（初回リリース前整備）の追加サブフェーズとして実施した。
- 目的は「`us-central1` 直書き除去」ではなく、**全関数の既定リージョンを `asia-northeast1` に確定**させること。
- phaseF.1 完了後は、phaseF 本体（外部操作・最終確認）へ戻る。

## 1. 対象仕様

- `docs/環境変数きれい化/仕様書/リージョン移行_ToBe_詳細仕様.md` 1〜12
- `docs/環境変数きれい化/仕様書/コード固定_ToBe_詳細仕様.md` 4.1 / 9.3 / 11
- `docs/環境変数きれい化/仕様書/GitHub_Actions_ToBe_詳細仕様.md`（deploy 手順整合）

## 2. As-Is と原因整理

### 2.1 着手時（2026-04-02）

- `asia-northeast1`: 24
- `us-central1`: 145

### 2.2 原因

- 多数の関数が `onCall(async ...)` など region 未指定で、v2 デフォルト `us-central1` に落ちる状態だった。

### 2.3 初回実装で判明した問題

- 関数定義ファイルごとに `setGlobalOptions({ region: 'asia-northeast1' })` を入れる方式を試したが、deploy 時に
  `Calling setGlobalOptions twice leads to undefined behavior` 警告が大量発生。
- この方式は phaseF.1 の最終実装として不採用。

## 3. 最終実装方針（採用）

### 3.1 方針

- `setGlobalOptions` は **`functions/src/index.ts` で1回のみ**実行する。
- その実行位置を、`export * from ...`（関数定義モジュールの読み込み）より前に置く。
- 各関数ファイルへの `setGlobalOptions` 追加は全撤回する。

### 3.2 反映内容

- 変更: `functions/src/index.ts`
  - 追加: `import { setGlobalOptions } from "firebase-functions/v2/options";`
  - 追加: `setGlobalOptions({ region: "asia-northeast1" });`
  - 位置: 全 `export *` より前（CommonJS 出力で先行評価を確認済み）
- 164 ファイルに加えていた `setGlobalOptions` import/call は削除。

## 4. 安全策

- `setGlobalOptions` 呼び出しは単一点に限定（多重呼び出しを禁止）。
- build/lint を必須ゲート化。
- deploy は全量一括ではなく、必要時はバッチ実行できるようスクリプト化。

## 5. 追加スクリプト

- `scripts/functions_region_migration_report.sh`
  - `us-central1` / `asia-northeast1` 差分比較（dry-run）
  - `--apply-delete-old` で「両リージョン重複分のみ」旧リージョン削除
- `scripts/firebase_deploy_functions_in_batches.sh`
  - 関数名リストを入力に、`firebase deploy --only ...` を分割実行
  - 429（mutation quota）回避用

## 6. 検証結果

### 6.1 ローカル検証

- `cd functions && npm run build`: 成功
- `cd functions && npm run lint`: 成功
- `rg -n "setGlobalOptions\(" functions/src | wc -l`: `1`
- `rg -n "us-central1" functions/src`: 0 件
- `functions/lib/index.js` で `setGlobalOptions(...)` が `__exportStar(require(...))` より前に出力されることを確認

### 6.2 デプロイ検証

- 単体検証: `controlHookHttp(asia-northeast1)` の update deploy 成功（2026-04-02）
- 旧/新リージョン差分確認:
  - `scripts/functions_region_migration_report.sh --project amuse-app-template --from us-central1 --to asia-northeast1`
  - 結果: `us-central1=0`, `asia-northeast1=169`, `only_in_us-central1=0`

## 7. デプロイ時の us-central1 扱い

- 原則は「再デプロイで新リージョン展開後、旧リージョン削除」。
- ただし 2026-04-02 時点で `us-central1` は 0 件確認済みのため、現時点で追加削除作業は不要。
- 今後の再発防止として、削除判断は必ず `functions_region_migration_report.sh` の dry-run 結果を根拠に実施する。

## 8. 完了条件と復帰

### 8.1 phaseF.1 完了条件

- 単一点 `setGlobalOptions` 設計へ是正済み
- build/lint 成功
- deploy 検証成功
- `us-central1` 残件ゼロ確認

### 8.2 phaseF 本流へ戻る作業（明示）

- phaseF.1 は完了。ここから phaseF 本体の外部操作に戻る。
- 継続対象:
  1. `task-endpoints` の最新 URL 整合確認
  2. scheduler / openclose / tournament の疎通最終確認
  3. phaseF ステップ8〜9の完了化（運用資料判定・完了サマリ）
