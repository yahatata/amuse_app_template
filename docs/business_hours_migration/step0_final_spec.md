# 営業日判定・開閉店自動化（単一状態ドキュメント＋週次Planner＋Cloud Tasks）最終仕様

## 1. 目的と非目的（スコープ）

### 目的
- 営業日計算時の営業時間取得先を`lib/globalConstant.dart`からFirestore上の`businessHoursMonthlyMap`に変更する
- 営業日判定の用途を明確に分離し、現在営業日（当日）と予定・任意日時の判定を適切に使い分ける
- 単一状態ドキュメント（`storeMeta/currentBusinessDay`）を導入し、UI/Functionsが「現在営業日」を1点参照で取得できるようにする
- 週次Planner + Cloud Tasksによる自動開閉店機能を実装する

### 非目的（スコープ外）
- 営業時間の設定UIの実装（別工程）
- 既存データのマイグレーション（別工程）
- 営業日判定の基本概念（営業日＝営業時間に基づく）を変えることはしない
  - ただし、参照先をFirestore（`businessHoursMonthlyMap`）へ移し、±30分バッファと`OK`/`NONE`/`AMBIGUOUS`を追加するため、関数実装は変更する

---

## 2. 用語

### businessDateKey
- 営業日を表す文字列（`YYYY-MM-DD`形式）
- 例: `2024-01-15`
- 営業日は営業時間が日を跨ぐ場合があるため、カレンダー日付とは異なる
- **用語統一**: 本ドキュメントでは`businessDateKey`を正として使用。Firestoreフィールド名が`businessDate`の場合は「フィールド名」として括弧書きで説明する

### currentBusinessDay
- Firestore上の単一状態ドキュメント（`storeMeta/currentBusinessDay`）
- 現在進行中の営業日を表すSSoT（Single Source of Truth）
- 必須フィールド:
  - `status`: `'closed' | 'running' | 'error'`
  - `currentBusinessDateKey`: `'YYYY-MM-DD' | null`
  - `lastClosedBusinessDateKey`: `'YYYY-MM-DD' | null`
  - `updatedAt`: Timestamp
  - `source`: string（更新元の識別子）
  - `lastError`: `{ code: string, message: string, at: string, context?: any } | null`（直近のエラー要約）
    - `code`: エラーコード
    - `message`: エラーメッセージ
    - `at`: 失敗したステップ名（例: `'open:setStateDoc'`, `'close:cleanupActiveStays'`）
    - `context`: 任意のコンテキスト情報（例: `{ businessDateKey: '2024-01-15' }`）

### calcBusinessDate
- 任意の日時から営業日を計算する関数（`functions/src/helpers/billsApi/calcBusinessDate.ts`）
- `businessHoursMonthlyMap`を参照して営業時間を取得
- 営業時間の前後±30分をバッファとして含める
- 戻り値: `OK | NONE | AMBIGUOUS`
  - `OK`: 単一の営業日に属する
  - `NONE`: どの営業日にも属さない
  - `AMBIGUOUS`: 複数営業日に跨る

### getCurrentBusinessDate
- `storeMeta/currentBusinessDay`から現在営業日を取得する関数（予定）
- UIはFirestoreのsnapshot購読で`currentBusinessDateKey`を取得する（リアルタイム性重視）

### buffer（±30分）
- 営業時間の前後30分を拡張したウィンドウとして扱う
- 例: 営業時間が20:00-28:00の場合、19:30-28:30の範囲を拡張ウィンドウとして扱う
- 判定ロジック:
  1. ±30分を拡張したウィンドウに時刻（`ts`）が含まれる営業日候補を列挙する
  2. 候補数が0 → `NONE`、1 → `OK`、2以上 → `AMBIGUOUS`を返す
- 注意: バッファ内でも片側の日にしか入らないケースは`OK`になる（`AMBIGUOUS`になるのは同一時刻が2つ以上の営業日ウィンドウに含まれる場合のみ）

---

## 3. SSoT一覧

### state doc（`storeMeta/currentBusinessDay`）
- **用途**: 現在進行中の営業日（当日）の取得
- **更新タイミング**: 開店時・閉店時・エラー時
- **参照方法**: UIはFirestoreのsnapshot購読、Functionsは`getCurrentBusinessDateKeyOrThrow()`を使用

### businessHoursMonthlyMap
- **用途**: 営業時間の設定（月次単位）
- **格納場所**: Firestore（コレクション名は実装時に確定）
- **参照方法**: `calcBusinessDate.ts`内で参照
- **データ構造**:
  ```typescript
  {
    days: {
      "10": {
        closeMinute: 1440,  // 閉店時刻（分単位、1440=24:00）
        isClosed: false,    // 休業日かどうか
        openMinute: 720,    // 開店時刻（分単位、720=12:00）
        source: "auto",     // データソース
        styleId: "weekendHoliday" | "weekday"  // スタイルID
      },
      "11": { ... },
      // ... 1ヶ月分（1-31日）
    }
  }
  ```
