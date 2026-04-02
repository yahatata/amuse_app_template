/**
 * errorShapeProbe 専用のログ出力上限（仕様として固定）。
 * 観察用ログの肥大化・循環参照・PII 漏えいリスクを抑える。
 */
export const PROBE_LOG_LIMITS = {
  /** cause / ネストしたオブジェクト走査の最大深さ（超過分はプレースホルダに置換） */
  MAX_DEPTH: 4,
  /** details が配列のとき先頭から取る最大要素数 */
  MAX_DETAILS_ARRAY_LENGTH: 5,
  /** 単一文字列フィールドの最大文字数（超過は末尾を切り捨て、truncated フラグを付与） */
  MAX_STRING_TRUNCATE: 2000,
  /** Object.getOwnPropertyNames / keys で列挙する最大キー数 */
  MAX_OWN_PROPERTY_KEYS: 40,
  /** JSON.stringify 結果として許容する最大文字数（全体のサマリ用） */
  MAX_JSON_STRING_LENGTH: 32000,
} as const;
