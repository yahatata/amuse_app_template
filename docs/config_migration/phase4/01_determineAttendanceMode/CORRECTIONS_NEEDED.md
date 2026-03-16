# Phase4 01: 修正が必要な点一覧

**作成日**: 2025-03-04  
**対象**: ドキュメント修正および clockIn.ts 実装修正

---

## 1. ドキュメントの修正（1.1〜1.4）

### 1.1 close_pre_confirmation_page の文言表示【修正済み】

- **対象**: CHANGESPEC.md セクション 2.2
- **修正**: 「未表示」→「表示済み」に更新

### 1.2 タブ構成【確認済み】

- **対象**: IMPLEMENTATION_PLAN.md 決定8
- **内容**: 3タブ（勤務記録 / シフト一覧 / 未退勤シフト一覧）が正。変更不要。

### 1.3 ナビゲーションフロー・attendanceService【修正済み】

- **対象**: CHANGESPEC.md セクション 2.2、10.1
- **修正内容**:
  - attendanceService から determineAttendanceMode を呼び出す必要はない
  - 勤怠管理・スタッフ打刻ページから直接「出勤」「退勤」を選択し、それぞれの QR 読み取りページに遷移するフローとする

### 1.4 attendance の date フィールドの扱い（セクション0）【修正済み】

- **対象**: IMPLEMENTATION_PLAN.md、CHANGESPEC.md
- **追加内容**:
  - フィールド名: `date` のまま（変更しない）
  - 格納タイミング: clockIn 実行時の JST 日付（YYYY-MM-DD）を格納
  - 用途: ① 表示用（どの日付の attendance として表示するか）② 給与計算（X日〜Y日の勤怠を対象とするか）
  - clockIn / clockOut での利用: 判定には使わない（エラー・警告は closedStoreWithoutClockOut, clockIn, clockOut で判定）
  - 閉店処理での利用: 使わない
- **実装確認**: clockIn/createClockInRecord は `getBusinessDateForAttendance()` を使用。status=running 時は currentBusinessDateKey、それ以外は JST 当日。格納タイミングは clockIn 実行時であり、営業日としての date を格納する意図に合致

---

## 2. 実装の修正（2.1〜2.4）

### 2.1 clockIn のエラー条件【修正済み】

- **対象**: `functions/src/domains/attendance/callables/clockIn.ts`
- **問題**: エラー条件に `closedStoreWithoutClockOut === false` の条件が欠けていた
- **修正**: `closedStoreWithoutClockOut !== true` の attendance に限定してエラー判定
  - 閉店処理でマーク済み（closedStoreWithoutClockOut: true）の未退勤は、警告のみで出勤許可

### 2.2 clockIn のエラー対象範囲【修正済み】

- **対象**: `functions/src/domains/attendance/callables/clockIn.ts`
- **問題**: 当日（date）のみをチェックしていた
- **修正**: **全期間**の attendance をチェック
  - 理由: 閉店時に全期間の attendances を検証し未退勤にフラグを付与するため、このエラーは基本的に当日分との齟齬でのみ発生する想定
  - **補足**: staffId + clockOut の複合インデックスを firestore.indexes.json に追加

### 2.3 UI 仕様（名称・画面構成・タブ）【ドキュメント反映済み】

- **対象**: IMPLEMENTATION_PLAN.md 3.7 に追記（実装は別途）
- **修正**:
  - 名称・画面構成・3ボタン: 使用側に合わせる（既存のまま）
  - タブ構成: 3タブ（勤怠記録 / シフト一覧 / 未退勤シフト一覧）

### 2.4 手動打刻の Callable 経路【ドキュメント反映済み】

- **対象**: CHANGESPEC.md 4-4 に追記
- **内容**:
  - 手動と QR では処理内容は基本的に同じなので統一してよい
  - 手動登録は設定によって許可/非許可が分かれる（今後の実装）
  - 手動用では、はじめに起動する関数は別種（QR 用）と同様のものであるべき
  - → 手動打刻も clockIn / clockOut を経由する設計とする。設定で許可されていない場合は UI で手動打刻ボタンを非表示にするなど対応

---

## 3. UI 仕様の詳細（添付文書より）

### 3.1 名称

「スタッフ打刻」→「勤怠管理・スタッフ打刻」に変更

### 3.2 画面構成

- `tournament_home_page.dart` の ExpansionTile（トーナメント操作）と同様の、下に折りたたみ可能なアクションバーを配置
- 折りたたみ内に 3 ボタン: 出勤登録（QR）、退勤登録（QR）、未退勤データの修正

### 3.3 タブ構成（3タブ）

| タブ | 内容 |
|------|------|
| 勤怠記録 | 当日勤怠＋未退勤セクション |
| シフト一覧 | 指定日のシフト一覧＋勤務状態 |
| 未退勤シフト一覧 | （IMPLEMENTATION_PLAN 決定8 に準拠） |

### 3.4 勤怠記録タブ

**ヘッダ**:
- storeMeta/currentBusinessDay を snapshot で監視
- AppBar に currentBusinessDateKey を表示（例: MM/DD(曜日)）
- status が running のときのみ「当日」として扱う

**セクション1: 当日の勤怠データ**
- バー文言: 「MM/DD(曜日)の勤怠データ」
- 表示対象: date === currentBusinessDateKey の attendances（status が running の場合）。念のため翌日の date 分も表示
- カラム: staffsFullName, 勤務状況, date, clockIn, clockOut, totalMinutes, createdAt, updatedAt
- 勤務状況: clockOut === null →「勤務中」（薄い赤）、clockOut != null →「退勤済み」（薄い緑）
- clockOut セル: null のとき薄い赤、値ありのとき薄い緑。null は空欄表示

**セクション2: 未退勤として登録された勤怠**
- バー文言: 「未退勤として登録された勤怠」
- 表示対象: closedStoreWithoutClockOut === true の attendances
- 行アクション: 各行右に「退勤処理」ボタン。勤務中: 有効。退勤済み: 無効＋グレーアウト、タップで「準備中」ダイアログ

### 3.5 シフト一覧タブ

**表示日付**:
- status が running: currentBusinessDateKey
- status が running 以外: lastClosedBusinessDateKey の翌日

**カラム**: staffName, 勤務状態, 開始時刻, 終了時刻

**勤務状態**（attendances からクエリ）:
- date 一致の attendance がない →「出勤前」
- date 一致の attendance があり clockOut === null →「勤務中」
- date 一致の attendance があり clockOut != null →「退勤済み」

**行アクション**: 各行右に「出勤登録」ボタン。出勤前: 有効、タップで「準備中」ダイアログ。勤務中・退勤済み: 無効＋グレーアウト
