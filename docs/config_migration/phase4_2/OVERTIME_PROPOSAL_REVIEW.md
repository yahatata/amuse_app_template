# 残業・休日労働対応 提案レビュー

**作成日**: 2026-03-21
**目的**: ユーザーが提案した残業・休日労働・月60時間超対応の設計案をレビューし、不備・矛盾・改善点を整理する。

---

## 全体評価

提案は、従来の phase4_2 設計にはなかった **法定時間外労働（残業）・法定休日労働・月60時間超・月跨ぎ週対応** を体系的にカバーしようとしており、方向性は正しい。特に以下の点は評価できる。

- attendance を SSoT とし、残業結果を持たせず再計算する方針
- payrollStatus による未反映 attendance の管理
- 月跨ぎ週への対応方針（週の先頭から通しで累計）
- 設定の snapshot 化による計算の再現性確保

ただし、**計算ロジックに重大な誤りが1件**あり、その他にも明確化が必要な点がいくつかある。以下に整理する。

---

## A. 重大な問題（修正必須）

### A-1. 残業時間の計算式が誤っている

**該当箇所**: 提案セクション 4-3

提案の式:

```
dailyOverMinutes = max(actualWorkMinutes - 480, 0)
weeklyOverContribution = max(weeklyAfter - max(weeklyBefore, weeklyLegalLimitMinutes), 0)
legalOvertimeMinutes = max(dailyOverMinutes, weeklyOverContribution)
```

**問題**: `max(dailyOverMinutes, weeklyOverContribution)` を各 attendance ごとに適用すると、**日の時間外労働と週の時間外労働の重複排除が正しく行われないケースがある**。

**再現例**: 月〜金 各9時間勤務 = 週45時間

| 日 | 実労働 | 日超過 | 週累計前 | 週累計後 | 週超過寄与 | 提案の式 |
|----|--------|--------|----------|----------|-----------|---------|
| 月 | 540 | 60 | 0 | 540 | 0 | max(60, 0) = **60** |
| 火 | 540 | 60 | 540 | 1080 | 0 | max(60, 0) = **60** |
| 水 | 540 | 60 | 1080 | 1620 | 0 | max(60, 0) = **60** |
| 木 | 540 | 60 | 1620 | 2160 | 0 | max(60, 0) = **60** |
| 金 | 540 | 60 | 2160 | 2700 | 300 | max(60, 300) = **300** |
| **合計** | | | | | | **540分** |

しかし、**正しい法定時間外労働は 300分（5時間）**。

理由:
- 日の時間外: 60分 × 5日 = 300分
- 週の時間外: 2700 - 2400 = 300分
- 日の時間外 300分 は週の時間外 300分 と **完全に重複** している
- 純粋な週の時間外 = max(300 - 300, 0) = 0分
- 合計法定時間外 = 300 + 0 = **300分**

提案の式は **月〜木の日超過 240分を二重計上** してしまう。

**正しい計算方法**:

各 attendance の「法定内労働（= min(actualWorkMinutes, 480)）」だけで週の累計を管理し、法定内累計が週の上限を超えた分だけを「純粋な週の時間外」として加算する。

```
dailyOverMinutes = max(actualWorkMinutes - 480, 0)
dailyRegularMinutes = actualWorkMinutes - dailyOverMinutes

weeklyRegularAfter = weeklyRegularRunning + dailyRegularMinutes
weeklyOnlyOverMinutes =
    max(weeklyRegularAfter - weeklyLegalLimit, 0)
  - max(weeklyRegularRunning - weeklyLegalLimit, 0)

legalOvertimeMinutes = dailyOverMinutes + weeklyOnlyOverMinutes
weeklyRegularRunning = weeklyRegularAfter
```

**検証（月〜金 各9時間）**:

| 日 | 実労働 | 日超過 | 法定内 | 法定内累計前 | 法定内累計後 | 純粋週超過 | 法定時間外 |
|----|--------|--------|--------|-------------|-------------|-----------|-----------|
| 月 | 540 | 60 | 480 | 0 | 480 | 0 | 60 |
| 火 | 540 | 60 | 480 | 480 | 960 | 0 | 60 |
| 水 | 540 | 60 | 480 | 960 | 1440 | 0 | 60 |
| 木 | 540 | 60 | 480 | 1440 | 1920 | 0 | 60 |
| 金 | 540 | 60 | 480 | 1920 | 2400 | 0 | 60 |
| **合計** | | | | | | | **300分** ✓ |

