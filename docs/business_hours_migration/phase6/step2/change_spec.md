# Phase6 Step2: 未会計billsの移管UI／フラグ付け — ChangeSpec

## 1. 目的・背景

### 1.1 目的

閉店処理において「未会計のまま残った bill」を運用上追跡できるようにする。Step2 では、**bills にフラグ（closeSnapshot）を追加して“未会計bills化”する**方式を採用し、別コレクションへは移さない。閉店処理本線には組み込まず、**管理画面から手動で実行できる UI** のみを提供する。

### 1.2 背景（現状）

- bills は SSoT。`status` により状態遷移する（open / in_progress / settling / settled …）。
- 未会計の伝票は、当日営業日で `status in ['open', 'in_progress', 'settling']` のものが該当する。
- 現状、閉店時（cleanupActiveStaysOnClose 等）でも未会計の bills は bills コレクションに残ったままで、運用上「どの伝票が閉店時未会計だったか」を後から一意に識別する仕組みがない。
- Step3 で storeMeta/closeRuns を導入し、閉店実行ログや未会計一覧の索引を残す予定。Step2 はその前段として「手動でのフラグ付与」と「一覧表示・確認」を実装する。

---

## 2. スコープ（Step2 でやる／やらない）

### 2.1 Step2 でやること

- **UI**: システム設定画面（`lib/Home/systemSettingsPage.dart` を想定。実際のファイル名・配置は既存構成に合わせる）に「未会計billsの移管」用ボタンを追加する。
- **取得**: ボタン押下で「未会計bills取得」の Callable（取得のみ）を呼ぶ。表示ロジックはその関数の外（クライアント側）に実装する。
- **表示**: 取得した未会計 bills をダイアログで一覧表示し、確認を挟む。1行の表示項目: pokerName / 金額（表示用）/ 入店日時（表示用）。
- **フラグ付与**: ユーザーが確定ボタンを押したら、選択対象の bills に `closeSnapshot` を追加する Callable を起動する。
- **データ**: bills に `closeSnapshot` を追加する。構造は後述。別コレクションへ移す処理は行わない。
- **重要（確定）**: Step2 で付与する `closeSnapshot` は **監査/運用ラベル**であり、`status` の意味や既存の write-guard（appendItem / startAccounting 等の許可/拒否条件）には影響しない。bills の SSoT 方針は維持する。

### 2.2 Step2 でやらないこと

- 閉店処理本線（closeStore / ターミナル関数）への組み込み。
- storeMeta/closeRuns の作成・closeRunId の正式な発行（Step3 で実装）。
- 当日以外の businessDate の「取り残し」伝票の扱い（Step3 または運用改善で扱う）。
- 取得・フラグ付与以外の業務ロジック（例: 会計強制完了、activeStays 一括更新など）。

---

## 3. UI 仕様

### 3.1 配置

- **画面**: システム設定画面（案: `lib/Home/systemSettingsPage.dart`。既存のシステム設定ページに追加する想定。実際のパスは既存構成に合わせる。）
- **要素**: 「未会計billsの移管」ボタン（または同等のラベル）を追加する。配置位置は既存レイアウトに合わせる（案: 閉店・営業日関連のセクション近く）。

### 3.2 導線

1. ユーザーが「未会計billsの移管」ボタンをタップする。
2. 未会計bills取得用 Callable を呼ぶ（引数: なし、または当日営業日を渡す仕様。実装時に決定）。
3. 取得結果をダイアログで一覧表示する。各行: **pokerName / 金額（表示用）/ 入店日時（表示用）**。
4. ユーザーが内容を確認し、「確定」ボタンを押す。
5. 確定時に、表示した一覧の**全 billId** を closeSnapshot 付与用 Callable に渡す（Step2 は全件確定のみ）。
6. 付与結果（成功/失敗・スキップ）をダイアログで明示し、失敗分のみ再試行できる導線を提供する（5.2 の出力に従う）。

### 3.3 ダイアログ・表示項目

