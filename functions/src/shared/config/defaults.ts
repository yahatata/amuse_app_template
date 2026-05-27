/**
 * storeMeta/config のデフォルト値集約（唯一のソース）
 *
 * 読み取り優先度: ① storeMeta/config ② 本ファイル ③ 各 TS 内直書き
 * 未設定時はエラーにせず、本ファイルの値でフォールバックする。
 *
 * 重要: デフォルト値の定義は本ファイルにのみ行うこと。
 * 新規フィールド追加時は configLoader buildFromDefaults() にもマッピングを追加する。
 * initializeStoreConfigCallable は buildFromDefaults() の出力をそのまま書き込むため変更不要。
 *
 * 参照: docs/config_migration/phase0B/STOREMETA_CONFIG_SPEC.md
 *       docs/config_migration/phase1/PHASE1_CONFIG_SCHEMA.md
 *       docs/config_migration/phase1/PHASE1_UPDATE_PATH_DESIGN.md
 */

// =============================================================================
// features: 機能フラグ
// =============================================================================

/** 当日請求 dual-write の有効化。todaysBills への複写を行うか */
export const DEFAULT_DUAL_WRITE_ENABLED = false;

/** enqueue スケジューラの有効化。true でないと enqueue バッチが即 return する */
export const DEFAULT_ENQUEUE_SCHEDULER_ENABLED = true;

/** テンプレート営業日重複チェックの有効化。同一営業日・同一テンプレートの重複チェック */
export const DEFAULT_TEMPLATE_BUSINESSDATE_CHECK = true;

/** 決済アグリゲータの有効化。bills 締め時に enqueueSettlement を呼ぶか */
export const DEFAULT_SETTLEMENT_AGGREGATOR_ENABLED = true;

/** 卓端末登録機能の有効化。トーナメント/SG 登録を卓デバイスから行えるか */
export const DEFAULT_TABLE_DEVICE_REGISTRATION_ENABLED = true;

/** 手動打刻（勤怠記録タブの退勤処理 / シフト一覧タブの出勤登録）の有効化 */
export const DEFAULT_CREATE_ATTENDANCE_BY_MANUAL = false;

// =============================================================================
// 手動打刻時刻調整
// =============================================================================

/** 時刻調整 UI の有効化（QR/手動の出退勤共通） */
export const DEFAULT_ATTENDANCE_TIME_ADJUSTMENT_ENABLED = false;

/** 現在時刻から未来方向への調整許可範囲（分）。null の場合は現在時刻のみ */
export const DEFAULT_ATTENDANCE_TIME_ADJUSTMENT_MAX_FUTURE_MINUTES: number | null = null;

/** 現在時刻から過去方向への調整許可範囲（分）。null の場合は現在時刻のみ */
export const DEFAULT_ATTENDANCE_TIME_ADJUSTMENT_MAX_PAST_MINUTES: number | null = null;

// =============================================================================
// D-10: 自動開閉店
// =============================================================================

/** 自動開閉店の有効/無効。週次 Planner が閉店・開店認定タスクを投入するかどうか */
export const DEFAULT_AUTO_OPEN_CLOSE_ENABLED = true;

/** 閉店認定タスクの発火オフセット（分）。閉店時刻から何分後にタスクを実行するか */
export const DEFAULT_TASK_CLOSE_OFFSET_MINUTES = 120;

/** 開店認定タスクの発火オフセット（分）。開店時刻の何分前にタスクを実行するか（負数で「前」） */
export const DEFAULT_TASK_OPEN_OFFSET_MINUTES = -30;

/** already_running_different_date の緊急一時解除後、再評価するまでの分数 */
export const DEFAULT_ALREADY_RUNNING_DIFFERENT_DATE_RECHECK_MINUTES = 15;

// =============================================================================
// R-10: 営業時間スタイル
// =============================================================================

/** 営業スタイル定義。weekday=平日, weekendHoliday=週末祝日, event=イベント, allDay=終日, closed=休業 */
export const DEFAULT_BUSINESS_HOURS_STYLES: Record<
  string,
  { styleId: string; openMinute: number; closeMinute: number; isClosed: boolean }
> = {
  weekday: { styleId: 'weekday', openMinute: 900, closeMinute: 1500, isClosed: false },
  weekendHoliday: { styleId: 'weekendHoliday', openMinute: 720, closeMinute: 1500, isClosed: false },
  event: { styleId: 'event', openMinute: 600, closeMinute: 1500, isClosed: false },
  allDay: { styleId: 'allDay', openMinute: 360, closeMinute: 1500, isClosed: false },
  closed: { styleId: 'closed', openMinute: 0, closeMinute: 0, isClosed: true },
};

// =============================================================================
// R-06: 入店料
// =============================================================================

/** 入店料（円）。0 も設定可能 */
export const DEFAULT_ENTRANCE_FEE = 1000;

/** 入店料の説明文 */
export const DEFAULT_ENTRANCE_FEE_DESCRIPTION = '入店料';

/** 再入店時に入店料を取るか */
export const DEFAULT_CHARGE_ENTRANCE_FEE_ON_REENTRY = false;

// =============================================================================
// R-11, R-12: 会計ポリシー
// =============================================================================

/** カテゴリ別の利用可能な支払い方法。extraCost=入店料, sideGameChip=チップ, items=フード等, tournaments=トーナメント */
export const DEFAULT_CATEGORY_PAYMENT_METHODS: Record<string, string[]> = {
  extraCost: ['cash', 'credit_card', 'electronic_money'],
  sideGameChip: ['cash', 'credit_card', 'electronic_money'],
  items: ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip'],
  tournaments: ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB'],
};