- **注意**: 
  - `days`キーは日付の文字列（例: `"10"`, `"11"`）で、`"1"`/`"01"`の揺れがあり得るため、実装ではnormalizeして両対応する必要がある
  - `openMinute`: 分単位（0-1440、1440=24:00）
  - `closeMinute`: 分単位（0-2880、1440=24:00、2880=48:00）
    - `closeMinute > 1440`の場合は「翌日に伸びる」ことを意味する（例: `1680` = 28:00 = 翌日04:00）
  - `isClosed: true`の場合は営業日ではない
  - 月跨ぎ対応: 1日の場合は前月分のドキュメントも確認、28-31日の場合は次月のドキュメントも確認が必要

---

## 4. 営業日判定の用途分離（最重要）

### 【現在時刻（いま）】のデータ格納・表示（当日画面など）
- **使用する関数**: `getCurrentBusinessDate`（= `storeMeta/currentBusinessDay`参照）
- **UIの実装**: Firestoreの`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得
- **理由**: リアルタイム性が重要であり、Functionsを呼ばずに直接Firestoreを参照する

### 【予定・任意日時（いま以外）】の営業日算出
- **使用する関数**: `calcBusinessDate`
- **参照先**: `businessHoursMonthlyMap`を参照して営業時間を取得
- **バッファ**: 営業時間の前後±30分を含める
- **戻り値**: `OK | NONE | AMBIGUOUS`
- **UIの実装**:
  - `NONE`: エラーダイアログ（「この時刻はどの営業日にも属しません」）
  - `AMBIGUOUS`: 候補から選択ダイアログ（「この時刻は複数の営業日に跨ります。どの営業日に属させますか？」）

### 重要：既存方針との差分
- **旧方針**: `businessDate`でクエリする場合は必ず`calcBusinessDate.ts`を使用
- **新方針**: 
  - 現在営業日（当日）のクエリは`state doc`（`getCurrentBusinessDate`）を使用
  - 予定/任意日時のみ`calcBusinessDate`を使用

---

## 5. calcBusinessDate仕様（±30分、OK/NONE/AMBIGUOUS、候補選択、ダイアログ要件）

### businessHoursMonthlyMapのデータ構造

```typescript
{
  days: {
    "10": {
      closeMinute: 1440,  // 閉店時刻（分単位、1440=24:00）
      isClosed: false,    // 休業日かどうか
      openMinute: 720,    // 開店時刻（分単位、720=12:00）
      source: "auto",     // データソース
      styleId: "weekendHoliday" | "weekday"  // スタイルID
    },
    "11": { ... },
    // ... 1ヶ月分（1-31日）
  }
}
```

### 計算ロジック
1. `businessHoursMonthlyMap`から該当月の営業時間を取得
   - **月跨ぎ対応**: 
     - 1日の場合は前月分のドキュメントも確認（前月の最終営業日に属する可能性があるため）
     - 28-31日の場合は次月のドキュメントも確認（次月の最初の営業日に属する可能性があるため）
2. `days`マップから該当日のデータを取得（キーは日付の文字列、例: `"10"`, `"11"`）
   - **注意**: daysキーは`"1"`/`"01"`の揺れがあり得るため、実装ではnormalizeして両対応する必要がある
3. `isClosed: true`の場合は営業日ではない（`NONE`を返す）
4. `openMinute`/`closeMinute`を分単位から時刻に変換（例: `720` → `12:00`, `1440` → `24:00`）
5. 営業時間の前後±30分をバッファとして含める
6. 入力日時がどの営業日に属するかを判定

### 戻り値
- `OK`: 単一の営業日に属する（`businessDateKey`を返す）
- `NONE`: どの営業日にも属さない（バッファ外の時刻）
- `AMBIGUOUS`: 複数営業日に跨る（バッファ内の時刻で、前後の営業日に属する可能性がある）

### UI要件
- **NONEの場合**: エラーダイアログを表示
  - メッセージ: 「この時刻はどの営業日にも属しません。別の時刻を選択してください。」
- **AMBIGUOUSの場合**: 候補選択ダイアログを表示
  - メッセージ: 「この時刻は複数の営業日に跨ります。どの営業日に属させますか？」
  - 候補: 前後の営業日のリスト
  - ユーザーが選択した営業日を使用

---

## 6. state doc仕様（status、フィールド、lastClosed、error時の扱い、logs）

### 必須フィールド
- `status`: `'closed' | 'running' | 'error'`
  - `closed`: 閉店中
  - `running`: 営業中
  - `error`: エラー状態
- `currentBusinessDateKey`: `'YYYY-MM-DD' | null`
  - 現在進行中の営業日（`status`が`running`の場合は必須）
- `lastClosedBusinessDateKey`: `'YYYY-MM-DD' | null`
  - 最後に閉店した営業日
- `updatedAt`: Timestamp
- `source`: string（更新元の識別子、例: `'manual'`, `'scheduler'`, `'cloud_task'`）
- `lastError`: string | null（エラー時の原因ヒント）

### 状態遷移
- `closed` → `running`: 開店時
- `running` → `closed`: 閉店時
- `running` → `error`: 開店処理失敗時
- `closed` → `error`: 閉店処理失敗時
- `error` → `closed` / `running`: 手動復旧時

### エラー時の扱い
- `status`が`error`の場合、`currentBusinessDateKey`は`null`になる可能性がある
- UIは`error`状態を検知し、適切なエラーメッセージを表示する
- エラー復旧は手動で行う（現段階では自動復旧は実装しない）

### 失敗ログ
- `storeMeta/currentBusinessDay/logs`サブコレクションに、開店/閉店のどのステップが失敗したかを詳細に記録
- ログエントリのフィールド（必須）:
  - `type`: `'open' | 'close'`（開店/閉店の種別）
  - `businessDateKey`: `'YYYY-MM-DD'`（対象の営業日）
  - `trigger`: `'manual' | 'auto'`（手動/自動）
  - `failedStep`: string（失敗したステップ名、例: `'open:setStateDoc'`, `'close:cleanupActiveStays'`）
  - `errorCode`: string（エラーコード）
  - `errorMessage`: string（エラーメッセージ）
  - `causeHint`: string | null（推定原因のヒント）
  - `createdAt`: Timestamp（ログ作成時刻）
  - `context`: any | null（任意のコンテキスト情報）
- `lastError`は直近の要約、`logs`は詳細履歴として役割分担

---

## 7. UI期待動作（当日=現在営業日、当日ページ、タブ/期間、単純+1禁止、期間クエリ戦略A/B、リアルタイム性）

### 当日の定義
- **本改修でいう「当日」とは、端末の暦日（calendar date）ではなく、現在進行中の営業日（`currentBusinessDateKey`）を指す**
- 当日データを表示するUIは必ず:
  1. `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得
  2. その`currentBusinessDateKey`をbills等の実フィールド`businessDate`に対して`where('businessDate', isEqualTo: currentBusinessDateKey)`でクエリする

