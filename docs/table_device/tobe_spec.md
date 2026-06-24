# 卓専用端末（role: table）To-Be 仕様書

最終更新: 2026-05-27

---

## 目次

1. [概要・目的](#1-概要目的)
2. [用語定義](#2-用語定義)
3. [Firestore データ設計変更](#3-firestore-データ設計変更)
4. [role 追加仕様](#4-role-追加仕様)
5. [ファイル構成](#5-ファイル構成)
6. [卓専用 Home 画面](#6-卓専用-home-画面)
7. [メニュー（ドロワー）](#7-メニュードロワー)
8. [登録解除フロー](#8-登録解除フロー)
9. [卓デバイスからの登録フロー（オプション機能）](#9-卓デバイスからの登録フローオプション機能)
10. [卓デバイス版 table_detail / side_game 画面](#10-卓デバイス版-table_detail--side_game-画面)
11. [既存機能の変更](#11-既存機能の変更)
12. [Cloud Functions 一覧](#12-cloud-functions-一覧)
13. [環境変数一覧](#13-環境変数一覧)
14. [進行中ステータス定義](#14-進行中ステータス定義)
15. [実装フェーズ分け](#15-実装フェーズ分け)
16. [残タスク（実装時実施）](#16-残タスク実装時実施)
17. [実装・検証ステータス](#17-実装検証ステータス)

---

## 1. 概要・目的

### 目的
- 店舗従業員（ディーラー）が操作する卓専用端末を作ることで、卓運用に不要な操作や誤操作を防ぐ
- 必要最低限の卓操作に絞ることで、卓現場で迷わず使える導線を提供する

### 基本方針
- デバイスに `role: 'table'` を追加し、起動時に卓専用ホーム画面へ遷移させる
- 卓の現在の登録状態は `tables/{tableId}` を単一参照先として管理する
- 既存の管理デバイス向け画面は変更せず、卓デバイス専用ファイルを別途作成する
- 卓デバイスからのトーナメント/サイドゲーム登録はオプション機能として実装し、`storeMeta/config` の設定値で制御する

---

## 2. 用語定義

| 用語 | 定義 |
|------|------|
| **卓デバイス** | `role: 'table'` のデバイス。本仕様の対象 |
| **管理デバイス** | `role: 'admin'` または `role: 'terminal'` のデバイス |
| **進行中ゲーム** | 当該卓が現在参加しているトーナメントまたはサイドゲーム |
| **登録** | 卓をトーナメントまたはサイドゲームに紐付ける操作 |
| **登録解除** | 卓をトーナメントまたはサイドゲームから取り外す操作 |
| **論理削除** | ドキュメントを物理削除せず `isEnabled: false` で無効化すること |
| **強制クリア** | 着席者が残っている状態でパスコードを入力して登録解除を行う操作 |

---

## 3. Firestore データ設計変更

### 3-1. `tables` コレクション：フィールド追加

既存フィールドに加えて `tournamentDetail` を追加する。

```
tables/{tableId}
  ├── createdAt: Timestamp           （既存）
  ├── isEnabled: boolean             （既存）
  ├── maxSeats: number               （既存）
  ├── name: string                   （既存）
  ├── status: string                 （既存）  'open' | 'tournament' | <sideGameTypes のゲーム名>
  ├── updatedAt: Timestamp           （既存）
  └── tournamentDetail: Map | null   （新規追加）
        ├── tournamentId: string       // scheduledTournaments の docId
        ├── tournamentName: string     // scheduledTournaments.snapshot.name
        └── startAt: Timestamp         // scheduledTournaments.startAt
```

**設計方針:**
- `tournamentDetail` は「当該卓が現在もトーナメント登録を保持している場合」に値を持つ
- `status == 'tournament'` の通常時に加え、トーナメント登録を保持したままサイドゲーム運用中の間も `tournamentDetail` を保持してよい
- サイドゲームは `tables.status` が `storeMeta/config.sideGameTypes` のいずれかで、かつ `sideGame/{tableId}.active == true` の場合に進行中と判定する
- `tables/{tableId}` を起点に卓デバイスの遷移先を判断し、必要に応じて `scheduledTournaments` / `sideGame` を補助参照する
- トーナメント登録が完全に解除された時点で `tournamentDetail` をクリアする

### 3-2. `tables/{tableId}.status` の状態遷移

| 状態 | `status` 値 | `tournamentDetail` |
|------|------------|-------------------|
| 空き | `'open'` | `null` または未存在 |
| トーナメント登録中 | `'tournament'` | 値あり |
| サイドゲーム登録中（トーナメント未登録） | `sideGameTypes` のいずれか（例: `'ブラックジャック'`） | `null` または未存在 |
| サイドゲーム登録中（トーナメント登録保持あり） | `sideGameTypes` のいずれか（例: `'ブラックジャック'`） | 値あり |

**補足:**
- `status == 'sideGame'` という固定値は使用しない
- サイドゲーム名の候補は `storeMeta/config.sideGameTypes` を唯一の定義元とする

### 3-3. `scheduledTournaments/{id}/tablesSeat/{tableId}` の変更

`isEnabled` フィールドを**論理削除フラグ**として使用する。

```
tablesSeat/{tableId}
  ├── maxSeats: number
  ├── seats: Map
  ├── isEnabled: boolean   // true = 登録有効, false = 論理削除（登録解除済み）
  ├── createdAt: Timestamp
  └── updatedAt: Timestamp
```

**変更点:**
- 既存の物理削除（`delete()`）を論理削除（`update({ isEnabled: false })`）に変更
- 再登録時は同一ドキュメントが `isEnabled: false` で存在する場合、`isEnabled: true` に更新して再利用（重複ドキュメント防止）
- `isEnabled: false` の卓は卓一覧・座席操作の対象外とする

---

## 4. role 追加仕様

### 4-1. 卓デバイスの卓 ID 保持（devices コレクション）

`role: 'table'` のデバイスは、紐づく卓 ID を `devices` コレクション内の `optionParams` で保持する。

- **格納キー**: `DeviceOptionKeys.tableDeviceTable`（例: `'table_device_table'`）
- **格納形式**: `optionParams['table_device_table'] = { tableId: "T1" }`
- **取得**: 既存の `Device.getTableIdForOption(DeviceOptionKeys.tableDeviceTable)` で取得
- **`lib/services/device_options.dart`**: `tableDeviceTable` 定数を追加し、labels / descriptions に文言を定義
- 同一卓に複数の `role: 'table'` デバイスを紐付けることを許容する（1卓:多端末を許容）

### 4-2. Flutter 側変更

| ファイル | 変更内容 |
|----------|----------|
| `lib/models/device.dart` | `DeviceRole` enum に `table('table')` を追加 |
| `lib/main.dart` | `device.role == 'table'` の分岐を追加し `TableDedicatedHomePage` へ遷移 |
| `lib/services/device_service.dart` | `isTableDevice()` メソッドを追加（`role == 'table'`）。`getTableIdForTableDevice()` または `getTableIdForOption(DeviceOptionKeys.tableDeviceTable)` で卓 ID 取得 |
| `lib/services/device_options.dart` | `tableDeviceTable` 定数と labels / descriptions を追加 |
| `lib/pages/device_management_page.dart` | 4-3 の仕様に従い変更 |
| `lib/pages/device_registration_page.dart` | `role` 選択肢に `'table'` を追加。登録直後は `table` ロール用の遷移判定を行う |

### 4-3. デバイス管理画面のオプション編集（role 別挙動）

登録（選択）された role に応じて、オプション編集ボタンの有効/無効と押下時の内容を変える。

| role | オプション編集ボタン | 押下時の内容 |
|------|---------------------|-------------|
| **admin** | 無効化（グレーアウト） | — |
| **terminal** | 有効（現状どおり） | 既存のオプション編集ダイアログ（チェックボックス＋卓紐づけ等） |
| **table** | 有効 | 卓紐づけ編集ダイアログ（4-4 参照） |

### 4-4. role: table 時の卓紐づけ編集ダイアログ

オプション編集ボタン押下時に表示する内容:

1. **卓選択**
   - `tables` コレクションを参照し、`isEnabled: true` の卓のみ選択可能とする
   - ドロップダウンまたはリストで選択
   - 「指定なし」は選択不可（卓デバイスは必ず 1 卓に紐づく）

2. **現在の紐づけ表示**
   - terminal の「付与済みオプション」と同様に、現状どの卓に紐づいているかを表示する
   - 例: 「紐づけ卓: TableA」または未設定時は「未設定」
   - 他端末の紐づけ状況は表示しない（自デバイスのみ）

3. **保存**
   - 選択した卓 ID を `optionParams[DeviceOptionKeys.tableDeviceTable] = { tableId: selectedTableId }` として保存
   - 既存の `updateDeviceOptions` を呼び出す（Cloud Functions 側で `table_device_table` を許容するよう必要に応じて修正）
   - 同一卓への複数 `table` デバイス紐付けは許容するため、`table_device_table` については同卓重複チェックを行わない

### 4-5. Cloud Functions 側変更

| ファイル | 変更内容 |
|----------|----------|
| `functions/src/shared/devices/callables/registerDevice.ts` | `role` の zod スキーマに `'table'` を追加 |
| `functions/src/shared/devices/callables/updateDeviceRole.ts` | スキーマに `'table'` を追加。`table` ロール変更時は `options: {}`, `optionParams: {}` で初期化（卓紐づけはオプション編集画面で別途設定） |
| `functions/.../updateDeviceOptions.ts` | `optionParams` のキーに `table_device_table` を許容（role: table 時の卓紐づけ保存）。`role: table` 時は `options` 空 + `table_device_table` のみを扱う前提に寄せる |

---

## 5. ファイル構成

### 5-1. Flutter（Dart）

```
lib/
  tableDevice/
    pages/
      table_device_home_page.dart           // 卓専用 Home 画面
      table_device_table_detail_page.dart   // table_detail_page.dart の卓デバイス版
      table_device_side_game_page.dart      // side_game_table_home.dart の卓デバイス版
    widgets/
      table_device_drawer.dart              // ≡ メニュー（ドロワー）
    services/
      table_device_service.dart             // 卓状態取得・登録・解除のロジック
```

### 5-2. Cloud Functions（TypeScript）

```
functions/src/
  table_device/
    callables/
      registerTableToTournament.ts          // 卓デバイスからのトーナメント登録
      unregisterTableFromTournament.ts      // 卓デバイスからのトーナメント登録解除
      registerTableToSideGame.ts            // 卓デバイスからのサイドゲーム登録
      unregisterTableFromSideGame.ts        // 卓デバイスからのサイドゲーム登録解除
    index.ts
```

---

## 6. 卓専用 Home 画面

### 6-1. 起動フロー

```
アプリ起動
  ↓
AppInitializer（main.dart）
  ↓ device.role == 'table'
  ↓ device.getTableIdForOption(DeviceOptionKeys.tableDeviceTable) で tableId を取得
  ↓ tableId が null の場合は専用案内を表示
     「管理者に報告して、adminデバイスからテーブルの紐付けを行う。もしくはroleを変更してください。」
TableDedicatedHomePage(tableId: tableId) へ遷移
  ↓
物理戻るボタン: 無効化（WillPopScope / PopScope）
```

**tableId の取得元**: `devices` コレクションの `optionParams.table_device_table.tableId`（4-1 参照）

### 6-2. 画面レイアウト

```
┌──────────────────────────────────────────────────────────────┐
│  ≡  [卓名（例: TableA）]                [storeMeta 日付表示]  │  ← AppBar
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────┐  ┌─────────────────────┐  │
│  │                              │  │                     │  │
│  │   【進行中ゲームエリア】        │  │  【サブエリア】       │  │
│  │   縦: 画面高さの 50%          │  │  縦: 画面高さの 50%  │  │
│  │   横: 画面幅の 60%           │  │  横: 画面幅の 40%   │  │
│  │   左上固定                   │  │  右側               │  │
│  │                              │  │                     │  │
│  │   ← タップで進行中画面へ →   │  │  （登録ボタン等）    │  │
│  │                              │  │                     │  │
│  └──────────────────────────────┘  └─────────────────────┘  │
│                                                              │
│  （下部 残りスペース）                                         │
└──────────────────────────────────────────────────────────────┘
```

### 6-3. 進行中ゲームエリアの状態別表示

データ取得元: `tables/{tableId}` をリアルタイムリスン（StreamBuilder）

| 状態 | 表示内容 | タップ動作 |
|------|----------|-----------|
| **トーナメント進行中**（`tables.status == 'tournament'` かつ `scheduledTournaments.status == running / registered / paused`） | 「トーナメント」アイコン＋トーナメント名＋「進行中」バッジ | `TableDeviceTableDetailPage` へ遷移 |
| **トーナメント開始前**（`tables.status == 'tournament'` かつ `scheduledTournaments.status == scheduled`、businessDate が当日） | 「トーナメント」アイコン＋トーナメント名＋「開始前」バッジ（グレー） | `TableDeviceTableDetailPage` へ遷移（着席者なしの状態で表示） |
| **サイドゲーム進行中**（`tables.status ∈ sideGameTypes`、`sideGame.active == true`） | 「サイドゲーム」アイコン＋ゲーム名＋「進行中」バッジ。`tournamentDetail` がある場合は「終了後に [トーナメント名] へ戻る」を併記 | `TableDeviceSideGamePage` へ遷移 |
| **異常系: 状態不整合**（後述） | 警告アイコン＋「卓データの整合が取れていません」 | タップで詳細メッセージを表示 |
| **進行中なし** | 「現在進行中のゲームはありません」（グレーテキスト） | タップ無効 |

### 6-4. 進行中判定ロジック

`table_device_service.dart` の `watchTableStatus(tableId)` が StreamBuilder でリアルタイム取得する。

```
tables/{tableId} を取得:

  status == 'tournament' && tournamentDetail != null
    → scheduledTournaments/{tournamentId}.status を確認
      - running / registered / paused → 「進行中」
      - scheduled かつ businessDate == currentBusinessDateKey → 「開始前」
      - ended / cancelled → 異常（tables のクリーンアップ漏れ）→「進行中なし」として扱う

  status ∈ sideGameTypes
    → sideGame/{tableId}.active を確認
      - true  → 「サイドゲーム進行中」
                 tournamentDetail != null の場合は
                 「トーナメント登録保持中（終了後に復帰）」として扱う
      - false → 異常（tables のクリーンアップ漏れ）→「進行中なし」として扱う

  status == 'open' または undefined
    → 「進行中なし」
```

### 6-5. 異常系：`tables.status` / `tournamentDetail` / `sideGame.active` の不整合

```
警告ダイアログ:
「卓データの整合が取れていません。管理者に連絡してください。」

例:
- status == 'tournament' なのに tournamentDetail がない
- status ∈ sideGameTypes なのに sideGame.active != true
- status == 'open' なのに tournamentDetail が残っている
```

### 6-6. 「進行中なし」時の登録ボタン（storeMeta/config 制御）

`storeMeta/config.features.tableDeviceRegistrationEnabled == true` のときのみ表示。

| ボタン | 表示条件 | 動作 |
|--------|----------|------|
| 「トーナメントに登録」 | `status == 'open'` | 登録可能なトーナメント一覧を表示（第9節参照） |
| 「サイドゲームに登録」 | `status == 'open'` | サイドゲーム登録確認ダイアログを表示（第9節参照） |

設定値が `false` の場合はボタンを非表示とする（UI からの操作を完全に無効化）。

---

## 7. メニュー（ドロワー）

AppBar 左の「≡」ボタンで開く。

### 7-1. メニュー項目

| メニュー項目 | 表示条件 | 動作 |
|-------------|----------|------|
| **卓ホームに戻る** | 常に表示 | `TableDedicatedHomePage` にリセット遷移（スタックを全クリア） |
| **トーナメントから登録解除** | 現在判定がトーナメント状態のとき表示 | 第8節の登録解除フローへ |
| **サイドゲームから登録解除** | 現在判定がサイドゲーム状態のとき表示 | 第8節の登録解除フローへ |

### 7-2. ドロワーの適用範囲

- `TableDedicatedHomePage`、`TableDeviceTableDetailPage`、`TableDeviceSideGamePage` の全画面で同一ドロワー（`TableDeviceDrawer`）を使用する
- ドロワー内の「登録解除」メニューは各画面からでも実行可能とする
- ドロワーは `tables/{tableId}` をリアルタイムリスンし、現在の `status` に応じて項目を動的に切り替える

---

## 8. 登録解除フロー

### 8-1. トーナメント登録解除

```
1. [前提チェック]
   tables/{tableId}.status == 'tournament' であること

2. [着席者チェック]
   scheduledTournaments/{tournamentId}/tablesSeat/{tableId}/seats
   の全 seatXXUserId フィールドが null または空文字列
   ├── 全て空 → ステップ4へ
   └── 1つでも非null → ステップ3（強制クリア確認）へ

3. [強制クリア確認]（着席者ありの場合）
   「着席者が {N} 名います。強制的に解除しますか？」
   ├── キャンセル → 処理中断
   └── OK → パスコード入力画面（4桁数字）
     ├── 正解（`storeMeta/config.tableDevice.forceClearPasscode`、デフォルト `'0000'`）→ ステップ4へ
     └── 不正解 → 「パスコードが違います」表示、再入力可能

4. [Cloud Function 呼び出し: unregisterTableFromTournament]
   引数: { tableId, tournamentId }
   処理:
     A. scheduledTournaments/{tournamentId}/tablesSeat/{tableId}
        → isEnabled: false, updatedAt: serverTimestamp()
     B. tables/{tableId}
        → status: 'open', tournamentDetail: FieldValue.delete(), updatedAt: serverTimestamp()

5. [完了]
   TableDedicatedHomePage にリセット遷移
```

### 8-2. サイドゲーム登録解除（終了処理）

```
1. [前提チェック]
   tables/{tableId}.status が `sideGameTypes` のいずれかであり、
   sideGame/{tableId}.active == true であること

2. [着席者チェック]
   sideGame/{tableId}/seats の全 seatXXUserId が null または空文字列
   ├── 全て空 → ステップ4へ
   └── 1つでも非null → ステップ3（強制クリア確認）へ

3. [強制クリア確認]（着席者ありの場合）
   「着席者が {N} 名います。強制的に解除しますか？」
   ├── キャンセル → 処理中断
   └── OK → パスコード入力画面（4桁数字）
     ├── 正解 → ステップ4へ
     └── 不正解 → 「パスコードが違います」表示、再入力可能

4. [Cloud Function 呼び出し: unregisterTableFromSideGame]
   引数: { tableId }
   処理:
     A. sideGame/{tableId}
        → active: false, 全 seats を null クリア, updatedAt: serverTimestamp()
     B. tables/{tableId}
        ├── tournamentDetail が存在する場合
        │   → status: 'tournament', tournamentDetail は保持, updatedAt: serverTimestamp()
        └── tournamentDetail が存在しない場合
            → status: 'open', updatedAt: serverTimestamp()

5. [完了]
   TableDedicatedHomePage にリセット遷移
```

### 8-3. 強制クリア パスコード仕様

- 4桁数字
- 正しいパスコードは `storeMeta/config.tableDevice.forceClearPasscode` で設定する（デフォルト: `'0000'`）
- 本値は**セキュリティの厳密担保ではなく、誤操作防止**を目的とする
- そのため client から参照可能な `storeMeta/config` に配置する運用を許容する
- アプリ UI からの変更は不可
- セキュリティの担保は「従業員のみが卓デバイスを操作できる」という物理的制限による
- 入力誤りに対して試行回数制限は設けない（ロックアウトなし）

---

## 9. 卓デバイスからの登録フロー（オプション機能）

`storeMeta/config.features.tableDeviceRegistrationEnabled == true` のときのみ有効。

### 9-1. トーナメント登録

**登録可能条件:**

| 条件 | 内容 |
|------|------|
| `businessDate` | `storeMeta/currentBusinessDay.currentBusinessDateKey` と一致する |
| `status` | `'scheduled'` / `'running'` / `'registered'` / `'paused'` のいずれか |
| `startAt` | 設定されていること |
| 重複登録チェック | 対象トーナメントの `tablesSeat/{tableId}` が `isEnabled: true` で存在する場合は選択不可 |

**前提:**
- 操作対象の `tableId` は `devices.optionParams.table_device_table.tableId` から取得し、卓デバイス側 UI で他卓を選ばせない

**競合エラーメッセージ:**

| ケース | 表示メッセージ |
|--------|--------------|
| 他のトーナメントに登録済み | 「既に [XX トーナメント] に登録されています。先に登録解除を行ってください。」 |
| サイドゲームに登録済み | 「既にサイドゲームに登録されています。先に登録解除を行ってください。」 |

**登録フロー（Cloud Function: registerTableToTournament）:**

```
引数: { tableId, tournamentId }

1. tables/{tableId}.status == 'open' を確認（競合チェック）
   → 'open' でない場合はエラー（上記エラーメッセージを返す）

2. tables/{tableId} と scheduledTournaments/{tournamentId} を取得
   → maxSeats, tournamentName, startAt は server 側で確定する

3. scheduledTournaments/{tournamentId}/tablesSeat/{tableId} の存在確認
   ├── isEnabled: false で存在 → isEnabled: true, seats をリセット, updatedAt 更新（再利用）
   └── 存在しない → 新規作成（isEnabled: true, seats, maxSeats, createdAt, updatedAt）

4. tables/{tableId} を更新
   → status: 'tournament'
   → tournamentDetail: { tournamentId, tournamentName, startAt }
   → updatedAt: serverTimestamp()

5. 成功 → { success: true } を返す
```

**権限チェック（Cloud Functions）:**

```
呼び出し元デバイスの role == 'table' または role == 'admin' であること
（通常利用は `table` ロール。`admin` は保守・検証用途として許容）
```

### 9-2. サイドゲーム登録

**登録可能条件:**

| 条件 | 内容 |
|------|------|
| 空き卓 | `tables/{tableId}.status == 'open'` の場合はそのまま開始可能 |
| トーナメント登録のみ | `tables/{tableId}.status == 'tournament'` かつ当該卓に着席者がいない場合は、警告表示後に開始可能 |
| トーナメント着席中 | 当該卓がトーナメントで着席中の場合は開始不可 |
| サイドゲーム進行中 | `tables.status ∈ sideGameTypes` かつ `sideGame.active == true` の場合は既存ゲーム画面へ遷移 |
| その他利用中 | `tables.status` が上記以外の使用中状態なら、警告表示後に開始可能 |

**競合エラーメッセージ:**

| ケース | 表示メッセージ |
|--------|--------------|
| トーナメント着席中 | 「トーナメントで着席中のため、この卓でサイドゲームを開始できません」 |
| トーナメント登録のみ | 「トーナメント登録中ですが使用しますか？ サイドゲーム終了後に登録されたトーナメントにて使用可能になります。」 |
| 他用途で使用中 | 「この卓は現在他の用途で使用中ですが、サイドゲームを開始しますか？」 |

**登録フロー（Cloud Function: registerTableToSideGame）:**

```
引数: { tableId, gameName }

1. tables/{tableId} と sideGame/{tableId} を確認
   ├── トーナメント着席中 → エラー
   ├── サイドゲーム進行中 → 既存ゲーム画面へ誘導
   ├── トーナメント登録のみ / 他用途で使用中 → UI で確認済みであれば続行
   └── 空き卓 → 続行

2. sideGame/{tableId} を upsert
   → active: true
   → gameName: request.gameName
   → テーブル名、maxSeats を tables/{tableId} から取得してセット
   → seats は開始時に空状態へリセットする
   → updatedAt: serverTimestamp()

3. tables/{tableId} を更新
   → status: gameName
   → tournamentDetail は、元々保持している場合はそのまま残す
   → updatedAt: serverTimestamp()

4. 成功 → { success: true } を返す
```

**権限チェック（Cloud Functions）:**

```
呼び出し元デバイスの role == 'table' または role == 'admin' であること
（通常利用は `table` ロール。`admin` は保守・検証用途として許容）
```

---

## 10. 卓デバイス版 table_detail / side_game 画面

### 10-1. 方針

既存ファイルは変更せず、卓デバイス専用の別ファイルを作成する。

| 既存ファイル | 卓デバイス版 |
|-------------|-------------|
| `lib/tournament/active/pages/table_detail_page.dart` | `lib/tableDevice/pages/table_device_table_detail_page.dart` |
| `lib/sideGame/pages/side_game_table_home.dart` | `lib/tableDevice/pages/table_device_side_game_page.dart` |

### 10-2. 卓デバイス版との差異（管理版との比較）

| 項目 | 既存（管理版） | 卓デバイス版 |
|------|-------------|------------|
| AppBar 戻るボタン | 表示・有効 | 非表示・無効（`automaticallyImplyLeading: false`） |
| AppBar 左ボタン | なし or デフォルト戻る | 「≡」メニューボタン（`TableDeviceDrawer` を開く） |
| `StoreStrongWarningWrapper` の遷移先 | `terminalHomePage` | `TableDedicatedHomePage` |
| 物理戻るボタン | 有効 | 無効化（`WillPopScope` / `PopScope`） |

### 10-3. 共通部分の扱い

- UI ロジック（座席表示、ストリーム購読、ダイアログ等）は既存ファイルから**コピーして流用**する
- 意図的な差異（AppBar、遷移先）以外は既存ファイルと同一の実装を維持する
- `side_game_table_home.dart` に残っているデバッグ用 UI（例: ドキュメント手動作成、デバッグ実行）は卓デバイス版では表示しない
- 将来的に既存ファイルを改修した場合は、卓デバイス版にも同様の変更を反映する（メンテナンスコストとして許容）

---

## 11. 既存機能の変更

### 11-1. `addTableToTournament.ts`：2 つの変更

**変更①：`isEnabled: false` ドキュメントの再利用**

```typescript
// 変更前: 常に transaction.set() で新規作成
// 変更後: 既存ドキュメントの isEnabled チェックを追加

const existingDoc = await transaction.get(tournamentTableRef);

if (existingDoc.exists && existingDoc.data()?.isEnabled === false) {
  // 論理削除済みドキュメントを復活（同一 tableId の重複防止）
  transaction.update(tournamentTableRef, {
    maxSeats,
    seats,
    isEnabled: true,
    updatedAt: FieldValue.serverTimestamp(),
  });
} else if (!existingDoc.exists) {
  // 新規作成（既存処理）
  transaction.set(tournamentTableRef, {
    maxSeats,
    seats,
    isEnabled: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
} else {
  // isEnabled: true で既存 → 重複登録エラー
  throw new Error('この卓は既にこのトーナメントに登録されています');
}
```

**変更②：`tables/{tableId}` に `tournamentDetail` を追加書き込み**

```typescript
// scheduledTournaments/{tournamentId} を追加取得（トランザクション内）
const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
const tournamentDoc = await transaction.get(tournamentRef);
const tournamentData = tournamentDoc.data();
const tournamentName = tournamentData?.snapshot?.name ?? '';
const startAt = tournamentData?.startAt ?? null;

// tables/{tableId} 更新に tournamentDetail を追加
transaction.update(tableRef, {
  status: 'tournament',
  tournamentDetail: {
    tournamentId,
    tournamentName,
    startAt,
  },
  updatedAt: FieldValue.serverTimestamp(),
});
```

### 11-2. `removeTableFromTournament.ts`：物理削除 → 論理削除

**変更前:**
```typescript
transaction.delete(tournamentTableRef);  // 物理削除
transaction.update(tableRef, { status: 'open', updatedAt: ... });
```

**変更後:**
```typescript
// 論理削除
transaction.update(tournamentTableRef, {
  isEnabled: false,
  updatedAt: FieldValue.serverTimestamp(),
});
// tables/{tableId} の tournamentDetail もクリア
transaction.update(tableRef, {
  status: 'open',
  tournamentDetail: FieldValue.delete(),
  updatedAt: FieldValue.serverTimestamp(),
});
```

### 11-3. `tournament_home_page.dart`：卓一覧の表示（確認）

`TournamentDataService.getTournamentTables()` にて既に `isEnabled: true` のみを取得する実装になっている（`tournament_data_service.dart` 22行目）。論理削除対応後も追加変更なしで動作する。

### 11-4. `remove_table_dialog.dart`：論理削除に対応

- **Cloud Function 側**: 上記 11-2 の変更後 CF に差し替える
- **Flutter 側**: `_loadEmptyTables` に `data['isEnabled'] == true` のフィルタを追加する。論理削除済み（`isEnabled: false`）の卓を削除リストに表示しないため

### 11-5. `endTournament`（既存 CF）：`tournamentDetail` クリア追加

トーナメント終了時に `tables` コレクションのクリーンアップを行う。既存の `transaction.update(tableRef, { status: 'open' })` に `tournamentDetail: FieldValue.delete()` と `updatedAt` を追加する。

```typescript
// 終了処理の一環として、このトーナメントに登録されていた全卓を更新
// （既存の transaction 内ループで、tableRef に対する update に以下を追加）
transaction.update(tableRef, {
  status: 'open',
  tournamentDetail: FieldValue.delete(),
  updatedAt: FieldValue.serverTimestamp(),
});
```

### 11-6. `table_select_page.dart`：論理削除卓の非表示

`TableSelectPage` で、`tablesSeat` から卓一覧を取得する際に `data['isEnabled'] == true` のフィルタを追加する。論理削除済みの卓は卓選択リストに表示しない。

### 11-7. `tournament_select_page.dart`：device 卓絞り込み時の論理削除対応

`TournamentSelectPage` が device に紐づいた卓でトーナメントを絞り込む際、`tablesSeat/{tableId}` の doc が**存在するだけ**ではなく `isEnabled == true` であることを確認する。論理削除済みの卓登録を、卓デバイス候補として扱わないため。

### 11-8. `storeMeta/config`：卓デバイス設定の追加整理

- `features.tableDeviceRegistrationEnabled` は既存どおり使用する
- `tableDevice.forceClearPasscode` を新規追加する
- `lib/services/store_config_service.dart`、`functions/src/shared/config/types.ts`、`functions/src/shared/config/defaults.ts` に同項目を反映する

---

## 12. Cloud Functions 一覧

### 12-1. 新規作成（卓デバイス専用）

| 関数名 | 配置先 | 役割 |
|--------|--------|------|
| `registerTableToTournament` | `table_device/callables/` | 卓デバイスからのトーナメント登録 |
| `unregisterTableFromTournament` | `table_device/callables/` | 卓デバイスからのトーナメント登録解除 |
| `registerTableToSideGame` | `table_device/callables/` | 卓デバイスからのサイドゲーム登録 |
| `unregisterTableFromSideGame` | `table_device/callables/` | 卓デバイスからのサイドゲーム登録解除 |

**共通権限チェック（上記全て）:**
- 認証済みであること（`request.auth` あり）
- 呼び出し元デバイスの `role == 'table'` または `role == 'admin'` であること
- デバイスの `status == 'active'` であること

### 12-2. 変更対象（既存）

| 関数名 | 変更内容 |
|--------|----------|
| `addTableToTournament` | `isEnabled: false` 再利用処理の追加、`tournamentDetail` 書き込みの追加 |
| `removeTableFromTournament` | 物理削除 → 論理削除への変更、`tournamentDetail` クリアの追加 |
| `endTournament` | 終了時の `tables` コレクションの `tournamentDetail` クリアの追加 |
| `registerDevice` | `role` スキーマに `'table'` を追加 |
| `updateDeviceRole` | スキーマに `'table'` を追加、`table` 時の options/optionParams 初期化 |
| `updateDeviceOptions` | `optionParams` のキーに `table_device_table` を許容（role: table の卓紐づけ保存） |

---

## 13. `storeMeta/config` 設定一覧

| パス | 型 | 説明 | デフォルト値 | 備考 |
|------|----|------|-------------|------|
| `features.tableDeviceRegistrationEnabled` | `boolean` | 卓デバイスからのトーナメント / サイドゲーム登録 UI の ON/OFF | `true` | 既存スキーマあり |
| `tableDevice.forceClearPasscode` | `string`（4桁数字） | 強制クリア時のパスコード | `'0000'` | 新規追加。誤操作防止用途 |

**Flutter / Functions 側での読み取り方針:**

```text
Flutter:
- registrationEnabled = storeConfig.features.tableDeviceRegistrationEnabled
- forceClearPasscode = storeConfig.tableDevice.forceClearPasscode

Functions:
- 同じ storeMeta/config を参照し、必要に応じて整合確認に利用する
```

---

## 14. 進行中ステータス定義

### トーナメントの「進行中」に含む status

| `scheduledTournaments.status` | 卓での扱い | 条件 |
|-------------------------------|-----------|------|
| `running` | 進行中（通常） | 無条件 |
| `registered` | 進行中（通常） | 無条件 |
| `paused` | 進行中（一時停止中） | 無条件 |
| `scheduled` | 開始前（進行中として表示・遷移先あり） | businessDate == currentBusinessDateKey かつ卓が登録済み |
| `ended` | 進行中なし（異常）| tables のクリーンアップ漏れとして扱う |
| `cancelled` | 進行中なし（異常）| 同上 |

### 「開始前」表示について

`scheduled` ステータスの場合、卓デバイスホームの進行中エリアに下記を表示する。
- トーナメント名 + 「開始前」バッジ（グレー）
- タップで `TableDeviceTableDetailPage` に遷移する（着席者 0 の状態で表示される）

### サイドゲームの「進行中」に含む status

| `tables.status` | 卓での扱い | 条件 |
|-----------------|-----------|------|
| `sideGameTypes` のいずれか | サイドゲーム進行中 | `sideGame/{tableId}.active == true` |
| `sideGameTypes` のいずれか + `tournamentDetail` 値あり | サイドゲーム進行中（終了後にトーナメントへ復帰） | `sideGame/{tableId}.active == true` |
| `open` | 進行中なし | 無条件 |

---

## 15. 実装フェーズ分け

### Phase 1: 基盤整備（他 Phase の前提）

- Firestore `tables` コレクションへの `tournamentDetail` フィールド追加
- `scheduledTournaments/tablesSeat` の論理削除対応（`isEnabled: false`）
- 既存 CF の変更（`addTableToTournament`、`removeTableFromTournament`、`endTournament`）
- `role: 'table'` の追加（Flutter モデル・CF スキーマ）
- `device_registration_page.dart` で `table` ロールを選択可能にする
- デバイス管理画面の role 別オプション編集挙動（4-3, 4-4）
- `device_options.dart` に `tableDeviceTable` 追加
- `updateDeviceOptions` で `table_device_table` 許容
- `storeMeta/config.tableDevice.forceClearPasscode` のスキーマ / defaults / Flutter パース追加

### Phase 2: 卓専用ホーム画面

- `TableDedicatedHomePage` の実装
- `TableDeviceDrawer` の実装
- `main.dart` のルーティング追加

### Phase 3: 卓デバイス版ゲーム画面

- `TableDeviceTableDetailPage` の実装（`table_detail_page.dart` をベースに差分適用）
- `TableDeviceSideGamePage` の実装（`side_game_table_home.dart` をベースに差分適用）
- 登録解除フローの実装（CF: `unregisterTableFromTournament`、`unregisterTableFromSideGame`）

### Phase 4: 卓デバイスからの登録（オプション機能）

- CF: `registerTableToTournament`、`registerTableToSideGame` の実装
- Flutter 側の登録 UI 実装
- `storeMeta/config.features.tableDeviceRegistrationEnabled` によるオン/オフ制御の実装

---

## 16. 残タスク（実装時実施）

本機能は現時点で設計段階であり、`tableDeviceRegistrationEnabled` のスキーマ定義のみ既存 config に存在する。`forceClearPasscode` を含む卓デバイス固有設定は、実装時に追加すること。

| # | 残タスク | 対象ドキュメント | 内容 |
|---|----------|------------------|------|
| 1 | **取得失敗時の挙動設計の記載** | `docs/運用時資料/設定/取得失敗時の挙動設計.md` | `tableDeviceRegistrationEnabled`（B-06）の行を「設定ごとの記載」テーブルに追加する。記載内容: 読めるがフィールド未存在時はデフォルト適用（必須。`true`）、読めない時は A. デフォルトを正とする。他 features フラグと同様。 |
| 2 | **設定の不具合時の対応の記載** | `docs/運用時資料/設定/設定の不具合時の対応.md` | `tableDeviceRegistrationEnabled` の行を「設定ごとの記載」テーブルに追加する。記載内容: 想定パターン A〜D、対応フローは他 boolean フラグと同様（リトライ→エラーコード→必要時コードデプロイ）。 |
| 3 | **`forceClearPasscode` の設定詳細追加** | `docs/運用時資料/設定/storeMeta/configによる設定の詳細/` | `tableDevice.forceClearPasscode` の用途、デフォルト値、誤操作防止用途であることを追記する。 |
| 4 | **`forceClearPasscode` の取得失敗 / 不具合時対応整理** | `docs/運用時資料/設定/取得失敗時の挙動設計.md` / `docs/運用時資料/設定/設定の不具合時の対応.md` | `tableDevice.forceClearPasscode` のデフォルト値 (`'0000'`) と、読めない場合のフォールバック方針を追加する。 |

※ Phase2 config 移行検証（Z_crossCutting）で検出。B-06 はスキーマ定義のみのため実装時に対応する。

---

## 17. 実装・検証ステータス

**ステータス: 実装完了・実機確認済（2026-05-27）**

### 17-1. Phase 完了状況

| Phase | 内容 | 状態 |
|-------|------|------|
| Phase 1 | 基盤（role / config / 論理削除 / 既存 CF 更新） | ✅ |
| Phase 2 | 卓専用 Home / Drawer | ✅ |
| Phase 3 | 卓デバイス版 TN/SG 画面・登録解除 | ✅ |
| Phase 4 | 卓からの登録（オプション） | ✅ |
| 本番化 | Firestore rules + SG 直接 write の CF 化 | ✅ |
| 追補 | 卓ページ TN/SG/置きバケの `role: table` 権限 | ✅ |

### 17-2. Cloud Functions（追加分・本番化関連）

| 関数名 | 配置 | 備考 |
|--------|------|------|
| `endSideGameSession` | `table_device/callables/` | terminal SG 終了 |
| `changeSideGameTableGameName` | `table_device/callables/` | ゲーム名変更 |
| — | `sideGame/lib/sideGameOperationPermission.ts` | `registerForSideGame` 等の table 権限 |
| — | `tournament_activeTournament/lib/okibakeTableDevicePermission.ts` | 着席済み置きバケ操作 |

卓ページ TN 操作（`addon` / `bulkAddon` / `bustAnd*` / `assignSeat*` / `placeOrder`）も `role: table` 対応済み。詳細は [A-1 詳細_コード確認.md](../残タスク_0623/カテゴリA_システム構築/A-1_テーブルデバイス挙動確認/詳細_コード確認.md)。

### 17-3. `storeMeta/config` 追加分（実装済み）

| パス | 型 | 説明 | デフォルト |
|------|----|------|-----------|
| `tableDevice.tournamentSeatAssignmentEnabled` | `boolean` | 卓端末からの空席着席 | `false` |
| `tableDevice.actionHistoryViewEnabled` | `boolean` | 操作履歴参照 | `true` |
| `tableDevice.actionHistoryRollbackEnabled` | `boolean` | 操作履歴取り消し | `false` |

### 17-4. 検証

- **実機確認:** A-1 シナリオ 3 項目 — 問題なし
- **単体テスト:** `test/table_device/`、`functions/__tests__/callables/tableDeviceTournamentActions.spec.ts`、`functions/__tests__/logs/tableDeviceActionHistory.spec.ts` 等
- **残:** §16 の運用時資料更新

---

## 付録：関連ファイル一覧（既存）

| ファイル | 役割 | 変更有無 |
|----------|------|---------|
| `lib/main.dart` | アプリ起動・ルーティング | **変更あり**（table 分岐追加） |
| `lib/models/device.dart` | デバイスモデル | **変更あり**（table role 追加） |
| `lib/services/device_service.dart` | デバイスサービス | **変更あり**（isTableDevice() 追加） |
| `lib/services/device_options.dart` | オプションキー定義 | **変更あり**（tableDeviceTable 追加） |
| `lib/pages/device_management_page.dart` | デバイス管理画面 | **変更あり**（4-3, 4-4 の仕様に従い role 別挙動を実装） |
| `lib/pages/device_registration_page.dart` | デバイス登録画面 | **変更あり**（table を選択可能にする） |
| `lib/services/store_config_service.dart` | storeMeta/config の Flutter 読み取り | **変更あり**（`tableDevice.forceClearPasscode` 追加） |
| `lib/tournament/active/pages/tournament_home_page.dart` | トーナメント管理画面 | **変更なし**（論理削除は CF 側で対応済み） |
| `lib/tournament/active/widgets/dialogs/add_table_dialog.dart` | 卓追加ダイアログ | **変更なし** |
| `lib/tournament/active/widgets/dialogs/remove_table_dialog.dart` | 卓削除ダイアログ | **変更あり**（`_loadEmptyTables` に `isEnabled` フィルタ追加） |
| `lib/tournament/pages/table_select_page.dart` | 卓選択ページ | **変更あり**（`_loadTables` に `isEnabled` フィルタ追加） |
| `lib/tournament/pages/tournament_select_page.dart` | 卓紐付け時のトーナメント絞り込み | **変更あり**（`tablesSeat.isEnabled` を確認） |
| `lib/tournament/active/pages/table_detail_page.dart` | 卓詳細（管理版） | **変更なし** |
| `lib/sideGame/pages/side_game_table_home.dart` | SG卓画面（管理版） | **変更なし** |
| `functions/.../addTableToTournament.ts` | 卓追加 CF | **変更あり** |
| `functions/.../removeTableFromTournament.ts` | 卓削除 CF | **変更あり** |
| `functions/.../registerDevice.ts` | デバイス登録 CF | **変更あり** |
| `functions/.../updateDeviceRole.ts` | role 変更 CF | **変更あり** |
| `functions/.../updateDeviceOptions.ts` | オプション更新 CF | **変更あり**（table_device_table を許容） |
| `functions/src/shared/config/types.ts` | storeMeta/config 型定義 | **変更あり**（`tableDevice.forceClearPasscode` 追加） |
| `functions/src/shared/config/defaults.ts` | storeMeta/config デフォルト値 | **変更あり**（`tableDevice.forceClearPasscode` 追加） |
