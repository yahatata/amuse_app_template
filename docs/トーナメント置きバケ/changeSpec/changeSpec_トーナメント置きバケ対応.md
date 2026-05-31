# ChangeSpec: トーナメント置きバケ対応

## 1. 文書情報

- **文書名**: ChangeSpec: トーナメント置きバケ対応
- **作成先ファイル**: [`changeSpec_トーナメント置きバケ対応.md`](./changeSpec_トーナメント置きバケ対応.md)（本ファイル）
- **正本**: [`../仕様/トーナメント置きバケ対応_詳細仕様書.md`](../仕様/トーナメント置きバケ対応_詳細仕様書.md)
- **上位方針**: [`../仕様/トーナメント置きバケ対応_全体仕様書.md`](../仕様/トーナメント置きバケ対応_全体仕様書.md)

### 基本方針（運用）

本 ChangeSpec は、トーナメント置きバケ対応**全体の実装計画**である。

- **詳細仕様書を正**とし、本 ChangeSpec は実装単位・対象ファイル候補・変更内容・検証観点を整理する。
- **全体仕様書は上位方針の確認用**として参照する。
- **As-is 調査資料は参考のみ**であり、古い可能性があるため**正本として扱わない**。矛盾時は詳細仕様書を優先する。
- **対象ファイル候補・既存構造は、現在のリポジトリを検索して確認**する（As-is のファイル列挙を鵜呑みにしない）。
- **実装は Phase 順に行う**。Cursor は Phase を飛ばして実装しない。各 Phase の完了後、**差分確認・テスト確認・未解決事項の報告**を行う。

また、以下を遵守する。

- **詳細仕様書内で上位仕様として確定済みのものを、ChangeSpec 内で勝手に変更しない。**
- **Addon 許容実行回数の上限は、詳細書 §16.0 に従い `addonLimitPerPlayer`（および `isAddon`）で決まる**。通常参加者・置きバケ参加者は **同一上限**とする。その他 §25 は「具体化・テスト計画」の整理であり、この上限を覆う上位未決ではない。

---

## 2. 参照ドキュメントと優先順位

| 優先 | 資料 | 役割 |
|------|------|------|
| 1 | `docs/トーナメント置きバケ/仕様/トーナメント置きバケ対応_詳細仕様書.md` | 仕様の正本 |
| 2 | `docs/トーナメント置きバケ/仕様/トーナメント置きバケ対応_全体仕様書.md` | 上位方針の確認用 |
| 3 | **現在のリポジトリコード** | 実装対象ファイル・既存 Callable / rollback / config の正本 |
| 4 | `docs/トーナメント置きバケ/調査/As-is_トーナメント置きバケ対応_現状再調査.md` | 調査時点のメモ。**仕様決定後に追加変更あり**（pending_review の終了時化、来店なし入金、重複防止、誤紐付け rollback、ログイン案内設定、Addon registered 実行可など）。断定根拠に使わない。 |

---

## 3. 実装方針

- **Firestore データ正本**: `scheduledTournaments/{tournamentId}/okibakeTemporaryEntries/{okibakeEntryId}`（詳細仕様書 §5 ほか）。
- **store 設定の置き場所**: **`storeMeta/config.okibake.loginPromptMode`**。**サブコレクション化・別ドキュメント分割はしない**（全体仕様書・詳細仕様書 §14.15）。許容値: `none` / `notice_only` / `link_prompt`。既定値: **`notice_only`**。欠損・不正値時は詳細書に従い **`notice_only` にフォールバック**（§14.15）。
- **Callable 実装規則**: 既存 `tournament_activeTournament` / `logs` / `bills` ドメインのパターン（`operationId`、`writeSingleOperationLog`、`rollbackAction`、`logOpsError` / `serviceByFunctionEntry`）に揃える。
- **冪等性**: 詳細仕様書および既存規則（各 Callable の `operationId` 節）に従う。
- **Addon 回数上限（§16.0）**: テンプレートの **`addonLimitPerPlayer`** と **`isAddon`** を、トーナメント作成時に **`scheduledTournaments/{tournamentId}` にコピー**する。**実行判定は `scheduledTournament` 側**を参照する（テンプレートを都度参照しない）。フィールド未定義時の読み込み既定は詳細書 §16.0 とする。**通常参加者は `addonCount < addonLimitPerPlayer` のときのみ、置きバケは `okibakeAddonCount < addonLimitPerPlayer` のときのみ** Addon は可能となる範囲で実行する（両者とも **同一上限**）。

### 横断ルールの確認

本 ChangeSpec の実装では、既存の Cursor rules を前提として扱う。

#### Cloud Functions 側

`functions/src` 配下を変更する Phase では、実装前に必ず以下を確認する。

```text
.cursor/rules/cloud-functions-error-logging.mdc
```

確認対象には、少なくとも以下を含める。

```text
- logOpsError / logOpsSuccess の使い方
- functionEntry の指定
- serviceByFunctionEntry / 対応表の更新要否
- errorKey / FunctionCustomError / HttpsError の使い分け
- operation / context に載せる情報
- 既存エラーログ方針との整合
```

#### Flutter 側

`lib/` 配下を変更する Phase では、実装前に必ず以下を確認する。

```text
.cursor/rules/flutter-loading-display.mdc
```

確認対象には、少なくとも以下を含める。

```text
- 更新処理中の loading 表示
- 二重タップ防止
- UI ロック範囲
- 成功 / 失敗時の結果表示
- finally 相当で loading を解除すること
- 既存 UI のローディング表示方針との整合
```

#### 実装報告での扱い

各 Phase の実装報告には、変更対象に応じて以下を含める。

```text
- 参照した Cursor rules
- Cloud Functions 側で logOpsError / logOpsSuccess にどう対応したか
- functionEntry / service 対応の更新有無
- Flutter 側で loading / 二重実行防止 / UI ロックにどう対応したか
```

特に、Cloud Functions Callable を追加・変更する Phase では `.cursor/rules/cloud-functions-error-logging.mdc` を確認し、Flutter の画面・ダイアログ・ボタン・サービス呼び出しを変更する Phase では `.cursor/rules/flutter-loading-display.mdc` を確認する。

---

## 4. 実装対象の全体像

| レイヤ | 概要 |
|--------|------|
| **Cloud Functions** | `okibakeTemporaryEntries` CRUD に相当する Callable、席配置・アドオン・バスト・伝票紐付け、`endTournament` / `force_ended` 経路での `pending_review`、来店なし置きバケ精算 bill、通常参加重複チェック、誤紐付け undo、`rollbackAction` 拡張 |
| **店舗デバイス Flutter** | トーナメント操作・待機者一覧統合、`StoreConfigService` で `loginPromptMode` 参照、置きバケダイアログ・会計要対応 UI（詳細書 §11・§15） |
| **LIFF (`public/user/`)** | `registerForTournament` における **TOURNAMENT_OKIBAKE_ALREADY_REGISTERED** の文言・ガイダンス（§22）、ログイン時案内（Phase 8） |
| **共有型** | `functions/src/shared/config/types.ts` 等 と Flutter `lib/services/store_config_*.dart` の整合 |

---

## 5. Phase 一覧