### 禁止事項
- 当日画面で`DateTime.now()` / `DateFormat('yyyyMMdd')` / `STORE_CLOSE_HOUR`等により暦日ベースで「当日キー」を作ってクエリすることは禁止（25:00問題の再発防止）

### 当日画面内のタブ/プルダウン（翌日・期間表示）
- 当日画面には、タブ/プルダウンで「翌日」「過去N日」「指定期間」などを表示するUIが存在し得る
- これらは`currentBusinessDateKey`を起点に、営業日キー列（`businessDateKey`の配列）を生成し、それを`businessDate`フィールドでクエリする
- **重要**: 単純な「日付+1」は禁止（その月末/年末などで破綻するため）
  - Dart側では`DateTime`加算（`add(Duration(days: 1))`）などで暦日の繰り上がりを正しく処理し、`YYYY-MM-DD`に整形して`businessDateKey`を生成する
  - ただしこれは「営業日キー列生成」のための暦日演算であり、「任意日時がどの営業日に属するか」は`calcBusinessDate`を使う

### 期間表示のクエリ戦略（Firestore制約を踏まえる）
- 期間表示の実現方法は2通りあるため、ページごとに実装を確認して選択する:
  - **パターンA**: `businessDate`フィールドで範囲クエリ（`where('businessDate', '>=', startKey).where('businessDate', '<=', endKey)`）
  - **パターンB**: キー配列（`whereIn`分割、複数クエリ）※`whereIn`制約（最大10要素）に注意
- どちらを採るかは対象コレクション/UX/リアルタイム要件/コストを踏まえて判断する

### リアルタイム性
- 当日画面は`storeMeta/currentBusinessDay`をsnapshot購読することで、営業日の切り替え（開店/閉店）をリアルタイムに反映する

---

## 8. 自動化仕様（週次Planner→Tasks、冪等、ON/OFF、30日制限の注意）

### 週次Planner
- Cloud Schedulerは週1回（例：日曜20:00 JST）だけ起動
- 起動されたPlannerが、翌週（月〜日）分のopen/closeをCloud Tasksに`scheduleTime`付きで投入
- Plannerの入力: `businessHoursMonthlyMap`から該当週の営業時間を取得
- Plannerの出力: Cloud Tasks一覧（`open_YYYY-MM-DD`, `close_YYYY-MM-DD`）