- **ダイアログ**: モーダル（またはボトムシート等、既存のダイアログパターンに合わせる）。キャンセル・確定の両方が可能であること。
- **1行の表示項目**（必須）:
  - **pokerName**: `bills/{billId}.party.pokerName`（表示用）。
  - **金額**: 表示用。算出方法は「4. 金額／入店日時の表示」に従う。
  - **入店日時**: `bills/{billId}.createdAt` を表示用にフォーマットしたもの（例: 日時文字列）。タイムゾーンは既存アプリ方針に合わせる。
- **選択（Step2確定）**: Step2 の UI では **全件を対象に closeSnapshot を付与する（全件確定のみ）**。一部選択は Step2 対象外とし、必要なら Step3 以降の拡張で扱う。
- **呼び出し方式**: UI は「取得した一覧の全 billId」を `billIds: string[]` として closeSnapshot 付与 Callable に渡す。
- **0件時**: 未会計が 0 件の場合はダイアログで「未会計の伝票はありません」等を表示し、確定ボタンは無効または非表示とする。

### 3.4 その他

- 一部選択の UI は Step2 対象外（全件確定のみ）。一部選択が必要な場合は Step3 以降で検討する。
- ダイアログの具体的なウィジェット（AlertDialog / 独自ダイアログ）は既存構成に合わせる。

### 3.5 結果表示と再試行（Step2確定）

- closeSnapshot 付与 Callable の実行結果は、**成功/失敗（スキップ）を bill 単位で明確に表示**する。
  - 成功（updated）: pokerName 等とともに「完了」として表示する。
  - 失敗/スキップ（skipped）: bill と理由（reason）を表示する。
- ユーザーが「できなかったものだけ再試行」できる導線を用意する。
  - 例: `skipped` のうち `already_marked` を除いた billIds を再試行対象にして、再試行ボタンを表示する。
- 目的は「どの bills は完了して、どの bills は未完了か」を Step2 時点でユーザーが確実に把握できるようにすることである。

---

## 4. 金額／入店日時の表示

### 4.1 入店日時

- **根拠**: `bills/{billId}.createdAt`（Timestamp）。未会計の伝票にも存在する。
- **表示**: 既存の日時フォーマット方針に合わせて表示用文字列に変換する。

### 4.2 金額（Step2確定: server-side 算出）

- **注意**: 未会計の bills 親ドキュメントには `amounts` が存在しない可能性がある（amounts は bills.onSettle で確定時に付与される）。
- **方針（確定）**:
  - Step2 の未会計bills取得用 Callable は、返却データに **表示用金額を必ず含める**。
  - 金額は **server-side で算出**する。算出は既存の会計プレビュー／集計ロジック（例: `getBillPreviewTotals` 相当。`functions/src/accounting/getBillPreviewTotals.ts` が items / extras / sideGameChips / tournaments から算出）を参照・再利用する前提とする。
  - クライアント側で `getBillPreviewTotals` を N 回呼ぶ方式は Step2 では採用しない（パフォーマンスと失敗時の整合性が悪いため）。

---

## 5. Functions 仕様

### 5.1 未会計bills取得用 Callable（案: 名前は実装時に決定）

- **責務**: 当日営業日について、未会計の bills を取得し、表示に必要な最小限の情報を返す。**取得のみ**で、bills や activeStays の書き換えは行わない。
- **入力**: なし、または `{ businessDate?: string }` など。当日営業日はサーバ側で `getCurrentBusinessDateKeyOrThrow`（または同等）で取得する想定。詳細は実装時に決定。
- **出力（確定）**: 少なくとも次の要素を持つリスト。
  - `billId`
  - `pokerName`（`party.pokerName`）
  - **`displayAmount`**（表示用金額。server-side 算出済み。4.2 に従う）
  - `createdAt`（表示用。ISO 文字列等）
  - 必要に応じて `status`, `businessDate`（検証用）
- ※ フィールド名は実装時に多少変えてもよいが、「server-side 算出済みの表示用金額を必ず含む」ことは固定とする。
- **権限**: 管理者またはそれに準ずる権限を持つ呼び出し元のみ許可する。既存の Callable 権限パターン（例: デバイス role: admin または特定オプション）に合わせる。詳細は実装時に決定。
- **失敗時**: 営業日が取得できない（店舗が閉店中で state が無い等）場合はエラーを返す。Firestore の読み取りエラーも適宜エラーとして返す。
- **冪等性**: 読み取りのみのため、冪等である。