| Phase | 内容 | 主な対象 | 依存 |
|-------|------|----------|------|
| Phase 1 | 型・基盤・store config | functions / Flutter の型・設定、LIFF 向け定数 | なし |
| Phase 2 | 置きバケ作成・一覧表示 | `okibakeTemporaryEntries` 作成、待機者一覧統合表示 | Phase 1 |
| Phase 3 | 席配置・Bust・Addon・**Addon 上限** | `assignOkibakeTemporaryEntryToSeat` / `applyOkibakeAddon` / `bustOkibakeTemporaryEntry`、**`addonLimitPerPlayer` のテンプレート〜`scheduledTournament` コピー**、`addon.ts` / `bulkAddon.ts` の **上限判定置換**（§16.0・§25.3） | Phase 2 |
| Phase 4 | 伝票紐付け・後追い反映 | `linkOkibakeTemporaryEntryToBill` | Phase 2, 3 |
| Phase 4 補正 | 置きバケ由来 seat の整合性補正 | 通常 Bust / Reentry / 全員再配置 / 通常着席 / 卓削除 / rollback 系 seat 解除 | Phase 4 |
| Phase 5 | `pending_review`・来店なし入金登録 | `endTournament` / `force_ended` / 要対応会計 / remote settlement bill | Phase 4 |
| Phase 6 | 通常参加重複防止 | `registerForTournament` / `registerParticipants` | Phase 2 |
| Phase 7 | 誤紐付け解除 rollback | `rollbackAction` / 専用 undo service | Phase 4 |
| Phase 8 | ログイン時置きバケ案内 | `storeMeta/config.okibake.loginPromptMode` / UI 表示 | Phase 1, 4 |
| Phase 9 | テスト・検証 | unit / integration / emulator / manual check | 全 Phase |

---

## 6. Phase 1: 型・基盤・store config

### 目的

置きバケドキュメント・店舗設定・クライアント表示に必要な**型・デフォルト・読み込み経路**を先に用意し、以降の Phase で重複実装しない。

### 参照仕様

- 詳細仕様書: §5〜§10（フィールド）、§6（`okibakeNextDisplayNumber`）、§14.15（`loginPromptMode`）
- 全体仕様書: `storeMeta/config.okibake.loginPromptMode`（サブコレクション禁止）

### 対象ファイル候補（リポジトリ確認済み・追記場所）

| 種別 | パス | 備考 |
|------|------|------|
| TS 設定型 | `functions/src/shared/config/types.ts` | `StoreConfig` に `okibake?: { loginPromptMode?: … }` 等を追加（**フィールド実名は詳細書 §14.15 に完全一致**） |
| TS デフォルト | `functions/src/shared/config/defaults.ts` | `loginPromptMode` 既定 **`notice_only`** |
| TS ローダ | `functions/src/shared/config/configLoader.ts` | `buildFromDefaults` / マージへのマッピング追加 |
| Flutter 設定 | `lib/services/store_config_service.dart` | `StoreConfigData` に `loginPromptMode` 等 |
| Flutter 既定 | `lib/services/store_config_defaults.dart` | 既定・パース時フォールバック（不正・欠損 → `notice_only`） |
| 共有ログマップ（新 Callable 追加時） | `functions/src/shared/logging/serviceByFunctionEntry.ts` | エントリ追加（Phase 2 以降で利用） |

**検討**: `functions/src/shared/types/` 配下または `domains/tournament_activeTournament` 内に `OkibakeTemporaryEntry` 等の型を置く。**既存パターンに合わせて Phase 実装開始時に確定**。
**Dart モデル**: `lib/tournament/active/models/` 配下へ新規（例: `okibake_temporary_entry.dart`）— **ファイル名は実装時に既存 naming に合わせる**。

### 実装内容

- `OkibakeTemporaryEntry` / `OkibakeAddonRecord` の型（または Zod／Dart class）と、`entryStatus` / `billLinkStatus` / `addonIntent` の union
- **`okibakeNextDisplayNumber`**: 親 `scheduledTournaments/{tournamentId}` 上のカウンタ（詳細書 §6）
- **`config.okibake.loginPromptMode`**: `none` | `notice_only` | `link_prompt`。default **`notice_only`**。不正・欠損 → **`notice_only`**
- **`usersList` は置きバケ作成時に更新しない**方針をコードコメントまたは README 運用メモで明記（詳細書・全体仕様書）

### 実装しないこと

- 置きバケ Callable の業務ロジック本体
- **`storeMeta/config/okibake` のようなサブドキュメント・サブコレクション**による分割

### データ整合・冪等性・transaction 方針

設定読み込みは既存 **`configLoader` の単一ソース**に合わせる。カウンタ系 transaction は Phase 2 で実装。

### ログ / operationLog / logOps 方針

Phase 1 ではマッピングの枠のみ。個別 Callable のログは Phase 2 以降。

### エラー / errorKey 方針

設定不正は **サイレントフォールバック（`notice_only`）** を基本（§14.15）。

### テスト観点

- `configLoader` 単体: `okibake` 未定義、`loginPromptMode` 省略、不正文字列

### 完了条件

- Functions / Flutter が同一の許容値・既定・フォールバックを参照できる
- 後続 Phase が型定義に依存できる状態

---

## 7. Phase 2: 置きバケ作成・一覧表示

### 目的

スタッフが置きバケ一時参加者を作成し、待機者一覧で通常 `waiting` と統合表示する。

### 参照仕様

- 詳細仕様書 §11（作成入力・カウンタ・ダイアログ）、§12（一覧 UI）

### 対象ファイル候補（リポジトリ確認済み）

| 種別 | パス |
|------|------|
| Callable（新規想定） | `functions/src/domains/tournament_activeTournament/callables/`（例: `createOkibakeTemporaryEntry.ts`。**エクスポート名は詳細書の入力型 `CreateOkibakeTemporaryEntryInput` と対応**。名称は詳細書・コードベース慣例に合わせ要確認） |
| ドメイン export | `functions/src/domains/tournament_activeTournament/index.ts` |
| Callable 公開 | `functions/src/index.ts`（既存と同様 `tournament_activeTournament` 経由 export） |
| Flutter サービス | `lib/tournament/active/tournament_service.dart` |
| 待機一覧 UI | `lib/tournament/active/widgets/display/waiting_list_view.dart` |
| メインビューモデル | `lib/tournament/active/models/main_view.dart`, `waiting_list.dart` |
| トーナメント操作 UI | `lib/tournament/active/pages/tournament_home_page.dart` |

### 実装内容（詳細書準拠の要約）

- **置きバケ作成 Callable（候補名: `createOkibakeTemporaryEntry`）**: 詳細仕様書は主に入力型 `CreateOkibakeTemporaryEntryInput` を明示。**最終 Callable 名は §25.3 に沿いコード規約で確定**する。
- **`temporaryDisplayName` 採番**、`okibakeNextDisplayNumber` +1
- 初期状態: `entryStatus: registered`, `billLinkStatus: unlinked`
- `linkedUserId` / `linkedUserPokerName` **任意**
- **`addonIntent` 必須**
- **`memo` 任意**、trim、空は `null`、最大 **200 文字**
- **`views/main.entries` / `playersIn` / `waitingCount` を +1**、`seatedCount` は変更しない
- **operationLog 記録**、`operationId` / idempotency（詳細書 §11 付近・§18）
- 待機者一覧: **通常 `waiting` と `okibakeTemporaryEntries` を UI 統合**。**`waiting` に保存しない**
- **`usersList` は更新しない**

**UI**

- トーナメント操作に **「置きバケ登録」**（§11.6: `全員リシート` と `終了処理` の間）
- **置きバケ登録ダイアログ**: 対象ユーザー任意・アドオン希望必須・メモ任意
- **対象ユーザー選択推奨文言**（全体 ChangeSpec指示）:

> 分かる場合は対象ユーザーを選択してください。選択しておくと、通常トーナメント参加との重複を防ぎやすくなります。

### 実装しないこと

- `pendingBillCharges` の作成
- bills 自動接続・`usersList` 更新

### データ整合・冪等性・transaction 方針

- 親 `scheduledTournaments` のカウンタとサブドキュメント作成は**同一 transaction**（詳細書 §6・§11.3）。
- 同一 **`operationId` の再送**は詳細書の idempotency 節に従う。

### ログ / operationLog / logOps 方針

- `writeSingleOperationLog`、`logOpsSuccess` / `logOpsError`、**`serviceByFunctionEntry` 登録**

### エラー / errorKey 方針

- 入力検証エラー・トーナメント不存在・権限は既存 Callable と同種の `HttpsError`。

### テスト観点

