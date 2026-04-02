# Secret Manager To-Be 詳細仕様書

作成日: 2026-03-31  
元仕様: `docs/環境変数きれい化/仕様書/tobe仕様書_全体像.md`  
関連仕様:

- `docs/環境変数きれい化/仕様書/コード固定_ToBe_詳細仕様.md`
- `docs/環境変数きれい化/仕様書/scheduler_ToBe_詳細仕様.md`

## 1. スコープ

本仕様書は、環境変数から Secret Manager へ移行する値、Secret の束ね方、コードからの取得方法、キャッシュ方針、IAM 前提、開発/テスト時の扱いを確定する。  
対象は主に Functions 側の機密値・プロジェクト単位 URL・LINE 連携値である。

以下は本仕様の対象外とする。

- Firestore に置く値
- コード固定する値（queue 名、region、Invoker SA プレフィックスなど）
- `projectId` 自体の取得方針
- scheduler の業務ロジックそのもの
- 実装完了後に別途作る完成版の運用手順資料

## 2. 基本方針

1. 機密値、またはプロジェクト単位で異なり誤設定リスクが高い URL は Secret Manager に置く。
2. Secret は単体で乱立させず、同一スコープの値を JSON ひとかたまりで保持する。
3. `defineJsonSecret` は使わず、`@google-cloud/secret-manager` SDK を直接利用する。
4. 機密値・プロジェクト差分値では `defineString` を原則使わない。
5. Secret 取得は `shared/secrets/secretManager.ts` の共通入口に寄せる。
6. `projectId` は `getRequiredProjectId()` で実行環境から取得し、Secret 名は `projects/{projectId}/secrets/...` で解決する。
7. 高頻度パスは UX を優先して warmup を許容するが、原則は遅延取得とする。
8. 取得失敗は握りつぶさず fail-fast し、Promise キャッシュを null リセットして再試行可能にする。

## 3. Secret Manager に置く対象

### 3.1 対象グループ一覧

| Secret 名 | 用途 | 保持形式 |
|---|---|---|
| `line-config` | LINE Messaging API / rich menu 関連 | JSON |
| `task-endpoints` | 既存 HTTP task の実行先 URL | JSON |
| `business-secrets` | 業務系機密値 | JSON |

### 3.2 Secret Manager に置かないもの

以下は Secret Manager に置かない。

- `GCLOUD_PROJECT` / `GCP_PROJECT` / `PROJECT_ID`
- queue 名
- region
- Invoker SA プレフィックス
- scheduler job 用 queue / URL / Invoker SA

補足:

- queue 名・region・Invoker SA プレフィックスはコード固定またはコード計算で扱う
- scheduler job は native Task Queue Function のため、scheduler job 用 URL は不要
- scheduler job 用 Invoker SA も不要

## 4. Secret グループ定義

### 4.1 `line-config`

```json
{
  "channelAccessToken": "<LINE_CHANNEL_ACCESS_TOKEN>",
  "staffRichMenuId": "<STAFF_RICHMENU_ID>",
  "userRichMenuId": "<USER_RICHMENU_ID>"
}
```

役割:

- LINE Messaging API 認証トークン
- スタッフ向けリッチメニュー ID
- ユーザー向けリッチメニュー ID

方針:

- `STAFF_RICHMENU_ID` / `USER_RICHMENU_ID` は `defineString` から移行する
- `defineString` は今後の機密値・プロジェクト差分値では原則使わない
- `LINE_CHANNEL_ACCESS_TOKEN` はローテーション前提で `versions/latest` を参照する

### 4.2 `task-endpoints`

```json
{
  "controlHookUrl": "<CONTROL_HOOK_URL>",
  "closeAssessmentUrl": "<CLOSE_ASSESSMENT_URL>",
  "openAssessmentUrl": "<OPEN_ASSESSMENT_URL>"
}
```

役割:

- tournament task の HTTP 実行先
- openclose task の HTTP 実行先

方針:

- URL 3 件は今回の Secret Manager 詳細仕様で正式確定する
- queue 名・region・Invoker SA はこの secret に含めない
- 既存 downstream task が HTTP ベースで残る前提のため、URL は現時点で必要

### 4.3 `business-secrets`

```json
{
  "qrSecretKey": "<QR_SECRET_KEY>",
  "unclockedAttendanceEditPassword": "<UNCLOCKED_ATTENDANCE_EDIT_PASSWORD>"
}
```

役割:

- QR コード署名/検証用秘密値
- 未退勤修正用パスワード

方針:

- 仕様書上はこの 2 項目で固定する
- 実装は将来項目追加に耐えられる形を許容する
- `UNCLOCKED_ATTENDANCE_EDIT_PASSWORD` の管理主体は開発している我々とする

## 5. コード側の取得設計

### 5.1 配置

推奨ファイル構成:

- `functions/src/shared/secrets/secretManager.ts`
- `functions/src/shared/secrets/types.ts`

補足:

- 型定義は `secretManager.ts` の隣接ファイルに置く
- `projectId` 取得は `functions/src/shared/runtime/projectId.ts` の `getRequiredProjectId()` を使う

### 5.2 型定義