### 5.2 closeSnapshot 付与用 Callable（案: 名前は実装時に決定）

- **責務（確定）**: 指定された billId のリストに対して、`bills/{billId}` に `closeSnapshot` を付与する。
- **入力（確定）**: `{ billIds: string[] }`（UI 側で取得一覧の全 billId を渡す。Step2 UI は全件確定のみ）。
- **前条件（サーバ側で bill ごとに検証、確定）**:
  - bill が存在する。
  - `businessDate` が当日営業日と一致する。
  - `status in ['open', 'in_progress', 'settling']` であること。
- **重複更新対策（確定）**:
  - `bills/{billId}` に **すでに `closeSnapshot` が存在する場合は書き込まない（スキップ）**。
  - スキップ理由として `already_marked` を返す。
  - 推奨: 競合を避けるため、bill 単位で transaction（read → 条件判定 → update）または同等の整合手段を用いる。
- **lastCloseRunId（確定）**: Step2 では必ず `'step2-manual'` をセットする（空文字・未設定・null 禁止）。
- **部分成功（確定）**: 1 件でも条件不一致や重複等があっても、更新可能なものは更新し、更新不可は理由付きで返す（全体拒否はしない）。
- **出力（確定：概念固定）**:
  - `updatedBillIds: string[]`（closeSnapshot を新規付与できた bill）
  - `skipped: Array<{ billId: string; reason: string }>`（例: `already_marked`, `status_mismatch`, `businessDate_mismatch`, `not_found` 等）
  - `updatedCount: number`
- **権限**: 管理者またはそれに準ずる権限のみ許可（既存パターンに合わせる）。
- **失敗時**: リクエスト全体が失敗するのは「認可失敗」「Firestore 致命エラー」などに限定する。bill 単位の不一致は `skipped` として扱う。
- **冪等性（確定）**: 同じ `billId` に再実行しても `closeSnapshot` が存在するため `already_marked` でスキップされ、結果的に冪等となる。

---

## 6. データ仕様（closeSnapshot・判定条件）

### 6.1 未会計billsの判定条件（Step2）

取得・フラグ付与の対象は**当日営業日分のみ**とする。

- **businessDate** == 当日営業日（`getCurrentBusinessDateKeyOrThrow` 等で取得する現在の営業日）
- **status** in `['open', 'in_progress', 'settling']`

※ 前日以前の businessDate の「取り残し」は Step2 では対象外とする。Step3 または運用改善で扱う。

### 6.2 closeSnapshot の構造

`bills/{billId}` に次のフィールドを追加する。**lastCloseRunId は必ず文字列で持ち、optional / nullable は禁止**とする。

```ts
closeSnapshot?: {
  lastCloseRunId: string;       // Step2 は 'step2-manual'、Step3 は実 closeRunId（空文字禁止）
  markedAt: Timestamp;
  closedBusinessDate: string;
  unresolved: true;
}
```

### 6.3 lastCloseRunId の扱い（確定）

- **必ず文字列**: closeSnapshot を付与するとき、**lastCloseRunId は必ず設定する**。未設定・null・空文字は禁止。
- **Step2**: closeRuns が存在しないため、固定文字列 **`'step2-manual'`** を入れる。
- **Step3**: storeMeta/closeRuns 導入後は、閉店処理で発行した実 **closeRunId** を入れる。空文字は禁止。
- 実 closeRunId の生成・保存・紐付けは **Step3 で storeMeta/closeRuns を実装したうえで**行う。

### 6.4 その他

- **markedAt**: フラグ付与時に `FieldValue.serverTimestamp()` でよい。
- **closedBusinessDate**: フラグ付与時に「当日営業日」を渡す（getCurrentBusinessDateKeyOrThrow の結果など）。
- **index**: `closeSnapshot` や `closeSnapshot.unresolved` でクエリする場合は、必要に応じて Firestore の複合インデックスを追加する。Step2 では一覧取得は「businessDate + status」で行い、closeSnapshot は主に「この伝票が閉店時未会計だったか」の印として参照する想定。インデックス要件は実装・運用で確定する。