- 作成直後カウンタ、採番連番、`memo` trim、**`usersList` 未更新**

### 完了条件

- スタッフが作成し一覧に見える。**Counters と Firestore 正本が一致**

---

## 8. Phase 3: 席配置・Bust・Addon および Addon 上限（通常・置きバケ）

### 目的

置きバケ参加者の席・Addon・Bust を、**通常 `assignSeatToPlayer` とは別 Callable** で処理する。

あわせて **Addon 回数上限 `addonLimitPerPlayer`**（§16.0）を **テンプレート → `scheduledTournament` コピー**し、**通常 Addon（`addon.ts` / `bulkAddon.ts`）と `applyOkibakeAddon` の両方**で **同一上限**を参照する。

### 参照仕様

- §13 `assignOkibakeTemporaryEntryToSeat`
- §16.0 **Addon 上限回数**、§16 `applyOkibakeAddon` / `bustOkibakeTemporaryEntry` / §16.5
- §25.3（**実装時具体化**: フィールド名・migration・判定差し替え・UI）

### 対象ファイル候補

| 種別 | パス |
|------|------|
| Callable（新規） | `functions/src/domains/tournament_activeTournament/callables/assignOkibakeTemporaryEntryToSeat.ts`（ほか 2 本同ディレクトリ） |
| 既存参照 | `functions/src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts`, `addon.ts`, `bulkAddon.ts`（**ロジック流用しないが参照**） |

### 実装内容（要約）

- **`assignOkibakeTemporaryEntryToSeat`**: `seatXXOkibakeEntryId`。**`seatXXUserId` に okibakeEntryId を入れない**。`seatXXPokerName` は `linkedUserPokerName ?? temporaryDisplayName`
- `registered → seated`、`waitingCount -1`、`seatedCount` は詳細書通り
- **`bustOkibakeTemporaryEntry`**: `seated → busted` と **対象 `tablesSeat` の席クリア**（`okibakeTemporaryEntries` / `operationLogs` は詳細書 §16.8）。**`views/main` のカウンタは一切変更しない**（下記「置きバケ Bust と `views/main`」）。通常参加者向け `bustAndExit` / `bustAndReentry` と同様の **`playersIn` / `playersBusted` 更新は行わない**（未接続のため通常 bust とカウンタ責務を共有しない）。
- **`applyOkibakeAddon`**: **`registered` / `seated` のみ**可、`busted` / `voided` は不可。**`addonIntent` は実行可否に使わない**。**`scheduledTournaments/{tournamentId}` の `isAddon` / `addonLimitPerPlayer`（§16.0）を読み、`okibakeAddonCount >= addonLimitPerPlayer` のときは拒否**。**registered で Addon 実行後も `entryStatus` は registered**

#### 置きバケ Bust と `views/main`（Phase 3C）

`bustOkibakeTemporaryEntry` 実行時、**以下は変更しない**（詳細仕様書 §16.8 と一致）。

- **`entries`**
- **`playersIn`**
- **`playersBusted`**
- **`waitingCount`**
- **`seatedCount`**

処理は **`okibakeTemporaryEntries/{okibakeEntryId}` の状態更新**と **`tablesSeat` の該当席フィールド削除**に留める。**Phase 3C 時点では bills / activeStay に接続しない**ため、通常 bust と同様の参加者系カウンタ更新は抱えない。
- **通常参加者向け Addon**: **`addon.ts` / `bulkAddon.ts`** での **`addonCount >= 1` 相当固定拒否をやめ、`addonCount >= addonLimitPerPlayer` で拒否**する（詳細書 §16.5。rollback / operationLog との整合に注意。**Phase 3 内で、`applyOkibakeAddon` と同時にまたは先行して対応**。既存コードの読み込み経路・`scheduledTournament` に `addonLimitPerPlayer` が無いときのフォールバック §16.0）
- **テンプレート／トーナメント作成**: `addonLimitPerPlayer` が **`scheduledTournament` に無いときのフォールバック**により現行互換を保ちつつ、**新規作成時はテンプレート値を確実にコピーする**処理を確認・実装する（Dart / TS の該当箇所は **実装時にリポジトリ検索**。Phase 3 着手前にも場所確認を推奨）
- **`okibakeAddonRecords` 追加**、`okibakeAddonCount` / `lastOkibakeAddonAt` 更新、`views/main.addons` +1
- **bills 側には即時反映しない**（伝票未接続）

### 実装しないこと

- **`billLinkStatus: linked` に対する `applyOkibakeAddon`**（詳細書: 誤経路として拒否。linked 後は通常 addon）

### データ整合・冪等性・transaction 方針

- seats / `okibakeTemporaryEntries` / `views/main` の更新境界は詳細書 §13・§16。
- **`bustOkibakeTemporaryEntry`**: **`views/main` の更新なし**（`entries` / `playersIn` / `playersBusted` / `waitingCount` / `seatedCount`）。詳細書 §16.8 および本章「置きバケ Bust と `views/main`（Phase 3C）」。

### ログ / operationLog / logOps 方針

- 詳細書の operationName 候補（`assign_okibake_temporary_entry_to_seat` 等）に合わせて記録。

### Flutter（addon 上限の入力・表示）

- テンプレートまたは開催作成フローで **`addonLimitPerPlayer` を設定・編集できる**経路とする。**`isAddon` false と `addonLimitPerPlayer`** の組み合わせは詳細書 §16.0（案 A／案 B）に合わせて永続する。

### エラー / errorKey 方針

既存 Callable と同等の検証エラー。**Addon 上限到達・`isAddon` false** 時のメッセージ・`errorKey` は実装フェーズで既存ユーザー向け addon と揃える（詳細書 §16.5・§25.3）。

### テスト観点

- 席レイアウト、`seatXXUserId` 非混入、**Addon および席配置での `views/main` 更新**（`assign`: `waitingCount -1`、`applyOkibakeAddon`: `addons +1`）／**置きバケ bust では `views/main` 非変更**
- **`addonLimitPerPlayer` のコピー**（テンプレート変更が既開催へ波及しないこと）と **読み込みフォールバック**
- **通常 Addon / `bulkAddon`**: `addonCount` と上限の組み合わせ（上限 1・2・0）
- **`applyOkibakeAddon`**: `okibakeAddonCount` と上限の組み合わせ

### 完了条件

- 配置・addon・bust が Firestore 正本と一覧表示に整合

---

## 9. Phase 4: 伝票紐付け・後追い反映

### 目的

**手動**の `linkOkibakeTemporaryEntryToBill` により、`open`/`in_progress` の bill と接続し、entry / addon を後追い反映する。busted は `okibakeTemporaryEntries` 側の状態として扱い、bill 側へ busted 専用フィールドは作らない。

### 参照仕様

- §14 `linkOkibakeTemporaryEntryToBill`（**Callable 名は変更しない**）

### 対象ファイル候補

| 種別 | パス |
|------|------|
| Callable（新規） | `functions/src/domains/tournament_activeTournament/callables/linkOkibakeTemporaryEntryToBill.ts` |
| Bill 側反映 | `functions/src/domains/bills/repos/recordTournamentAction.ts` 等（**「相当処理」を本 Callable 内の専用実装として寄せる**／詳細書 §14） |
| Flutter | 伝票選択・確認ダイアログ（画面ファイルは **実装時に特定**。トーナメント系 `lib/tournament/active/` と会計系 `lib/Accounting/` の連携が候補） |

### 実装内容（要約）

- 対象 bill は **`open` / `in_progress` のみ**。**`settling` / `settled` は不可**
- `linkedUserId` / `linkedUserPokerName` / `linkedBillId` / `linkedAt` / `billLinkStatus: linked`
- **`entryStatus` は変更しない**
- 参加費反映: `entryCount` / `entryFeeIncl` を bill tournaments 側へ
- **未反映 `okibakeAddonRecords` を後追い**
- **`busted` でも bust は bill 側へ後追い反映しない**
- `seats` が seated なら `seatXXUserId` / `seatXXPokerName` を実ユーザーへ更新。**`seatXXOkibakeEntryId` は追跡用に残す**
- **operationLog payload**: `before` / `after` / `reflectedEntry` / `reflectedAddonRecordIds` / `seatBefore`
- **自動接続しない**

