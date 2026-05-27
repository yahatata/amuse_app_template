/**
 * temporaryDisplayName 採番（詳細仕様書 §6.5）。
 * okibakeNextDisplayNumber の現在値（1 始まり）から 「オキバケ」 + Excel 列相当の接尾辞 を生成する。
 */

/**
 * oneBasedIndex に対応する A, B, ..., Z, AA, ... を返す（Excel 列名と同様、1 が A）。
 */
export function excelStyleColumnLetters(oneBasedIndex: number): string {
  let n = oneBasedIndex;
  let s = '';
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

/** okibakeNextDisplayNumber が n のとき作成される表示名（未加算時のカウンタ値を渡す）。 */
export function buildOkibakeTemporaryDisplayName(okibakeSequenceNumber: number): string {
  const letters = excelStyleColumnLetters(okibakeSequenceNumber);
  return `オキバケ${letters}`;
}
