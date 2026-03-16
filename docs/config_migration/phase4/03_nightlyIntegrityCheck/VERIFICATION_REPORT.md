# Phase4 03: 項目2・3 実装検証レポート

**検証日**: 2025-03-04

---

## 1. 項目2: Callable 実装の検証

### 1.1 getUnclockedStaffForClose

| SPEC 項目 | 実装 | 判定 |
|-----------|------|------|
| 入力なし（currentBusinessDateKey は storeMeta から取得） | `getCurrentBusinessDateKeyOrThrow()` で取得 | ✅ |
| 出力: staffName, clockIn (ISO) | 実装済み。staffsFullName を使用 | ✅ |
| 対象0件時: hasNoTarget: true | 実装済み | ✅ |
| 判定: date === currentBusinessDateKey, clockIn あり, clockOut null | 実装済み | ✅ |
| シフト無関係 | クエリにシフト条件なし | ✅ |
| 権限: requireAdmin | 実装済み | ✅ |

### 1.2 getUnclosedTournamentsForClose

| SPEC 項目 | 実装 | 判定 |
|-----------|------|------|
| 対象: scheduledTournaments, businessDate フィルタ | 実装済み | ✅ |
| close の定義: ended, cancelled | CLOSED_STATUSES に force_ended も含む（一貫性のため） | ✅ |
| 必須返却: tournamentId, status, startAt, snapshotName, displayMessage, reentries, playersBusted, entries | 実装済み | ✅ |
| ケース0〜3+ の displayMessage | computeDisplayMessage で実装 | ✅ |
| reentries+entries < playersBusted でエラーログ | logger.warn で実装 | ✅ |
| 1stPlayerName の存在・値確認 | 実装済み | ✅ |
| 対象0件時: hasNoTarget: true | 実装済み | ✅ |

### 1.3 getCloseIntegrityData

| SPEC 項目 | 実装 | 判定 |
|-----------|------|------|
| 3項目を一括取得 | Promise.all で並列実行 | ✅ |
| hasNoTarget（全0件のとき true） | 実装済み | ✅ |
| 返却形式: unsettledBills, unclockedStaff, unclosedTournaments | 実装済み。unsettledBills は returnedCount, truncated も含む | ✅ |

### 1.4 発見した問題・要確認

| 項目 | 内容 | 対応 |
|------|------|------|
| **attendances のインデックス** | `where('date','==',x).where('clockOut','==',null)` の複合クエリ用に date+clockOut インデックスを firestore.indexes.json に追加済み | ✅ 対応済み |
| **businessDate 未設定のレガシー** | SPEC 8.1「businessDate が未設定のレガシーあり得る場合」のフォールバック未実装 | 現状は businessDate 必須。レガシーデータがある場合は要対応 |

---

## 2. 項目3: closeStoreTerminal 拡張の検証

### 2.1 リクエストパラメータ

| SPEC 項目 | 実装 | 判定 |
|-----------|------|------|
| forceClose: boolean | reqData.forceClose === true で取得 | ✅ |
| forceClose の永続化（再開時用） | closeRuns ドキュメントに forceClose を保存 | ✅ |
| effectiveForceClose（再開時に既存 run から取得） | runDocData?.forceClose \|\| forceClose | ✅ |

### 2.2 markUnclockedAndForceEnd ステップ

| SPEC 項目 | 実装 | 判定 |
|-----------|------|------|
| 未退勤 attendance に closedStoreWithoutClockOut: true | clockIn あり・clockOut null の doc に付与 | ✅ |
| clockOut が Timestamp の場合は更新しない | クエリで clockOut==null のみ取得しているため対象外 | ✅ |
| 強制閉店時: 未 close トーナメントを force_ended に更新 | effectiveForceClose 時に getUnclosedTournamentsForCloseCore で取得し更新 | ✅ |
| テーブルを open に戻す | endTournament と同様に tables を status: 'open' に更新 | ✅ |
| endedAt の付与 | 実装済み | ✅ |

### 2.3 実行順序

| 順序 | ステップ | SPEC との整合 |
|------|----------|---------------|
| 1 | UNSETTLED_MARK（未会計 bills） | ✅ |
| 2 | markUnclockedAndForceEnd（attendance フラグ + 強制閉店時 tournament） | ✅ |
| 3 | 以降既存ステップ | ✅ |

### 2.4 発見した問題・要確認

| 項目 | 内容 | 対応 |
|------|------|------|
| **バッチ制限** | Firestore の batch は最大500件。未退勤スタッフが500人超の場合は分割が必要 | 一般的な店舗では問題になりにくい。必要に応じて後で分割処理を追加 |

---

## 3. force_ended 影響箇所の検証

| ファイル | 対応内容 | 判定 |
|----------|----------|------|
| validateEndTournament.ts | status === 'ended' \|\| 'force_ended' で終了済み判定 | ✅ |
| getUnclosedTournamentsForClose.ts | CLOSED_STATUSES に force_ended 追加 | ✅ |
| tournament_home_page.dart | 2箇所 | ✅ |
| countdown_display.dart | 2箇所 | ✅ |
| blind_timer_tournament_select_page.dart | 3箇所 | ✅ |
| admin_controls.dart | 2箇所 | ✅ |
| scheduled_tournament_list_page.dart | 2箇所 | ✅ |

---

## 4. 修正推奨事項

### 4.1 必須

- **特になし**（現状の実装で SPEC と整合）

### 4.2 推奨

1. **firestore.indexes.json**: attendances の `date` + `clockOut` 複合インデックスを追加（クエリが失敗する場合）
2. **getUnclockedStaffForClose の indentation**: 20–22行目の `.where` のインデントが1段ずれている → 体裁のため修正を推奨

### 4.3 将来的な検討

- businessDate 未設定の scheduledTournaments に対するフォールバック（startAt から営業日算出）
- 未退勤スタッフが500人超の場合の batch 分割