### 実装しないこと

- **`linkOkibakeTemporaryEntryToBill` による来店なし精算 bill 作成**（Phase 5）

### データ整合・冪等性・transaction 方針

詳細書 §14.11 の transaction 範囲に従う。

### ログ / operationLog / logOps 方針

Rollback 入力用に payload を十分に保持（§14.14 前提）。

### エラー / errorKey 方針

Bill 状態不整合・権限・ tournament 不一致は `HttpsError`。

### テスト観点

後追い entry / addon / seat が bill 側と tournaments 側で整合し、bust が bill 側へ反映されない

### 完了条件

来店ユーザー伝票への手動紐付けが完結

---

## 9A. Phase 4 補正: 置きバケ由来 seat の整合性補正

### 目的

Phase 4 以降、着席中置きバケを伝票紐付けすると、同一 seat に `seatXXUserId` / `seatXXPokerName` / `seatXXOkibakeEntryId` が同時に存在する。

これは「元置きバケ由来の参加者が実ユーザーへ接続された通常ユーザー席」であり、Flutter 表示上は `seatXXUserId` を優先して通常ユーザー席として扱う。

一方で、既存の通常ユーザー前提処理が `seatXXUserId` / `seatXXPokerName` だけを消すと、`seatXXOkibakeEntryId` だけが残る ghost okibake 状態が発生し得る。これを Phase 4 補正として修正する。

### 参照仕様

- 詳細書 §14.7.1 置きバケ由来 seat の整合性補正
- 詳細書 §13.9 席種別の判定
- 詳細書 §19 リシート仕様

### 対象ファイル候補

| 種別 | パス |
|------|------|
| 通常 Bust | `functions/src/domains/tournament_activeTournament/callables/bustAndExit.ts` |
| Reentry Bust | `functions/src/domains/tournament_activeTournament/callables/bustAndReentry.ts` |
| 全員再配置 | `functions/src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts` |
| 通常着席 | `functions/src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts` |
| 卓削除 | `functions/src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts` |
| rollback | `functions/src/domains/logs/services/undoAssignSeatToPlayer.ts` |
| rollback | その他、seat 解除を伴う rollback 系 |

### 修正方針

seat を空ける処理:

```text
seatXXUserId = null
seatXXPokerName = null
seatXXOkibakeEntryId = null
```

通常ユーザーを座らせる処理:

```text
seatXXUserId だけでなく seatXXOkibakeEntryId も空であることを確認する。
seatXXUserId が null でも seatXXOkibakeEntryId が残る seat は空席扱いしない。
```

卓削除 / occupied 判定:

```text
seatXXUserId だけでなく seatXXOkibakeEntryId も占有判定に含める。
```

rollback:

```text
seat 解除を伴う場合は seatXXOkibakeEntryId も復元・削除対象として扱う。
既存 rollback payload で不足がある場合は、現実装に合わせて安全側に修正する。
```

### 実装しないこと

今回の seat 整合性補正では、以下は実装しない。

```text
- registerParticipants / registerForTournament の通常参加重複防止
- busted + linked のランキング反映
- usersList の意味定義の再設計
- views/main の再加算
- bill 側への busted 専用フィールド追加
- Flutter の seat 表示判定変更
```

### Phase 6 に送るもの

`registerParticipants` / `registerForTournament` の通常参加重複防止は Phase 6 で扱う。

Phase 4 以降、置きバケ由来で `views/usersList` に追加されるユーザーが存在する。そのため、`views/usersList` に存在するユーザーを通常参加済み・実ユーザー接続済み参加者として扱い、通常参加 / 一括参加 / reentry の二重処理を防ぐ必要がある。

特に以下を Phase 6 で確認・修正する。

```text
- registerParticipants が usersList 既存ユーザーを reentry 扱いすることの妥当性
- registerForTournament が usersList 既存でも初回 entry 加算し得ること
- 置きバケ由来 linked user と通常参加の重複拒否
```

### 今後の仕様確認事項

busted + linked の置きバケ参加者を、順位確定 / ランキング / `tablesSeat/busted.bustedUser` にどう反映するかは、別途仕様確認事項とする。

現状、busted 置きバケを後から伝票紐付けすると `views/usersList` には追加されるが、`tablesSeat/busted.bustedUser` には追加されない。そのため、`getRankingData` が `bustedUser` のみを参照する場合、ランキング候補に出ない可能性がある。

これは会計リンクの問題ではなく、順位・ランキング仕様に関わるため、今回の seat 整合性補正には含めない。

### テスト観点

```text
- linked 済み元置きバケ席を bustAndExit した場合、seatXXOkibakeEntryId が null になる
- linked 済み元置きバケ席を bustAndReentry した場合、seatXXOkibakeEntryId が null になる
- reseatAllPlayers の全席クリアで seatXXOkibakeEntryId が null になる
- assignSeatToPlayer が seatXXUserId null かつ seatXXOkibakeEntryId ありの席を空席扱いしない
- removeTableFromTournament が seatXXOkibakeEntryId ありの席を occupied と判定する
- rollback 系の seat 解除で seatXXOkibakeEntryId が残らない
- Flutter 側の userId + okibakeEntryId は通常席優先のまま
```

### 完了条件

linked 済み元置きバケ席が通常 Bust / Reentry / 全員再配置 / rollback / 卓削除判定を通過しても、ghost okibake 状態を残さない。

---

## 9bis. Phase 4 補完: 「置きバケ一覧」導線（トーナメント操作タブ）

### 目的

Phase 4 のうち、**待機者一覧（registered）・卓ページ（seated）導線では到達できない `entryStatus: "busted"` かつ `billLinkStatus: "unlinked"` の置きバケ** へ、店舗端末から伝票紐付けする導線を確保する。

主な業務ユースケース:

```text
退席後かつトーナメント進行中の置きバケ参加者が来店した場合に、
店舗端末から該当 okibakeTemporaryEntry を選び、対象ユーザーの未精算 bill に伝票紐付けする。
```

副次目的として、`registered` / `seated` を含めて状態確認・操作できる統合導線とする。

### 参照仕様

- 詳細書 §11.6（トーナメント操作タブ配置）
- 詳細書 §12.8（「置きバケ一覧」本体仕様。表示対象・カード・操作分岐・伝票紐付け・既存導線との関係・Phase 境界・実装方針メモ）
- 詳細書 §14.2 伝票紐付け UI 導線（「置きバケ一覧」を初期導線に追加済み）
- 詳細書 §14.3 `linkOkibakeTemporaryEntryToBill`

### 対象状態

操作対象は **`billLinkStatus == "unlinked"`** に絞る。

```text
entryStatus == "registered" + unlinked
entryStatus == "seated"     + unlinked
entryStatus == "busted"     + unlinked   ← 本補完の主目的
```

`voided` および `linked` / `pending_review` は初期実装の操作対象外（参照表示の可否は実装判断）。`pending_review` は Phase 5（要対応会計ページ）で扱う。

### 対象ファイル候補

| 種別 | パス |
|------|------|
| Flutter（新規） | `lib/tournament/active/widgets/dialogs/okibake_list_dialog.dart` 相当（**ファイル名は実装時確定**。トーナメント操作タブの呼び出し元から開く） |
| Flutter（再利用） | `okibake_waiting_action_dialog.dart`（registered の操作 / 既存）、`okibake_seat_action_dialog.dart`（seated の操作 / 既存。`置きバケ一覧` 経由では Bust 非表示の薄いラッパで再利用）、`okibake_link_bill_dialog.dart`（伝票紐付け / 既存）、`okibake_bill_link_stay_candidates.dart`（候補抽出 helper / 既存） |
| Flutter（モデル） | `lib/tournament/active/models/okibake_temporary_entry.dart`（`isBustedUnlinked` 等の getter 追加余地。新フィールド不要） |
| Functions | **追加実装は原則不要**（`linkOkibakeTemporaryEntryToBill` は registered / seated / busted を既に許可済み） |

