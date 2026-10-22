# Phase0A Task7 テスト・検証チェックリスト

作成日: 2026-03-04  
参照: [TASK6_CHANGESPEC.md](./TASK6_CHANGESPEC.md) 8. 受け入れテスト項目

---

## 1. 検証要件一覧

### 1.1 D-01（LINE_CHANNEL_ACCESS_TOKEN）

| # | 検証項目 | 種別 | 担い手 |
|---|----------|------|--------|
| D01-1 | 本番想定で `LINE_CHANNEL_ACCESS_TOKEN` 未設定時に失敗する | 単体 | **AI**（ユニットテスト） |
| D01-2 | 設定済みで webhook が通る | 結合 | 手動 |
| D01-3 | 設定済みで push 送信が通る | 結合 | 手動 |

### 1.2 D-12（QR_SECRET_KEY）

| # | 検証項目 | 種別 | 担い手 |
|---|----------|------|--------|
| D12-1 | 本番想定で `QR_SECRET_KEY` 未設定時に失敗する | 単体 | **AI**（ユニットテスト） |
| D12-2 | 設定済みで QR 生成が通る | 結合 | 手動 |
| D12-3 | 設定済みで QR 検証が通る | 結合 | 手動 |

### 1.3 D-13（default-store / default-tenant）

| # | 検証項目 | 種別 | 担い手 |
|---|----------|------|--------|
| D13-1 | 本番想定で `default-store` / `default-tenant` が入力された場合に失敗する | 単体 | **AI**（ユニットテスト） |
| D13-2 | 正式 store/tenant 入力で tournament 作成が通る | 結合 | **AI**（エミュレータ） / 手動 |
| D13-3 | 正式 store/tenant 入力で recurrence 生成が通る | 結合 | **AI**（エミュレータ） / 手動 |
| D13-4 | 正式 store/tenant で enqueue が通る | 結合 | **AI**（エミュレータ） / 手動 |

### 1.4 回帰・既存機能

| # | 検証項目 | 種別 | 担い手 |
|---|----------|------|--------|
| R1 | tournament 関連ユニットテストが全て通過する | 単体 | **AI** |
| R2 | 既存の tournament 作成フローが壊れていない | 回帰 | 手動 |
| R3 | 既存データ確認スクリプト動作確認（エミュレータ） | 事前確認 | **AI** |

### 1.5 既存データ影響（本番デプロイ前必須）

| # | 検証項目 | 種別 | 担い手 |
|---|----------|------|--------|
| E1〜E4 | 本番 Firestore の default 件数確認・補正 | 確認 | 手動（要 credentials） |

---

## 2. 担い手別サマリ

### 2.1 AI（自動化）が担うもの ✅

| 項目 | コマンド |
|------|----------|
| **D01-1, D12-1, D13-1** | `cd functions && npm run test:phase0A` |
| **R1, D13-2〜4（エミュレータ）** | `cd functions && npm run test:phase0A:emulator` |
| **R3 スクリプト確認** | `firebase emulators:exec --only firestore 'cd functions && npx ts-node scripts/check-default-store-tenant.ts'` |

※ `test:phase0A:emulator` は Firestore エミュレータを起動し、tournament/config テストを実行。ポート 8081 が空いている必要あり。別プロセスで emulator が起動中の場合は停止してから実行すること。

### 2.2 ユーザー（手動）が行うもの

- **D01-2, D01-3** LINE webhook / push の結合確認（実 LINE 環境・要トークン）
- **D12-2, D12-3** QR 生成・検証の結合確認（実アプリ操作）
- **R2** 既存フローの回帰確認（アプリ操作）
- **E1〜E4** 本番 Firestore の default 件数確認・補正（要 credentials）

---

## 3. 実行手順

### 3.1 AI が実施する一括コマンド

```bash
# Phase0A ユニットテスト（D01-1, D12-1, D13-1）
cd functions && npm run test:phase0A

# エミュレータ + tournament/config テスト（R1, D13-2〜4）
cd functions && npm run test:phase0A:emulator

# 既存データ確認スクリプト（エミュレータで動作確認）
firebase emulators:exec --only firestore 'cd functions && npx ts-node scripts/check-default-store-tenant.ts'
```

### 3.2 ユーザーが実施する手順

#### 設定済みでの成功確認（D01-2, D12-2, D13-2 等）

1. 環境変数をコマンド/コンソールで設定（LINE_CHANNEL_ACCESS_TOKEN, QR_SECRET_KEY）
2. LINE webhook にメッセージを送り、応答 200 を確認
3. アプリから QR 生成・検証を実行
4. アプリからトーナメント作成（test-store / test-tenant で開発時は可）を実行

#### 本番既存データ確認（E1〜E4）

1. 本番プロジェクトで `cd functions && npx ts-node scripts/check-default-store-tenant.ts` を実行
2. または Firestore コンソールで対象コレクションをクエリ
3. 件数 0 ならそのままデプロイ、件数 > 0 なら補正後にデプロイ

---

## 4. 完了条件（Task7 Done）

- [x] 上記検証項目のうち、自動化可能なもの（ユニットテスト）が通過
- [x] 手動検証項目の結果を本ドキュメントまたは別メモに記録
- [x] 既存データ影響の有無を確認し、補正が必要な場合は実施済みであること

**完了日**: 2026-03-04

**補足**: 既存データに test-store/test-tenant が残存するが、本番ガード対象（default-store/default-tenant）ではないため、一旦スルー可。

**Task8 について**: ロールバック手順・監視観点の Runbook 作成は Phase3 で実施する。
