# 実行環境注入のまま使うもの To-Be 詳細仕様書

作成日: 2026-03-31  
元仕様: `docs/環境変数きれい化/仕様書/tobe仕様書_全体像.md`  
関連仕様:

- `docs/環境変数きれい化/仕様書/コード固定_ToBe_詳細仕様.md`
- `docs/環境変数きれい化/仕様書/Secret_Manager_ToBe_詳細仕様.md`

## 1. スコープ

本仕様書は、「コード固定しない」「Secret Manager にも置かない」「Firestore にも置かない」値のうち、
プラットフォームや実行環境が自動で注入するため、そのまま使うものの扱いを確定する。  
主に `projectId` 系、Node.js 実行環境判定、Cloud Run 実行メタ情報が対象である。

以下は本仕様の対象外とする。

- Secret Manager に移行する値
- コード固定する値
- Firestore に置く値
- scheduler の業務ロジック
- 導入後の完成版運用資料

## 2. 基本方針

1. プラットフォームが自動注入する値は、原則そのまま使う。
2. これらの値をコード固定文字列で代替しない。
3. `projectId` 系は、各ファイルが独自に読むのではなく `getRequiredProjectId()` に寄せる。
4. 実行環境注入値が未設定で成立しない処理は、fail-fast で止める。
5. ログ用途などで補助的に使う実行環境注入値は、変更不要とする。

## 3. 対象変数一覧

### 3.1 本仕様で扱う変数

| 変数名 | 実態 | To-Be |
|---|---|---|
| `GCLOUD_PROJECT` | Cloud Functions 実行時に Firebase / GCP が注入 | 実行環境注入のまま使う |
| `GCP_PROJECT` | 上記の別名 | 実行環境注入のまま使う |
| `PROJECT_ID` | GCP 環境で注入されることがある互換的な値 | 実行環境注入のまま使う |
| `NODE_ENV` | Node.js / ビルドチェーンが注入 | 変更不要 |
| `FUNCTIONS_EMULATOR` | Firebase エミュレータが注入 | 変更不要 |
| `K_SERVICE` | Cloud Run が注入 | 変更不要（ログ用途のみ） |
| `K_REVISION` | Cloud Run が注入 | 変更不要（ログ用途のみ） |

### 3.2 この章で扱わない変数

以下は実行環境注入ではなく、別仕様で扱う。

- queue 名
- region
- Invoker SA プレフィックス
- Secret Manager に移す機密値
- Firestore 設定値

## 4. `projectId` 系の扱い

### 4.1 目的

`GCLOUD_PROJECT` / `GCP_PROJECT` / `PROJECT_ID` は、
「現在この Functions 実行環境が、どの Firebase / GCP プロジェクトに属しているか」を示す。  
1 リポジトリから複数 Firebase プロジェクトへ同じコードをデプロイする運用では、
この runtime injected な `projectId` を正として使う。

### 4.2 To-Be の取得方法

```typescript
export function getRequiredProjectId(): string {
  const projectId =
    process.env.GCLOUD_PROJECT ??
    process.env.GCP_PROJECT ??
    process.env.PROJECT_ID;

  if (!projectId) {
    throw new Error('プロジェクト ID が未設定です。実行環境を確認してください。');
  }

  return projectId;
}
```

方針:

- `GCLOUD_PROJECT` を第一優先で使う
- `GCP_PROJECT`、`PROJECT_ID` は互換的フォールバックとして読む
- 固定文字列フォールバックは持たない

### 4.3 なぜ実行環境注入のまま使うか

- 同一コードを複数 Firebase プロジェクトへデプロイしても、デプロイ先ごとに自動で値が分かれる
- コード固定すると誤プロジェクト参照の危険がある
- Secret Manager の secret 名解決、Cloud Tasks のパス組み立て、SA メールアドレス計算と自然に接続できる

### 4.4 禁止事項

以下は禁止とする。

- `'amuse-app-template'` のような固定文字列フォールバック
- 各ファイルで独自に `GCLOUD_PROJECT ?? GCP_PROJECT ?? PROJECT_ID` を繰り返すこと
- `projectId` が必要な処理で、`getRequiredProjectId()` を使わず独自取得すること

## 5. 既存の危険箇所と To-Be

### 5.1 As-Is の危険なパターン

```typescript
const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.PROJECT_ID ||
  'amuse-app-template';
```

問題点:

- 実行環境注入に失敗した時、テンプレートプロジェクト名で処理が続行してしまう
- 別 Firebase プロジェクトにデプロイしても、誤ってテンプレートプロジェクトのリソースにアクセスする危険がある

### 5.2 To-Be のパターン

```typescript
const projectId = getRequiredProjectId();
```

問題発生時の挙動:

- `projectId` が解決できなければ即時に `throw`
- 誤プロジェクトへ処理を飛ばすより、安全に停止する

## 6. `getRequiredProjectId()` の適用対象

### 6.1 適用対象

以下は `projectId` を処理時に必要とするため、共通化対象とする。

- `functions/src/domains/tournament_createTournament/services/tasks.ts`
- `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts`
- `functions/src/domains/storeMeta/callables/continueBusinessTerminal.ts`
- `functions/src/shared/logging/logOpsError.ts`
- `functions/src/shared/secrets/secretManager.ts`（新規）
- 今後追加する `schedulerSupervisor` / scheduled-job enqueue 関連の新規ファイル

### 6.2 適用不要の考え方