```typescript
export type LineConfig = {
  channelAccessToken: string;
  staffRichMenuId: string;
  userRichMenuId: string;
};

export type TaskEndpoints = {
  controlHookUrl: string;
  closeAssessmentUrl: string;
  openAssessmentUrl: string;
};

export type BusinessSecrets = {
  qrSecretKey: string;
  unclockedAttendanceEditPassword: string;
};
```

### 5.3 共通フェッチ関数

```typescript
async function fetchSecretJson<T>(secretName: string): Promise<T> {
  const projectId = getRequiredProjectId();

  const [version] = await client.accessSecretVersion({
    name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
  });

  const payload = version.payload?.data?.toString('utf8');
  if (!payload) {
    throw new Error(`Secret [${secretName}] のペイロードが空です`);
  }

  return JSON.parse(payload) as T;
}
```

責務:

- Secret を取得する
- payload の空チェックを行う
- JSON parse を行う

責務に含めないもの:

- 業務デフォルトの補完
- 呼び出し元ごとの分岐
- 値のロギング

### 5.4 公開取得関数

```typescript
export function getLineConfig(): Promise<LineConfig> { ... }
export function getTaskEndpoints(): Promise<TaskEndpoints> { ... }
export function getBusinessSecrets(): Promise<BusinessSecrets> { ... }
```

取得関数名はこの 3 つで固定する。

## 6. キャッシュと warmup

### 6.1 Promise レベルキャッシュ

```typescript
let _lineConfigP: Promise<LineConfig> | null = null;
let _taskEndpointsP: Promise<TaskEndpoints> | null = null;
let _businessSecretsP: Promise<BusinessSecrets> | null = null;
```

方針:

- オブジェクトではなく Promise をキャッシュする
- 同一インスタンス内では同じ secret 取得を最大 1 回に抑える
- 取得失敗時は `.catch()` 内で該当 Promise を null に戻す

### 6.2 warmup 方針

初期仕様での推奨:

- `line-config` は高頻度パス向けに warmup 対象としてよい
- `task-endpoints` は遅延取得を基本とする
- `business-secrets` は遅延取得を基本とする

補足:

- `business-secrets` は QR 系で使われるため将来的な個別 warmup の余地はある
- ただし初期仕様では、secret 全体を一律 warmup する意味は薄いため必須にしない

### 6.3 warmup 関数

```typescript
export function warmupSecrets(): void {
  getLineConfig();
}
```

初期仕様では `line-config` のみを warmup 対象とする。  
将来、実測上必要であれば `task-endpoints` や `business-secrets` の個別 warmup を追加してよい。

## 7. 最低限のバリデーション

### 7.1 required key チェック

各 secret は parse 後に required key の存在チェックだけ行う。

例:

- `line-config`:
  - `channelAccessToken`
  - `staffRichMenuId`
  - `userRichMenuId`
- `task-endpoints`:
  - `controlHookUrl`
  - `closeAssessmentUrl`
  - `openAssessmentUrl`
- `business-secrets`:
  - `qrSecretKey`
  - `unclockedAttendanceEditPassword`

### 7.2 エラー方針

- エラーには `secretName` を含める
- 欠落 key 名を含める
- Secret の値そのものは含めない

例:

- `Secret [line-config] に required key [channelAccessToken] がありません`

## 8. 既存コードからの置き換え

### 8.1 `line-config` へ寄せるもの

対象:

- `functions/src/domains/webhook/services/lineRichMenu.ts`
- `functions/src/domains/webhook/services/lineMessaging.ts`
- `functions/src/domains/webhook/callables/lineWebhook.ts`

置き換え:

| 置き換え前 | 置き換え後 |
|---|---|
| `process.env.LINE_CHANNEL_ACCESS_TOKEN` | `(await getLineConfig()).channelAccessToken` |
| `defineString('STAFF_RICHMENU_ID')` | `(await getLineConfig()).staffRichMenuId` |
| `defineString('USER_RICHMENU_ID')` | `(await getLineConfig()).userRichMenuId` |

### 8.2 `task-endpoints` へ寄せるもの

対象:

- `functions/src/domains/tournament_createTournament/services/tasks.ts`
- `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts`
- `functions/src/domains/storeMeta/callables/continueBusinessTerminal.ts`

置き換え:

| 置き換え前 | 置き換え後 |
|---|---|
| `getEnv('CONTROL_HOOK_URL')` | `(await getTaskEndpoints()).controlHookUrl` |
| `getEnv('CLOSE_ASSESSMENT_URL')` | `(await getTaskEndpoints()).closeAssessmentUrl` |
| `getEnv('OPEN_ASSESSMENT_URL')` | `(await getTaskEndpoints()).openAssessmentUrl` |

### 8.3 `business-secrets` へ寄せるもの

対象:

- `functions/src/domains/user/services/qrCodeUtils.ts`
- `functions/src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts`
- `functions/src/domains/storeMeta/callables/verifyUnclockedAttendanceEditPassword.ts`

置き換え:

| 置き換え前 | 置き換え後 |
|---|---|
| `process.env.QR_SECRET_KEY` | `(await getBusinessSecrets()).qrSecretKey` |
| `process.env[ENV_PASSWORD_KEY]` | `(await getBusinessSecrets()).unclockedAttendanceEditPassword` |