**検証（月〜金 各7時間 + 土10時間 = 45時間）**:

| 日 | 実労働 | 日超過 | 法定内 | 法定内累計前 | 法定内累計後 | 純粋週超過 | 法定時間外 |
|----|--------|--------|--------|-------------|-------------|-----------|-----------|
| 月 | 420 | 0 | 420 | 0 | 420 | 0 | 0 |
| 火 | 420 | 0 | 420 | 420 | 840 | 0 | 0 |
| 水 | 420 | 0 | 420 | 840 | 1260 | 0 | 0 |
| 木 | 420 | 0 | 420 | 1260 | 1680 | 0 | 0 |
| 金 | 420 | 0 | 420 | 1680 | 2100 | 0 | 0 |
| 土 | 600 | 120 | 480 | 2100 | 2580 | 180 | 300 |
| **合計** | | | | | | | **300分** ✓ |

---

### A-2. 法定休日の attendance が残業計算から除外されていない

**該当箇所**: 提案セクション 4-3 と 5-2

提案では「法定休日労働時間」を別途集計すると述べているが、**セクション 4-3 の残業計算ループで法定休日 attendance をスキップする記述がない**。

日本の労基法の原則:
- 法定休日労働はすべて 1.35倍（基本1.0 + 割増0.35）
- 法定休日労働には 1日8時間超 の概念が適用されない
- 法定休日労働は 週40時間 の累計に含めない
- 法定休日労働は 月60時間超 の算定基礎に含めない

**修正方針**:
セクション 4-3 の計算ループ内で、法定休日と判定された attendance は以下のように処理する:

1. `dailyOverMinutes` を計算しない
2. `weeklyRegularRunning` に加算しない
3. `actualWorkMinutes` 全体を `totalLegalHolidayWorkMinutes` に加算
4. `nightWorkMinutes` は通常通り `totalNightWorkMinutes` に加算（深夜+法定休日 = 1.60倍は正しい）

---

## B. 重要な問題（対応推奨）

### B-1. paymentPeriodKey の決定ロジックが未定義

提案では attendance に `paymentPeriodKey` を持たせるとしているが、**どのルールで paymentPeriodKey を決めるかが書かれていない**。

- `date` フィールド（勤務開始基準日）を基準に、`payroll.startDay / endDay` の期間に当てはめるのか？
- `clockIn` の日時を基準にするのか？
- 日跨ぎ勤務（例: 23:00出勤 → 翌07:00退勤）はどちらの日に帰属するのか？

現在のコードベースでは `date` フィールドが勤務開始基準日として使われている。paymentPeriodKey も `date` 基準で `payroll.startDay / endDay` に当てはめるのが自然だが、明示が必要。

### B-2. paymentPeriodKey のフォーマットが既存設計と不一致

| 設計 | フォーマット | 例 |
|------|------------|-----|
| 既存 phase4_2 | 支払日キー | `2025-03-25` |
| 提案 | 期間レンジ | `2026-03-01_2026-03-31` |

既存 phase4_2 は `paymentDate`（支払日）をキーにしているが、提案は「期間の開始日_終了日」形式。これはどちらも合理性があるが、**両方のドキュメントが混在すると混乱する**。どちらかに統一が必要。

提案の「期間レンジ」形式の方が、「この attendance はどの給与期間に属するか」を直感的に表現でき、period の一意性も高いため推奨。ただし既存 phase4_2 のドキュメントを書き換える必要がある。

### B-3. weekStartDay 等の新設定の格納場所が未定義

提案で必要となる以下の設定は、**現在の storeMeta/config にも storeMeta/payrollConfig にも存在しない**:

| 設定 | 説明 | 提案の記載 |
|------|------|-----------|
| weekStartDay | 法定週の開始曜日 | payroll run snapshot に含まれるが、元の設定場所が不明 |
| weeklyLegalLimitMinutes | 週の法定労働上限 | 2400 or 2640。格納場所が不明 |
| legalHolidayRule | 法定休日の判定ルール | 格納場所・構造が不明 |
| legalHolidayWeekday | 法定休日の曜日（fixed_weekly の場合） | 格納場所が不明 |

