/**
 * スナップショット計算ヘルパ
 * 
 * Settlement Trigger で使用するスナップショット計算ロジック
 * functions/src/accounting/getBillPreviewTotals.ts のロジックを参照し、同等実装にする
 */

import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE } from '../../../shared/config/defaults';

// itemsSnapshot 圧縮閾値（schema_plan.md に記載の「700KB 超は Top50 + その他合算に圧縮」に準拠）
// テストで差し替え可能にするため export（テスト時のみ使用）
export const ITEMS_SNAPSHOT_SIZE_THRESHOLD = 700 * 1024; // 700KB
export const ITEMS_SNAPSHOT_TOP_N = 50; // Top50

/**
 * amounts を計算
 * getBillPreviewTotals.ts の計算ロジックと同等
 */
export interface CalculateAmountsParams {
  items: admin.firestore.QueryDocumentSnapshot[];
  extras: admin.firestore.QueryDocumentSnapshot[];
  sideGameChips: admin.firestore.QueryDocumentSnapshot[];
  tournaments: admin.firestore.QueryDocumentSnapshot[];
}

export interface Amounts {
  subTotalIncl: number;
  discountTotalIncl: number;
  serviceChargeIncl: number;
  grandTotalIncl: number;
  roundingDelta: number;
  grandTotalRounded: number;
}

export function calculateAmounts(params: CalculateAmountsParams): Amounts {
  const { items, extras, sideGameChips, tournaments } = params;

  // extras の計算（getBillPreviewTotals.ts 83-84行目と同等）
  let extraCostMonetary = 0;
  for (const doc of extras) {
    const data = doc.data();
    const amountIncl = (data.amountIncl as number | undefined) ?? 0;
    extraCostMonetary += amountIncl;
  }

  // items の計算（getBillPreviewTotals.ts 92-99行目と同等）
  let itemsMonetary = 0;
  for (const doc of items) {
    const data = doc.data();
    // voided: true のアイテムは算出対象外
    if (data.voided === true) {
      continue;
    }
    // totalPriceIncl があればそれを使い、なければ price * quantity で計算
    if (data.totalPriceIncl !== undefined) {
      itemsMonetary += (data.totalPriceIncl as number) ?? 0;
    } else {
      const price = (data.unitPriceIncl as number | undefined) ?? 0;
      const quantity = (data.quantity as number | undefined) ?? 0;
      itemsMonetary += price * quantity;
    }
  }

  // sideGameChips の計算（getBillPreviewTotals.ts 103-120行目と同等、action == 'purchase' のみ）
  let sideGameChipMonetary = 0;
  for (const doc of sideGameChips) {
    const data = doc.data();
    if (data.action === 'purchase') {
      const amountIncl = (data.amountIncl as number | undefined) ?? 0;
      sideGameChipMonetary += amountIncl;
    }
  }

  // tournaments の計算（getBillPreviewTotals.ts 127-137行目と同等）
  let tournamentsMonetary = 0;
  for (const doc of tournaments) {
    const data = doc.data();
    const entryFeeIncl = (data.entryFeeIncl as number | undefined) ?? 0;
    const entryCount = (data.entryCount as number | undefined) ?? 0;
    const reentryFeeIncl = (data.reentryFeeIncl as number | undefined) ?? 0;
    const reentryCount = (data.reentryCount as number | undefined) ?? 0;
    const addonFeeIncl = (data.addonFeeIncl as number | undefined) ?? 0;
    const addonCount = (data.addonCount as number | undefined) ?? 0;

    tournamentsMonetary +=
      entryFeeIncl * entryCount +
      reentryFeeIncl * reentryCount +
      addonFeeIncl * addonCount;
  }

  const subTotalIncl = itemsMonetary + extraCostMonetary;
  const discountTotalIncl = 0; // 現状は 0（既存ロジックに従う）
  const serviceChargeIncl = 0; // 現状は 0（既存ロジックに従う）
  const grandTotalIncl = subTotalIncl + sideGameChipMonetary + tournamentsMonetary - discountTotalIncl + serviceChargeIncl;
  const roundingDelta = 0; // 現状は 0（既存ロジックに従う）
  const grandTotalRounded = Math.round(grandTotalIncl + roundingDelta);

  return {
    subTotalIncl,
    discountTotalIncl,
    serviceChargeIncl,
    grandTotalIncl,
    roundingDelta,
    grandTotalRounded,
  };
}

/**
 * categoryBreakdown を計算
 * getBillPreviewTotals.ts のカテゴリ別計算ロジックと同等
 */
