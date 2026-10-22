/**
 * トーナメント置きバケ一時参加者関連の型（詳細仕様書 §10 準拠）。
 * Phase 1: 型定義のみ。Firestore 読み書きロジックは後続 Phase。
 */

import type { Timestamp } from 'firebase-admin/firestore';

export type OkibakeEntryStatus = 'registered' | 'seated' | 'busted' | 'voided';

export type OkibakeBillLinkStatus = 'unlinked' | 'linked' | 'pending_review';

export type OkibakeAddonIntent = 'unknown' | 'yes' | 'no';

/** 詳細仕様書 §10.27 */
export type OkibakeAddonRecord = {
  addonRecordId: string;
  operationId: string;

  occurredAt: Timestamp;
  createdByDeviceId: string | null;

  reflectedToBill: boolean;
  reflectedToBillAt: Timestamp | null;
  linkedBillId: string | null;

  rolledBack: boolean;
  rollBackAt: Timestamp | null;
  rollBackBy: string | null;
};

/** 詳細仕様書 §10 基本構造 */
export type OkibakeTemporaryEntry = {
  okibakeEntryId: string;

  tournamentId: string;

  temporaryDisplayName: string;

  linkedUserId: string | null;
  linkedUserPokerName: string | null;

  linkedBillId: string | null;
  linkedAt: Timestamp | null;

  entryStatus: OkibakeEntryStatus;
  billLinkStatus: OkibakeBillLinkStatus;

  addonIntent: OkibakeAddonIntent;

  memo: string | null;

  okibakeAddonCount: number;
  lastOkibakeAddonAt: Timestamp | null;
  okibakeAddonRecords: OkibakeAddonRecord[];

  assignedTableId: string | null;
  assignedSeatKey: string | null;
  seatedAt: Timestamp | null;

  bustedAt: Timestamp | null;
  bustedTableId: string | null;
  bustedSeatKey: string | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;

  createdByDeviceId: string | null;
  updatedByDeviceId: string | null;

  voidedAt: Timestamp | null;
  voidedByDeviceId: string | null;
};