### 実装内容（要約）

- トーナメント操作タブ（`参加者登録` / `順位確定` / `全員リシート` / `置きバケ登録` / **`置きバケ一覧`（新規）** / `終了処理` / `プライズ確定` / `操作履歴`）に **「置きバケ一覧」** ボタンを追加（詳細書 §11.6 の並びに整合）
- 該当トーナメントの `okibakeTemporaryEntries` から **`billLinkStatus == "unlinked"`** かつ `entryStatus in {registered, seated, busted}` をクエリ／フィルタしてカード一覧表示
- カードに表示する項目（詳細書 §12.8.3）
  - 主表示名（`linkedUserPokerName` 優先 → `temporaryDisplayName` → 「置きバケ」）
  - 置きバケバッジ
  - entryStatus ラベル（待機中 / 着席中 / 退席済み）
  - billLinkStatus ラベル（伝票未接続）
  - Addon 表示
  - 状態別補助情報（待機時間 / 卓席 / `bustedAt`）
- カードタップ時の操作ダイアログを `entryStatus` で分岐（詳細書 §12.8.4）
  - **registered**: 席配置 / Addon / 伝票紐付け
  - **seated**:     Addon / 伝票紐付け（Bust は卓ページ側に残す）
  - **busted**:     伝票紐付けのみ
- 伝票紐付けは既存 `OkibakeLinkBillDialog` + `linkOkibakeTemporaryEntryToBill` を再利用
- 候補条件は既存 helper（Phase 4-C と同じ）を共通利用

### 実装しないこと

- 新規 Callable の追加（`functions/src` は原則変更しない）
- 新規 bill 作成（Phase 5 領域）
- `pending_review` 化処理（Phase 5）
- 来店なし入金登録（Phase 5）
- LIFF / ログイン契機の表示（Phase 8）
- `busted` に対する Addon / 席配置 / Bust の表示（仕様上 busted では実行不可・不要）
- bill 側へ busted 専用フィールドを追加すること

### データ整合・冪等性・transaction 方針

伝票紐付け本体は既存 `linkOkibakeTemporaryEntryToBill` の transaction（詳細書 §14.11）に従う。本補完では UI 側に追加トランザクションを設けない。

### ログ / operationLog / logOps 方針

伝票紐付けの operationLog は既存どおり `linkOkibakeTemporaryEntryToBill` 側に残す。「置きバケ一覧」UI 操作自体は新規ログを増やさない方針とする（誤操作監査は伝票紐付け operationLog で追跡可能）。

### エラー / errorKey 方針

既存の `TOURNAMENT_OKIBAKE_LINK_*` をそのまま使う。新規 errorKey は追加しない。

### テスト観点

- 「置きバケ一覧」ボタンがトーナメント操作タブに表示される
- `registered + unlinked` の置きバケが一覧に表示される
- `seated + unlinked` の置きバケが一覧に表示される
- `busted + unlinked` の置きバケが一覧に表示される
- `linked` / `voided` / `pending_review` は操作対象として表示しない、または操作不可になる
- `registered` では席配置 / Addon / 伝票紐付けが表示される
- `seated` では Addon / 伝票紐付けが表示される（Bust は非表示）
- `busted` では伝票紐付けのみ表示される（席配置・Addon・Bust は非表示）
- `busted + unlinked` から `OkibakeLinkBillDialog` を開ける
- 候補条件は Phase 4-C と同じ（入店中・billId あり・同一トーナメント未参加・`linkedUserId` ありなら本人のみ）
- 伝票紐付け成功後、対象 entry が一覧から消える（`unlinked` のみ表示のため）
- 待機中 / 着席中の既存導線（§12.6・§12.7・§14.2 卓ページ）を壊さない

### 実装時の注意

- 既存の `okibake_waiting_action_dialog` / `okibake_seat_action_dialog` / `OkibakeLinkBillDialog` のUI・処理を可能な限り再利用する
- 状態別の操作差分は `entryStatus` で判定する
- 伝票紐付け候補条件は Phase 4-C と同じ helper を使う
- `busted` では Addon / 席配置 / Bust を出さない
- bill 側に busted 専用フィールドは追加しない
- `linkOkibakeTemporaryEntryToBill` は既存 Callable を利用する
- `functions/src` の追加実装は原則不要

### Phase 境界

- **Phase 4 補完 = 本節**: 進行中トーナメント内の店舗端末操作に限定する
- **Phase 5**: トーナメント終了後の `pending_review` / 来店なし精算 / 要対応会計ページ
- **Phase 8**: 次回来店時の `link_prompt` / LIFF・LINE ログイン経路での案内

これらは目的・タイミング・対象データが異なるため、本補完には含めない。

### 完了条件

- トーナメント操作タブから「置きバケ一覧」を開ける
- 該当トーナメントの `unlinked` な置きバケが状態別に確認できる
- `busted + unlinked` 置きバケを店舗端末から伝票紐付けできる
- 既存導線（待機者一覧 / 卓ページ）が壊れない

---

## 9B. Phase 5-A' 補正: 対象ユーザー設定の制約と重複防止

### 目的

Phase 5 実装前提として、対象ユーザー設定を「未設定 entry への初回設定」に限定し、同一 tournament 内の置きバケ同士で `linkedUserId` 重複を防ぐ。

### 実装内容（要約）

- `linkedUserId` 未設定の `unlinked` entry（`entryStatus in registered/seated/busted`）のみ対象ユーザー設定を許可
- `linkedUserId` 設定済み entry は UI で設定/変更アクションを表示しない
- Functions 側 `updateOkibakeTemporaryEntryLinkedUser` でも `linkedUserId` 設定済み entry を拒否
- 同一 tournament 内で、他の `okibakeTemporaryEntries`（`entryStatus != voided` かつ `billLinkStatus in [unlinked,pending_review,linked]`）に既に使われている `linkedUserId` は設定不可
- 置きバケ登録時は、対象ユーザーの有無にかかわらず登録前確認ダイアログを表示

### Phase 境界

- 本補正は「置きバケ同士の `linkedUserId` 重複防止」であり、Phase 6 の通常参加重複防止とは別である。
- 対象ユーザー変更・誤設定修正・誤紐付け修正は Phase 7 rollback / undo で扱う。

---

## 10. Phase 5: pending_review・来店なし入金登録

### 目的

トーナメント終了時・`force_ended` での **`pending_review` 化**、**終了ブロック**、および**来店なし置きバケ精算 bill**による `linked` 化を実現する。

Phase 5 初期実装は **案A（pending_review 維持）**で進める。
閉店時に `pending_review` を自動で未会計 bill 化する案（案B）は、今回の Phase 5 には含めない。

### 参照仕様

- §15（`pending_review`、会計ページ、来店なし入金、`billType: okibake_remote_payment`、`remotePayment`、`/payments` 非作成、`open→settled`）
- **`endTournament` / `validateEndTournament`**、および **`closeStoreTerminal` 経由の `force_ended` 発生時の終了連携**（閉店時自動 bill 化は行わない）

### 対象ファイル候補（リポジトリ確認済み）

| 種別 | パス |
|------|------|
| 終了 Callable | `functions/src/domains/tournament_activeTournament/callables/endTournament.ts` |
| 終了検証 | `functions/src/domains/tournament_activeTournament/callables/validateEndTournament.ts` |
| 強制終了トリガ | `functions/src/domains/storeMeta/callables/closeStoreTerminal.ts`（`force_ended` 経路との整合確認。pending_review 自動 bill 化は対象外） |
| Bill 作成・更新 | `functions/src/domains/bills/` 配下の既存 create/settle（**詳細書 §15.14〜に沿い専用 Callable または既存関数の安全な再利用を設計**。§25.3: Callable 名は実装フェーズ確定） |
| Flutter | **要対応会計ページ**: `lib/Accounting/` 配下および関連 VM（詳細書 §15.6。既存カード/行/一覧 UI を再利用し、専用カード新設はしない） |

