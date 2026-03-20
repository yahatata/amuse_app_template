# 手動打刻・時間調整設定 実装要件書

**作成日**: 2026-03-04  
**前提**: storeMeta/config による設定の詳細（`docs/運用時資料/設定/storeMeta/configによる設定の詳細`）、既存 Phase4 01 実装計画

---

## 1. 概要

Firestore `storeMeta/config` に以下 2 項目を追加し、勤怠記録タブ・シフト一覧タブでの手動出退勤の可否および、登録時刻の調整 UI の有無を制御する。

| 設定 | パス | 概要 |
|------|------|------|
| 手動打刻の可否 | `features.createAttendanceByManual` (boolean) | true: 勤怠記録から退勤処理・シフト一覧から出勤処理を表示・実行可能。false: 当該 UI を非表示。 |
| 時間調整 | `attendanceTimeAdjustment` (map) | enabled で QR/手動問わず登録時刻の調整 UI の表示有無。maxFutureMinutes / maxPastMinutes で調整範囲（分）。 |

**設定の取得・監視**: 他設定と同様、アプリ起動時に `storeMeta/config` を取得し、以降は購読（監視）し続ける。取得失敗時はデフォルトを適用（createAttendanceByManual: false、attendanceTimeAdjustment: { enabled: false } 等）。

### 1.1 設定の取得方法

| 層 | 取得方法 | 参照先 |
|----|----------|--------|
| **Flutter（アプリ）** | `StoreConfigService`（シングルトン）が Firestore `storeMeta/config` を **snapshots()** で購読。`main.dart` 起動時に `StoreConfigService.instance` にアクセスし、その時点でリスナーが開始される。各画面は `StoreConfigService.instance.stream` または `StoreConfigService.instance.latestData` で現在値を参照する。 | `lib/services/store_config_service.dart`、`lib/main.dart` |
| **Functions** | 各 Callable 実行時に共通の config 取得経路（`configLoader` / `defaults`）で `storeMeta/config` を読み取る。1 回の処理ごとに取得（購読はしない）。 | `functions/src/shared/config/configLoader.ts`、`defaults.ts` |

詳細な取得失敗時挙動（未存在・読取エラー・フォールバック）は以下を参照すること。

- `docs/config_migration/phase1/PHASE1_FALLBACK_BEHAVIOR.md`
- `docs/運用時資料/設定/storeMeta/configによる設定の詳細/README.md`（取得失敗時の挙動・全設定共通）

### 1.2 初期化

| 観点 | 内容 |
|------|------|
| **Flutter：購読開始** | アプリ起動時（`main` で `StoreConfigService.instance` 参照時）にシングルトンが構築され、同時に `storeMeta/config` の snapshot リスナーが開始される。初回 snapshot 到達前は `latestData` が null になり得るため、画面では `latestData ?? StoreConfigData.fromDefaults()` や stream の初回値を待つ実装とする。 |
| **Flutter：デフォルト適用** | ドキュメントが存在しない場合は `StoreConfigData.fromDefaults()` を流す。ドキュメントは存在するがフィールドが無い・不正な場合は `StoreConfigData.fromMap()` 内で `store_config_defaults.dart` の各デフォルトを適用する。読み取りエラー時は最後の成功値を維持し、キャッシュが無い場合のみ `fromDefaults()` を適用する。 |
| **Functions：初期値** | `defaults.ts` に createAttendanceByManual / attendanceTimeAdjustment のデフォルトを定義する。`configLoader` で未存在・取得失敗時はこの defaults を返す。 |

本機能で追加する `createAttendanceByManual` および `attendanceTimeAdjustment` のデフォルト値は、セクション 2 および 2.3 のとおりとする。

### 確認事項への回答（実装方針の確定）

