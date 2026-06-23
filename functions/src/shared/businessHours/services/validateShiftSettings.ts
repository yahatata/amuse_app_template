import { HttpsError } from "firebase-functions/v2/https";
import {
  REQUIRED_STAFF_STYLE_IDS,
  type BusinessHoursStyle,
  type RequiredStaffByTimeSlotV2,
  type RequiredStaffSlot,
} from "../../config/types";
import { DEFAULT_BUSINESS_HOURS_STYLES } from "../../config/defaults";

function assertHourStep(minutes: number, fieldName: string): void {
  if (minutes % 60 !== 0) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must be a multiple of 60. Got: ${minutes}`
    );
  }
}

function parseRequiredStaffSlot(slot: unknown, styleId: string, index: number): RequiredStaffSlot {
  if (!slot || typeof slot !== "object") {
    throw new HttpsError(
      "invalid-argument",
      `byStyle.${styleId}[${index}] must be an object`
    );
  }

  const record = slot as Record<string, unknown>;
  const startHour = record.startHour;
  const endHour = record.endHour;
  const requiredCount = record.requiredCount;

  if (typeof startHour !== "number" || !Number.isInteger(startHour)) {
    throw new HttpsError("invalid-argument", `byStyle.${styleId}[${index}].startHour must be an integer`);
  }
  if (typeof endHour !== "number" || !Number.isInteger(endHour)) {
    throw new HttpsError("invalid-argument", `byStyle.${styleId}[${index}].endHour must be an integer`);
  }
  if (typeof requiredCount !== "number" || !Number.isInteger(requiredCount) || requiredCount < 0) {
    throw new HttpsError(
      "invalid-argument",
      `byStyle.${styleId}[${index}].requiredCount must be a non-negative integer`
    );
  }
  if (startHour >= endHour) {
    throw new HttpsError(
      "invalid-argument",
      `byStyle.${styleId}[${index}]: startHour must be less than endHour`
    );
  }

  return { startHour, endHour, requiredCount };
}

export function validateRequiredStaffByTimeSlotV2(payload: unknown): RequiredStaffByTimeSlotV2 {
  if (!payload || typeof payload !== "object") {
    throw new HttpsError("invalid-argument", "requiredStaffByTimeSlot payload must be an object");
  }

  const record = payload as Record<string, unknown>;
  const byStyleRaw = record.byStyle;

  if (!byStyleRaw || typeof byStyleRaw !== "object" || Array.isArray(byStyleRaw)) {
    throw new HttpsError("invalid-argument", "byStyle must be an object");
  }

  const byStyle: Record<string, RequiredStaffSlot[]> = {};

  for (const styleId of REQUIRED_STAFF_STYLE_IDS) {
    if (!(styleId in (byStyleRaw as Record<string, unknown>))) {
      throw new HttpsError("invalid-argument", `byStyle.${styleId} is required`);
    }

    const slotsRaw = (byStyleRaw as Record<string, unknown>)[styleId];
    if (!Array.isArray(slotsRaw)) {
      throw new HttpsError("invalid-argument", `byStyle.${styleId} must be an array`);
    }

    if (styleId === "closed" && slotsRaw.length > 0) {
      throw new HttpsError("invalid-argument", "byStyle.closed must be an empty array");
    }

    byStyle[styleId] = slotsRaw.map((slot, index) => parseRequiredStaffSlot(slot, styleId, index));
  }

  return { version: 2, byStyle };
}

export function validateBusinessHoursStylesPayload(
  payload: unknown
): Record<string, BusinessHoursStyle> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpsError("invalid-argument", "businessHoursStyles must be an object");
  }

  const input = payload as Record<string, unknown>;
  const result: Record<string, BusinessHoursStyle> = {};

  for (const styleId of REQUIRED_STAFF_STYLE_IDS) {
    const raw = input[styleId];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new HttpsError("invalid-argument", `businessHoursStyles.${styleId} is required`);
    }

    const style = raw as Record<string, unknown>;
    const openMinute = style.openMinute;
    const closeMinute = style.closeMinute;
    const isClosed = style.isClosed;

    if (typeof openMinute !== "number" || typeof closeMinute !== "number") {
      throw new HttpsError(
        "invalid-argument",
        `businessHoursStyles.${styleId}: openMinute and closeMinute are required`
      );
    }

    if (typeof isClosed !== "boolean") {
      throw new HttpsError(
        "invalid-argument",
        `businessHoursStyles.${styleId}: isClosed must be a boolean`
      );
    }

    if (styleId === "closed") {
      if (openMinute !== 0 || closeMinute !== 0 || !isClosed) {
        throw new HttpsError(
          "invalid-argument",
          "businessHoursStyles.closed must be { openMinute: 0, closeMinute: 0, isClosed: true }"
        );
      }
    } else {
      if (isClosed) {
        throw new HttpsError(
          "invalid-argument",
          `businessHoursStyles.${styleId}: isClosed must be false`
        );
      }
      assertHourStep(openMinute, `businessHoursStyles.${styleId}.openMinute`);
      assertHourStep(closeMinute, `businessHoursStyles.${styleId}.closeMinute`);
    }

    result[styleId] = {
      styleId,
      openMinute,
      closeMinute,
      isClosed,
    };
  }

  return result;
}

export function detectChangedBusinessHoursStyleIds(
  existing: Record<string, BusinessHoursStyle> | undefined,
  incoming: Record<string, BusinessHoursStyle>
): string[] {
  const changed: string[] = [];

  for (const styleId of REQUIRED_STAFF_STYLE_IDS) {
    const prev = existing?.[styleId] ?? DEFAULT_BUSINESS_HOURS_STYLES[styleId];
    const next = incoming[styleId];
    if (
      prev.openMinute !== next.openMinute ||
      prev.closeMinute !== next.closeMinute ||
      prev.isClosed !== next.isClosed
    ) {
      changed.push(styleId);
    }
  }

  return changed;
}

export function buildChangedStylesMap(
  incoming: Record<string, BusinessHoursStyle>,
  changedStyleIds: string[]
): Record<string, BusinessHoursStyle> {
  const result: Record<string, BusinessHoursStyle> = {};
  for (const styleId of changedStyleIds) {
    result[styleId] = incoming[styleId];
  }
  return result;
}