export interface CategoryBreakdown {
  items: number;
  extraCost: number;
  sideGameChips: number;
  tournaments: number;
}

export function calculateCategoryBreakdown(params: CalculateAmountsParams): CategoryBreakdown {
  const { items, extras, sideGameChips, tournaments } = params;

  // items
  let itemsTotal = 0;
  for (const doc of items) {
    const data = doc.data();
    // voided: true のアイテムは算出対象外
    if (data.voided === true) {
      continue;
    }
    if (data.totalPriceIncl !== undefined) {
      itemsTotal += (data.totalPriceIncl as number) ?? 0;
    } else {
      const price = (data.unitPriceIncl as number | undefined) ?? 0;
      const quantity = (data.quantity as number | undefined) ?? 0;
      itemsTotal += price * quantity;
    }
  }

  // extraCost
  let extraCostTotal = 0;
  for (const doc of extras) {
    const data = doc.data();
    extraCostTotal += (data.amountIncl as number | undefined) ?? 0;
  }

  // sideGameChips (action == 'purchase' のみ)
  let sideGameChipsTotal = 0;
  for (const doc of sideGameChips) {
    const data = doc.data();
    if (data.action === 'purchase') {
      sideGameChipsTotal += (data.amountIncl as number | undefined) ?? 0;
    }
  }

  // tournaments
  let tournamentsTotal = 0;
  for (const doc of tournaments) {
    const data = doc.data();
    const entryFeeIncl = (data.entryFeeIncl as number | undefined) ?? 0;
    const entryCount = (data.entryCount as number | undefined) ?? 0;
    const reentryFeeIncl = (data.reentryFeeIncl as number | undefined) ?? 0;
    const reentryCount = (data.reentryCount as number | undefined) ?? 0;
    const addonFeeIncl = (data.addonFeeIncl as number | undefined) ?? 0;
    const addonCount = (data.addonCount as number | undefined) ?? 0;

    tournamentsTotal +=
      entryFeeIncl * entryCount +
      reentryFeeIncl * reentryCount +
      addonFeeIncl * addonCount;
  }

  return {
    items: itemsTotal,
    extraCost: extraCostTotal,
    sideGameChips: sideGameChipsTotal,
    tournaments: tournamentsTotal,
  };
}

/**
 * itemsSnapshot を構築
 * 700KB 超で Top50 + _others に圧縮
 */
export interface ItemsSnapshotItem {
  qty: number;
  salesIncl: number;
  name: string;
  category: string | null;
}

export type ItemsSnapshot = Record<string, ItemsSnapshotItem>;

export function buildItemsSnapshot(items: admin.firestore.QueryDocumentSnapshot[]): ItemsSnapshot {
  const snapshot: ItemsSnapshot = {};

  // まず全商品を集計
  for (const doc of items) {
    const data = doc.data();
    // voided: true のアイテムは算出対象外
    if (data.voided === true) {
      continue;
    }
    const menuItemId = (data.menuItemId as string | undefined) ?? doc.id;
    const name = (data.name as string | undefined) ?? '';
    const category = (data.category as string | undefined) ?? null;
    
    // totalPriceIncl があればそれを使い、なければ price * quantity で計算
    let salesIncl = 0;
    if (data.totalPriceIncl !== undefined) {
      salesIncl = (data.totalPriceIncl as number) ?? 0;
    } else {
      const price = (data.unitPriceIncl as number | undefined) ?? 0;
      const quantity = (data.quantity as number | undefined) ?? 0;
      salesIncl = price * quantity;
    }
    
    const quantity = (data.quantity as number | undefined) ?? 0;

    if (snapshot[menuItemId]) {
      snapshot[menuItemId].qty += quantity;
      snapshot[menuItemId].salesIncl += salesIncl;
    } else {
      snapshot[menuItemId] = {
        qty: quantity,
        salesIncl,
        name,
        category,
      };
    }
  }

  // サイズ計測（Buffer.byteLength(JSON.stringify(snapshot), 'utf8')）
  const snapshotSize = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');

  // 700KB 超の場合は Top50 + _others に圧縮
  if (snapshotSize > ITEMS_SNAPSHOT_SIZE_THRESHOLD) {
    // Top50 の選定（売上額の降順）
    const sortedItems = Object.entries(snapshot)
      .sort(([, a], [, b]) => b.salesIncl - a.salesIncl)
      .slice(0, ITEMS_SNAPSHOT_TOP_N);

    const compressed: ItemsSnapshot = {};
    let othersQty = 0;
    let othersSalesIncl = 0;

    // Top50 を保持
    for (const [menuItemId, item] of sortedItems) {
      compressed[menuItemId] = item;
    }

    // 残りを _others に合算
    for (const [menuItemId, item] of Object.entries(snapshot)) {
      if (!compressed[menuItemId]) {
        othersQty += item.qty;
        othersSalesIncl += item.salesIncl;
      }
    }

    // _others を追加
    if (othersQty > 0 || othersSalesIncl > 0) {
      compressed._others = {
        qty: othersQty,
        salesIncl: othersSalesIncl,
        name: 'その他',
        category: null,
      };
    }

    return compressed;
  }

  return snapshot;
}

