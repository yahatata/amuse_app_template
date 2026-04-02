import { logger } from 'firebase-functions';
import { PROBE_LOG_LIMITS } from './limits';

export type ErrorShapeProbeLogPayload = {
  errorShapeProbe: true;
  probe: string;
  summary: {
    name?: string;
    messagePreview?: string;
    code?: unknown;
    constructorName?: string;
  };
  observation: {
    ownPropertyNames: string[];
    enumerableKeys: string[];
    stackPreview?: string;
    code?: unknown;
    messageFullTruncated: boolean;
    details?: unknown;
    cause?: unknown;
    jsonSample?: string;
    jsonSampleTruncated: boolean;
  };
};

function truncateString(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) {
    return { text: s, truncated: false };
  }
  return { text: `${s.slice(0, max)}…[truncated ${s.length} chars]`, truncated: true };
}

function safeJsonStringify(value: unknown, maxLen: number): { text: string; truncated: boolean } {
  try {
    const raw = JSON.stringify(
      value,
      (_key, v) => {
        if (typeof v === 'bigint') {
          return String(v);
        }
        return v;
      },
      2
    );
    if (raw.length <= maxLen) {
      return { text: raw, truncated: false };
    }
    return { text: `${raw.slice(0, maxLen)}…`, truncated: true };
  } catch {
    return { text: '[JSON.stringify failed]', truncated: false };
  }
}

function serializeDetails(details: unknown, depth: number): unknown {
  if (depth > PROBE_LOG_LIMITS.MAX_DEPTH) {
    return '[MaxDepth]';
  }
  if (details === null || details === undefined) {
    return details;
  }
  if (Array.isArray(details)) {
    return details.slice(0, PROBE_LOG_LIMITS.MAX_DETAILS_ARRAY_LENGTH).map((item, i) => ({
      index: i,
      value: serializeUnknown(item, depth + 1),
    }));
  }
  return serializeUnknown(details, depth);
}

function serializeUnknown(err: unknown, depth: number): unknown {
  if (depth > PROBE_LOG_LIMITS.MAX_DEPTH) {
    return '[MaxDepth]';
  }
  if (err === null || err === undefined) {
    return err;
  }
  if (typeof err !== 'object') {
    return err;
  }
  const obj = err as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const pick = ['reason', 'domain', 'metadata', '@type', 'type', 'code', 'message'];
  for (const k of pick) {
    if (k in obj && obj[k] !== undefined) {
      const v = obj[k];
      if (typeof v === 'string') {
        out[k] = truncateString(v, PROBE_LOG_LIMITS.MAX_STRING_TRUNCATE).text;
      } else {
        out[k] = serializeUnknown(v, depth + 1);
      }
    }
  }
  if (Object.keys(out).length === 0) {
    const sub = safeJsonStringify(err, PROBE_LOG_LIMITS.MAX_JSON_STRING_LENGTH);
    return sub.text;
  }
  return out;
}

function extractCauseChain(err: unknown, depth: number): unknown {
  if (depth > PROBE_LOG_LIMITS.MAX_DEPTH) {
    return '[MaxDepth]';
  }
  if (err === null || err === undefined) {
    return err;
  }
  if (typeof err !== 'object') {
    return err;
  }
  const e = err as Error & { cause?: unknown; code?: unknown };
  const next = e.cause;
  if (next === undefined) {
    return undefined;
  }
  return {
    message: truncateString(String((next as Error)?.message ?? next), PROBE_LOG_LIMITS.MAX_STRING_TRUNCATE).text,
    name: (next as Error)?.name,
    code: (next as { code?: unknown }).code,
    deeper: extractCauseChain(next, depth + 1),
  };
}

/**
 * catch された値から観察用ペイロードを組み立て、logger に渡す（logOpsError には統合しない）。
 */
export function logErrorShapeObservation(probe: string, caught: unknown): ErrorShapeProbeLogPayload {
  const err = caught;
  const name = err instanceof Error ? err.name : typeof err;
  const msgRaw = err instanceof Error ? err.message : String(err);
  const msgT = truncateString(msgRaw, PROBE_LOG_LIMITS.MAX_STRING_TRUNCATE);
  const stackT = err instanceof Error && err.stack
    ? truncateString(err.stack, PROBE_LOG_LIMITS.MAX_STRING_TRUNCATE).text
    : undefined;

  let code: unknown;
  let details: unknown;
  if (typeof err === 'object' && err !== null) {
    const anyErr = err as { code?: unknown; details?: unknown };
    code = anyErr.code;
    details = anyErr.details !== undefined ? serializeDetails(anyErr.details, 0) : undefined;
  }

  let ownPropertyNames: string[] = [];
  let enumerableKeys: string[] = [];
  if (typeof err === 'object' && err !== null) {
    try {
      ownPropertyNames = Object.getOwnPropertyNames(err).slice(0, PROBE_LOG_LIMITS.MAX_OWN_PROPERTY_KEYS);
      enumerableKeys = Object.keys(err).slice(0, PROBE_LOG_LIMITS.MAX_OWN_PROPERTY_KEYS);
    } catch {
      ownPropertyNames = ['[enumeration failed]'];
    }
  }

  const jsonTry = safeJsonStringify(err, PROBE_LOG_LIMITS.MAX_JSON_STRING_LENGTH);
  const causeChain = extractCauseChain(err, 0);

  const payload: ErrorShapeProbeLogPayload = {
    errorShapeProbe: true,
    probe,
    summary: {
      name,
      messagePreview: msgT.text,
      code,
      constructorName: err instanceof Object && err !== null ? err.constructor?.name : undefined,
    },
    observation: {
      ownPropertyNames,
      enumerableKeys,
      stackPreview: stackT,
      code,
      messageFullTruncated: msgT.truncated,
      details,
      cause: causeChain,
      jsonSample: jsonTry.text,
      jsonSampleTruncated: jsonTry.truncated,
    },
  };

  logger.info(`errorShapeProbe:${probe}`, payload);
  return payload;
}