| # | 確認事項 | 回答 |
|---|----------|------|
| 1 | createAttendanceByManual の配置 | features と揃え、`features.createAttendanceByManual` とする。 |
| 2 | 手動退勤で使う Callable | updateManualClockOutRecord。データ更新・チェックは clockOut と揃え、両ファイル先頭にクロス更新のコメントを記載。 |
| 3 | 手動出勤で使う Callable | createManualClockInRecord。clockIn と揃え、両ファイル先頭にクロス更新のコメントを記載。 |
| 4 | 誕生日フィールド | staffs の birthMonthDay（MMDD）で照合。 |
| 5 | 時間調整の計算 | サーバー側で計算。適切に実装する。 |
| 6 | QR の時間調整 UI | QR スキャン後の確認画面に、設定次第で表示を追加し調整可能にする。 |
| 7 | attendanceTimeAdjustment デフォルト | enabled: false、maxFutureMinutes / maxPastMinutes: null。enabled が true で他が null のときはデフォルト値は不要、プルダウンは「現在時刻で登録」のみ。 |
| 8 | 退勤処理列の非表示 | 一旦純粋に非表示で進める。**のちに列幅の再計算に修正する可能性がある**（本ドキュメントに記載済み）。 |
| 9 | 誕生日未登録時メッセージ | 「スタッフに誕生日が登録されていません。先行して誕生日の登録を行って下さい。」 |
| 10 | 設定取得失敗時 | デフォルトを正とする。アプリ起動時取得・監視継続の仕様。 |

---

## 2. storeMeta/config の追加フィールド

### 2.1 features.createAttendanceByManual（boolean）

- **パス**: `storeMeta/config.features.createAttendanceByManual`
- **デフォルト**: `false`
- **未存在・取得失敗時**: デフォルト適用（手動打刻 UI は非表示）

### 2.2 attendanceTimeAdjustment（map）

- **パス**: `storeMeta/config.attendanceTimeAdjustment`
- **構造**:
  - `enabled`: boolean（デフォルト false）
  - `maxFutureMinutes`: number | null（enabled が false のときは未使用でよい）
  - `maxPastMinutes`: number | null（同上）
- **デフォルト**: `{ enabled: false, maxFutureMinutes: null, maxPastMinutes: null }`
- **enabled が true かつ maxFutureMinutes / maxPastMinutes が null の場合**: デフォルト値は設けず、表示上は「調整できる」が、プルダウンの選択肢は「現在時刻で登録」のみとする。

### 2.3 スキーマ（YAML イメージ）

```yaml
# storeMeta/config に追加するフィールド
features:
  # 既存フィールド ...
  createAttendanceByManual: bool   # 手動打刻の可否。デフォルト false

attendanceTimeAdjustment:
  enabled: bool                   # 時間調整 UI の表示。デフォルト false
  maxFutureMinutes: number | null  # 現在時刻から何分後まで選択可能か
  maxPastMinutes: number | null   # 現在時刻から何分前まで選択可能か
```

---

## 3. ① createAttendanceByManual の挙動

### 3.1 true の場合

#### 勤怠記録タブ

- 「退勤処理」列（ヘッダー＋各セルのボタン）を**表示**する。
- 退勤処理ボタン押下時:
  1. ダイアログを表示。タイトルは「退勤処理」。
  2. 内容: 氏名、出勤時刻を表示。「上記の退勤処理を行う場合は誕生日を4桁で入力して下さい(例：4月3日→0403)」と表示。入力欄、確定ボタン、キャンセルボタン。
  3. `attendanceTimeAdjustment.enabled` が true のときは、誕生日入力の下に時間調整 UI（後述）を追加する。
  4. 確定押下時:
     - `staffs/{staffId}` を取得し、`birthMonthDay` を確認。
     - **birthMonthDay が存在しない・空**: 「スタッフに誕生日が登録されていません。先行して誕生日の登録を行って下さい。」をダイアログ内に表示。登録は行わない。
     - **入力値と birthMonthDay が不一致**: 「選択されたユーザーの誕生日が適切に入力されていません。選択したユーザーが正しいか、また入力した誕生日が正しいかを確認して下さい。」をダイアログ内に表示。登録は行わない。
     - **一致**: 退勤処理を実行。Callable は **updateManualClockOutRecord** を使用。時間調整が有効な場合は、選択した時刻（またはオフセット）をサーバーに渡し、サーバー側で登録時刻を計算する。