以下に該当しないファイルは、`getRequiredProjectId()` を導入しない。

- Cloud Tasks の `queuePath` / `taskPath` を組み立てる
- Secret Manager の `projects/{projectId}/...` を組み立てる
- SA メールアドレスを組み立てる
- ログに `projectId` を明示的に付与する

つまり、repo 全体のすべての `.ts` に一律導入するのではなく、
`projectId` を必要とする処理だけに導入する。

## 7. `NODE_ENV` / `FUNCTIONS_EMULATOR`

### 7.1 `NODE_ENV`

扱い:

- Node.js / ビルドチェーンが注入する
- 開発用分岐や `dotenv.config()` 呼び出し条件などに使う
- コード固定しない

To-Be:

- 変更不要
- 実行環境注入のまま使う

### 7.2 `FUNCTIONS_EMULATOR`

扱い:

- Firebase エミュレータが `"true"` を注入する
- 本番/エミュレータ判定に使う

To-Be:

- 変更不要
- `shared/runtime.ts` などの実行環境判定ロジックで読む

## 8. `K_SERVICE` / `K_REVISION`

### 8.1 用途

- Cloud Run / Cloud Functions Gen2 の実行リビジョン識別
- ログ補助情報

### 8.2 To-Be

- 実行環境注入のまま使う
- 監視やデバッグ用途に限定する
- 業務判定の主キーには使わない

## 9. ローカル開発時の扱い

### 9.1 基本方針

- 本番ではプラットフォーム注入を正とする
- ローカルでは必要時のみ `.env` などで明示する

### 9.2 `projectId` 系

ローカル開発時に `GCLOUD_PROJECT` が未設定になる場合は、
`functions/.env` に以下のように明示してよい。

```dotenv
GCLOUD_PROJECT=amuse-app-template-dev
```

補足:

- これは開発利便性のための設定であり、本番の正ではない
- 本番用の secret や機密値を `.env` の正にしない

## 10. 1 リポジトリ複数 Firebase プロジェクト運用との関係

### 10.1 この設計で満たしたいこと

- どの Firebase プロジェクトにデプロイしたかに応じて、同じコードが自動的に対象プロジェクトを識別できる
- コード側にアプリ別の `projectId` を直書きしない
- Secret Manager や Cloud Tasks がプロジェクト境界で自然に分離される

### 10.2 期待する挙動

- A プロジェクトへ deploy すれば `getRequiredProjectId()` は A を返す
- B プロジェクトへ deploy すれば `getRequiredProjectId()` は B を返す
- Secret 名や queuePath 生成は、その runtime の `projectId` に従って決まる

## 11. コード固定 / Secret Manager との境界

### 11.1 コード固定との境界

コード固定するもの:

- queue 名
- region
- Invoker SA プレフィックス

実行環境注入のまま使うもの:

- `GCLOUD_PROJECT`
- `GCP_PROJECT`
- `PROJECT_ID`
- `NODE_ENV`
- `FUNCTIONS_EMULATOR`
- `K_SERVICE`
- `K_REVISION`

### 11.2 Secret Manager との境界

Secret Manager に置くもの:

- `LINE_CHANNEL_ACCESS_TOKEN`
- `STAFF_RICHMENU_ID`
- `USER_RICHMENU_ID`
- `CONTROL_HOOK_URL`
- `CLOSE_ASSESSMENT_URL`
- `OPEN_ASSESSMENT_URL`
- `QR_SECRET_KEY`
- `UNCLOCKED_ATTENDANCE_EDIT_PASSWORD`

実行環境注入のまま使うもの:

- Secret を解決するための `projectId` 系

## 12. テスト・確認観点

1. `getRequiredProjectId()` が未設定時に fail-fast すること
2. 固定文字列フォールバックがコードから除去されること
3. `tasks.ts` / `weeklyPlanner.ts` / `continueBusinessTerminal.ts` / `logOpsError.ts` が共通 helper を使うこと
4. `secretManager.ts` も独自 `process.env.GCLOUD_PROJECT` 読みを持たないこと
5. `NODE_ENV` / `FUNCTIONS_EMULATOR` / `K_SERVICE` / `K_REVISION` は現行用途のまま壊れないこと

## 13. 本仕様書での最終結論

1. `projectId` 系はコード固定せず、実行環境注入のまま使う。
2. `projectId` が必要な処理は `getRequiredProjectId()` に一本化する。
3. 固定文字列フォールバックは削除し、未設定時は fail-fast とする。
4. `NODE_ENV` / `FUNCTIONS_EMULATOR` / `K_SERVICE` / `K_REVISION` は変更不要で、実行環境注入のまま使う。
5. 1 リポジトリ複数 Firebase プロジェクト運用では、runtime injected な `projectId` を正とする。

## 14. フェーズ対応メモ

- 本仕様書の主実装フェーズは `フェーズ A: 基盤の安全化` である。
- `4. projectId 系の扱い`、`5. 既存の危険箇所と To-Be`、`6. getRequiredProjectId() の適用対象` はフェーズ A で反映する。
- `9. ローカル開発時の扱い` と `10. 1 リポジトリ複数 Firebase プロジェクト運用との関係` は、フェーズ A 実装後にフェーズ F / G で導入時設定と最終整合を確認する。
- 本仕様書の内容は `docs/環境変数きれい化/フェーズ設計_詳細仕様対応表.md` で全体フェーズに割り当て済みであり、未対応章はない。
