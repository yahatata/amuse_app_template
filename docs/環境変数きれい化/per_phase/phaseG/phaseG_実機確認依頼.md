# phaseG 実機確認依頼（クローズ前最終版）

作成日: 2026-04-02  
更新日: 2026-04-03

## 1. 目的

- `docs/環境変数きれい化/per_phase` で回収した修正が、実運用で破綻しないことを実機で確認する。
- 自動検証で代替できない「画面操作 + 外部連携」の最終確認を行う。
- すべての改修箇所を1件ずつ検証するのではなく、同種の改修は代表ケースで保証する。

## 2. 進め方（漏れ防止ルール）

- 同じ種類の修正が複数ファイルにある場合は、代表ケース1〜2件で「同じ系統が正常に動くこと」を確認する。
- 1項目で異常が出た場合は、その系統（同種修正）を追加確認して切り分ける。
- すべての項目で「画面結果」と「バックエンド結果（Firestore / Functionsログ）」をセットで確認する。

## 3. 事前準備（全項目共通）

1. 実施者:
   - 管理者端末 1台 + 端末ロール端末 1台（可能なら）を用意する。
2. 実施環境:
   - 本番相当環境（今回デプロイ済み環境）を使用する。
3. 確認観点:
   - 失敗時は必ず日時（JST）と対象データID（billId/tournamentId/eventId など）を記録する。
4. ログ確認先:
   - Cloud Logging で、対象関数が `asia-northeast1` で実行されていることを確認する。

### 3.1 `asia-northeast1` の確認方法（必ず実施）

1. どこで（Where）:
   - Google Cloud Console -> Logging -> Logs Explorer
2. いつ（When）:
   - 各 M 項目の操作直後（5分以内推奨）
3. 何を（What）:
   - 該当関数の実行ログに `asia-northeast1` が紐づいていること
4. どうやって（How）:
   - まず関数名で絞る（後述の「各項目の確認対象関数」）。
   - 次にリージョンで絞る。環境によりラベル名が異なるため、以下いずれかで確認する。
     - `resource.labels.region="asia-northeast1"`（`cloud_function`）
     - `resource.labels.location="asia-northeast1"`（`cloud_run_revision`）
5. 期待結果（Expected）:
   - 対象操作に対応する関数ログが取得でき、リージョンが `asia-northeast1` であること。

参考クエリ（Logs Explorer）:

```text
(
  resource.type="cloud_function"
  AND resource.labels.function_name="<<FUNCTION_NAME>>"
  AND resource.labels.region="asia-northeast1"
)
OR
(
  resource.type="cloud_run_revision"
  AND resource.labels.service_name="<<FUNCTION_NAME>>"
  AND resource.labels.location="asia-northeast1"
)
```

## 4. 実機確認項目（5W1H）

### M-01 アプリ起動・端末初期導線

- Why（なぜ）:
  - Secret/設定読み出しや初期化変更後に、起動時導線が壊れていないことを確認するため。
- Who（誰が）:
  - 管理者権限を持つ実施者。
- When（いつ）:
  - テスト開始時の最初に実施。
- Where（どこから）:
  - アプリ起動直後（初期画面）。
- What（何を）:
  - 起動後、端末登録済みならホームへ遷移、未登録なら登録画面へ遷移することを確認。
- How（どう確認）:
  1. 端末A（登録済み）で起動する。
  2. 端末B（未登録状態にできるなら）で起動する。
  3. 期待どおりの画面に遷移するか確認する。
- 期待結果:
  - エラー表示なく初期遷移が完了する。
  - 想定外の認証/設定エラーが出ない。
  - （この項目は画面初期遷移確認が主目的。リージョン確認は M-02 以降で実施）

### M-02 開店〜営業中〜閉店導線（代表）

- Why（なぜ）:
  - 営業日計算・自動タスク・評価処理の改修影響を最も広くカバーできるため。
- Who（誰が）:
  - 管理者ロール端末利用者。
- When（いつ）:
  - 通常営業時間帯、または検証用時間帯で1サイクル。
