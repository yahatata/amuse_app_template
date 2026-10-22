/**
 * 仕様書 [04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md] §13 / §14 / §15 / §16 に基づき、
 * adjustment の `lines[]` から analyticsMonthly 更新用の純粋 delta を構築する。
 *
 * 設計方針（[02_changeSpec.md] §5.2.1）:
 * - Firestore に直接 write しない pure function
 * - `amountInclDelta` の符号は呼び出し元で既に direction と整合済み（adjustment service `validateLines`）
 * - `byTemplateTournaments` は templateKey（=`targetId`）単位で集計、`operationType` ごとに count/sales を分ける
 * - `userId` は bill 所有 user のみで line ごとに変えない（仕様書 §15）
 */

import type {
  AdjustmentLine,
  LineOperationType,
} from '../../../bills/services/adjustments';

export interface AnalyticsCategoryAggregate {
  items: number;
  extraCost: number;
  sideGameChip: number;
  tournaments: number;
}

export interface AnalyticsTournamentTemplateAggregate {
  templateKey: string;
  templateName: string;
  entryCount: number;
  entrySales: number;
  reentryCount: number;
  reentrySales: number;
  addonCount: number;
  addonSales: number;
  totalSales: number;
}

export interface AdjustmentAnalyticsDelta {
  /** 全 line の amountInclDelta 合計（仕様書 §14.1 grossSales） */
  grossSales: number;
  /** category ごとの amountInclDelta 合計（仕様書 §13） */
  byCategory: AnalyticsCategoryAggregate;
  /** tournament line のみ template / operationType 単位で集計（仕様書 §16） */
  byTemplateTournaments: AnalyticsTournamentTemplateAggregate[];
  /** bill 所有 userId（仕様書 §15）。null の場合は byUser 反映なし */
  userId: string | null;
}

const ZERO_CATEGORY: AnalyticsCategoryAggregate = {
  items: 0,
  extraCost: 0,
  sideGameChip: 0,
  tournaments: 0,
};

const ZERO_TEMPLATE_AGGREGATE: Omit<AnalyticsTournamentTemplateAggregate, 'templateKey' | 'templateName'> = {
  entryCount: 0,
  entrySales: 0,
  reentryCount: 0,
  reentrySales: 0,
  addonCount: 0,
  addonSales: 0,
  totalSales: 0,
};

/**
 * adjustment の `lines[]` から analytics 更新用 delta を構築する。
 *
 * @throws tournament line で targetId が空の場合（adjustment service 側で既に保証されているはずだが二重 guard）
 */
export function buildAdjustmentAnalyticsDelta(input: {
  lines: AdjustmentLine[];
  billUserId?: string | null;
}): AdjustmentAnalyticsDelta {
  const { lines, billUserId } = input;

  let grossSales = 0;
  const byCategory: AnalyticsCategoryAggregate = { ...ZERO_CATEGORY };
  const tournamentMap = new Map<string, AnalyticsTournamentTemplateAggregate>();

  for (const line of lines) {
    grossSales += line.amountInclDelta;

    switch (line.targetCategory) {
      case 'item':
        byCategory.items += line.amountInclDelta;
        break;
      case 'extra':
        byCategory.extraCost += line.amountInclDelta;
        break;
      case 'sideGameChip':
        byCategory.sideGameChip += line.amountInclDelta;
        break;
      case 'tournament':
        byCategory.tournaments += line.amountInclDelta;
        accumulateTournamentLine(tournamentMap, line);
        break;
    }
  }

  return {
    grossSales,
    byCategory,
    byTemplateTournaments: Array.from(tournamentMap.values()),
    userId: typeof billUserId === 'string' && billUserId.length > 0 ? billUserId : null,
  };
}

function accumulateTournamentLine(
  map: Map<string, AnalyticsTournamentTemplateAggregate>,
  line: AdjustmentLine
): void {
  if (!line.targetId || line.targetId.length === 0) {
    throw new Error(
      `buildAdjustmentAnalyticsDelta: tournament line requires non-empty targetId (lineNo=${line.lineNo})`
    );
  }
  const key = line.targetId;
  const existing =
    map.get(key) ??
    ({
      templateKey: key,
      templateName: line.targetName,
      ...ZERO_TEMPLATE_AGGREGATE,
    } as AnalyticsTournamentTemplateAggregate);

  existing.totalSales += line.amountInclDelta;

  applyOperationToTournamentAggregate(existing, line.operationType, line.qtyDelta, line.amountInclDelta);

  map.set(key, existing);
}

function applyOperationToTournamentAggregate(
  aggregate: AnalyticsTournamentTemplateAggregate,
  operationType: LineOperationType,
  qtyDelta: number,
  amountInclDelta: number
): void {
  switch (operationType) {
    case 'entry':
      aggregate.entryCount += qtyDelta;
      aggregate.entrySales += amountInclDelta;
      return;
    case 'reentry':
      aggregate.reentryCount += qtyDelta;
      aggregate.reentrySales += amountInclDelta;
      return;
    case 'addon':
      aggregate.addonCount += qtyDelta;
      aggregate.addonSales += amountInclDelta;
      return;
    default:
      throw new Error(
        `buildAdjustmentAnalyticsDelta: tournament line has invalid operationType '${operationType}'`
      );
  }
}