export function buildBaselineItems(items: admin.firestore.QueryDocumentSnapshot[]) {
  const baselineItems: Array<{
    menuItemId: string | null;
    name: string;
    category: string | null;
    qty: number;
    unitPriceIncl: number;
    salesIncl: number;
  }> = [];

  for (const doc of items) {
    const data = doc.data();
    if (data.voided === true) {
      continue;
    }

    const qty = (data.quantity as number | undefined) ?? 0;
    const unitPriceIncl =
      (data.unitPriceIncl as number | undefined) ??
      (qty > 0 && data.totalPriceIncl !== undefined ? Number(data.totalPriceIncl) / qty : 0);
    const salesIncl =
      (data.totalPriceIncl as number | undefined) ??
      unitPriceIncl * qty;

    baselineItems.push({
      menuItemId: (data.menuItemId as string | undefined) ?? doc.id,
      name: (data.name as string | undefined) ?? '',
      category: (data.category as string | undefined) ?? null,
      qty,
      unitPriceIncl,
      salesIncl,
    });
  }

  return baselineItems;
}

export function buildBaselineExtras(extras: admin.firestore.QueryDocumentSnapshot[]) {
  return extras.map((doc) => {
    const data = doc.data();
    const qty = (data.quantity as number | undefined) ?? 1;
    const unitPriceIncl =
      (data.unitPriceIncl as number | undefined) ??
      (data.amountIncl as number | undefined) ??
      0;
    const salesIncl =
      (data.amountIncl as number | undefined) ??
      unitPriceIncl * qty;

    return {
      extraType: (data.extraType as string | undefined) ?? null,
      name: (data.name as string | undefined) ?? '',
      qty,
      unitPriceIncl,
      salesIncl,
    };
  });
}

/**
 * sideGameChipsSummary を構築
 */
export interface SideGameChipsSummary {
  purchased: number;
  deposited: number;
  withdrawn: number;
  net: number;
}

export function buildSideGameChipsSummary(sideGameChips: admin.firestore.QueryDocumentSnapshot[]): SideGameChipsSummary {
  let purchased = 0;
  let deposited = 0;
  let withdrawn = 0;

  for (const doc of sideGameChips) {
    const data = doc.data();
    const action = data.action as string | undefined;
    const amountIncl = (data.amountIncl as number | undefined) ?? 0;

    if (action === 'purchase') {
      purchased += amountIncl;
    } else if (action === 'deposit') {
      deposited += amountIncl;
    } else if (action === 'withdraw') {
      withdrawn += amountIncl;
    }
  }

  return {
    purchased,
    deposited,
    withdrawn,
    net: purchased + deposited - withdrawn,
  };
}

export function buildBaselineSideGameChips(sideGameChips: admin.firestore.QueryDocumentSnapshot[]) {
  return sideGameChips.map((doc) => {
    const data = doc.data();
    return {
      chipActionType: (data.action as string | undefined) ?? null,
      qty: (data.chipQty as number | undefined) ?? 0,
      amountIncl: (data.amountIncl as number | undefined) ?? 0,
    };
  });
}

/**
 * tournamentsSnapshot を構築
 */
export interface TournamentSnapshotItem {
  templateName: string;
  entryCount: number;
  entrySalesIncl: number;
  reentryCount: number;
  reentrySalesIncl: number;
  addonCount: number;
  addonSalesIncl: number;
  totalTournamentSalesIncl: number;
  pointsAwardedTotal: number;
  prizeAmountTotalIncl: number;
}

export type TournamentsSnapshot = Record<string, TournamentSnapshotItem>;

