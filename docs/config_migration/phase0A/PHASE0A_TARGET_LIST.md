# Phase0A 対象一覧（タスク1 成果物）

作成日: 2026-03-04  
根拠: `docs/config_audit/store_config_classification.md`、実コード検索結果

---

## 1. 対象 ID サマリ

| 分類 ID | キー名 | 現状の問題 | To-Be 方針 |
|---------|--------|------------|------------|
| D-01 | `LINE_CHANNEL_ACCESS_TOKEN` | 2 ファイルに同一の平文 default | 環境変数はコマンド/コンソールで設定（default なし、env ファイルは使用しない） |
| D-12 | `QR_SECRET_KEY` | `process.env` に `"default-secret-key"` の fallback | 環境変数はコマンド/コンソールで設定（default/fallback なし、env ファイルは使用しない） |
| D-13 | `default-store` / `default-tenant` | ハードコードで本番残存リスク | 本番は店舗固有値を Build/Deploy で注入、未設定時ガード |

---

## 2. D-01: LINE_CHANNEL_ACCESS_TOKEN

| 項目 | 内容 |
|------|------|
| **現状の場所** | `defineString("LINE_CHANNEL_ACCESS_TOKEN", { default: "JsnZdiDqZDylvlOEzAspG65YN1SNWqCaOXwtiyd2DSOMg8RTjhnaKOVZuH0/saa0gNFS5+9O+Qmifb4O6EPmhbIKHG6hQoKHZoJXTveyJWg4YaVYVCr9DtBZ2RSdh4eO+OOZUQ5gLZStBDoFPZLUXQdB04t89/1O/w1cDnyilFU=" })` |
| **定義ファイル（2 箇所）** | ① `functions/src/domains/webhook/callables/lineWebhook.ts` 7–9 行目<br>② `functions/src/domains/webhook/services/lineMessaging.ts` 5–7 行目 |
| **参照箇所** | `lineWebhook.ts`: `lineChannelAccessToken.value()` で webhook 処理、リッチメニュー設定<br>`lineMessaging.ts`: `lineChannelAccessToken.value()` で `sendLinePushMessage`、`sendLineButtonMessage` |
| **リスク** | 2 ファイルに同一トークンが平文で埋め込まれており、漏えいリスクが高い |
| **To-Be 方針** | default 削除。環境変数はコマンド/コンソールで設定し、env ファイルは使用しない。未設定時は本番即エラー。開発段階ではローカル用に限り .env 等を許容。 |
| **備考** | 両ファイルを漏れなく修正すること（webhook と service の両方） |

---

## 3. D-12: QR_SECRET_KEY

| 項目 | 内容 |
|------|------|
| **現状の場所** | `process.env.QR_SECRET_KEY \|\| "default-secret-key"` |
| **定義ファイル** | `functions/src/domains/user/services/qrCodeUtils.ts` 23 行目 |
| **参照箇所** | `generateSecurityToken` 内で QR トークンの HMAC 生成に使用。`generateQRData`、`verifyQRData` から間接参照 |
| **リスク** | `"default-secret-key"` の fallback により、本番で未設定でも弱い値が使用され得る |
| **To-Be 方針** | 環境変数はコマンド/コンソールで設定（default/fallback 禁止、env ファイルは使用しない）。未設定時は本番即エラー。鍵ローテーション時は即切替（旧QR無効化）。 |
| **備考** | 同ファイル内の `generateSecurityToken` および `verifyQRData` の呼び出し元を確認すること |

---

## 4. D-13: default-store / default-tenant

| 項目 | 内容 |
|------|------|
| **現状の場所** | ハードコード文字列 `'default-store'` / `'default-tenant'` |
| **定義・参照ファイル** | 下表のとおり |
| **リスク** | 本番に残ると店舗横断で誤動作（マルチテナント/多店舗展開時に致命的） |
| **To-Be 方針** | 本番は店舗固有 `storeId`/`tenantId` を Build/Deploy で注入。`default-store/default-tenant` は開発用途に限定。未設定時はガード（エラー or feature flag） |
| **備考** | Phase 0A では「本番残存ガード方針の確立」と、未設定時の挙動明文化を優先 |

### D-13 参照箇所一覧（実コード）

| # | ファイルパス | 種別 | 内容 |
|---|--------------|------|------|
| 1 | `functions/src/domains/tournament_createTournament/callables/createScheduledTournament.ts` | 定義 | `storeId: z.string().optional().default("default-store")`、`tenantId` 同様（29–30 行目） |
| 2 | `functions/src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts` | 定義 | 同上（27–28 行目） |
| 3 | `functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts` | 参照 | `doc.storeId ?? 'default-store'`（145 行目） |
| 4 | `functions/src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts` | 参照 | `d.data().storeId \|\| "default-store"`（197 行目） |
| 5 | `lib/tournament/active/tournament_service.dart` | デフォルト引数 | `storeId = 'default-store'`, `tenantId = 'default-tenant'`（16–17, 89–90, 389–390 行目） |
| 6 | `lib/tournament/scheduling/pages/create_tournament_from_calendar_page.dart` | 呼び出し | `'storeId': 'default-store'`, `'tenantId': 'default-tenant'`（744–745 行目） |
| 7 | `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart` | 呼び出し | 同上（1041–1042 行目） |

### テストファイル（参考）

- `functions/__tests__/tournament_createTournament/step1_emulator_verification.spec.ts`
- `functions/__tests__/tournament_createTournament/step3_taskSyncNeeded.spec.ts`  
→ テスト fixture として使用。Phase 0A では本番コードを優先し、必要に応じて定数化などを検討

---

## 5. 確認済み：Phase 0A スコープ外（参考）

| キー | 場所 | 備考 |
|------|------|------|
| STAFF_RICHMENU_ID | lineWebhook.ts | default ありだが機密ではない。Phase 0B で default 削除を検討 |
| USER_RICHMENU_ID | lineWebhook.ts | 同上 |
| LINE_PLAN | lineWebhook.ts, confirmShiftRequest.ts | 同上。Phase 0B で二重管理解消を検討 |

---

## 6. 根拠参照

- `docs/config_audit/store_config_classification.md`（D-01, D-12, D-13）
- `docs/config_audit/store_config_followup_checkpoints.md`（Secrets/平文 default の確認結果）
- `docs/config_migration/DECISION_LOG.md`（D-0009, D-0010, D-0011）
