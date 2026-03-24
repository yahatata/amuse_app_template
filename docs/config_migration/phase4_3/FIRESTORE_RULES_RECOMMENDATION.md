# Phase4.3 Firestore ルール追加・修正提案

## 1. 目的

`docs/config_migration/phase4_3/per_step` の `VERIFICATION_LOG.md` と実装コードをもとに、
Phase4.3 で追加した給与計算機能を本番運用するために必要な

- `firestore.rules` への追加
- `firestore.rules` 以外で必要な修正

を整理する。

本書は **実装済みコードを前提にした運用・デプロイ差分** の整理であり、
Functions / Flutter コード自体はここでは変更しない。

---

## 2. 結論

Phase4.3 の給与機能を現状コードのまま本番で成立させるには、最低でも次が必要。

1. `storeMeta/payrollConfig`、`monthlyPayroll`、`notifications` 向けのルール追加
2. `notifications` 用の複合インデックス追加
3. ルールで使える **admin 判定の SSOT 整備**

特に 3 が重要で、現在の Callable は `devices.role === 'admin'` を使っている一方、
Firestore Rules は `devices` を `where uid == request.auth.uid` のように参照できないため、
**Functions の権限モデルと Rules の権限モデルがそのままでは一致しない**。

---

## 3. Phase4.3 で実際に増えたクライアントアクセス

`VERIFICATION_LOG.md` と Flutter 実装から、クライアント直アクセスが必要なパスは以下。

| 用途 | パス | 操作 | 根拠 |
|------|------|------|------|
| payrollConfig 購読 | `storeMeta/payrollConfig` | read | Step01 / `lib/services/payroll_config_service.dart` |
| 結果タブ: 月次結果 | `monthlyPayroll/{paymentPeriodKey}` | read | Step09 / `lib/payroll/widgets/result_tab.dart` |
| 結果タブ: run 進捗 | `monthlyPayroll/{paymentPeriodKey}/payrollRuns/{runId}` | read | Step09 / `result_tab.dart`, `progress_view.dart` |
| 結果タブ: staff 結果 | `.../staffResults/{staffId}` | read | Step09 / `result_tab.dart`, `error_view.dart` |
| 結果タブ: 明細 | `.../attendanceItems/{itemId}` | read | Step09 / `staff_detail_page.dart` |
| 過去結果セレクタ | `monthlyPayroll` | read | Step09 / `past_results_selector.dart` |
| 通知一覧 | `notifications/{notificationId}` | read | Step10 / `notification_list.dart` |
| 通知既読化 | `notifications/{notificationId}` | update | Step10 / `notification_list.dart` |
| 通知フラグ切替 | `notifications/{notificationId}` | update | Step10 / `notification_list.dart` |
| 通知ベル未読件数 | `notifications` | read | Step10 / `lib/Home/adminHomePage.dart` |

一方、給与計算データの作成・更新は Functions 側で実行される。
つまり Rules では **「読み取りを admin に許可」「書き込みは原則禁止」「通知の UI 状態更新のみ例外許可」**
という構成が適切。

---

## 4. `firestore.rules` に追加すべき内容

## 4-1. 前提: admin 判定ヘルパーを追加

まず Rules 側で使う admin 判定を 1 箇所に寄せるべき。

### 推奨

- `/admins/{uid}` を admin 判定の SSOT にする
- もしくは Firebase Auth custom claims の `admin == true` を使う

### 理由

Functions は `devices` コレクションの `role` を見ているが、
Rules は `devices` に対して `where("uid", "==", request.auth.uid)` のような検索ができない。
そのため、**今の `devices.role` ベース判定は Rules にそのまま移植できない**。

### 例（`/admins/{uid}` を使う場合）

```rules
function isSignedIn() {
  return request.auth != null;
}

function isPayrollAdmin() {
  return isSignedIn()
    && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
}
```

---

## 4-2. `storeMeta/payrollConfig`

### 追加理由

