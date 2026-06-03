import type { Firestore } from 'firebase-admin/firestore';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { formatBlindLevelDurationText } from './formatBlindLevelDurationText';
import { convertFirestoreTimestampToIso } from './liffTournamentDateUtils';

export interface LiffTournamentItem {
  id: string;
  name: string;
  templateId: string;
  startAt: string;
  regEndAt: string;
  status: string;
  entryFee: number;
  startStack: number;
  isReentry: boolean;
  maxReentries: number | null;
  reentryFee: number;
  isAddon: boolean;
  addonLimitPerPlayer: number | null;
  addonFee: number;
  blindLevelDurationText: string;
  isRegisteredByCurrentUser?: boolean;
}

export function isTournamentStatusCancelled(status: string | undefined): boolean {
  return status === 'cancelled' || status === 'canceled';
}

interface TemplateFields {
  name: string;
  entryFee: number;
  startStack: number;
  isReentry: boolean;
  maxReentries: number | null;
  reentryFee: number;
  isAddon: boolean;
  addonLimitPerPlayer: number | null;
  addonFee: number;
  blindStructureId: string;
}

function resolveTemplateFields(
  data: FirebaseFirestore.DocumentData,
  templateFallback?: Record<string, unknown>
): TemplateFields {
  const snapshot = (data.snapshot as Record<string, unknown> | undefined) ?? {};
  const template = templateFallback ?? {};

  const pickString = (key: string, fallback = ''): string => {
    const fromSnapshot = snapshot[key];
    if (typeof fromSnapshot === 'string' && fromSnapshot.length > 0) {
      return fromSnapshot;
    }
    const fromTemplate = template[key];
    if (typeof fromTemplate === 'string' && fromTemplate.length > 0) {
      return fromTemplate;
    }
    return fallback;
  };

  const pickNumber = (key: string): number => {
    const fromSnapshot = snapshot[key];
    if (typeof fromSnapshot === 'number') return fromSnapshot;
    const fromTemplate = template[key];
    if (typeof fromTemplate === 'number') return fromTemplate;
    return 0;
  };

  const pickBoolean = (key: string): boolean => {
    const fromSnapshot = snapshot[key];
    if (typeof fromSnapshot === 'boolean') return fromSnapshot;
    const fromTemplate = template[key];
    if (typeof fromTemplate === 'boolean') return fromTemplate;
    return false;
  };

  const pickOptionalNumber = (...keys: string[]): number | null => {
    for (const key of keys) {
      const fromSnapshot = snapshot[key];
      if (typeof fromSnapshot === 'number') return fromSnapshot;
      const fromTemplate = template[key];
      if (typeof fromTemplate === 'number') return fromTemplate;
    }
    return null;
  };

  const blindStructureId =
    pickString('blindStructure') ||
    pickString('blindStructureId') ||
    (typeof snapshot.blindStructure === 'string' ? snapshot.blindStructure : '') ||
    (typeof template.blindStructure === 'string' ? template.blindStructure : '') ||
    (typeof template.blindStructureId === 'string' ? template.blindStructureId : '');

  return {
    name: pickString('name', '無名トーナメント'),
    entryFee: pickNumber('entryFee'),
    startStack: pickNumber('startStack'),
    isReentry: pickBoolean('isReentry'),
    maxReentries: pickOptionalNumber('maxReentries', 'maxReentriesPerPlayer'),
    reentryFee: pickNumber('reentryFee'),
    isAddon: pickBoolean('isAddon'),
    addonLimitPerPlayer: pickOptionalNumber('addonLimitPerPlayer'),
    addonFee: pickNumber('addonFee'),
    blindStructureId,
  };
}

async function loadBlindDurationTextMap(
  db: Firestore,
  blindStructureIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(blindStructureIds.filter((id) => id.length > 0))];
  const result = new Map<string, string>();
  if (uniqueIds.length === 0) {
    return result;
  }

  await Promise.all(
    uniqueIds.map(async (blindId) => {
      const blindDoc = await db.collection('blindTemplates').doc(blindId).get();
      if (!blindDoc.exists) {
        result.set(blindId, '');
        return;
      }
      const levels = blindDoc.data()?.levels as Array<{ level?: number; duration?: number }> | undefined;
      result.set(blindId, formatBlindLevelDurationText(levels));
    })
  );

  return result;
}

export interface MapScheduledTournamentsForLiffOptions {
  docs: QueryDocumentSnapshot[];
  db: Firestore;
  templateById: Map<string, Record<string, unknown>>;
  includeRegistrationStatus: boolean;
  registeredTemplateIds?: Set<string>;
}

export async function mapScheduledTournamentsForLiff(
  options: MapScheduledTournamentsForLiffOptions
): Promise<LiffTournamentItem[]> {
  const { docs, db, templateById, includeRegistrationStatus, registeredTemplateIds } = options;

  const activeDocs = docs.filter((doc) => {
    const status = doc.data().status as string | undefined;
    return !isTournamentStatusCancelled(status);
  });

  const blindIds: string[] = [];
  const resolvedFields = activeDocs.map((doc) => {
    const data = doc.data();
    const templateId = typeof data.templateId === 'string' ? data.templateId : '';
    const fields = resolveTemplateFields(
      data,
      templateId ? templateById.get(templateId) : undefined
    );
    if (fields.blindStructureId) {
      blindIds.push(fields.blindStructureId);
    }
    return { doc, data, templateId, fields };
  });

  const blindTextById = await loadBlindDurationTextMap(db, blindIds);

  return resolvedFields.map(({ doc, data, templateId, fields }) => {
    const item: LiffTournamentItem = {
      id: doc.id,
      name: fields.name,
      templateId,
      startAt: convertFirestoreTimestampToIso(data.startAt),
      regEndAt: convertFirestoreTimestampToIso(data.regEndAt),
      status: typeof data.status === 'string' ? data.status : 'scheduled',
      entryFee: fields.entryFee,
      startStack: fields.startStack,
      isReentry: fields.isReentry,
      maxReentries: fields.maxReentries,
      reentryFee: fields.reentryFee,
      isAddon: fields.isAddon,
      addonLimitPerPlayer: fields.addonLimitPerPlayer,
      addonFee: fields.addonFee,
      blindLevelDurationText: fields.blindStructureId
        ? blindTextById.get(fields.blindStructureId) ?? ''
        : '',
    };

    if (includeRegistrationStatus) {
      item.isRegisteredByCurrentUser =
        templateId.length > 0 && registeredTemplateIds
          ? registeredTemplateIds.has(templateId)
          : false;
    }

    return item;
  });
}

/** 認証ユーザーの bills 登録済み templateId セットを取得 */
export async function loadRegisteredTemplateIdsForUser(
  db: Firestore,
  userId: string,
  templateIds: string[]
): Promise<Set<string>> {
  const registered = new Set<string>();
  const uniqueTemplateIds = [...new Set(templateIds.filter((id) => id.length > 0))];
  if (uniqueTemplateIds.length === 0) {
    return registered;
  }

  const activeStayDoc = await db.collection('activeStays').doc(userId).get();
  if (!activeStayDoc.exists) {
    return registered;
  }

  const billId = activeStayDoc.data()?.billId as string | undefined;
  if (!billId) {
    return registered;
  }

  await Promise.all(
    uniqueTemplateIds.map(async (templateId) => {
      const billTournamentDoc = await db
        .collection('bills')
        .doc(billId)
        .collection('tournaments')
        .doc(templateId)
        .get();
      if (billTournamentDoc.exists) {
        registered.add(templateId);
      }
    })
  );

  return registered;
}
