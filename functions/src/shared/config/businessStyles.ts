/**
 * storeMeta/businessStyles — 営業スタイル + 必要人数の統合設定
 *
 * Phase 1: 型・default・組み立て helper のみ。読み取り/書き込みの正本切替は Phase 2 以降。
 */

import { HttpsError } from 'firebase-functions/v2/https';
import {
  DEFAULT_BUSINESS_HOURS_STYLES,
  DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2,
} from './defaults';
import {
  REQUIRED_STAFF_STYLE_IDS,
  type BusinessHoursStyle,
  type BusinessStyleConfig,
  type BusinessStyleId,
  type BusinessStylesConfigV2,
  type RequiredStaffSlot,
} from './types';

/** storeMeta/businessStyles 向け HttpsError / ログ文言のプレフィックス */
const BS = 'storeMeta/businessStyles';

function bsStylePath(styleId: string, suffix = ''): string {
  return suffix ? `${BS}.styles.${styleId}.${suffix}` : `${BS}.styles.${styleId}`;
}

function cloneRequiredStaffSlots(slots: RequiredStaffSlot[]): RequiredStaffSlot[] {
  return slots.map((slot) => ({
    startHour: slot.startHour,
    endHour: slot.endHour,
    requiredCount: slot.requiredCount,
  }));
}

function isValidBusinessHoursStyle(raw: unknown): raw is BusinessHoursStyle {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return false;
  }
  const style = raw as Record<string, unknown>;
  return (
    typeof style.styleId === 'string' &&
    typeof style.openMinute === 'number' &&
    typeof style.closeMinute === 'number' &&
    typeof style.isClosed === 'boolean'
  );
}

function parseRequiredStaffSlotsLenient(raw: unknown): RequiredStaffSlot[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const result: RequiredStaffSlot[] = [];
  for (const slot of raw) {
    if (!slot || typeof slot !== 'object') {
      continue;
    }
    const record = slot as Record<string, unknown>;
    const startHour = record.startHour;
    const endHour = record.endHour;
    const requiredCount = record.requiredCount;

    if (typeof startHour !== 'number' || !Number.isInteger(startHour)) {
      continue;
    }
    if (typeof endHour !== 'number' || !Number.isInteger(endHour)) {
      continue;
    }
    if (
      typeof requiredCount !== 'number' ||
      !Number.isInteger(requiredCount) ||
      requiredCount < 0
    ) {
      continue;
    }
    if (startHour >= endHour) {
      continue;
    }

    result.push({ startHour, endHour, requiredCount });
  }

  return result;
}

function resolveBusinessHoursStyle(styleId: BusinessStyleId, raw?: unknown): BusinessHoursStyle {
  const styles = raw as Record<string, unknown> | undefined;
  const candidate = styles?.[styleId];
  if (isValidBusinessHoursStyle(candidate)) {
    return {
      styleId: candidate.styleId,
      openMinute: candidate.openMinute,
      closeMinute: candidate.closeMinute,
      isClosed: candidate.isClosed,
    };
  }
  return { ...DEFAULT_BUSINESS_HOURS_STYLES[styleId] };
}

function resolveRequiredStaffForStyle(
  styleId: BusinessStyleId,
  byStyle: Record<string, unknown> | null | undefined
): RequiredStaffSlot[] {
  if (styleId === 'closed') {
    return [];
  }

  if (!byStyle) {
    return cloneRequiredStaffSlots(DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2.byStyle[styleId]);
  }

  if (!(styleId in byStyle)) {
    return [];
  }

  return parseRequiredStaffSlotsLenient(byStyle[styleId]);
}

/**
 * defaults.ts の営業時間 + 必要人数から v2 businessStyles を構築（deep copy）
 */
export function buildDefaultBusinessStyles(): BusinessStylesConfigV2 {
  return buildBusinessStylesFromLegacyConfig({
    businessHoursStyles: DEFAULT_BUSINESS_HOURS_STYLES,
    requiredStaffByStyle: DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2.byStyle,
  });
}

/** storeMeta/businessStyles の v2 初期値 */
export const DEFAULT_BUSINESS_STYLES_V2: BusinessStylesConfigV2 = buildDefaultBusinessStyles();

/**
 * 旧 config.businessHoursStyles + requiredStaffByTimeSlot.byStyle から businessStyles を組み立てる
 */