- `PayrollConfigService` が `storeMeta/payrollConfig` を常時購読するため
- 現在は `storeMeta/config` のルールはあるが、`payrollConfig` は未定義

### 推奨ルール

```rules
match /storeMeta/payrollConfig {
  allow read: if isPayrollAdmin();
  allow write: if false;
}
```

### 補足

- 初期化・補完は `initializeStoreConfigCallable` が行うため、クライアント書き込みは不要
- `schedulerNotificationHour` などを将来アプリから編集するなら、その時点で Callable 経由に寄せる方が安全

---

## 4-3. `monthlyPayroll` ルート + サブコレクション

### 追加理由

結果タブと進捗表示で以下を直接読んでいるため。

- `monthlyPayroll/{paymentPeriodKey}`
- `monthlyPayroll/{paymentPeriodKey}/payrollRuns/{runId}`
- `.../staffResults/{staffId}`
- `.../attendanceItems/{itemId}`

### 推奨ルール

```rules
match /monthlyPayroll/{paymentPeriodKey} {
  allow read: if isPayrollAdmin();
  allow write: if false;

  match /payrollRuns/{runId} {
    allow read: if isPayrollAdmin();
    allow write: if false;

    match /staffResults/{staffId} {
      allow read: if isPayrollAdmin();
      allow write: if false;

      match /attendanceItems/{itemId} {
        allow read: if isPayrollAdmin();
        allow write: if false;
      }
    }
  }
}
```

### 補足

- `executeMonthlyPayroll`、`processStaffPayroll`、`finalizePayrollRun`、
  `confirmPayrollRun`、`registerPaymentStatus` などはすべて Admin SDK 書き込みのため、
  クライアント write を許可する必要はない
- 現状の UI 要件では `staffResults` / `attendanceItems` は read のみで足りる

---

## 4-4. `notifications`

### 追加理由

Step10 で以下が実装済み。

- 一覧取得
- 未読件数取得
- `isRead` 更新
- `isFlagged` 更新

### 推奨ルール

```rules
match /notifications/{notificationId} {
  allow read: if isPayrollAdmin();

  allow update: if isPayrollAdmin()
    && resource.data.operationCategory == 'payroll'
    && request.resource.data.operationCategory == resource.data.operationCategory
    && request.resource.data.type == resource.data.type
    && request.resource.data.title == resource.data.title
    && request.resource.data.body == resource.data.body
    && request.resource.data.createdAt == resource.data.createdAt
    && request.resource.data.paymentPeriodKey == resource.data.paymentPeriodKey
    && request.resource.data.diff(resource.data).changedKeys().hasOnly([
      'isRead',
      'isFlagged'
    ]);

  allow create, delete: if false;
}
```

### ねらい

- クライアントからの更新は **通知 UI 状態のみ** に限定
- 通知本文・種別・期間キーなどの業務データ改ざんを防ぐ
- 通知作成は Functions 側の `createPayrollNotification()` のみ

### 注意

今後 UI で `updatedAt` を書くようにする場合は、`changedKeys()` の許可リストに `updatedAt` を追加する。

---

## 4-5. 任意だが追加を推奨するもの

### `attendanceLogs`

Phase4.3 Step07 では `payment_registered` / `payment_hold` を `attendanceLogs` に書いている。
現時点で Flutter が直接読む実装はないが、運用確認や将来 UI を考えると
admin read を用意しておくと扱いやすい。

```rules
match /attendanceLogs/{logId} {
  allow read: if isPayrollAdmin();
  allow write: if false;
}
```

ただし、**現行 Phase4.3 の UI 動作に必須ではない**。

---

## 5. 追加以外に必要な修正

## 5-1. `firestore.indexes.json` に `notifications` 用インデックスを追加

Step10 の通知 UI は以下のクエリを使う。

- `operationCategory == 'payroll'`
- `operationCategory == 'payroll' && isRead == false`
- `operationCategory == 'payroll' && isFlagged == true`
- いずれも `createdAt >= twoMonthsAgo`
- 一覧画面は `orderBy('createdAt', descending: true)`

