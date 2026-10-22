/**
 * shared/time: 時間・JST・営業日計算の汎用
 *
 * configOps（getStoreCloseHour, normalizeStoreCloseHour 等）は Phase4 01 で
 * unused_function_lib に移動。本番利用は終了。
 */
export { generateJstDateKey } from './generateJstDateKey';
