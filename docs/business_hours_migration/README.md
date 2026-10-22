# 営業時間設定のFirestore移行 改修ドキュメント

## 概要

このドキュメントは、営業日計算時の営業時間取得先を`lib/globalConstant.dart`からFirestore上の`businessHoursMonthlyMap`に変更する改修に関する情報をまとめています。

## 改修の目的

- 営業日ごとの営業時間をFirestore上で管理可能にする
- 月次単位で営業時間を変更できるようにする
- `calcBusinessDate.ts`を共通関数として維持し、営業日計算のみに専念させる
- 単一状態ドキュメント（`storeMeta/currentBusinessDay`）を導入し、UI/Functionsが「現在営業日」を1点参照で取得できるようにする
- 週次Planner + Cloud Tasksによる自動開閉店機能を実装する

## 改修方針

1. **営業日判定の用途分離**:
   - 【現在時刻（いま）】のデータ格納・表示（当日画面など）: `getCurrentBusinessDate`（= `storeMeta/currentBusinessDay`参照）を使用
   - 【予定・任意日時（いま以外）】の営業日算出: `calcBusinessDate`を使用（`businessHoursMonthlyMap`参照、±30分バッファ、OK/NONE/AMBIGUOUS対応）

2. **UI「当日」の定義**:
   - 本改修でいう「当日」とは、端末の暦日（calendar date）ではなく、現在進行中の営業日（`currentBusinessDateKey`）を指す
   - 当日データを表示するUIは必ず`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得し、その`currentBusinessDateKey`をbills等の実フィールド`businessDate`に対して`isEqualTo: currentBusinessDateKey`でクエリする
   - 当日画面で`DateTime.now()` / `DateFormat('yyyyMMdd')` / `STORE_CLOSE_HOUR`等により暦日ベースで「当日キー」を作ってクエリすることは禁止（25:00問題の再発防止）

3. **当日画面内のタブ/プルダウン（翌日・期間表示）**:
   - 当日画面には、タブ/プルダウンで「翌日」「過去N日」「指定期間」などを表示するUIが存在し得る
   - これらは`currentBusinessDateKey`を起点に、営業日キー列（`businessDateKey`の配列）を生成し、それを`businessDate`フィールドでクエリする
   - **重要**: 単純な「日付+1」は禁止（その月末/年末などで破綻するため）
    - Dart側では`DateTime`加算（`add(Duration(days: 1))`）などで暦日の繰り上がりを正しく処理し、`YYYY-MM-DD`に整形して`businessDateKey`を生成する
    - ただしこれは「営業日キー列生成」のための暦日演算であり、「任意日時がどの営業日に属するか」は`calcBusinessDate`を使う

4. **期間表示のクエリ戦略**:
   - 期間表示の実現方法は2通りあるため、ページごとに実装を確認して選択する:
     - パターンA: `businessDate`フィールドで範囲クエリ（`where('businessDate', '>=', startKey).where('businessDate', '<=', endKey)`）
     - パターンB: キー配列（`whereIn`分割、複数クエリ）※`whereIn`制約（最大10要素）に注意

5. **calcBusinessDate仕様**:
   - `businessHoursMonthlyMap`を参照して営業時間を取得
   - 営業時間の前後±30分をバッファとして含める
   - 戻り値: `OK | NONE | AMBIGUOUS`
   - UIは`NONE`時にエラーダイアログ、`AMBIGUOUS`時に候補選択ダイアログを表示

6. **単一状態ドキュメント（storeMeta/currentBusinessDay）**:
   - 目的: UI/Functionsが「現在営業日」を1点参照で得るためのSSoT
   - 必須フィールド: `status`, `currentBusinessDateKey`, `lastClosedBusinessDateKey`, `updatedAt`, `source`, `lastError`
   - 失敗ログ: `storeMeta/currentBusinessDay/logs`サブコレクションに記録
   - **更新経路**: 
     - UIはread-only（snapshot購読のみ）
     - 更新はFunctions経由のみ（手動更新は管理者のみ）
     - UIからの直接書き込みは禁止（運用事故防止）

7. **自動化（週次Planner + Cloud Tasks）**:
   - Cloud Schedulerは週1回（例：日曜20:00 JST）だけ起動
   - 起動されたPlannerが、翌週（月〜日）分の「閉店認定」「開店認定」タスクをCloud Tasksに`scheduleTime`付きで投入
   - 自動処理は破壊的操作を行わず、認定結果のみをstate docに記録
   - UIは認定結果を検知し、閉店時間超過時は画面操作を実質ブロック（意思決定強制）
   - 詳細仕様は[自動開閉店（補助）機能 仕様書](./automatic_store_assessment_spec.md)を参照

## 旧方針との差分（何が変わったか）

- **旧方針**: `businessDate`でクエリする場合は必ず`calcBusinessDate.ts`を使用
- **新方針**: 
  - 現在営業日（当日）のクエリは`state doc`（`getCurrentBusinessDate`）を使用
  - 予定/任意日時のみ`calcBusinessDate`を使用
- **理由**: リアルタイム性が重要であり、当日画面はFunctionsを呼ばずに直接Firestoreを参照する

## ドキュメント構成

- [Step0: 最終仕様](./step0_final_spec.md) - ✅ 完了
  - 営業日判定・開閉店自動化の最終仕様（SSoT）
  - 用語、SSoT一覧、営業日判定の用途分離、calcBusinessDate仕様、state doc仕様、UI期待動作、自動化仕様、セキュリティ要件、実装ステップ
- [Step1: コレクション分析](./step1_collection_analysis.md) - ✅ 完了
  - businessDateを格納する必要があるコレクションの洗い出し
  - 各コレクションの日時フィールドの現状分析
  - 対象外コレクションの一覧化
  - 現在営業日 vs 予定/任意日時の軸を追加
- [Step2: 取得・表示ファイルの洗い出し](./step2_query_display_files.md) - ✅ 完了
  - 更新対象コレクションを取得・表示しているファイルの洗い出し
  - 修正が必要なファイルと修正内容の整理
  - 当日画面はstate docを使用、予定/任意日時はcalcBusinessDateを使用
- [Step3: state docと自動開閉店の設計](./step3_state_doc_and_scheduling.md) - ✅ 完了
  - `storeMeta/currentBusinessDay`の設計
  - 状態遷移、手動open/close、Tasks冪等、週次Planner、エラー時の挙動
- [自動開閉店（補助）機能 仕様書](./automatic_store_assessment_spec.md) - ✅ 完了
  - 自動開閉店の補助機能としての詳細仕様
  - 閉店認定・開店認定の処理フロー、UI強警告、冪等性保証、認証/IAM仕様
- [Step4: 改修実装チェックリスト](./step4_migration_plan_checklist.md) - ✅ 完了
  - UI（Dart）チェックリスト
  - Functions（TS）チェックリスト
  - Schedulingチェックリスト
  - テスト観点

## Phase6: 手動開閉店処理の実装（4ステップに分割）

Phase6は以下の4ステップに分けて実装します：

- [Phase6 Step1: UIでstoreMetaをsnapshot購読する仕様の実装](./phase6/step1/implementation_plan.md) - ⏳ 未着手
  - 複数ページで`storeMeta/currentBusinessDay`をsnapshot購読
  - `lib/utils`に共通実装を作成
  - AppBar内にボタン兼日付表示要素を追加

- [Phase6 Step2 (Phase7): 閉店処理の具体処理の作成](./phase6/step2/implementation_plan.md) - ⏳ 未着手
  - 未会計billsの抽出と保存
  - ユーザー判断を挟む場所の検討
  - 未会計billsのUI表示作成

- [Phase6 Step3 (Phase8): 閉店処理の一括操作の実装](./phase6/step3/implementation_plan.md) - ⏳ 未着手
  - 日付ボタンからの開閉店操作
  - ターミナル関数経由での閉店処理実行
  - エラーハンドリングと処理順序の考慮

- [Phase6 Step4 (Phase9): storeMeta監視ページでの自動開閉店時の挙動・表示の実装](./phase6/step4/implementation_plan.md) - ⏳ 未着手
  - 自動開閉店処理時の挙動・表示の実装
  - `lib/utils`に共通実装を作成

**重要**: 各ステップを始める際に、検討事項が残っているステップについては、changeSpecの作成や実装の前に必ず検討事項の方針を固めてからスタートしてください。

## 保留中の作業

- [保留中の後回しにしている作業](./deferred_tasks.md) - 検討中または保留中の作業一覧
  - `attendances`コレクションへの`businessDate`追加（保留）
  - `attendanceCorrectionRequests`コレクションへの`businessDate`追加（保留）

**重要**: `deferred_tasks.md`に記載されている作業の実装は、ユーザーから明確に指示された時にのみ行ってください。

## 参照資料

- [営業日判定要件分析](../business_date_analysis/README.md) - 既存の営業日判定要件分析