現在の `firestore.indexes.json` には **`notifications` 用インデックスが無い**。

### 追加候補

```json
{
  "collectionGroup": "notifications",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "operationCategory", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "notifications",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "operationCategory", "order": "ASCENDING" },
    { "fieldPath": "isRead", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "notifications",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "operationCategory", "order": "ASCENDING" },
    { "fieldPath": "isFlagged", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

---

## 5-2. admin 判定の SSOT を Rules 対応の形に寄せる

これはルール追加よりも重要な「設計修正」。

### 現状

- Callable: `devices.role === 'admin'`
- Rules: `devices` を `uid` 条件で検索できない

### 必要な修正

次のどちらかに統一する。

1. `/admins/{uid}` を admin 判定の SSOT にする
2. Firebase Auth custom claims を使う

### 補足

Phase4.3 の給与機能だけでなく、今後 Rules で admin 制御を増やすなら
**Rules から O(1) で参照できる admin マーカー**が必須。

---

## 5-3. `monthlyPayrollTriggerEnabled` のデフォルト値の整合

Step10 の changeSpec / 運用ガイドでは

- `schedulerConfig.monthlyPayrollTriggerEnabled` は **false（デフォルト）**
- そのため旧 `monthlyPayrollTrigger` は既にスキップされる

という前提で書かれている。

しかし実コードでは

- `functions/src/shared/config/defaults.ts`
- `DEFAULT_MONTHLY_PAYROLL_TRIGGER_ENABLED = true`

となっている。

### 必要な修正

次のどちらかに揃える。

1. **コードを直す**  
   `DEFAULT_MONTHLY_PAYROLL_TRIGGER_ENABLED = false` に変更
2. **ドキュメントを直す**  
   「false（デフォルト）」ではなく、運用上 `storeMeta/schedulerConfig` を手動で false にする前提へ修正

### 優先判断

Phase4.3 の設計意図に合わせるなら、通常は **コードを false に寄せる方が安全**。

---

## 5-4. `firestore.rules` の開発用全許可コメントの整理

現行 `firestore.rules` は全体として

- `allow read: if true`
- 一部 `allow write: if true`

が多く、冒頭にも「開発用設定」と明記されている。

Phase4.3 の給与機能に限れば `monthlyPayroll` などを追加すれば最低限は動くが、
本番前提であれば **給与関連だけでなく既存の全許可ルールも段階的に縮小**した方がよい。

本書の対象外ではあるが、少なくとも給与機能まわりは

- `notifications`
- `monthlyPayroll`
- `storeMeta/payrollConfig`

を **admin 限定** にするべき。

---

## 6. 実施順の推奨

1. admin 判定の SSOT を決める（`/admins/{uid}` か custom claims）
2. `firestore.rules` に payroll 用 `match` を追加
3. `firestore.indexes.json` に `notifications` 複合インデックスを追加
4. `monthlyPayrollTriggerEnabled` のデフォルト値をコードかドキュメントで整合
5. ステージングで以下を確認

- `PayrollConfigService` が `storeMeta/payrollConfig` を読める
- 結果タブで `monthlyPayroll` / `payrollRuns` / `staffResults` / `attendanceItems` を読める
- 通知ベル未読件数が表示される
- 通知一覧が表示される
- 通知タップで `isRead` が更新される
- 通知長押しで `isFlagged` が更新される

---

## 7. 最低限の差分まとめ

### ルール追加が必須

- `storeMeta/payrollConfig`: admin read
- `monthlyPayroll` 以下: admin read
- `notifications`: admin read + `isRead` / `isFlagged` のみ update

### ルール以外で必須度が高い

- `notifications` の複合インデックス追加
- admin 判定の SSOT 見直し

### ルール以外で整合を取るべき

- `monthlyPayrollTriggerEnabled` デフォルト値のコード / ドキュメント差分解消

