# 給与確認タスクキュー方針

## このタスクの要点

給与確認のためのスケジュール通知基盤は、古い構想だけが残っている状態ではありません。  
仕様、scheduler task、`processPayrollNotifications` まで存在します。  
ただし、実運用で本当に採用するか、別の簡易形へ寄せるかはまだ判断余地があります。

## 現状整理

- `07_NOTIFICATION_SCHEDULER_SPEC.md` がある
- `payrollNotificationScheduler` がある
- `processPayrollNotifications` がある
- 通知テンプレートや triggerType の考え方も docs 化されている
- 復旧 docs では、十分な成功サンプルが不足しているとされている

## いま言える状態評価

- 仕様: かなりある
- 実装: ある
- 本番採用判断: 未確定

## このタスクの本質

論点は「コードが古いか」ではなく、次です。

- この通知基盤を本番で使う価値があるか
- scheduler + task まで組むほどの重要度か
- もっと簡単な運用で十分ではないか

## 関連が強いタスク

- `07_scheduler確認`
- `08_cloudTasks確認`
- `11_requiredStaffByTimeSlot方針`
