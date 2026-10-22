/** blindTemplates.levels[].duration から LIFF 表示用テキストを生成 */
export interface BlindLevelLike {
  level?: number;
  duration?: number;
}

export function formatBlindLevelDurationText(
  levels: BlindLevelLike[] | undefined | null
): string {
  if (!levels || levels.length === 0) {
    return '';
  }

  const sorted = [...levels].sort(
    (a, b) => (a.level ?? 0) - (b.level ?? 0)
  );

  const seen = new Set<number>();
  const uniqueDurations: number[] = [];
  for (const level of sorted) {
    const duration = level.duration ?? 0;
    if (seen.has(duration)) {
      continue;
    }
    seen.add(duration);
    uniqueDurations.push(duration);
  }

  if (uniqueDurations.length === 0) {
    return '';
  }

  return uniqueDurations.map((d) => `${d}分`).join(' / ');
}
