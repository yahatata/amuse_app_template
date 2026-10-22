# Step07: 通知基盤

## このステップで実装する内容の概要

- 通知コレクションと取得/更新APIを実装。
- adminHomeで未読・種別・フラグを表示/操作できるようにする。

## 懸念・確定できていない仕様等（判断が必要）

- 通知保持方針（2ヶ月後のアーカイブ or 非取得）の選択。
- 通知種別の最終定義（warning/report/strong_warning/error）。
- フィルターUIの最小構成。

## このステップで実装する内容全体の詳細

- 追加/変更候補:
  - `functions/src/shared/notifications/callables/getNotifications.ts`（新規）
  - `functions/src/shared/notifications/callables/updateNotificationState.ts`（新規）
  - `functions/src/shared/notifications/helpers/createNotification.ts`（新規）
  - `lib/notifications/pages/admin_notifications_page.dart`（新規）
  - `lib/.../admin_home_page.dart`（通知導線追加）
- 完了条件:
  - 既読/未読・フラグ変更が可能。
  - 給与関連イベントで通知が作成できる。