#### シフト一覧タブ

- 各行に「出勤登録」ボタンを**表示**する。
- 出勤登録ボタン押下時:
  1. ダイアログを表示。タイトルは「出勤処理」。
  2. 内容: 氏名を表示。同上の誕生日4桁入力の案内・入力欄。enabled 時は時間調整 UI を追加。確定・キャンセル。
  3. 確定押下時: staffs の birthMonthDay を上記と同様に検証。誕生日未登録時は「スタッフに誕生日が登録されていません。先行して誕生日の登録を行って下さい。」、不一致時は上記と同じメッセージ。一致時は **createManualClockInRecord** を呼び出し、時間調整が有効な場合は選択時刻をサーバーに渡す。

### 3.2 false の場合

- **勤怠記録タブ**: 「退勤処理」列（ヘッダー＋セル）を**非表示**にする。枠サイズの再計算は**一旦行わない**（純粋に非表示）。※のちに列幅再計算に変更する可能性がある旨を本ドキュメントで明記する。
- **シフト一覧タブ**: 「出勤登録」ボタンを**非表示**にする。

---

## 4. ② attendanceTimeAdjustment の挙動

### 4.1 enabled === false

- QR 出勤・退勤、手動出勤・退勤のいずれでも「時間の調整」UI は表示しない。登録時刻はサーバー現在時刻（既存の serverTimestamp 相当）とする。

### 4.2 enabled === true

- **maxFutureMinutes / maxPastMinutes**: 現在時刻から何分後／何分前まで選択可能か。いずれかが null の場合は、プルダウンの選択肢は「現在時刻で登録」のみとする（表示上は調整 UI は出すが、実質 1 択）。
- プルダウンは **1 分刻み**。選択肢の範囲は「現在 − maxPastMinutes」〜「現在 + maxFutureMinutes」（null の場合は現在時刻のみ）。
- **登録時刻の計算**: **サーバー側**で行う。クライアントからは「オフセット分」または「希望登録時刻」を渡し、サーバーで適切に計算して attendances に格納する。
- **バリデーション**: 退勤時刻が出勤時刻より前になる場合はエラーとし、登録しない。メッセージは「出勤時刻より過去の退勤時間は登録できません」等とする。

#### QR スキャン後の確認画面

- 出勤ボタンを表示するタイミングで、**設定次第で**時間調整の枠を表示する（enabled が true のときのみ）。
- デフォルト表示は「現在時刻で登録」。枠を押下するとプルダウンが開き、現在時刻を基準に maxPastMinutes 〜 maxFutureMinutes の範囲で 1 分刻み選択可能（両方 null の場合は「現在時刻で登録」のみ）。
- 出勤・退勤ボタン押下時に、ここで選択した内容をサーバーに送り、サーバー側で登録時刻を計算して格納する。

#### 手動ダイアログ（createAttendanceByManual が true のとき）

- 退勤処理・出勤処理のダイアログで、誕生日入力の**下**に「現在時刻で登録」と表示されたボックスを配置（enabled が true のときのみ）。押下で同上の 1 分刻みプルダウン。確定時に選択内容をサーバーに渡す。

---

## 5. Callable の揃え方・コメント

### 5.1 退勤: updateManualClockOutRecord と clockOut