export function buildBusinessStylesFromLegacyConfig(params: {
  businessHoursStyles?: Record<string, unknown> | null;
  requiredStaffByStyle?: Record<string, unknown> | null;
}): BusinessStylesConfigV2 {
  const styles = {} as Record<BusinessStyleId, BusinessStyleConfig>;

  for (const styleId of REQUIRED_STAFF_STYLE_IDS) {
    const hours = resolveBusinessHoursStyle(styleId, params.businessHoursStyles);
    const requiredStaffByTimeSlot = resolveRequiredStaffForStyle(
      styleId,
      params.requiredStaffByStyle ?? null
    );

    styles[styleId] = {
      styleId,
      openMinute: hours.openMinute,
      closeMinute: hours.closeMinute,
      isClosed: hours.isClosed,
      requiredStaffByTimeSlot:
        styleId === 'closed' ? [] : cloneRequiredStaffSlots(requiredStaffByTimeSlot),
    };
  }

  return { version: 2, styles };
}

function assertHourStep(minutes: number, fieldName: string): void {
  if (minutes % 60 !== 0) {
    throw new HttpsError(
      'invalid-argument',
      `${fieldName} must be a multiple of 60. Got: ${minutes}`
    );
  }
}

function parseRequiredStaffSlotStrict(
  slot: unknown,
  styleId: string,
  index: number
): RequiredStaffSlot {
  if (!slot || typeof slot !== 'object') {
    throw new HttpsError(
      'invalid-argument',
      `${bsStylePath(styleId, `requiredStaffByTimeSlot[${index}]`)} must be an object`
    );
  }

  const record = slot as Record<string, unknown>;
  const startHour = record.startHour;
  const endHour = record.endHour;
  const requiredCount = record.requiredCount;

  if (typeof startHour !== 'number' || !Number.isInteger(startHour)) {
    throw new HttpsError(
      'invalid-argument',
      `${bsStylePath(styleId, `requiredStaffByTimeSlot[${index}].startHour`)} must be an integer`
    );
  }
  if (typeof endHour !== 'number' || !Number.isInteger(endHour)) {
    throw new HttpsError(
      'invalid-argument',
      `${bsStylePath(styleId, `requiredStaffByTimeSlot[${index}].endHour`)} must be an integer`
    );
  }
  if (
    typeof requiredCount !== 'number' ||
    !Number.isInteger(requiredCount) ||
    requiredCount < 0
  ) {
    throw new HttpsError(
      'invalid-argument',
      `${bsStylePath(styleId, `requiredStaffByTimeSlot[${index}].requiredCount`)} must be a non-negative integer`
    );
  }
  if (startHour >= endHour) {
    throw new HttpsError(
      'invalid-argument',
      `${bsStylePath(styleId, `requiredStaffByTimeSlot[${index}]`)}: startHour must be less than endHour`
    );
  }

  return { startHour, endHour, requiredCount };
}

/**
 * storeMeta/businessStyles v2 payload を検証して正規化する
 */
export function validateBusinessStyles(payload: unknown): BusinessStylesConfigV2 {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpsError('invalid-argument', `${BS} payload must be an object`);
  }

  const record = payload as Record<string, unknown>;
  if (record.version !== 2) {
    throw new HttpsError('invalid-argument', `${BS}.version must be 2`);
  }

  const stylesRaw = record.styles;
  if (!stylesRaw || typeof stylesRaw !== 'object' || Array.isArray(stylesRaw)) {
    throw new HttpsError('invalid-argument', `${BS}.styles must be an object`);
  }

  const styles = {} as Record<BusinessStyleId, BusinessStyleConfig>;

  for (const styleId of REQUIRED_STAFF_STYLE_IDS) {
    const raw = (stylesRaw as Record<string, unknown>)[styleId];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new HttpsError('invalid-argument', `${bsStylePath(styleId)} is required`);
    }

    const style = raw as Record<string, unknown>;
    const openMinute = style.openMinute;
    const closeMinute = style.closeMinute;
    const isClosed = style.isClosed;
    const slotsRaw = style.requiredStaffByTimeSlot;

    if (typeof openMinute !== 'number' || typeof closeMinute !== 'number') {
      throw new HttpsError(
        'invalid-argument',
        `${bsStylePath(styleId)}: openMinute and closeMinute are required`
      );
    }
    if (typeof isClosed !== 'boolean') {
      throw new HttpsError('invalid-argument', `${bsStylePath(styleId)}: isClosed must be a boolean`);
    }

    if (styleId === 'closed') {
      if (openMinute !== 0 || closeMinute !== 0 || !isClosed) {
        throw new HttpsError(
          'invalid-argument',
          `${bsStylePath('closed')} must be { openMinute: 0, closeMinute: 0, isClosed: true }`
        );
      }
    } else {
      if (isClosed) {
        throw new HttpsError('invalid-argument', `${bsStylePath(styleId)}: isClosed must be false`);
      }
      assertHourStep(openMinute, `${bsStylePath(styleId)}.openMinute`);
      assertHourStep(closeMinute, `${bsStylePath(styleId)}.closeMinute`);
    }

    if (!Array.isArray(slotsRaw)) {
      throw new HttpsError(
        'invalid-argument',
        `${bsStylePath(styleId, 'requiredStaffByTimeSlot')} must be an array`
      );
    }
    if (styleId === 'closed' && slotsRaw.length > 0) {
      throw new HttpsError(
        'invalid-argument',
        `${bsStylePath('closed', 'requiredStaffByTimeSlot')} must be an empty array`
      );
    }

    styles[styleId] = {
      styleId,
      openMinute,
      closeMinute,
      isClosed,
      requiredStaffByTimeSlot: slotsRaw.map((slot, index) =>
        parseRequiredStaffSlotStrict(slot, styleId, index)
      ),
    };
  }

  return { version: 2, styles };
}

