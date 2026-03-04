# Phase0A 参照箇所・使用経路マップ（タスク2 成果物）

作成日: 2026-03-04  
根拠: 実コード検索結果

---

## 1. D-01: LINE_CHANNEL_ACCESS_TOKEN

### 1.1 定義箇所（2 ファイル・独立した defineString）

| ファイル | 行 | 内容 |
|----------|-----|------|
| `functions/src/domains/webhook/callables/lineWebhook.ts` | 7-9 | `defineString("LINE_CHANNEL_ACCESS_TOKEN", { default: "JsnZdiDqZDylvlOEz..." })` |
| `functions/src/domains/webhook/services/lineMessaging.ts` | 5-7 | 同上（同一トークンが 2 箇所に重複定義） |

### 1.2 使用経路

#### lineWebhook.ts

| 行 | 利用シーン |
|-----|------------|
| 74 | `lineChannelAccessToken.value()` を取得し、LINE Webhook のリッチメニュー設定に使用 |
| 79 | 未設定時エラーログ `"LINE_CHANNEL_ACCESS_TOKEN is not set"` |
| 115-120 付近 | `fetch("https://api.line.me/v2/bot/message/reply", ...)` で LINE Messaging API に直接リクエスト（linePlan が communication 時の decline リプライ） |
| 150 行付近 | 友だち追加/ブロック解除時、リッチメニュー設定用に LINE API へ fetch |

**呼び出し元**: LINE プラットフォーム（Webhook エンドポイント）。`onRequest` で HTTP 受信。

#### lineMessaging.ts

| 行 | 利用シーン |
|-----|------------|
| 21 | `sendLinePushMessage` 内で `lineChannelAccessToken.value()` を取得 |
| 24 | 未設定時エラーログ、`return false` |
| 117 | `sendLineButtonMessage` 内で `lineChannelAccessToken.value()` を取得 |
| 120 | 未設定時エラーログ、`return false` |

**呼び出し元**:
- `sendLinePushMessage` → `functions/src/domains/shift/callables/sendRecruitmentNotification.ts` 103 行目（シフト募集通知の LINE プッシュ）
- `sendLineButtonMessage` → 検索範囲内で他 callable からの呼び出しは未検出（将来利用または未使用の可能性）

### 1.3 注意点

- **2 ファイルで独立して defineString を定義**しており、default 値が重複。両方を漏れなく修正する必要がある。
- lineWebhook と lineMessaging のいずれか片方だけの修正では不十分。
- 環境変数はコマンドまたはコンソールで設定し、env ファイルは使用しない（リリース開始後は絶対に使用しない）。

---

## 2. D-12: QR_SECRET_KEY

### 2.1 定義箇所（1 箇所）

| ファイル | 行 | 内容 |
|----------|-----|------|
| `functions/src/domains/user/services/qrCodeUtils.ts` | 23 | `process.env.QR_SECRET_KEY \|\| "default-secret-key"` |

### 2.2 使用経路（generateSecurityToken 経由）

`generateSecurityToken` 内で QR_SECRET_KEY を参照。この関数は以下から呼ばれる:

| 呼び出し元関数 | 用途 |
|----------------|------|
| `generateQRData` | QR トークン生成（uid, loginId, timestamp から HMAC） |
| `verifyQRData` | QR トークン検証（expected token との比較） |

### 2.3 呼び出しチェーン（QR_SECRET_KEY が関与する経路）

```
generateQRData
  ├── generateQRCode (callable)        ← functions/src/domains/user/callables/generateQRCode.ts:77
  ├── createUserAccount (callable)     ← functions/src/domains/user/callables/createUserAccount.ts:71
  ├── createStaffAccount (callable)    ← functions/src/domains/staff/callables/createStaffAccount.ts:76
  └── createStaffByApp (callable)      ← functions/src/domains/staff/callables/createStaffByApp.ts:72

verifyQRData
  ├── processVisitByQR (callable)      ← functions/src/domains/user/callables/processVisitByQR.ts:50
  └── verifyQRCode (callable)          ← functions/src/domains/user/callables/verifyQRCode.ts:36
```

### 2.4 影響範囲