export function buildTournamentsSnapshot(tournaments: admin.firestore.QueryDocumentSnapshot[]): TournamentsSnapshot {
  const snapshot: TournamentsSnapshot = {};

  for (const doc of tournaments) {
    const data = doc.data();
    const templateId = (data.templateId as string | undefined) ?? doc.id;
    const templateName = (data.templateName as string | undefined) ?? '';
    
    const entryFeeIncl = (data.entryFeeIncl as number | undefined) ?? 0;
    const entryCount = (data.entryCount as number | undefined) ?? 0;
    const reentryFeeIncl = (data.reentryFeeIncl as number | undefined) ?? 0;
    const reentryCount = (data.reentryCount as number | undefined) ?? 0;
    const addonFeeIncl = (data.addonFeeIncl as number | undefined) ?? 0;
    const addonCount = (data.addonCount as number | undefined) ?? 0;

    const entrySalesIncl = entryFeeIncl * entryCount;
    const reentrySalesIncl = reentryFeeIncl * reentryCount;
    const addonSalesIncl = addonFeeIncl * addonCount;
    const totalTournamentSalesIncl = entrySalesIncl + reentrySalesIncl + addonSalesIncl;

    if (snapshot[templateId]) {
      snapshot[templateId].entryCount += entryCount;
      snapshot[templateId].entrySalesIncl += entrySalesIncl;
      snapshot[templateId].reentryCount += reentryCount;
      snapshot[templateId].reentrySalesIncl += reentrySalesIncl;
      snapshot[templateId].addonCount += addonCount;
      snapshot[templateId].addonSalesIncl += addonSalesIncl;
      snapshot[templateId].totalTournamentSalesIncl += totalTournamentSalesIncl;
      snapshot[templateId].pointsAwardedTotal += (data.pointsAwardedTotal as number | undefined) ?? 0;
      snapshot[templateId].prizeAmountTotalIncl += (data.prizeAmountTotalIncl as number | undefined) ?? 0;
    } else {
      snapshot[templateId] = {
        templateName,
        entryCount,
        entrySalesIncl,
        reentryCount,
        reentrySalesIncl,
        addonCount,
        addonSalesIncl,
        totalTournamentSalesIncl,
        pointsAwardedTotal: (data.pointsAwardedTotal as number | undefined) ?? 0,
        prizeAmountTotalIncl: (data.prizeAmountTotalIncl as number | undefined) ?? 0,
      };
    }
  }

  return snapshot;
}

export function buildBaselineTournaments(tournaments: admin.firestore.QueryDocumentSnapshot[]) {
  return tournaments.map((doc) => {
    const data = doc.data();
    const entryFeeIncl = (data.entryFeeIncl as number | undefined) ?? 0;
    const entryCount = (data.entryCount as number | undefined) ?? 0;
    const reentryFeeIncl = (data.reentryFeeIncl as number | undefined) ?? 0;
    const reentryCount = (data.reentryCount as number | undefined) ?? 0;
    const addonFeeIncl = (data.addonFeeIncl as number | undefined) ?? 0;
    const addonCount = (data.addonCount as number | undefined) ?? 0;
    const entrySalesIncl = entryFeeIncl * entryCount;
    const reentrySalesIncl = reentryFeeIncl * reentryCount;
    const addonSalesIncl = addonFeeIncl * addonCount;

    return {
      templateId: (data.templateId as string | undefined) ?? doc.id,
      templateName: (data.templateName as string | undefined) ?? '',
      entryCount,
      entrySalesIncl,
      reentryCount,
      reentrySalesIncl,
      addonCount,
      addonSalesIncl,
      totalTournamentSalesIncl: entrySalesIncl + reentrySalesIncl + addonSalesIncl,
      pointsAwardedTotal:
        (data.pointsAwardedTotal as number | undefined) ??
        (data.pointsAwarded as number | undefined) ??
        0,
      prizeAmountTotalIncl: (data.prizeAmountTotalIncl as number | undefined) ?? 0,
    };
  });
}

/**
 * paymentTotals を計算
 * /payments が存在する場合は優先、なければ meta.paymentMethodsByCategory または meta.paymentMethodsByAmount から計算
 */
export interface CalculatePaymentTotalsParams {
  paymentsDocs: admin.firestore.QueryDocumentSnapshot[];
  metaPaymentMethodsByCategory?: Record<string, string | Array<{ method: string; amount: number }>>;
  metaPaymentMethodsByAmount?: Record<string, number>;
  categoryBreakdown: CategoryBreakdown;
  sideGameChipExchangeRate?: number;
}

export type PaymentTotals = Record<string, number>;