- **使用する Callable**: 手動退勤は **updateManualClockOutRecord** を使用する。
- **データ更新・チェック**: 処理内容は **clockOut** と揃える。必要な箇所だけ差が出るようにする（例: 手動時は docId 指定、QR 時は一覧から特定など）。
- **コメント**: **clockOut.ts** と **updateManualClockOutRecord.ts** の両方のファイル先頭に、以下の旨をコメントで記載する。「片方の更新を行った際に、共通で変更する必要がある可能性がある。」

### 5.2 出勤: createManualClockInRecord と clockIn

- **使用する Callable**: 手動出勤は **createManualClockInRecord** を使用する。
- **データ更新・チェック**: 処理内容は **clockIn** と揃える。必要な箇所だけ差が出るようにする。
- **コメント**: **clockIn.ts** と **createManualClockInRecord.ts** の両方のファイル先頭に、上記と同様のクロス更新注意のコメントを記載する。

---

## 6. スタッフの誕生日照合

- **参照フィールド**: `staffs` コレクションの **birthMonthDay**（MMDD 4桁）。
- **照合**: ダイアログで入力した 4 桁と `staffs/{staffId}.birthMonthDay` を比較。一致した場合のみ登録を実行。
- **誕生日が未登録**: `birthMonthDay` が存在しない、または空の場合は「スタッフに誕生日が登録されていません。先行して誕生日の登録を行って下さい。」を表示。

---

## 7. 時間調整のサーバー側計算

- クライアントからは「現在時刻からのオフセット（分）」または「希望する登録時刻（ISO 等）」のいずれかを渡す。
- サーバー側で、業務日・営業日や既存の clockIn との前後関係を考慮し、適切に **登録する時刻** を計算して attendances に格納する。
- 退勤時は、同一 attendance の clockIn より前の時刻にならないようにバリデーションし、なった場合はエラーを返す。

---

## 8. 影響ファイル一覧（実装時の参照用）

| 種別 | ファイル | 役割 |
|------|----------|------|
| ts | `functions/src/shared/config/defaults.ts` | createAttendanceByManual, attendanceTimeAdjustment のデフォルト値 |
| ts | `functions/src/shared/config/configLoader.ts` | 上記の読込・マッピング（buildFromDefaults 等） |
| ts | `functions/src/domains/attendance/callables/clockIn.ts` | 先頭に createManualClockInRecord との揃え・共通変更のコメント |
| ts | `functions/src/domains/attendance/callables/clockOut.ts` | 先頭に updateManualClockOutRecord との揃え・共通変更のコメント |
| ts | `functions/src/domains/attendance/callables/createManualClockInRecord.ts` | 手動出勤エントリ。clockIn と処理内容を揃える。時刻パラメータ対応。先頭コメント追加 |
| ts | `functions/src/domains/attendance/callables/updateManualClockOutRecord.ts` | 手動退勤。clockOut と処理内容を揃える。時刻パラメータ対応。先頭コメント追加 |
| dart | `lib/services/store_config_service.dart` | StoreConfigData に features.createAttendanceByManual, attendanceTimeAdjustment を追加 |
| dart | `lib/services/store_config_defaults.dart` | 上記のデフォルト値 |
| dart | `lib/AttendanceManagement/staff_attendance_page_from_terminalHome.dart` | 勤怠記録の退勤処理列の表示/非表示、退勤ダイアログ（誕生日＋時間調整）。シフト一覧の出勤登録ボタン表示/非表示、出勤ダイアログ |
| dart | QR スキャン後の確認画面 | 設定に応じた時間調整 UI の追加（該当画面を特定して実装） |

※ 勤怠記録の「退勤処理」列非表示は、一旦純粋に非表示で実装する。のちに列幅の再計算に変更する可能性あり。

---

## 9. ドキュメント・運用

- 本要件を満たす実装を行った後、必要に応じて `docs/運用時資料/設定/storeMeta/configによる設定の詳細/` に、createAttendanceByManual および attendanceTimeAdjustment の運用時説明を追加する（取得失敗時・不具合時対応、現状持ちうる値、影響ファイル一覧など）。
