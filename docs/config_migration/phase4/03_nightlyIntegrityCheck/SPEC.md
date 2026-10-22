# Phase4 03: 閉店処理用整合性チェック — 詳細仕様書

**最終確定日**: 2025-03-04

---

## 1. 概要

### 1.1 目的

閉店処理の一環として、以下の3項目を確認し、結果を UI に表示する。ユーザーが対応を検討したうえで、閉店処理を実行できるようにする。

| 確認項目 | 内容 |
|----------|------|
| 未会計 bills | 会計が完了していない伝票 |
| 未 close トーナメント | 終了処理ができていないトーナメント |
| 未退勤スタッフ | 退勤打刻ができていないスタッフ |

### 1.2 前提

- スケジューラ（STORE_CLOSE_HOUR）は使用しない
- 閉店処理の画面遷移時およびボタン押下時に、整合性チェック用の Callable を呼び出す
- 単一店舗想定

---

## 2. UI フロー

### 2.1 画面構成の変更

**現状**: それぞれterminalHomeにダイアログ内のボタンとして表示される「閉店処理を開始する」または「YYYY-MM-DD の閉店処理へ」ボタン押下 → ダイアログ表示 → 未会計一覧 → 確認 → closeStoreTerminal

**変更後**: ボタン押下 → **画面遷移** → 閉店前確認画面

### 2.2 閉店前確認画面の構成

**AppBar**: 「再度確認する」ボタンを配置する。押下時、本画面の構成に必要な確認（未会計・未退勤スタッフ・未 close トーナメントの取得）を再度実行し、3つの枠の表示を更新する。

**画面内**: 以下の3つの枠を設ける。

1. **未会計 bills** … 一覧表示（従来どおり）
2. **未退勤スタッフ** … スタッフ名・出勤時刻を表示
3. **未 close トーナメント** … トーナメント名・開始時刻・ステータス・状態メッセージを表示

**必須表示文言**: 閉店前確認画面に「閉店処理後から1時間以内は通常フローでの退勤が可能です」と表示する。

枠のサイズについて1,2は同じサイズで、画面の縦幅の45%でappbarのすぐした（画面上部）に左右にそれぞれを配置。3は画面下部に画面縦幅の35%で表示。なお、横幅は1,2は画面横幅の45%ずつで、それぞれの間に5%の余白と左右の画面ふちから2.5%の余白を設けて下さい（余白（2.5%),1,余白（5%),2,余白（2.5%))として下さい。3は画面の左右幅の95%とし、（余白（2.5%),3,余白（2.5%))として下さい。

### 2.3 ボタンと実行フロー

| ボタン | 表示条件 | 動作 |
|--------|----------|------|
| **確認して閉店する** | 未 close トーナメントが 0 件のとき | 押下可 |
| **強制閉店する** | 未 close トーナメントが 1 件以上のとき | 押下可 |

#### 2.3.1 「確認して閉店する」押下時

1. 押下時点で再取得: 未会計・未退勤スタッフ・未 close トーナメントを再度 Callable で取得
2. 確認ダイアログ表示: 会計・attendance・tournament の有無（あれば内容）を記載し、確認を求める
3. ユーザーが「実行」を選択 → 閉店処理（closeStoreTerminal）を実行

#### 2.3.2 「強制閉店する」押下時

1. **第1段階ダイアログ**: 以下を表示し、確認・キャンセルを求める。
   - 文言: 「トーナメントの終了処理をせずに閉店処理を実行しようとしていますが、エラー等でトーナメントの終了処理ができない場合を除き推奨していません。本当に強制閉店処理に進んで良いです？」
   - ボタン: 「確認」「キャンセル」
2. ユーザーが「確認」を選択した場合のみ、次へ進む
3. 押下時点で再取得: 未会計・未退勤スタッフ・未 close トーナメントを再度 Callable で取得
4. **第2段階ダイアログ**: 会計・attendance・tournament の有無（あれば内容）を記載し、最終確認を求める
5. ユーザーが「実行」を選択 → 閉店処理（closeStoreTerminal）を実行

### 2.4 データ変動への対応