### 実装内容（要約）

- **`endTournament` / `force_ended`** 処理内で、`billLinkStatus == unlinked` かつ **`linkedUserId` 必須**の残存がある場合 **`pending_review` に遷移可能な対象のみ処理**。**`linkedUserId` 未設定のまま残るものがあると終了を完了しない**
- `pending_review` は要対応会計ページでの解決を主導線としつつ、Phase 8 の店舗端末入店時案内候補には含める（§14.15・§15）
- 要対応会計ページは既存 UI を再利用する（表示文言・カードレイアウト・行構造を既存仕様に合わせる）。置きバケ専用カードは作成しない。内部データソース・操作処理は okibake 用に分岐する。
- **来店なし入金**: `billType: okibake_remote_payment`、**`activeStay` なし**、`businessDate` は対象トーナメントと整合（§15）
- **open 作成 → settled update**。**支払い方法（payment methods）は詳細仕様書 §15.11 の定義を正とする**。本 ChangeSpecでは **cash / electronic_money / other 相当**の簡易分類を想定メモとして置くが、**実装時は §15.11 の許容値のみ**に合わせる。
- **`meta.paymentMethodsByAmount`、`/payments` サブコレクションは作成しない**（詳細書）
- **settled update 後**に `okibakeTemporaryEntry` を **`linked`**
- **来店なし経路の専用 rollback/取消は初期しない**。settled 後は **post-settlement**

### 実装しないこと

- `linkedUserId` 未設定での **默示的 `pending_review` 省略**による終了完了
- 閉店時の `pending_review` 自動未会計 bill 化
- 来店なし専用 rollback（§15・全体仕様書）

### データ整合・冪等性・transaction 方針

bill settle と okibake の `linked` の順序は **§15.17**。**冪等**は `operationId` で担保。

### ログ / operationLog / logOps 方針

来店なし精算も監査ログ・成功/失敗ログを既存規則に合わせる。

### エラー / errorKey 方針

終了ブロック時はスタッフ向け明示エラー（message / errorCode は §15・実装で具体化）。

### テスト観点

終了ブロック、`pending_review` 取得、`open→settled→linked`、`analytics`/日次との整合

### 完了条件

未接続置きバケが終了後に要対応として追跡でき、店舗判断で来店なし登録できる

### 後続検討

`pending_review` を閉店時に自動で未会計 bill 化する案は中期検討とする。
既存の `closeStoreTerminal` / `closeSummary` / `closeSnapshot` / `unresolved` / activeStay なし bill / businessDate / analytics 整合を別フェーズで整理したうえで判断する。

---

## 11. Phase 6: 通常参加重複防止

### 目的

LIFF と店舗 Callable の両方から、置きバケ済みユーザーが**通常参加で二重登録**しない。

### 参照仕様

- §22（`TOURNAMENT_OKIBAKE_ALREADY_REGISTERED`、`assertNoOkibakeBlockingRegistration` 概念）

### 対象ファイル候補（リポジトリ確認済み）

| 種別 | パス |
|------|------|
| LIFF Callable | `functions/src/domains/tournament_activeTournament/callables/registerForTournament.ts` |
| 店舗一括 Callable | `functions/src/domains/tournament_activeTournament/callables/registerParticipants.ts` |
| 共通 helper（新規想定） | `functions/src/domains/tournament_activeTournament/helpers/` または `services/`（**配置は §25.3 に従い実装時確定**） |
| Flutter 一括 UI | `lib/tournament/active/widgets/dialogs/register_participants_dialog.dart` |
| LIFF | `public/user/index.html`（`registerForTournament`呼び出し付近・エラー表示） |

### 実装内容（要約）

- **`registerForTournament` / `registerParticipants`** の両方で `okibakeTemporaryEntries` を確認
- 条件: `linkedUserId == 参加 userId`、`tournamentId` 一致、`entryStatus != voided`、`billLinkStatus in [unlinked, pending_review, linked]` → **拒否**
- **`busted`** および **`billLinkStatus: unlinked` 組み合わせ**も拒否対象に含める（詳細書・全体仕様書および依頼文）
- **`voided` は許可**
- **`linkedUserId` 未設定は検知対象外**
- **temporaryDisplayName / memo の自動照合なし**。未紐付けのみでは警告しない。**自動統合なし**。
- **errorKey: `TOURNAMENT_OKIBAKE_ALREADY_REGISTERED`**

**UI 文言（ChangeSpec指示）**

- **LIFF**: 「このトーナメントは店舗側で登録済みです。店舗スタッフに確認してください。」
- **店舗デバイス**: 「このユーザーは置きバケ登録済みです。通常参加ではなく、置きバケの伝票紐付けを行ってください。」

**一括登録**: **該当ユーザーのみ失敗**。他ユーザーは継続。

### 実装しないこと

- エラー項目を勝手に一般化しない（詳細書のキー優先）。

### データ整合・冪等性・transaction 方針

クエリまたは transaction 内読取のどちらで塞ぐか §22.3。

### ログ / operationLog / logOps 方針

拒否でも必要なら `logOps`。成功 operationLog は既存のみ。

### エラー / errorKey 方針

**`TOURNAMENT_OKIBAKE_ALREADY_REGISTERED`** と、LIFF/店舗でメッセージ出し分け（§25.3: details 伝播は実装で具体化）。

### テスト観点

両 Callable、並行実行、`voided` 後許可、`linked`/`pending_review`/`busted` で拒否

### 完了条件

二重参加者がカウンタに載らない

---

## 12. Phase 7: rollback / undo（初期実装）

### 目的（初期実装対象）

初期実装の対象は以下の 2 つ。

1. 置きバケ対象ユーザー設定 undo
   （`updateOkibakeTemporaryEntryLinkedUser` を `billLinkStatus == unlinked` の範囲で取り消す）

2. 置きバケ来店中 bill 紐付け undo
   （`linkOkibakeTemporaryEntryToBill` を会計前 bill の範囲で取り消す）

### Phase 7 追加実装（確定）

Phase 7 追加対象として、以下 2 操作を rollbackAction に接続する。

1. 置きバケ登録 rollback
   （`createOkibakeTemporaryEntry` の取り消し。削除ではなく voided 化）

2. 置きバケ席配置 undo
   （`assignOkibakeTemporaryEntryToSeat` の取り消し。seated から registered へ復元）

### 参照仕様（正本）

- §14.14 置きバケ伝票紐付け undo
- §15.4.1 / §15.4.2（対象ユーザー設定の制約）
- §18（rollbackAction 体系）

### 対象ファイル候補（リポジトリ確認済み）

| 種別 | パス |
|------|------|
| rollback 入口 | `functions/src/domains/logs/callables/rollbackAction.ts`（**`action` z.enum に新値追加** のパターン） |
| Undo 実装（新規） | `functions/src/domains/logs/services/undoOkibakeUpdateLinkedUser.ts` |
| Undo 実装（新規） | `functions/src/domains/logs/services/undoOkibakeLinkToBill.ts` |
| Undo export | `functions/src/domains/logs/services/index.ts` |
| Payload 参照元 | Phase 4 の operationLog |

### 実装内容（要約）

- **`rollbackAction` 体系に載せる**。既存 **`undoRegisterParticipants` 等は流用しない**
- `getActionLogs` / ActionHistory の既存履歴 UI に接続する
- **対象ユーザー設定 undo**:
  - `billLinkStatus == unlinked` のみ許可
  - `pending_review` / `linked` は拒否
  - `linkedUserId` / `linkedUserPokerName` を payload.before に戻す
  - seated の場合は `seatXXPokerName` も `seatBefore` に戻す