export function calculatePaymentTotals(params: CalculatePaymentTotalsParams): PaymentTotals {
  const { paymentsDocs, metaPaymentMethodsByCategory, metaPaymentMethodsByAmount, categoryBreakdown, sideGameChipExchangeRate = DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE } = params;

  // /payments が存在する場合は優先
  if (paymentsDocs.length > 0) {
    const totals: PaymentTotals = {};
    for (const doc of paymentsDocs) {
      const data = doc.data();
      const method = (data.method as string | undefined) ?? 'cash';
      const amountIncl = (data.amountIncl as number | undefined) ?? 0;
      totals[method] = (totals[method] || 0) + amountIncl;
    }
    return totals;
  }

  // meta.paymentMethodsByAmount が存在する場合は直接使用（最も簡潔）
  if (metaPaymentMethodsByAmount && Object.keys(metaPaymentMethodsByAmount).length > 0) {
    const totals: PaymentTotals = {};
    for (const [method, amount] of Object.entries(metaPaymentMethodsByAmount)) {
      if (amount > 0) {
        // sideGameChip の場合は既に円換算値として保存されているため、そのまま使用
        if (method === 'sideGameChip') {
          totals[method] = (totals[method] || 0) + amount; // amountは円換算値
        } else {
          totals[method] = (totals[method] || 0) + amount;
        }
      }
    }
    return totals;
  }

  // meta.paymentMethodsByCategory から計算（normalizePaymentMethods と同等の処理）
  if (metaPaymentMethodsByCategory && Object.keys(metaPaymentMethodsByCategory).length > 0) {
    const totals: PaymentTotals = {};
    const defaultPaymentMethod = 'cash';

    for (const [category, paymentValue] of Object.entries(metaPaymentMethodsByCategory)) {
      const categoryAmount = categoryBreakdown[category as keyof CategoryBreakdown] || 0;
      if (categoryAmount <= 0) continue;

      if (typeof paymentValue === 'string') {
        // 文字列形式: カテゴリ全体の金額をその method に配賦
        const validMethods = ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip'];
        const validMethod = validMethods.includes(paymentValue) ? paymentValue : defaultPaymentMethod;
        totals[validMethod] = (totals[validMethod] || 0) + categoryAmount;
      } else if (Array.isArray(paymentValue)) {
        // 配列形式: 各 split の method と amount を使用
        for (const split of paymentValue) {
          if (!split || typeof split !== 'object') continue;
          const method = split.method;
          const amount = Number(split.amount) || 0;
          if (amount <= 0) continue;

          const validMethods = ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip'];
          const validMethod = validMethods.includes(method) ? method : defaultPaymentMethod;
          
          // sideGameChipの場合、split.amountはチップ枚数なので円換算値に変換
          if (method === 'sideGameChip') {
            const yenAmount = Math.floor(amount * sideGameChipExchangeRate);
            totals[validMethod] = (totals[validMethod] || 0) + yenAmount;
          } else {
            totals[validMethod] = (totals[validMethod] || 0) + amount;
          }
        }
      }
    }

    return totals;
  }

  // どちらも存在しない場合は空オブジェクトを返す
  return {};
}

/**
 * contentHash を計算
 * 対象フィールド: amounts, categoryBreakdown, itemsSnapshot, tournamentsSnapshot, paymentTotals
 * 時刻系フィールドはハッシュ対象外
 */
export interface CalculateContentHashParams {
  amounts: Amounts;
  categoryBreakdown: CategoryBreakdown;
  itemsSnapshot: ItemsSnapshot;
  tournamentsSnapshot: TournamentsSnapshot;
  paymentTotals: PaymentTotals;
}

export function calculateContentHash(params: CalculateContentHashParams): string {
  const { amounts, categoryBreakdown, itemsSnapshot, tournamentsSnapshot, paymentTotals } = params;

  // 正規化: JSON key をソート、undefined 除去、Firestore Timestamp は millis（number）に揃える、数値はそのまま
  const normalized = {
    amounts: normalizeObject(amounts),
    categoryBreakdown: normalizeObject(categoryBreakdown),
    itemsSnapshot: normalizeObject(itemsSnapshot),
    tournamentsSnapshot: normalizeObject(tournamentsSnapshot),
    paymentTotals: normalizeObject(paymentTotals),
  };

  // ハッシュ化（sha256）
  const json = JSON.stringify(normalized, Object.keys(normalized).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * オブジェクトを正規化（key ソート、undefined 除去、Timestamp は millis 化）
 */
function normalizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(normalizeObject);
  }

  // Firestore Timestamp の処理
  if (obj && typeof obj.toMillis === 'function') {
    return obj.toMillis();
  }

  // オブジェクトの正規化
  const normalized: any = {};
  const sortedKeys = Object.keys(obj).sort();

  for (const key of sortedKeys) {
    const value = obj[key];
    if (value !== undefined) {
      normalized[key] = normalizeObject(value);
    }
  }

  return normalized;
}
