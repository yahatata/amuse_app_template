/**
 * Phase 4-A: linkOkibakeTemporaryEntryToBill 用 bill tournaments 反映（transaction 内インライン）。
 * recordTournamentAction 相当のフィールド形式に寄せる。
 */

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { OkibakeAddonRecord } from '../types/okibake';

export type SlimBillTournament = {
  templateId?: string;
  templateName?: string | null;
  entryCount?: number;
  reentryCount?: number;
  addonCount?: number;
  entryFeeIncl?: number | null;
  reentryFeeIncl?: number | null;
  addonFeeIncl?: number | null;
  registeredAt?: unknown;
  lastAddonAt?: unknown;
  startAt?: unknown;
};

export function slimBillTournament(data: Record<string, unknown> | undefined | null): SlimBillTournament | null {
  if (!data) return null;
  return {
    templateId: typeof data.templateId === 'string' ? data.templateId : undefined,
    templateName: data.templateName != null ? String(data.templateName) : null,
    entryCount: typeof data.entryCount === 'number' ? data.entryCount : 0,
    reentryCount: typeof data.reentryCount === 'number' ? data.reentryCount : 0,
    addonCount: typeof data.addonCount === 'number' ? data.addonCount : 0,
    entryFeeIncl: typeof data.entryFeeIncl === 'number' ? data.entryFeeIncl : null,
    reentryFeeIncl: typeof data.reentryFeeIncl === 'number' ? data.reentryFeeIncl : null,
    addonFeeIncl: typeof data.addonFeeIncl === 'number' ? data.addonFeeIncl : null,
    registeredAt: data.registeredAt ?? null,
    lastAddonAt: data.lastAddonAt ?? null,
    startAt: data.startAt ?? null,
  };
}

export type ReflectOkibakeLinkFees = {
  templateId: string;
  templateName: string;
  entryFeeIncl: number;
  addonFeeIncl: number;
  startAt: admin.firestore.Timestamp | null;
};

export type ReflectOkibakeLinkBillResult = {
  tournamentUpdate: Record<string, unknown>;
  updatedAddonRecords: OkibakeAddonRecord[];
  reflectedAddonRecordIds: string[];
  reflectedAddonCount: number;
  reflectedAddonAmount: number;
  reflectedEntry: {
    templateId: string;
    entryCountDelta: number;
    entryFeeInclDelta: number;
  };
  billTournamentBefore: SlimBillTournament | null;
  billTournamentAfter: SlimBillTournament;
};

function isAddonRecordEligible(record: unknown): record is OkibakeAddonRecord {
  if (!record || typeof record !== 'object') return false;
  const r = record as Record<string, unknown>;
  if (r.rolledBack === true) return false;
  if (r.reflectedToBill === true) return false;
  return typeof r.addonRecordId === 'string' && r.addonRecordId.length > 0;
}

/**
 * bill tournaments ドキュメントが未作成である前提で、entry + 未反映 addon を反映する更新 payload を組み立てる。
 */
export function buildOkibakeLinkBillTournamentReflection(params: {
  fees: ReflectOkibakeLinkFees;
  existingTournamentData: Record<string, unknown> | null | undefined;
  okibakeAddonRecords: unknown[];
  billId: string;
  nowTs: FieldValue;
}): ReflectOkibakeLinkBillResult {
  const { fees, existingTournamentData, okibakeAddonRecords, billId, nowTs } = params;

  const billTournamentBefore = slimBillTournament(existingTournamentData ?? null);

  const pendingRecords = okibakeAddonRecords.filter(isAddonRecordEligible);
  const reflectedAddonRecordIds = pendingRecords.map((r) => r.addonRecordId);
  const reflectedAddonCount = pendingRecords.length;

  const updatedAddonRecords: OkibakeAddonRecord[] = okibakeAddonRecords.map((raw) => {
    if (!isAddonRecordEligible(raw)) return raw as OkibakeAddonRecord;
    return {
      ...(raw as OkibakeAddonRecord),
      reflectedToBill: true,
      reflectedToBillAt: admin.firestore.Timestamp.now(),
      linkedBillId: billId,
    };
  });

  let lastAddonAt: admin.firestore.Timestamp | FieldValue | null =
    (existingTournamentData?.lastAddonAt as admin.firestore.Timestamp | undefined) ?? null;
  if (pendingRecords.length > 0) {
    const lastRecord = pendingRecords[pendingRecords.length - 1];
    lastAddonAt = lastRecord.occurredAt ?? admin.firestore.Timestamp.now();
  }

  const addonCountBefore =
    typeof existingTournamentData?.addonCount === 'number' ? existingTournamentData.addonCount : 0;

  const tournamentUpdate: Record<string, unknown> = {
    templateId: fees.templateId,
    templateName: fees.templateName,
    entryFeeIncl: fees.entryFeeIncl,
    reentryFeeIncl: existingTournamentData?.reentryFeeIncl ?? null,
    addonFeeIncl: fees.addonFeeIncl,
    entryCount: 1,
    reentryCount: typeof existingTournamentData?.reentryCount === 'number' ? existingTournamentData.reentryCount : 0,
    addonCount: addonCountBefore + reflectedAddonCount,
    registeredAt: nowTs,
    startAt: fees.startAt ?? existingTournamentData?.startAt ?? null,
    lastReentryAt: existingTournamentData?.lastReentryAt ?? null,
    lastAddonAt: lastAddonAt ?? null,
    pointsAwarded: existingTournamentData?.pointsAwarded ?? null,
  };

  const billTournamentAfter = slimBillTournament(tournamentUpdate)!;

  return {
    tournamentUpdate,
    updatedAddonRecords,
    reflectedAddonRecordIds,
    reflectedAddonCount,
    reflectedAddonAmount: fees.addonFeeIncl * reflectedAddonCount,
    reflectedEntry: {
      templateId: fees.templateId,
      entryCountDelta: 1,
      entryFeeInclDelta: fees.entryFeeIncl,
    },
    billTournamentBefore,
    billTournamentAfter,
  };
}

export function slimOkibakeEntryForLinkLog(data: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!data) return null;
  return {
    entryStatus: data.entryStatus,
    billLinkStatus: data.billLinkStatus,
    linkedUserId: data.linkedUserId ?? null,
    linkedUserPokerName: data.linkedUserPokerName ?? null,
    linkedBillId: data.linkedBillId ?? null,
    okibakeAddonCount: data.okibakeAddonCount ?? 0,
    assignedTableId: data.assignedTableId ?? null,
    assignedSeatKey: data.assignedSeatKey ?? null,
  };
}

export function slimSeatForLinkLog(
  seats: Record<string, unknown>,
  suffix: string
): Record<string, unknown> {
  return {
    userId: seats[`seat${suffix}UserId`] ?? null,
    pokerName: seats[`seat${suffix}PokerName`] ?? null,
    okibakeEntryId: seats[`seat${suffix}OkibakeEntryId`] ?? null,
  };
}