---

## 7. テスト観点（最低限）

- **取得**: 当日営業日で status が open / in_progress / settling の bills が存在するとき、取得用 Callable がそれらを返すこと。0 件のときは空配列を返すこと。
- **取得**: 当日営業日以外の bills、または status が settled の bills は取得結果に含まれないこと。
- **権限**: 権限のない呼び出し元では取得・フラグ付与のいずれもエラーとなること。
- **フラグ付与**: 指定した billId に対し、closeSnapshot が付与されること。markedAt, closedBusinessDate, unresolved が期待どおりであること。lastCloseRunId は Step2 では **'step2-manual'** であること（空文字禁止）。
- **フラグ付与（冪等）**: 既に closeSnapshot が付いている bill に再度付与した場合、書き込まず `already_marked` としてスキップされること（結果として冪等）。
- **UI**: ボタン表示・ダイアログ表示・0件時の表示・確定押下で付与 Callable が呼ばれること（手動または E2E で確認）。
- **結果表示・再試行**: 付与結果で成功（updated）と失敗/スキップ（skipped）が bill 単位で表示され、失敗分のみ再試行できる導線があること。

---

## 8. Step3 への持ち越し項目

- **storeMeta/closeRuns の導入**: closeRunId の生成・保存・bills.closeSnapshot.lastCloseRunId への確実な付与。
- **storeMeta/closeRuns/{closeRunId}/unsettledBills/{billId}**: 閉店処理本線での未会計一覧の索引。作成タイミングは閉店処理本線に組み込む。
- **閉店処理本線との統合**: 未会計billsの取得・フラグ付与（または索引作成）を閉店ターミナル関数から呼び出す。
- **Step2 の手動フラグ付与との整合**: lastCloseRunId が **'step2-manual'** の既存 closeSnapshot を、Step3 でどう扱うか（そのまま「手動移管」として残すか、後から closeRunId を埋め直すか等）。Step3 の implementation_plan に記載する。

---

## 9. 完了条件（Definition of Done）

- [x] システム設定画面に「未会計billsの移管」ボタンが追加されている。
- [x] ボタン押下で未会計bills取得用 Callable が呼ばれ、当日営業日・status in ['open','in_progress','settling'] の bills が取得できる。
- [x] 取得結果がダイアログで一覧表示され、1行あたり pokerName / 金額（表示用）/ 入店日時（表示用）が表示される。
- [x] ユーザーが確定ボタンを押すと、closeSnapshot 付与用 Callable が呼ばれ、結果（updated / skipped）が表示され、失敗分のみ再試行できる。
- [x] closeSnapshot の構造が本 ChangeSpec に従い、Step2 では lastCloseRunId に **'step2-manual'** が設定されている（空文字・未設定・null 禁止）。
- [x] 権限のないユーザーでは取得・付与ができない。
- [x] 上記テスト観点を満たす。
- [x] **Step2 実装完了**（2025年2月）。本 ChangeSpec は「未会計billsの移管」UI の仕様書として完了。実装は `implementation_summary.md` に記載。

### 9.1 Step2 実装完了に含まれる追加フロー（本 ChangeSpec のスコープ外）

Step2 完了時には、以下の「未会計の会計」フローも実装済みである。仕様の詳細は `implementation_summary.md` の「§10. 未会計の会計フロー」を参照。

- ターミナルホームの「未会計の会計」→ 未会計の会計ページ（タブ: 日付ごと／ユーザー別）→ ユーザー別で未会計bills一覧（**営業日**表示、請求書IDは非表示）→ 会計ページで会計完了 → `finalizeUnsettledBillAfterAccounting` で closeSnapshot.unresolved を false にし、unsettledBillsCount をデクリメント。
- 会計管理ページ（accountingPage）では、closeSnapshot.unresolved が true の bill は一覧対象外とするフィルタを適用。