/** ポイント使用の優先順位。支払い分割計算でどの順で充当するか */
export const DEFAULT_POINT_PRIORITY = ['pointA', 'pointB', 'sideGameChip'];

/** サイドゲームチップ 1 枚あたりの円換算レート */
export const DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE = 10.0;

/** pointA/pointB の切り捨て単位（円） */
export const DEFAULT_POINT_AB_ROUNDING_UNIT = 1000;

/** sideGameChip の切り捨て単位（チップ数） */
export const DEFAULT_SIDE_GAME_CHIP_ROUNDING_UNIT = 100;

// =============================================================================
// D-04: LINE プラン
// =============================================================================

/** LINE プラン種別。communication=シフト辞退なし, light/standard=シフト辞退あり */
export const DEFAULT_LINE_PLAN = 'communication';

// =============================================================================
// 営業日境界バッファ（補足）
// =============================================================================

/** 営業日境界計算時のバッファ（分）。境界付近の曖昧な時刻をどちらの営業日に含めるかの判定に使用 */
export const DEFAULT_CALC_BUSINESS_DATE_BUFFER_MINUTES = 70;

// =============================================================================
// R-08: シフトフロー期間
// =============================================================================

/** シフト提出期間の開始日（前月の何日から） */
export const DEFAULT_SHIFT_SUBMISSION_START_DAY = 1;

/** シフト提出期間の終了日（前月の何日まで） */
export const DEFAULT_SHIFT_SUBMISSION_END_DAY = 15;

/** シフトを組む期間の開始日（前月の何日から） */
export const DEFAULT_SHIFT_SCHEDULING_START_DAY = 16;

// =============================================================================
// R-07: 給与締め
// =============================================================================

/** 給与期間の開始日（例: 26 → 26日開始） */
export const DEFAULT_PAYROLL_START_DAY = 26;

/** 給与期間の終了日（例: 25 → 翌月25日まで） */
export const DEFAULT_PAYROLL_END_DAY = 25;

// =============================================================================
// Phase4.1: 勤怠 夜間労働時間
// =============================================================================

/** 夜間労働の開始時刻（時、0-23）。22 = 22:00 から深夜割増 */
export const DEFAULT_NIGHT_WORK_START_HOUR = 22;

/** 夜間労働の終了時刻（時、0-23）。5 = 翌日 05:00 まで */
export const DEFAULT_NIGHT_WORK_END_HOUR = 5;

// =============================================================================
// B-02: メニューカテゴリ
// =============================================================================

/** メニューアイテムのカテゴリ選択肢。メニュー作成・編集・注文時の選択肢として使用 */
export const DEFAULT_MENU_CATEGORIES = ['フード', 'ノンアルコール', 'アルコール', 'Chip', 'その他'];

// =============================================================================
// B-03: サイドゲーム種別
// =============================================================================

/** サイドゲームとして扱うテーブルステータス（ゲーム種別）の一覧。テーブル一覧での判定やサイドゲーム用UIの選択肢に使用 */
export const DEFAULT_SIDE_GAME_TYPES = ['ブラックジャック', 'ルーレット', 'バカラ', 'アルティメットポーカー'];

// =============================================================================
// B-04: トーナメント設定
// =============================================================================

/** デフォルトプライズ割合（70%）。新規テンプレート作成時の初期値 */
export const DEFAULT_TOURNAMENT_PRIZE_RATIO = 0.7;

/** プライズを受け取る人数の割合（参加者の何%まで入賞とするか） */
export const DEFAULT_TOURNAMENT_PRIZE_RECEIVER_PERCENTAGE = 10;

/** プライズ計算の丸め方法。'floor' | 'ceil' | 'round' */
export const DEFAULT_TOURNAMENT_PRIZE_ROUNDING_METHOD = 'floor';

/** 賞金額の丸め単位（円）。1, 10, 100, 1000 のいずれか */
export const DEFAULT_TOURNAMENT_PRIZE_ROUNDING_UNIT = 100;

/** 入賞人数ごとの賞金配分比率（%）。キー=入賞人数、値=順位別比率リスト */
export const DEFAULT_TOURNAMENT_PRIZE_DISTRIBUTION: Record<number, number[]> = {
  1: [100.0],
  2: [65.0, 35.0],
  3: [50.0, 30.0, 20.0],
  4: [45.0, 25.0, 18.0, 12.0],
  5: [40.0, 25.0, 15.0, 12.0, 8.0],
  6: [38.0, 23.0, 15.0, 10.0, 8.0, 6.0],
  7: [36.0, 22.0, 14.0, 9.0, 7.0, 6.0, 6.0],
  8: [35.0, 21.0, 13.0, 9.0, 7.0, 6.0, 5.0, 4.0],
  9: [34.0, 20.0, 12.0, 8.0, 7.0, 6.0, 5.0, 4.0, 4.0],
  10: [32.0, 19.0, 12.0, 8.0, 7.0, 6.0, 5.0, 4.0, 4.0, 3.0],
};

// =============================================================================
// トーナメント置きバケ: storeMeta/config.okibake（詳細仕様書 §14.15）
// =============================================================================

/** loginPromptMode の既定。欠損・不正値時もこれへフォールバック */
export const DEFAULT_OKIBAKE_LOGIN_PROMPT_MODE = 'notice_only' as const;

// =============================================================================
// R-09: 時間帯別必要人数（曜日ごとの可能性あり、実装時検討）
// =============================================================================

/** 時間帯別の必要スタッフ数。シフト不足判定に使用。曜日ごとに異なる場合は別 doc を検討 */
export const DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT: Array<{
  startHour: number;
  endHour: number;
  requiredCount: number;
}> = [
  { startHour: 19, endHour: 22, requiredCount: 2 },
  { startHour: 10, endHour: 12, requiredCount: 3 },
];