- **ページ遷移時**から**確認ボタン押下時**までに、ユーザーが他画面でデータを修正する場合がある
- ボタン押下時に必ず最新データを再取得し、その内容で確認ダイアログを表示する
- 冪等性: 同一実行内での重複処理を防ぐ（Callable 側で適切に設計）

### 2.5 読み込み・エラー表示

- **ローディング**: 「閉店時確認の実行中...」＋ スピナーを表示
- **2分経過後**: 再実行ボタンをダイアログ内に表示
- **取得失敗時**: 「取得失敗」の旨を表示し、再試行ボタンを設置
- **スクロール**: 各項目の枠内をスクロール可能にし、全体を表示

---

## 3. 未 close トーナメント

### 3.1 定義

| 項目 | 内容 |
|------|------|
| **close の定義** | `status` が `ended` または `cancelled` のもの |
| **未 close の定義** | `status` が上記以外（`scheduled`, `registered`, `running`, `paused` 等）のもの |
| **対象コレクション** | `scheduledTournaments` のみ |
| **営業日フィルタ** | `businessDate === storeMeta/currentBusinessDay.currentBusinessDateKey` のドキュメントのみ |
| **スケジュール済み未開始** | 未 close 扱いとする |

### 3.2 強制閉店時の status

「強制閉店する」で閉店処理を実行した際、未 close だったトーナメントは `status: 'force_ended'` に更新する。

- **影響調査**: `status === 'ended'` で判定している箇所（validateEndTournament、一覧表示等）で、`force_ended` も close 相当として扱う必要あり。実装時に影響範囲を確認すること。

### 3.3 表示メッセージ（ケース別）

**必須表示**: トーナメント名（snapshot.name）、開始時刻、ステータス

**状態に応じたメッセージ**:

| ケース | 条件 | 表示メッセージ |
|--------|------|----------------|
| 0 | status≠ended かつ 1stPlayerName が存在し null でない | 「終了処理がなされていません（順位の確定、プライズの付与は完了しています。）」 |
| 1 | 1stPlayerName が存在し、値が null | 「順位の確定およびプライズの付与ができていません。」 |
| 2 | 1stPlayerName が存在しない かつ 残りプレイヤーなし（reentries+entries=playersBusted） | 「プライズの確定および順位の確定ができていません。」 |
| 3 | 残りプレイヤーがいる（reentries+entries > playersBusted） | 「burst処理がされていないplayerがいます。」 |
| 3+ | 上記 3 かつ 1stPlayerName が存在し null でない | 「burst処理がされていないplayerがいます。ただし順位の確定およびプライズの付与は完了しています。」 |

**補足**: `reentries+entries < playersBusted` の場合は表示上「=」と同等に扱う。ただし Function 側でエラーログを残す。

### 3.4 1stPlayerName の取得方針

- `views/main` の `1stPlayerName` の存在・値を確認
- XstPlayerName（2nd, 3rd 等）は 1stPlayerName の確認のみで十分とする（フィールド存在確認は 1stPlayerName のみ）

---

## 4. 未退勤スタッフ

### 4.1 定義

| 項目 | 内容 |
|------|------|
| **判定方法** | `attendances` で `clockIn` あり かつ `clockOut` が null |
| **取得対象** | **営業日でフィルタせず**、未退勤（clockIn あり & clockOut null）を**すべて**返す（2025-03-04 確定） |
| **シフト** | 当日シフトの有無にかかわらず、打刻があれば対象 |
| **動作** | 強制退勤は行わない。警告表示のみ。閉店処理後の退勤も許可 |

### 4.2 閉店時フラグ（closedStoreWithoutClockOut）

閉店処理実行時、未退勤の attendance に対してフラグを付与する。

| 項目 | 内容 |
|------|------|
| **フィールド名** | `closedStoreWithoutClockOut` |
| **型** | `boolean` |
| **値** | `true`（閉店時に未退勤だった場合のみ設定） |
| **目的** | 後から「閉店時に未退勤だった一覧」を参照・クエリするため |
| **クエリ** | `where('closedStoreWithoutClockOut', '==', true)` で取得可能 |

**更新ルール**:

- 閉店処理実行時、`clockIn` あり かつ `clockOut` が null の attendance に対し、`closedStoreWithoutClockOut: true` と `closedAt: Timestamp` を付与
- `clockOut` に Timestamp が入っている場合は上書きしない（既に退勤済み）
- 新規 attendance 作成時: Phase4 01 改修後は `closedStoreWithoutClockOut: false` をデフォルトで持たせる（クエリ効率のため。01 改修前は省略可）

**インデックス**: `attendances` に `closedStoreWithoutClockOut` の単一フィールドインデックス、または複合インデックスが必要な場合は firestore.indexes.json に追加する。

**閉店後退勤の猶予【確定】**: 閉店後 **1時間** 以内は通常フローでの退勤を許可。`closedAt` から1時間経過するまでは、未退勤一覧やパスワード認証なしで通常の clockOut により退勤可能。詳細は [01_determineAttendanceMode/IMPLEMENTATION_PLAN.md](../01_determineAttendanceMode/IMPLEMENTATION_PLAN.md) の「2.4 閉店後一定時間の退勤許可」参照。

### 4.3 lastClosedBusinessDateKey が無い場合

status ≠ running 時に勤怠記録・シフト一覧の表示日を決める際、`lastClosedBusinessDateKey` が存在しない場合（初回開店前など）は、**当日（JST 基準）** を基準とする。詳細は [01_determineAttendanceMode/IMPLEMENTATION_PLAN.md](../01_determineAttendanceMode/IMPLEMENTATION_PLAN.md) の「3.3 status ≠ running 時の画面表示日」参照。

### 4.4 Phase4 01 との関係

- 本機能の attendance 参照ロジックは、**Phase4 01（determineAttendanceMode 改修）の完了後に影響を受ける可能性がある**
- Phase4 01 の [OVERVIEW.md](../01_determineAttendanceMode/OVERVIEW.md) に「03 で追加した閉店前未退勤スタッフ取得・closedStoreWithoutClockOut フラグの attendance 参照は、01 改修時に確認必須」と記載する
- 01 実施時に本仕様の attendance 周りを再確認すること

---

## 5. Callable 設計

### 5.1 単体 Callable の構成

| Callable | 役割 | 備考 |
|----------|------|------|
| `getUnsettledBillsForClose` | 未会計 bills 取得 | 既存 |
| `getUnclockedStaffForClose` | 未退勤スタッフ取得 | **新規** |
| `getUnclosedTournamentsForClose` | 未 close トーナメント取得 | **新規** |

閉店処理用ターミナル関数（closeStoreTerminal 等）は、上記 Callable のロジックを呼び出すか、同等の処理を内部で実行する。

### 5.2 実行タイミング

- **閉店前確認画面の表示時**: 上記3つを呼び出し（または統合 Callable で一括取得）
- **確認ボタン押下時**: 再度呼び出して最新状態を取得し、確認ダイアログに反映

### 5.3 getUnclockedStaffForClose

**入力**: なし。営業日フィルタは行わない。

**取得条件**: 未退勤（`clockIn` あり & `clockOut` null）の attendance を**すべて**返す。

**出力**:

```typescript
{
  success: true,
  data: [
    { staffName: string, clockIn: string /* ISO */ }
  ]
}
```

- 対象 0 件のとき: `data: []` かつ `hasNoTarget: true` を返す（空配列のみだと取得失敗と区別できないため）
- 失敗時: `success: false`, `error: string`

### 5.4 getUnclosedTournamentsForClose

**入力**: なし

**出力**:

```typescript
{
  success: true,
  data: [
    {
      tournamentId: string,
      status: string,
      startAt: string /* ISO */,
      snapshotName: string,
      displayMessage: string,  // ケース0〜3+ のメッセージ
      // views/main から: reentries, playersBusted, entries
      // 1stPlayerName の有無・値（必要に応じて）
    }
  ]
}
```

**必須返却項目**: status, startAt, snapshot.name, views/main の reentries, playersBusted, entries

**1stPlayerName**: 存在有無と値を返す。XstPlayerName は 1stPlayerName の確認で代表とする。

- 対象 0 件のとき: `data: []` かつ `hasNoTarget: true`
- 失敗時: `success: false`, `error: string`

### 5.5 統合取得の可否

- 3つの Callable を別々に呼んでも、1つの統合 Callable（例: `getCloseIntegrityData`）で3項目をまとめて返してもよい
- UI のローディング・再取得の簡素化のため、統合 Callable を推奨