- **来店中 bill 紐付け undo**:
  - 紐付け先 bill.status が **`open` / `in_progress` のみ**許可
  - `settling` / `settled` / `post_settlement_pending` / `refunded` / `partially_refunded` / `voided` は拒否
  - `okibakeEntryBefore` / `billTournamentBefore` / `usersListBefore` / `waitingBefore` / `seatBefore` を正として復元
  - `pending_review` からの紐付け取り消しは、`before` を正として `pending_review` 状態へ戻す

- **置きバケ登録 rollback**:
  - operationName `置きバケ登録` を `okibake_create_entry` に mapping し rollbackAction から undo service を実行
  - `registered + unlinked + linkedBillId なし + okibakeAddonCount == 0` のみ許可
  - 対象 entry は削除せず `entryStatus: voided` に更新
  - `voidedAt / voidedByDeviceId / updatedAt / updatedByDeviceId` を更新
  - `views/main.entries / playersIn / waitingCount` を `-1` 補正（`max(0, current - 1)`）
  - `okibakeNextDisplayNumber` は戻さない

- **置きバケ席配置 undo**:
  - operationName `置きバケ着席` を `okibake_assign_seat` に mapping し rollbackAction から undo service を実行
  - `seated + unlinked + linkedBillId なし + okibakeAddonCount == 0` のみ許可
  - `okibakeEntryBefore` / `seatBefore` を正として復元
  - `entryStatus` は registered に戻す
  - `views/main.waitingCount` を `+1` 補正
  - `views/main.entries / playersIn` は変更しない

- **ActionHistory 接続**:
  - rollbackAction に渡す値は表示名ではなく action key を使用
  - `okibake_create_entry` / `okibake_assign_seat` に rollback ボタンを表示
  - 表示名（operationName）と action key は分離する

### 実装しないこと

- 来店なし入金 (`resolveOkibakePendingReviewWithRemotePayment`) の undo
- settled 後の「直接 unlinked 戻し」による簡略 rollback
- settled bill の削除、analytics 直接巻き戻し、bill 削除型 rollback
- Addon rollback
- Bust rollback
- busted + linked のランキング / bustedUser 反映
- Phase 8 link_prompt / LIFF

### データ整合・冪等性・transaction 方針

§14.14 の手順および `markOperationLogRolledBack`

### ログ / operationLog / logOps 方針

undo 側も rollback 済みフラグ・監査ログを整合

### エラー / errorKey 方針

bill 状態・operationId 不正は `HttpsError`

### テスト観点

addon 後追い済み、bust が bill 側へ反映されないこと、`open` と `settled` の可否

### 完了条件

誤操作を現場で巻き戻せる（会計前のみ）

---

## 13. Phase 8: 店舗端末入店時の置きバケ案内

### 目的

`loginPromptMode` に応じ、店舗端末での手動入店 / QR入店の完了後に **候補提示のみまたは手動接続導線** を出す。**自動接続は一切しない**。

### 参照仕様

- §14.15（対象条件: `linkedUserId == 入店ユーザー ID`、`billLinkStatus != linked`、`entryStatus != voided`、`linkedUserId` 未設定除外）

### 対象ファイル候補

| 種別 | パス |
|------|------|
| Flutter（店舗端末） | `lib/UserLogin/UserManualCheckInPage.dart` / `lib/UserLogin/userCheckInPage.dart`（入店完了後の通知導線） |
| 入店 Callable | `functions/src/domains/user/callables/manualCheckIn.ts` / `processVisitByQR.ts` |
| 設定参照 | Flutter: `lib/services/store_config_service.dart`。Functions: `storeMeta/config` ローダー（`configLoader`） |
| Callable（候補検索・任意） | 詳細書 §14.15.6。§25.3「候補検索 Callable の名前」未定 → **クエリのみで足りるか実装時判断** |

### 実装内容（要約）

- `loginPromptMode` を読む: **`none`** / **`notice_only`** / **`link_prompt`**。既定・不正・欠損 → **`notice_only`**
- 各 mode で **自動接続禁止**。**`notice_only`** は通知のみ。**`link_prompt`** はスタッフ操作前提の手動接続導線へ誘導（**詳細処理は Phase 4 の Callable** に集約）。
- **temporaryDisplayName / memo で自動照合しない**
- `pending_review` も案内候補に含める（`billLinkStatus != linked`）

### 実装しないこと

- logs 自動紐付け・候補の勝手選択

### データ整合・冪等性・transaction 方針

表示・誘導のみ。**書き込みは手動リンク時**。

### ログ / operationLog / logOps 方針

必要最低限。**個人情報を過剰送信しない**。

### エラー / errorKey 方針

設定読込失敗 → **フォールバック `notice_only`**

### テスト観点

mode ごとの表示、`pending_review` を含む候補検出

### 完了条件

店舗端末入店後の運用ガイダンスが仕様どおり動作

---

## 14. Phase 9: テスト・検証

### 目的

全 Phase を横断した回帰と、並行実行・analytics・rollback の確認。

### 参照仕様

- §25.4、および各章の Acceptance

### 対象ファイル候補

- `functions/__tests__/callables/`（既存パターン: `registerForTournament.spec.ts` 等）
- 統合/E2E: **プロジェクトの既存 Emulator ／ CI 構成に合わせる（要確認）**

### 実装内容

以下をテスト一覧に含める（依頼文・詳細書 §25.4 と整合）。

- `okibakeTemporaryEntries` 作成、採番、`views/main` counters、**`usersList` 非更新**
- 待機 UI 統合表示
- 席配置・Addon・Bust
- 伝票紐付け・entry / addon 後追い、bust 非反映
- **`pending_review` 化**、**`linkedUserId` 未指定終了ブロック**
- `linkedUserId` なしの unlinked 置きバケ残存時に終了処理が完了しない
- `linkedUserId` ありの unlinked 置きバケが pending_review へ遷移し、entryStatus を維持する
- 要対応会計ページで pending_review を既存 UI に合わせて表示する（専用カード新設なし）
- pending_review から来店中 bill 紐付けできる
- **来店なし入金 open → settled → linked**
- open / in_progress / settling 段階では analytics へ反映されず、settled 後に既存 `billsOnSettle` 経路へ乗る
- 同一 tournament の他 okibake で使用中の linkedUserId は create/update/picker の各段階で拒否される
- linkedUserId 設定済み entry に対象ユーザー設定/変更アクションを出さない（Functions 側でも拒否）
- 置きバケ登録時、対象ユーザーあり/なし双方で登録前確認ダイアログが表示される
- 通常参加重複防止（**voided** 後許可、**linked** / **pending_review** / **busted** 拒否）
- **誤紐付け rollback**、`settled` 後は不可
- **`loginPromptMode` 三値**、`errorKey` 表示
- **並行・二重送信・冪等性**

### 実装しないこと

- 本 Phase は**テスト・検証計画の実行とドキュメント化**を主とし、本書の他 Phase に属する**新規ビジネスロジック実装をここに載せない**。

### データ整合・冪等性・transaction 方針

並行実行テストは transaction 競合ログを確認。

### ログ / operationLog / logOps 方針

`logOps` の期待パターンをテストへ明記

### エラー / errorKey 方針

`TOURNAMENT_OKIBAKE_ALREADY_REGISTERED` の LIFF と店舗の表示差分

### テスト観点

§25.4 の一覧を網羅

### 完了条件

ステークホルダーが承認可能な証跡（テスト一覧・結果・手順書）

---

## 15. 実装しないこと

仕様および依頼文に基づき、初期スコープ**から除外するもの**として明記する。