/**
 * 営業時間のみを既存 businessStyles にマージする（requiredStaffByTimeSlot は保持）
 */
export function mergeBusinessHoursStylesIntoBusinessStyles(
  existing: BusinessStylesConfigV2,
  validatedHours: Record<string, BusinessHoursStyle>
): BusinessStylesConfigV2 {
  const styles = { ...existing.styles } as Record<BusinessStyleId, BusinessStyleConfig>;

  for (const styleId of REQUIRED_STAFF_STYLE_IDS) {
    const hours = validatedHours[styleId];
    styles[styleId] = {
      styleId,
      openMinute: hours.openMinute,
      closeMinute: hours.closeMinute,
      isClosed: hours.isClosed,
      requiredStaffByTimeSlot:
        styleId === 'closed' ? [] : cloneRequiredStaffSlots(styles[styleId].requiredStaffByTimeSlot),
    };
  }

  return { version: 2, styles };
}

/**
 * 必要人数のみを既存 businessStyles にマージする（営業時間は保持）
 */
export function mergeRequiredStaffByStyleIntoBusinessStyles(
  existing: BusinessStylesConfigV2,
  byStyle: Record<string, RequiredStaffSlot[]>
): BusinessStylesConfigV2 {
  const styles = { ...existing.styles } as Record<BusinessStyleId, BusinessStyleConfig>;

  for (const styleId of REQUIRED_STAFF_STYLE_IDS) {
    const current = styles[styleId];
    styles[styleId] = {
      ...current,
      requiredStaffByTimeSlot:
        styleId === 'closed' ? [] : cloneRequiredStaffSlots(byStyle[styleId] ?? []),
    };
  }

  return { version: 2, styles };
}

/**
 * 旧 storeMeta/requiredStaffByTimeSlot doc から byStyle を抽出する（migration helper）
 */
export function extractRequiredStaffByStyleFromDoc(
  data: Record<string, unknown> | undefined,
  docExists: boolean
): Record<string, unknown> | null {
  if (!docExists) {
    return DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2.byStyle;
  }

  if (
    data?.version === 2 &&
    data.byStyle &&
    typeof data.byStyle === 'object' &&
    !Array.isArray(data.byStyle)
  ) {
    return data.byStyle as Record<string, unknown>;
  }

  return null;
}

/**
 * initializeStoreConfigCallable 用: config + requiredStaff から businessStyles を組み立てる
 */
export function buildBusinessStylesForInitialization(params: {
  businessHoursStyles?: Record<string, unknown> | null;
  requiredStaffDocData?: Record<string, unknown>;
  requiredStaffDocExists: boolean;
}): BusinessStylesConfigV2 {
  return buildBusinessStylesFromLegacyConfig({
    businessHoursStyles: params.businessHoursStyles,
    requiredStaffByStyle: extractRequiredStaffByStyleFromDoc(
      params.requiredStaffDocData,
      params.requiredStaffDocExists
    ),
  });
}

/**
 * Firestore から読み取った businessStyles を lenient に正規化する（Phase 2 読取向け）
 */
export function normalizeBusinessStyles(payload: unknown): BusinessStylesConfigV2 | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (record.version !== 2) {
    return null;
  }

  const stylesRaw = record.styles;
  if (!stylesRaw || typeof stylesRaw !== 'object' || Array.isArray(stylesRaw)) {
    return null;
  }

  try {
    return validateBusinessStyles({ version: 2, styles: stylesRaw });
  } catch {
    return buildBusinessStylesFromLegacyConfig({
      businessHoursStyles: stylesRaw as Record<string, unknown>,
      requiredStaffByStyle: Object.fromEntries(
        REQUIRED_STAFF_STYLE_IDS.map((styleId) => {
          const style = (stylesRaw as Record<string, unknown>)[styleId];
          if (!style || typeof style !== 'object' || Array.isArray(style)) {
            return [styleId, []];
          }
          return [
            styleId,
            (style as Record<string, unknown>).requiredStaffByTimeSlot ?? [],
          ];
        })
      ),
    });
  }
}