---

## 6. 閉店処理との連携

### 6.1 closeStoreTerminal の拡張

閉店処理実行時、以下を行う。

1. **未 close トーナメント**: 「強制閉店する」の場合、該当トーナメントの `status` を `force_ended` に更新
2. **未退勤 attendance**: `clockIn` あり かつ `clockOut` が null のドキュメントに `closedStoreWithoutClockOut: true` と `closedAt: Timestamp` を付与
3. **未会計 bills**: 既存どおり closeSnapshot 付与等を実施

### 6.2 権限

- `requireAdmin` または `terminal + store_management` のデバイスのみ実行可能
- 既存の closeStoreTerminal 等と同様の権限チェック

---

## 7. エラー・異常系

| 項目 | 方針 |
|------|------|
| **Firestore エラー** | ダイアログで取得失敗を表示し、再試行ボタンを設置 |
| **タイムアウト** | 取らない。2分経過後に再実行ボタンを表示 |
| **冪等性** | 同一実行内での重複を防ぐ。再取得はボタン押下時のみ |
| **ページング** | 不要。各枠内をスクロールして全体表示 |

---

## 8. データ構造・クエリ

### 8.1 scheduledTournaments の営業日フィルタ

- `businessDate === currentBusinessDateKey` でフィルタ
- `businessDate` が未設定のレガシーあり得る場合: `startAt` から営業日を算出して判定する方針で実装時に検討

### 8.2 attendances の構造（Phase4 01 改修後）

- **営業日フィールド**: `date` → `currentBusinessDate` にフィールド名変更（YYYY-MM-DD）
- **closedStoreWithoutClockOut**: 新規作成時は `false` をデフォルトで持たせる。閉店処理時、未退勤のものに `true` を付与
- **closedAt**: 閉店処理時、`closedStoreWithoutClockOut: true` 付与と同時に `closedAt: Timestamp` を付与。閉店後1時間以内の通常退勤許可判定に使用
- **インデックス**: `currentBusinessDate` を含む複合インデックスを firestore.indexes.json に追加（date から移行）

---

## 9. 対象ファイル一覧

### 9.1 TypeScript（Functions）

| 種別 | パス |
|------|------|
| 新規 | `domains/storeMeta/callables/getUnclockedStaffForClose.ts` |
| 新規 | `domains/storeMeta/callables/getUnclosedTournamentsForClose.ts` |
| 新規（統合案） | `domains/storeMeta/callables/getCloseIntegrityData.ts` |
| 変更 | `domains/storeMeta/callables/closeStoreTerminal.ts` … 強制閉店時の tournament status 更新、attendance に closedStoreWithoutClockOut + closedAt 付与 |
| 変更 | `domains/tournament_activeTournament/callables/validateEndTournament.ts` … force_ended を ended と同様に扱うか確認 |
| 変更 | その他 status 参照箇所 … force_ended 影響調査に基づき対応 |

### 9.2 Dart（Flutter）

| 種別 | パス |
|------|------|
| 変更 | `lib/Home/terminalHomePage.dart` … 閉店フローを画面遷移に変更、閉店前確認画面を追加 |
| 新規 | 閉店前確認画面用の Widget / Page |

### 9.3 その他

| 種別 | パス |
|------|------|
| 変更 | `firestore.indexes.json` … closedStoreWithoutClockOut 用インデックス（必要に応じて） |
| 変更 | `domains/attendance` の attendance 作成ロジック … closedStoreWithoutClockOut: false のデフォルト付与（01 と調整） |

---

## 10. 参照

- [OVERVIEW.md](./OVERVIEW.md) … 変更方針の概要
- [TASK_EXECUTION_POLICY.md](./TASK_EXECUTION_POLICY.md) … タスク進め方
- [../NIGHTLY_INTEGRITY_CHECK.md](../NIGHTLY_INTEGRITY_CHECK.md) … 旧仕様（bills/activeStays/analyticsMonthly）
- [../01_determineAttendanceMode/OVERVIEW.md](../01_determineAttendanceMode/OVERVIEW.md) … attendance 改修（01 実施時に 03 の attendance 参照を確認すること）
