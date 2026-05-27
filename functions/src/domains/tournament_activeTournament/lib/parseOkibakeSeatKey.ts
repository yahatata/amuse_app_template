/**
 * 卓 seat フィールド名（seat01UserId 等）と同一の桁揃えルール。
 * assignSeatToPlayer の seatNumber.toString().padStart(2, '0') に合わせる。
 */

export function parseSeatKeyToTwoDigitSuffix(seatKey: string): string | null {
  const s = seatKey.trim();
  const withPrefix = /^seat(\d{1,2})$/i.exec(s);
  if (withPrefix) {
    const num = parseInt(withPrefix[1], 10);
    if (num < 1 || num > 99) return null;
    return num.toString().padStart(2, '0');
  }
  const digits = /^(\d{1,2})$/.exec(s);
  if (digits) {
    const num = parseInt(digits[1], 10);
    if (num < 1 || num > 99) return null;
    return num.toString().padStart(2, '0');
  }
  return null;
}

export function canonicalSeatKeyFromSuffix(twoDigitSuffix: string): string {
  return `seat${twoDigitSuffix}`;
}
