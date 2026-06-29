/**
 * 通知テンプレート定数
 *
 * 参照: 07_NOTIFICATION_SCHEDULER_SPEC §1-6
 */

export interface NotificationTemplate {
  type: string;
  title: string;
  body: string;
}

export const PAYROLL_NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  payroll_period_start: {
    type: 'report',
    title: '給与計算可能期間に入りました',
    body: '{periodStart}〜{periodEnd} の給与計算が可能です。',
  },
  payroll_calc_remind: {
    type: 'warning',
    title: '給与計算がまだ行われていません',
    body: '{periodStart}〜{periodEnd} の給与計算がまだ実行されていません。支払日は {paymentDate} です。',
  },
  payroll_confirm_remind: {
    type: 'warning',
    title: '給与確定処理がまだ行われていません',
    body: '{periodStart}〜{periodEnd} の給与計算は完了していますが、確定処理がまだ行われていません。',
  },
  payroll_run_completed: {
    type: 'report',
    title: '給与計算が完了しました',
    body: '{periodStart}〜{periodEnd}: {staffCount}名, 総支給額 ¥{totalGrossPay}',
  },
  payroll_run_completed_with_errors: {
    type: 'error',
    title: '給与計算が一部失敗しました',
    body: '{periodStart}〜{periodEnd}: {failedCount}名の計算に失敗。確認してください。',
  },
  payroll_run_failed: {
    type: 'error',
    title: '給与計算が失敗しました',
    body: '{periodStart}〜{periodEnd} の給与計算が失敗しました。再実行してください。',
  },
  payroll_payment_overdue: {
    type: 'strong_warning',
    title: '支払い済み登録がされていません',
    body: '{periodStart}〜{periodEnd} の支払い日を過ぎています。',
  },
  payroll_hold_reminder: {
    type: 'report',
    title: '保留中の支払いがあります',
    body: '{holdCount}名の支払いが保留中です。',
  },
  payroll_attendance_corrected: {
    type: 'warning',
    title: '給与反映済み勤怠が修正されました',
    body: '{staffName} の {date} の勤怠データが給与反映後に修正されました。給与は自動再計算されません。必要に応じて再計算または差額調整を行ってください。',
  },
};