- **generateQRData を利用する callable**: generateQRCode, createUserAccount, createStaffAccount, createStaffByApp（ユーザー/スタッフ QR 生成）
- **verifyQRData を利用する callable**: processVisitByQR（来店時 QR 検証）, verifyQRCode（QR 検証）

qrCodeUtils.ts の fallback 削除（および採用方式での Secret 取得）により、上記 6 callable の動作に影響。未設定時は `generateSecurityToken` 内で即エラーにする設計が必要。

---

## 3. D-13: default-store / default-tenant

### 3.1 参照箇所一覧（実コードのみ）

| # | ファイル | 行 | 種別 | 内容 |
|---|----------|-----|------|------|
| 1 | `functions/.../callables/createScheduledTournament.ts` | 29-30 | Zod スキーマ default | `storeId: z.string().optional().default("default-store")`, tenantId 同様 |
| 2 | `functions/.../callables/createTournamentRecurrence.ts` | 27-28 | Zod スキーマ default | 同上 |
| 3 | `functions/.../services/enqueueTournamentTasksCore.ts` | 145 | fallback | `doc.storeId ?? 'default-store'` |
| 4 | `functions/.../services/generateRecurringTournamentsCore.ts` | 197 | fallback | `d.data().storeId \|\| "default-store"` |
| 5 | `lib/tournament/active/tournament_service.dart` | 16-17, 89-90, 389-390 | デフォルト引数 | `storeId = 'default-store'`, `tenantId = 'default-tenant'` |
| 6 | `lib/.../create_tournament_from_calendar_page.dart` | 744-745 | 呼び出し引数 | `'storeId': 'default-store'`, `'tenantId': 'default-tenant'` |
| 7 | `lib/.../scheduled_tournament_list_page.dart` | 1041-1042 | 呼び出し引数 | 同上 |

### 3.2 テストファイル（参考）

| ファイル | 用途 |
|----------|------|
| `functions/__tests__/tournament_createTournament/step1_emulator_verification.spec.ts` | テスト fixture として default-store/tenant を使用 |
| `functions/__tests__/tournament_createTournament/step3_taskSyncNeeded.spec.ts` | 同上 |

Phase 0A では本番コードのガード方針を優先。テストは定数化など後続で検討可。

### 3.3 データフロー概要

- **Functions**: createScheduledTournament / createTournamentRecurrence が入力に storeId/tenantId を受け、Zod で default 付与。recurrences ドキュメントに保存。
- **Functions**: enqueueTournamentTasksCore / generateRecurringTournamentsCore が Firestore の `storeId` を読む際、欠損時に `'default-store'` を fallback。
- **Flutter**: tournament_service のメソッドが storeId/tenantId をデフォルト引数で受け、create_tournament_from_calendar_page / scheduled_tournament_list_page から `'default-store'` / `'default-tenant'` を明示的に渡している。

---

## 4. サマリ：修正が必要なファイル一覧

| 分類 ID | ファイル | 修正内容 |
|---------|----------|----------|
| D-01 | `functions/src/domains/webhook/callables/lineWebhook.ts` | 平文 default 削除（採用方式で Secret 取得） |
| D-01 | `functions/src/domains/webhook/services/lineMessaging.ts` | 同上 |
| D-12 | `functions/src/domains/user/services/qrCodeUtils.ts` | `"default-secret-key"` fallback 削除（採用方式で Secret 取得） |
| D-13 | `functions/.../callables/createScheduledTournament.ts` | 本番で default-store/tenant を使わないガードへ変更 |
| D-13 | `functions/.../callables/createTournamentRecurrence.ts` | 同上 |
| D-13 | `functions/.../services/enqueueTournamentTasksCore.ts` | fallback をガードまたはエラーに変更 |
| D-13 | `functions/.../services/generateRecurringTournamentsCore.ts` | 同上 |
| D-13 | `lib/tournament/active/tournament_service.dart` | 本番 default 禁止方針に合わせた引数受け渡しへ変更（後続フェーズで実装） |
| D-13 | `lib/.../create_tournament_from_calendar_page.dart` | storeId/tenantId の供給経路見直し（後続フェーズ） |
| D-13 | `lib/.../scheduled_tournament_list_page.dart` | 同上 |
