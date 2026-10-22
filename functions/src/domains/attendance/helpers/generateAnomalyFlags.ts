/**
 * 計算結果の異常値チェック — スタブ実装
 *
 * 初期リリースでは実質的なチェックは行わず、常に空のフラグを返す。
 * 運用開始後に実績データを基にチェック内容を追加する。
 *
 * TODO: 以下のようなチェックを運用フィードバックを経て追加予定
 * - expectedRange ベースの件数・金額・時間チェック
 * - staff ごとの異常値検出
 * - 前回 run との差分チェック
 *
 * 参照: 04_CALLABLE_API_SPEC セクション5-1
 */

export interface AnomalyFlags {
  [key: string]: unknown;
}

export function generateAnomalyFlags(): AnomalyFlags {
  return {};
}
