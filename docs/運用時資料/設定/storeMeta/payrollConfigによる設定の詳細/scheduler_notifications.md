# 通知・スケジューラー（schedulerNotificationHour / reminderStartDaysAfterPeriodEnd）

給与の **リマインド・警告などスケジューラー経由の通知時刻** と、**いつからリマインドを始めるか** を制御する。

**snapshot 対象外**。変更すると **次回のスケジューラー実行から** すぐに効く（過去の計算 run の数値には影響しない）。

---

## schedulerNotificationHour

### 設定の説明

Cloud Scheduler から日次で動く給与通知処理が、**その日の何時（JST）にタスクを積むか** の指標として使う **時刻（0〜23）**。

### 何を設定するのか

整数 `0`〜`23`。デフォルト **`10`**（10:00 JST）。不正・欠落時はデフォルトへ。

### その設定により何が変わるのか

- リマインドや通知メッセージの **配信時刻の枠** がずれる。
- 店舗の開店前・忙しい時間を避けたい場合に調整する。

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/domains/attendance/scheduler/payrollNotificationScheduler.ts` | 当日の `scheduleTime` 決定 |
| ts | `functions/src/shared/config/payrollConfigLoader.ts` | 取得 |

---

## reminderStartDaysAfterPeriodEnd

### 設定の説明

給与期間の **`periodEnd` から何日後**をもって、リマインド対象期間の開始とみなすか（計算リマインド・確定リマインドの共通パラメータ。仕様上 `07_NOTIFICATION_SCHEDULER_SPEC` に準拠）。

### 何を設定するのか

**0 以上**の整数（number）。デフォルト **`3`**。負値や非数はデフォルトへ。

### その設定により何が変わるのか

- 小さくすると **早めに** リマインドが飛ぶ。大きくすると **猶予が長い**。
- 計算締切の運用（いつまでに計算してほしいか）とセットで決める。

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/domains/attendance/tasks/processPayrollNotifications.ts` | リマインド条件 |
| ts | `functions/src/shared/config/payrollConfigLoader.ts` | 取得 |

---

## 取得失敗時・不具合時

payrollConfig 全体のフォールバック方針は [README.md](./README.md) に同じ。通知だけデフォルト時刻になると、**意図せず早朝／深夜に近い時刻に寄る**ことはない（時刻は 0〜23 にクランプされる前提だが、欠落時は 10 時デフォルト）。

詳細な共通手順は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。