- **置きバケを通常 `waiting` に保存しない**
- **`pendingBillCharges` は作らない**
- **`seatXXUserId` に okibakeEntryId を入れない**
- **`usersList` を置きバケ作成時に更新しない**
- **`linkedUserId` 未設定の置きバケを `temporaryDisplayName` / memo で自動照合しない**
- **ログイン時に自動接続しない**
- **通常参加と置きバケを自動統合しない**
- **`settled` 後に `okibakeTemporaryEntry` を一方的に `unlinked` に戻さない**（※会計前専用 undo は Phase 7）
- **来店なし入金の専用 rollback / 取消 / 補正を初期実装しない**
- **閉店時の pending_review 自動未会計 bill 化を初期実装しない**
- **対象ユーザー変更を初期実装しない**（未設定 entry への初回設定のみ）
- **誤設定 rollback / 誤紐付け rollback を Phase 5 に含めない**（Phase 7）
- **registerParticipants / registerForTournament の通常参加重複防止を Phase 5 に含めない**（Phase 6）
- **busted + linked のランキング / bustedUser 反映を Phase 5 に含めない**
- **次回来店時 link_prompt / LIFF 案内を Phase 5 に含めない**（Phase 8）
- **全体 UI を事前に一式固定しない**（画面は段階的に。詳細書 §25.2）
- **置きバケ一時参加者を UI 操作から `voided` に変更する処理**（将来検討。詳細は §16.6）
- **通常待機者を待機者一覧からキャンセルする専用操作**（将来検討。詳細は §16.6）

---

## 16. 未決事項・ChangeSpec / 実装時に具体化する事項

詳細仕様書 **§25** に沿って整理。**§25 の多くは「上位未決」ではなく実装粒度のチェックリスト**である。

### 16.1 詳細書 §25.1 と本 ChangeSpecでの位置づけ

```text
- 詳細仕様書 §25.1 は、**Addon 「複数回か否か」を単独の未決項目として載せない**。上限は **`addonLimitPerPlayer`** と **`isAddon`** で決まる。
```

※ **ChangeSpec で追加の製品仕様変更はしない。**

### 16.2 ChangeSpec / UI 実装時に具体化する事項（§25.2 および依頼文）

```text
- pending_review / 来店なし入金の画面細部（§15.4〜§15.7）
- 待機者一覧カードの memo 表示
- 待機者一覧 Addon 導線
- ログイン時置きバケ案内の UI（ウィジェット・文言選択）
- loginPromptMode 変更 UI の設置場所・権限
```

### 16.3 ChangeSpec / 実装設計で具体化する事項（§25.3 および依頼文）

```text
- 来店なし入金 open→settled bill 作成系の Callable 名・入力スキーマ
- **`addonLimitPerPlayer` の実装**: フィールド実名確定、template／`scheduledTournament` の migration／バックフィル、未定義読み込みフォールバック（§16.0）
- トーナメント作成時 **`addonLimitPerPlayer` をテンプレートから **`scheduledTournament` にコピー**する処理のコード箇所とテスト観点
- **`addon.ts` / `bulkAddon.ts`** の **`addonCount >= addonLimitPerPlayer`** への判定置換（および rollback・operationLog との整合）
- **`applyOkibakeAddon`** の上限判定、`isAddon:false`/`limit 0` 時のエラー種別・メッセージ
- テンプレート／開催作成 **UI** で `addonLimitPerPlayer` を入力する方式
- assertNoOkibakeBlockingRegistration（互換ヘルパー）の file レイアウト／transaction 境界
- rollback 専用 undo の正式 service / operationName / action enum
- operationLog payload の具象型（before/after/reflected〜 等）
- errorKey/details の Callable 応答および LIFF/Flutter の伝播経路
- storeMeta/config 読み込みタイミング・キャッシュ
- §14.15.6 における「候補検索」を Callable とするか Firestore 直読みに留めるか
- 権限チェック・店舗デバイス検証の共通化
```

### 16.4 テスト・検証観点（§25.4 + 本章 Phase 9）

```text
- 通常参加重複防止の統合テスト（LIFF・店舗両方、並行、voided 後許可）
- 来店なし入金の analytics / settle 経路検証
- 誤紐付け解除 rollback（addon 後追い込み済みケース、bust 非反映）
- loginPromptMode 各値の画面・遷移
```

### 16.5 後続 Phase の設計ウォッチポイント（Phase 2 実装由来）

本章は**仕様未決の記載ではなく**、Phase 2 実装時点では問題視しないものの、**後続 Phase の進展に伴い再検討が必要になり得る点**を、設計レビューのフックとして残す。

#### okibakeTemporaryEntries の取得条件

- **現状（Phase 2）**: Firestore クエリでは `entryStatus == registered` のみを指定し、`billLinkStatus == unlinked` は**クライアント側でフィルタ**している。
- **Phase 2 時点での判断**: スコープとデータ規模から**許容**としている。
- **ウォッチ**: Phase 5 付近で `pending_review` / `linked` が運用上増え、`registered` ドキュメント数が増大するタイミングで**一覧取得コスト・帯域・クライアント負荷**を再確認する。
- **再検討の例**: `billLinkStatus` をクエリ条件に組み込む、`where` と **複合インデックス**の追加、`limit`/`orderBy` とページネーションなど。

#### WaitingPlayer / 一覧行モデルの拡張方針

- **現状（Phase 2）**: `WaitingPlayer` に `isOkibakeTemporary` と `okibakeTemporary` factory を足し、通常待機者と一覧上は同一リスト型で表示している。
- **Phase 2 時点での判断**: UX・実装コストから**許容**としている。
- **ウォッチ**: Phase 3 以降で**席配置・Addon・Bust・伝票紐付け・pending_review** などが一覧・操作導線に入り、`WaitingPlayer` への分岐が増え続ける場合は、**モデル境界の見直し**を検討する。
- **再検討の例**: `WaitingListRow` のような **tagged union**、または「通常行／オキバケ行」を包む wrapper モデルへ切り出し、一覧・Callable 入力・ダイアログ間の契約を明確にする。

### 16.6 将来検討：待機者の取消・無効化

本 ChangeSpec の現在の実装順には、置きバケ一時参加者を UI 操作から `voided` に変更する処理は含めない。

`voided` は状態としては存在するが、今回の実装スコープでは、UI から `entryStatus: "voided"` へ遷移させる Callable / Flutter UI / カウンタ更新 / operationLogs までは実装しない。

将来、置きバケ一時参加者の取消・無効化を実装する場合は、Flutter から Firestore を直接更新せず、専用 Callable 経由で行う。
その際は少なくとも以下を別途設計する。

- 対象状態
  - 例: `registered` のみ対象にするか、`seated` も対象にするか
- `entryStatus` の遷移
  - 例: `registered -> voided`
- `voidedAt` / `voidedByDeviceId` 等の記録
- `views/main` のカウンタ更新
  - `waitingCount`
  - `entries`
  - `playersIn`
  - その他必要な集計値
- `operationLogs` / operationLog payload
- `logOpsSuccess` / `logOpsError`
- 既存の Addon / Bust / seat 状態との整合
- 後続 rollback / undo との関係

また、通常待機者についても、将来的に待機者一覧からキャンセルできる仕組みを実装する可能性がある。
通常待機者のキャンセルは、置きバケの `voided` とは別に、通常 waiting / seat / views/main / operationLog との整合が必要になるため、別途仕様検討対象とする。

なお、本項目は将来実装の可能性を明記するものであり、現時点で実装を確定するものではない。

---

## 17. 完了条件

プロダクトとして次を満たすこと。

1. 詳細仕様書および全体仕様書に沿った**データモデルと Callable が一通り稼働**する。
2. **実装しないこと（§15）**に反するコードが混入していないことがレビューで確認できる。
3. **Addon 許容実行回数**は詳細書 §16.0 で定義済みであり（**`addonLimitPerPlayer`** および **`isAddon`**）、コードは **`okibakeAddonRecords` の配列構造・冪等性・rollback 運用**と整合させること。
4. Phase 9 のテスト・手順が再現可能であり、Phase 順の実施記録がある。