- Where（どこから）:
  - 管理者ホームの開閉店操作導線。
- What（何を）:
  - 開店実行、営業中操作（軽い注文1件など）、閉店実行。
- How（どう確認）:
  1. 開店を実行し、営業状態になることを確認。
  2. 営業中に最低1件データ変更（例: 注文追加）を行う。
  3. 閉店を実行し、完了表示と結果画面を確認。
  4. Cloud Loggingで関連関数実行リージョンを確認。
- Cloud Loggingで確認する関数（この項目）:
  - `openStore` / `openStoreTerminal`
  - `closeStore` / `closeStoreTerminal`
  - `openAssessmentTask`
  - `closeAssessmentTask`
  - `applyCloseSnapshot`（閉店スナップショット適用が走る場合）
- 期待結果:
  - 開店/閉店とも正常完了する。
  - 失敗通知・権限エラーが出ない。
  - 関連実行が `asia-northeast1` で確認できる。

### M-03 トーナメント作成〜開始〜レジ締め〜終了（代表）

- Why（なぜ）:
  - スケジュール再計画、enqueue/controlHook、リージョン移行の主要影響点のため。
- Who（誰が）:
  - 管理者ロール端末利用者。
- When（いつ）:
  - M-02と同日で可。
- Where（どこから）:
  - トーナメント管理画面（作成/運用導線）。
- What（何を）:
  - テンプレートから作成し、開始・レジ締め・終了まで実行。
- How（どう確認）:
  1. テンプレート選択で新規作成。
  2. 開始操作を実行。
  3. レジ締め操作を実行。
  4. 終了操作を実行。
  5. Firestoreで対象 tournament の状態遷移を確認。
- Cloud Loggingで確認する関数（この項目）:
  - `createScheduledTournament`
  - `enqueueTournamentTasks`
  - `controlHookHttp`（開始/レジ締めタスク到達確認）
  - `endTournament`
- 期待結果:
  - UI操作とFirestore状態が一致する。
  - タスク連携の遅延/取りこぼしがない。
  - 関連実行が `asia-northeast1` で確認できる。

### M-04 トーナメント変更系（代表2ケース）

- Why（なぜ）:
  - `schedulePlanVersion/taskSyncNeeded` の変更系回帰を実機で押さえるため。
- Who（誰が）:
  - 管理者ロール端末利用者。
- When（いつ）:
  - M-03で作成したデータを利用して続けて実施。
- Where（どこから）:
  - スケジュール編集導線（開始時刻変更、キャンセル/復帰）。
- What（何を）:
  - ケースA: 開始時刻変更。
  - ケースB: キャンセルして復帰。
- How（どう確認）:
  1. ケースAで開始時刻を変更して保存。
  2. ケースBでキャンセル後に復帰。
  3. 画面状態とFirestore値（status, version系）を確認。
- Cloud Loggingで確認する関数（この項目）:
  - `updateScheduledTournamentStartAt`
  - `updateScheduledTournamentStatus`
  - `updateTournamentRecurrence`
  - `updateTournamentTemplate`
  - `enqueueTournamentTasksReplanOnWrite`（再計画トリガ確認）
  - `enqueueTournamentTasks`
  - `controlHookHttp`
- 期待結果:
  - 変更後に画面表示・内部状態が矛盾しない。
  - 復帰後も通常操作が継続できる。

### M-05 会計更新（調整/取消/再開）と返金（代表）

- Why（なぜ）:
  - postEvent 系の営業日キー・イベント反映の修正影響を確認するため。
- Who（誰が）:
  - 会計操作権限のある利用者。
- When（いつ）:
  - M-02の営業中データ、または専用検証データで実施。
- Where（どこから）:
  - 会計画面（会計確定後の調整/返金導線）。
- What（何を）:
  - 調整（+/-）、取消/再開、返金を1回ずつ実施。
- How（どう確認）:
  1. 会計確定済みデータを用意。
  2. 調整・取消/再開・返金を順に実施。
  3. 伝票履歴と合計値、イベント記録整合を確認。