これらを `storeMeta/payrollConfig` に追加するのが自然。型定義（`PayrollConfig`）の拡張が必要になる。

### B-4. nightWorkMinutes が休憩を考慮していない可能性

現在のコードベースの `calculateNightWorkMinutes` は clockIn〜clockOut の間で22:00〜05:00に該当する「拘束分数」を数えているが、**休憩時間を控除していない**。

提案では「nightMinutes は拘束時間帯用、nightWorkMinutes は実労働用」と整理しているが、現在のコードでは nightWorkMinutes の計算に休憩控除が入っていない。

給与計算で `nightWorkMinutes` を使うなら、休憩時間が深夜帯に重なった場合にその分を控除する必要がある。これは計算ロジックの修正であり、今回の設計で明確にしておくべき。

### B-5. attendanceItems の weeklyRunningBefore / weeklyRunningAfter の意味変更

提案のセクション 8-3 では `weeklyRunningBefore` / `weeklyRunningAfter` を保存するとしているが、A-1 の修正を適用すると **weeklyRegularRunning（法定内労働のみの累計）** を追跡する必要がある。

保存すべきフィールドの修正案:

| 元の名前 | 修正案 | 説明 |
|----------|--------|------|
| weeklyRunningBefore | weeklyRegularBefore | その週の当日前までの「法定内労働」累計 |
| weeklyRunningAfter | weeklyRegularAfter | その週の当日後の「法定内労働」累計 |
| （追加） | dailyRegularMinutes | min(actualWorkMinutes, 480) |
| weeklyOverContribution | weeklyOnlyOverMinutes | 法定内累計が週上限を超えた分 |

---

## C. 明確化が必要な問題

### C-1. weekday の仕様

提案では「曜日（0-6 等、仕様固定）」としているが、0 が何曜日かが未定義。JavaScript の `getDay()` は 0=日曜日。weekStartDay との整合性のために、どちらかを明記する必要がある。

### C-2. 法定外休日（非法定休日）の扱い

提案では `totalNonLegalHolidayWorkMinutes` を集計しているが、grossPay の計算式には法定外休日の割増がない。

法律上、法定外休日に割増賃金の義務はないが、**会社独自の割増を設定するケースもある**。現時点で割増なしとするなら、その旨を明記し、将来的に設定可能にする余地を残す設計が望ましい。

### C-3. 未反映 attendance の扱い（案A vs 案B）

提案では案Aを推奨しているが、**案Aの場合、過去の未反映 attendance をどう救済するかの具体的なフロー**が書かれていない。

- 「差額再計算 run を別で打つ」とあるが、その run はどの paymentPeriodKey に属するのか？
- 過去期間の paymentPeriodKey に対して再度 run を実行するなら、confirmed 済みの期間はどうするのか？
- 案Aを採用するなら、confirmed 済み期間の再 run の可否ルールを追加定義する必要がある

### C-4. 深夜 + 法定休日 + 月60時間超の重複

提案では「深夜と残業は別軸で加算される」としているが、以下の3重重複のケースが明示されていない:

- 法定休日の深夜勤務: 1.0 + 0.25(深夜) + 0.35(法定休日) = **1.60倍**
- 月60時間超の深夜勤務: 1.0 + 0.25(深夜) + 0.50(60h超含む時間外) = **1.75倍**

提案の加算式モデル（basePay + 各 premium）ではこれらは正しく処理されるが、「法定休日労働は60時間超の算定に含めない」というルールと合わせて、テストケースとして明記しておくべき。

---

## D. 設計上の確認事項（提案で「残る前提条件」として挙げられているもの）

提案のセクション10で挙げられている以下の項目は、すべて実装前に決定が必要:

| # | 項目 | 影響度 | コメント |
|---|------|--------|---------|
| 1 | 変形労働時間制の有無 | 高 | 採用しないなら明記。採用するなら計算ロジックが根本的に変わる |
| 2 | 法定休日の決め方 | 高 | legalHolidayRule の具体的な値と判定ロジック |
| 3 | 端数処理 | 中 | 月次集計後の端数丸め方式（切捨て / 四捨五入 / 50銭未満切捨て50銭以上切上げ等） |
| 4 | 時給変更日の扱い | 中 | 期間中に時給が変わった場合、旧時給/新時給をどう適用するか |
| 5 | 深夜・休日・残業の重複ルール | 中 | 上記 C-4 で触れた通り。加算式なら自動的に処理されるが、社内ルールとの整合確認 |
| 6 | 休憩控除の方法 | 中 | 深夜帯の休憩控除含む。B-4 参照 |
| 7 | 遡及訂正の方法 | 中 | 差額方式 vs 月全体再計算。提案では月全体再計算を推奨 |

---

## E. 既存 phase4_2 との差分まとめ

| 観点 | 既存 phase4_2 | 提案 |
|------|-------------|------|
| 計算内容 | basePay + nightTimePay のみ | basePay + 深夜割増 + 残業割増 + 60h超割増 + 法定休日割増 |
| attendance フィールド | payrollReflectedAt（文字列） | weekday, weekStartDate, paymentPeriodKey, payrollStatus, reflectedPayrollRunId, reflectedAt（大幅拡張） |
| staffResults 配置 | payrollRuns ドキュメント内（フラット） | 別サブコレクション staffResults/{staffId} |
| 監査明細 | なし | attendanceItems/{attendanceId} サブコレクション |
| paymentPeriodKey | 支払日キー `2025-03-25` | 期間レンジ `2026-03-01_2026-03-31` |
| 設定 | payroll.startDay/endDay のみ | + weekStartDay, weeklyLegalLimitMinutes, legalHolidayRule, legalHolidayWeekday |
| 週単位処理 | なし | weekStartDate によるグループ化、週内時系列処理 |
| 月跨ぎ週 | 考慮なし | 参照専用 attendance による対応 |
| 未反映管理 | payrollReflectedAt の有無 | payrollStatus 3値 + reflectedPayrollRunId |

**差分の評価**: 計算ロジック、データモデル、Callable API のすべてが根本的に異なる。phase4_2 の既存設計を「パッチ」で修正できるレベルではない。

---

## F. 進め方の提案

### 推奨: phase4_2 を破棄し、新しいフェーズ（phase4_3）として再設計

**理由**:

1. **計算モデルが根本的に異なる**: phase4_2 は「basePay + nightTimePay」だが、提案は「basePay + 5種の割増」。Step03 の SPEC は全面書き直しになる
2. **データモデルが根本的に異なる**: attendance に新フィールド追加、staffResults のサブコレクション化、attendanceItems の新設。Step01-03 の changeSpec はすべて書き直し
3. **まだ実装に入っていない**: 既存コードへの影響がなく、破棄コストが低い
4. **パッチ修正のリスク**: 既存ドキュメントに継ぎ足すと、「元の設計」と「修正後の設計」が混在し、レビューが困難になる

### 再利用できる部分

phase4_2 の以下の設計は、ほぼそのまま phase4_3 に持ち込める:

| Step | 内容 | 再利用度 |
|------|------|---------|
| Step01（一部） | payrollPeriodUtils の期間計算、payrollErrors、payrollConfig の基盤 | **高** |
| Step02（一部） | getPayrollCandidates の属性分類ロジック（ただし payrollStatus 対応に変更要） | **中** |
| Step03 | executeMonthlyPayroll, confirmPayrollRun | **低（全面再設計）** |
| Step04 | 計算用タブ UI の表示仕様 | **高** |
| Step05 | 計算結果タブ UI の表示仕様（項目追加が必要） | **中** |
| Step06 | 支払い管理 | **高** |
| Step07 | 通知基盤 | **高** |
| Step08 | スケジューラー補助化 | **高** |
| Step09 | 統合・リリース | **高** |

### 次のステップ

1. 本レビューの指摘事項（A-1, A-2, B-1〜B-5）を反映した **修正版の設計案** を確定する
2. phase4_3 として、修正版設計に基づいた 00_OVERVIEW / 01_TOBE_DETAILED_SPEC を新規作成する
3. per_step の構成は phase4_2 と同様の形式を踏襲する（STEP_PLAN → SPEC → changeSpec の流れ）
4. phase4_2 ディレクトリは参照用として残し、README に「phase4_3 に移行済み」と記載する