### Cloud Tasks
- Tasks名は冪等のため固定化（例: `open_YYYY-MM-DD` / `close_YYYY-MM-DD`）
- `scheduleTime`を指定して、指定時刻に実行されるように設定
  - **デフォルト**: `openMinute` / `closeMinute`ちょうどに実行
  - **安全のための前後オフセット**（オプション）:
    - 開店タスク: `TASK_OPEN_OFFSET_MINUTES`（デフォルト: 0、`globalConstant`で設定可能）
    - 閉店タスク: `TASK_CLOSE_OFFSET_MINUTES`（デフォルト: 0、`globalConstant`で設定可能）
    - 例: 閉店直後に集計を走らせたい場合は`TASK_CLOSE_OFFSET_MINUTES = 60`（1時間後）に設定
  - **注意**: このオフセットは「営業日判定用の±30分バッファ」とは別物（タスク実行時刻の調整用）
- 再実行耐性: 同じ`taskName`で再実行された場合、既存のタスクが存在するかチェックし、存在する場合はスキップ

### 自動開閉店のON/OFF
- `globalConstant`のON/OFFで切替（店舗ごとにFirebaseプロジェクト分離前提で可）
- ONの場合: 週次Plannerが起動し、Cloud Tasksが投入される
- OFFの場合: 週次Plannerは起動してもno-op（Tasks作成しない）を原則とする
  - 実装方法: Schedulerは起動するが、Plannerの中で`ENABLE_AUTO_OPEN/CLOSE`を見てTasks作成をスキップ
  - 補足: 可能ならScheduler自体を作らない（デプロイ構成分岐）も選択肢だが、Firebase Functions的にはやや面倒

### Schedulerのcron設定
- Schedulerのcronを`globalConstant`で「定数化」はできるが、変更には再デプロイが必要（動的変更ではない）ことを明記

### 30日制限の注意
- Cloud Tasksの`scheduleTime`は最大30日先まで設定可能
- 週次Plannerは翌週分のみ投入するため、30日制限には抵触しない
- ただし、将来的に月次Plannerを導入する場合は、30日制限を考慮する必要がある

---

## 9. セキュリティ要件（Tasks→HTTPの認証は必須、公開URL禁止）

### Cloud TasksからHTTP Functionsへの呼び出し
- Cloud TasksからHTTP Functionsを呼び出す場合、認証は必須
- 公開URL（認証なし）での呼び出しは禁止
- 認証方法: Cloud Tasksの認証ヘッダーを使用（OIDCトークンなど）

### Firestore Rules
- `storeMeta/currentBusinessDay`は読み取り専用（UIはsnapshot購読のみ）
- 更新はFunctions経由のみ（手動更新は管理者のみ）
- **重要**: UIからの直接書き込みは禁止（運用事故防止）

---

## 10. 実装ステップ（Phase0〜）

### Phase0: 準備（docs整備）
- ✅ Step0: 最終仕様確定（本ドキュメント）
- ✅ Step1: コレクション分析
- ✅ Step2: 取得・表示ファイルの洗い出し
- ✅ Step3: state docと自動開閉店の設計
- ✅ Step4: 改修実装チェックリスト

### Phase1: state doc導入
- `storeMeta/currentBusinessDay`ドキュメントの作成
- `getCurrentBusinessDateKeyOrThrow()`関数の実装
- 手動開店/閉店機能の実装（state doc更新のみ）

### Phase2: businessHoursMonthlyMap導入
- `businessHoursMonthlyMap`の参照機能を`calcBusinessDate.ts`に統合
- `calcBusinessDate.ts`の±30分バッファ、OK/NONE/AMBIGUOUS対応

### Phase3: UI改修（当日画面）
- 当日画面で`storeMeta/currentBusinessDay`をsnapshot購読
- `_getBusinessDate()`等の削除・置き換え
- タブ/プルダウンの翌日・期間表示の改修（`currentBusinessDateKey`起点）

### Phase4: UI改修（予定・任意日時）
- 日付選択UIで`calcBusinessDate`を使用
- `AMBIGUOUS`/`NONE`時のダイアログ実装

### Phase5: 自動開閉店
- 週次Plannerの実装
- Cloud Tasksの投入・実行
- エラーハンドリング・ログ記録

### Phase6: テスト・検証
- 25:00問題の再発防止確認
- `closed`時の動作確認
- `AMBIGUOUS`/`NONE`時の動作確認
- 重複Tasks、再実行、手動/自動競合の確認

---

## 参照資料

- [Step1: コレクション分析](./step1_collection_analysis.md)
- [Step2: 取得・表示ファイルの洗い出し](./step2_query_display_files.md)
- [Step3: state docと自動開閉店の設計](./step3_state_doc_and_scheduling.md)
- [Step4: 改修実装チェックリスト](./step4_migration_plan_checklist.md)