## 9. 開発・テスト・CI

### 9.1 ローカル開発

方針:

- 第一選択はモック
- 必要時のみ `GOOGLE_APPLICATION_CREDENTIALS` を設定して実 Secret Manager 接続

補足:

- 本番対象 secret を `.env` の正としない
- 開発中にどうしても実 secret を読む場合だけ明示的に認証を与える

### 9.2 Jest テスト

方針:

- `jest.mock()` で `secretManager.ts` をモックする
- 実 Secret Manager には接続しない

### 9.3 CI/CD

方針:

- デプロイ用 SA が直接 secret を読む必要はない
- 実行時に Functions SA が `secretmanager.versions.access` を持つ前提とする

## 10. IAM 前提

Functions 実行時に使う SA に以下を付与する。

- `roles/secretmanager.secretAccessor`

最小権限として、少なくとも以下 3 secret へのアクセスが必要である。

- `projects/<projectId>/secrets/line-config`
- `projects/<projectId>/secrets/task-endpoints`
- `projects/<projectId>/secrets/business-secrets`

## 11. ローテーション方針

### 11.1 共通方針

1. 新バージョンを追加する
2. コードは `versions/latest` を参照する
3. 問題なければ旧バージョンを無効化または破棄する

### 11.2 特にローテーションが発生しやすい値

- `LINE_CHANNEL_ACCESS_TOKEN`

補足:

- rich menu ID や URL の変更も Secret Manager の値更新で吸収する
- コード変更なしでの切り替えを可能にする

## 12. `defineString` の扱い

### 12.1 原則

機密値・プロジェクト差分値では `defineString` を原則使わない。

### 12.2 理由

- Secret Manager 集約方針と置き場が分散する
- JSON ひとかたまり運用と相性が悪い
- `STAFF_RICHMENU_ID` / `USER_RICHMENU_ID` のような関連値をまとめにくい
- 1 リポジトリ / 複数 Firebase プロジェクト運用で、設定の正が複数系統になる

### 12.3 今回の明確な廃止対象

- `defineString('STAFF_RICHMENU_ID')`
- `defineString('USER_RICHMENU_ID')`

## 13. 実装時の注意

1. `shared/secrets/secretManager.ts` 自体は `getRequiredProjectId()` を使い、独自の `process.env.GCLOUD_PROJECT` 読みを持たない。
2. Secret 取得関数は値をログに出さない。
3. warmup を導入する場合も、取得失敗を握りつぶさない。
4. high-frequency path と low-frequency path を分けて扱う。
5. `task-endpoints` は URL 3 件だけを持ち、コード固定対象を混ぜない。
6. `business-secrets` は現時点では 2 項目固定だが、実装は拡張しやすくしてよい。

## 14. テスト・確認観点

1. `getLineConfig()` / `getTaskEndpoints()` / `getBusinessSecrets()` が同一インスタンス内で重複取得しないこと
2. 取得失敗時に Promise キャッシュが null リセットされ、次回再試行できること
3. required key 欠落時に fail-fast すること
4. エラーログや例外に Secret の値が含まれないこと
5. `lineRichMenu.ts` の `defineString` 依存が除去されること
6. `tasks.ts` / `weeklyPlanner.ts` / `continueBusinessTerminal.ts` が URL を `task-endpoints` から読むこと
7. `qrCodeUtils.ts` / 未退勤修正系が `business-secrets` から読むこと
8. Jest モックで実 Secret Manager 接続なしにテスト可能であること

## 15. 本仕様書での最終結論

1. Secret Manager は `line-config`、`task-endpoints`、`business-secrets` の 3 secret で構成する。
2. 読み取りは SDK 直接利用 + Promise レベルキャッシュ + 共通モジュールで行う。
3. `projectId` は Secret Manager に置かず、`getRequiredProjectId()` で runtime 取得する。
4. scheduler job は native Task Queue Function 前提のため、scheduler job 用 URL や scheduler job 用 Invoker SA は新設しない。
5. 機密値・プロジェクト差分値では `defineString` を原則使わず、既存 `STAFF_RICHMENU_ID` / `USER_RICHMENU_ID` は廃止する。
6. 開発時はモック優先、実運用は Functions SA の IAM により Secret Manager を読む。

## 16. フェーズ対応メモ

- 本仕様書の主実装フェーズは `フェーズ D: Secret Manager 移行` である。
- `3. Secret Manager に置く対象`、`4. Secret グループ定義`、`5. コード側の取得設計`、`6. キャッシュと warmup`、`7. 最低限のバリデーション`、`8. 既存コードからの置き換え`、`12. defineString の扱い` はフェーズ D で反映する。
- `9.3 CI/CD`、`10. IAM 前提`、`11. ローテーション方針` はフェーズ D で設計反映しつつ、フェーズ F / G で運用実体と最終確認を行う。
- 本仕様書の内容は `docs/環境変数きれい化/フェーズ設計_詳細仕様対応表.md` で全体フェーズに割り当て済みであり、未対応章はない。