- Cloud Loggingで確認する関数（この項目）:
  - `updateAccounting`
  - `cancelAccounting`
  - `processRefund`
  - `billsEventsOnCreate`
- 期待結果:
  - イベントが正しく反映され、欠落や二重反映がない。
  - 画面表示と保存値が一致する。

### M-06 注文履歴表示（代表）

- Why（なぜ）:
  - `getUserOrderHistory` の参照元/並び順変更の回帰確認のため。
- Who（誰が）:
  - ユーザー画面操作が可能な実施者。
- When（いつ）:
  - 会計データが複数ある状態で実施。
- Where（どこから）:
  - ユーザー注文履歴画面。
- What（何を）:
  - 複数件履歴を表示し、並び順と対象データを確認。
- How（どう確認）:
  1. 同一ユーザーに対して複数会計データを用意。
  2. 履歴画面を開く。
  3. 最新順表示・件数・明細内容を確認。
- Cloud Loggingで確認する関数（この項目）:
  - `getUserOrderHistory`
- 期待結果:
  - 期待対象のみ表示される。
  - 並び順が新しい順で一貫する。

### M-07 勤怠修正承認（深夜帯を含む代表）

- Why（なぜ）:
  - 深夜労働時間計算修正（タイムゾーン依存除去）の実運用確認のため。
- Who（誰が）:
  - 勤怠管理権限者。
- When（いつ）:
  - 深夜帯を含む実績データを用意できるタイミング。
- Where（どこから）:
  - 勤怠修正申請の承認導線。
- What（何を）:
  - 深夜帯を含む勤務の修正申請を承認。
- How（どう確認）:
  1. 深夜帯勤務データを作成。
  2. 修正申請を上げて承認。
  3. 集計時間（総労働/深夜労働）が想定どおりか確認。
- Cloud Loggingで確認する関数（この項目）:
  - `createAttendanceCorrectionRequest`
  - `approveAttendanceCorrectionRequest`
  - `attendanceOnWrite`
- 期待結果:
  - 深夜時間の過不足や不自然なズレがない。
  - 承認後の表示と集計が一致する。

### M-08 LINE Webhook 実イベント（代表）

- Why（なぜ）:
  - Secret/関数リージョン変更後の外部連携実動作確認のため。
- Who（誰が）:
  - LINE連携検証権限を持つ実施者。
- When（いつ）:
  - 低負荷時間帯を推奨。
- Where（どこから）:
  - LINE実クライアントからイベント送信、または検証環境からWebhook相当送信。
- What（何を）:
  - 代表イベント1〜2種類（通常メッセージなど）を送る。
- How（どう確認）:
  1. イベント送信。
  2. アプリ側反映を確認。
  3. Cloud Loggingで受信〜処理完了を確認。
- Cloud Loggingで確認する関数（この項目）:
  - `lineWebhook`
  - `ensureStaffRichMenu`（リッチメニュー更新操作を伴う場合）
- 期待結果:
  - イベント受信から反映まで成功する。
  - `asia-northeast1` 側の関数で処理される。

## 5. クローズ判定基準

- 必須項目: M-01〜M-08
- クローズ条件:
  1. 必須項目がすべて「成功」または「軽微（運用影響なし）で合意済み」になること。
  2. 重大障害（操作不能、データ破損、リージョン不整合）が0件であること。
  3. 失敗項目がある場合は、再現手順と切り分け結果が記録されていること。

## 6. 実機確認記録テンプレート（各項目共通）

- 実施ID:
- 項目ID（M-xx）:
- 実施日時（JST）:
- 実施者:
- 端末情報（OS/アプリバージョン）:
- 事前条件:
- 実施手順（実績）:
- 結果（成功/失敗）:
- 証跡（スクショ、ログURL、対象ID）:
- 不具合時メモ（再現条件、暫定回避、影響範囲）:

## 7. 補足

- 外部状態（Functions/Queue/Scheduler/Secret/IAM）の静的整合は自動検証で確認済み。
- 本資料は「実機でしか確認できない運用導線」を中心に、重複検証を避けつつ漏れを防ぐための最終確認計画である。
