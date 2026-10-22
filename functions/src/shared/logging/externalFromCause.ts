/**
 * external_api 用の材料抽出。shape 優先。差分仕様 §9–10。
 */

export type SourceProductId = 'firestore' | 'auth' | 'storage' | 'cloud_tasks' | 'line_api';

export type ExternalFields = {
  sourceProduct: SourceProductId;
  sdkCode?: string;
  httpStatus?: number | string;
  detailReason?: string;
};

function pickString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0 && v.length < 500) return v;
  return undefined;
}

function pickHttpStatus(v: unknown): number | string | undefined {
  if (typeof v === 'number' && v >= 100 && v < 600) return v;
  if (typeof v === 'string' && /^\d{3}$/.test(v)) return v;
  return undefined;
}

/**
 * cause の shape から external 項目を抽出。取れないものは undefined。
 * 原則 message 単体では決めないが、Admin Storage（GCS）の定型メッセージは例外。
 */
export function extractExternalFromCause(
  cause: unknown,
  sourceProductHint?: SourceProductId
): Partial<ExternalFields> | undefined {
  if (cause === undefined || cause === null) {
    return sourceProductHint ? { sourceProduct: sourceProductHint } : undefined;
  }

  if (typeof cause !== 'object') {
    return sourceProductHint ? { sourceProduct: sourceProductHint } : undefined;
  }

  const o = cause as Record<string, unknown>;

  // Fetch Response
  if (typeof Response !== 'undefined' && cause instanceof Response) {
    const status = cause.status;
    const out: Partial<ExternalFields> = {
      sourceProduct: 'line_api',
      httpStatus: status,
    };
    return out;
  }

  // HTTP-like { status, statusText }
  const st = pickHttpStatus(o.status) ?? pickHttpStatus(o.statusCode);
  if (st !== undefined && typeof o === 'object') {
    const code = pickString(o.code);
    const hint = sourceProductHint ?? 'line_api';
    return {
      sourceProduct: hint,
      httpStatus: st,
      sdkCode: code,
      detailReason: pickString(o.statusText) ?? pickString(o.error),
    };
  }

  // Firebase / gRPC style: { code: number|string, message, details }
  const codeRaw = o.code;
  const codeStr =
    typeof codeRaw === 'string'
      ? codeRaw
      : typeof codeRaw === 'number'
        ? String(codeRaw)
        : undefined;

  /**
   * Firebase Admin / @google-cloud/storage は、クライアント SDK の storage/... ではなく
   * プレーン Error + message（No such object / .firebasestorage.app 等）だけのことが多い。
   * この場合は code が無い、または NOT_FOUND が Firestore と紛れるため message で先に判定する。
   */
  const messageEarly =
    pickString(o.message) ?? (cause instanceof Error ? cause.message : undefined);
  if (messageEarly && looksLikeFirebaseAdminStorageMessage(messageEarly)) {
    const sdkPart =
      codeStr && codeStr.length > 0
        ? codeStr
        : typeof codeRaw === 'number' || typeof codeRaw === 'string'
          ? String(codeRaw)
          : 'GCS_ERROR';
    return {
      sourceProduct: 'storage',
      sdkCode: sdkPart,
      detailReason: messageEarly,
    };
  }

  /**
   * firebase-admin / @google-cloud/firestore は、クライアント側検証でプレーン Error + message のみのことがある
   *（例: undefined フィールド、`not a valid Firestore document`）。code が無くても message で識別する。
   */
  if (messageEarly && looksLikeFirestoreSdkClientMessage(messageEarly)) {
    return {
      sourceProduct: 'firestore',
      sdkCode: codeStr,
      detailReason: messageEarly,
    };
  }

  if (codeStr) {
    // Auth
    if (codeStr.startsWith('auth/')) {
      return {
        sourceProduct: 'auth',
        sdkCode: codeStr,
        detailReason: pickString(o.message),
      };
    }
    // Storage rules
    if (codeStr.startsWith('storage/')) {
      return {
        sourceProduct: 'storage',
        sdkCode: codeStr,
        detailReason: pickString(o.message),
      };
    }
    // Firestore REST / common gRPC codes
    const fsCodes = new Set([
      'NOT_FOUND',
      'ALREADY_EXISTS',
      'FAILED_PRECONDITION',
      'ABORTED',
      'PERMISSION_DENIED',
      'RESOURCE_EXHAUSTED',
      'INVALID_ARGUMENT',
      'UNAVAILABLE',
      'DEADLINE_EXCEEDED',
      'UNAUTHENTICATED',
      'INTERNAL',
    ]);
    if (fsCodes.has(codeStr) || codeStr.includes('/')) {
      return {
        sourceProduct: 'firestore',
        sdkCode: codeStr,
        detailReason: pickString(o.message),
      };
    }
  }

  // Google Cloud / Tasks など details 配列
  const details = o.details;
  if (Array.isArray(details) && details.length > 0) {
    const d0 = details[0] as Record<string, unknown> | undefined;
    const reason = d0 && pickString(d0['@type']);
    if (reason) {
      return {
        sourceProduct: sourceProductHint ?? 'firestore',
        sdkCode: codeStr,
        detailReason: reason,
      };
    }
  }

  // Node.js fetch error with cause chain
  if (typeof o.name === 'string' && o.name === 'FirebaseError' && typeof codeStr === 'string') {
    if (codeStr.startsWith('auth/')) {
      return { sourceProduct: 'auth', sdkCode: codeStr, detailReason: pickString(o.message) };
    }
    return {
      sourceProduct: 'firestore',
      sdkCode: codeStr,
      detailReason: pickString(o.message),
    };
  }

  if (sourceProductHint) {
    return {
      sourceProduct: sourceProductHint,
      sdkCode: codeStr,
      detailReason: pickString(o.message),
    };
  }

  return undefined;
}

/** Admin SDK / GCS が返す object 不在・バケット URL を含むメッセージ */
function looksLikeFirebaseAdminStorageMessage(msg: string): boolean {
  if (msg.includes('No such object:')) return true;
  if (msg.includes('.firebasestorage.app/')) return true;
  if (msg.includes('storage.googleapis.com/')) return true;
  return false;
}

/** Firestore Node SDK のクライアント検証・定型エラーメッセージ（誤検知しにくい文言のみ） */
function looksLikeFirestoreSdkClientMessage(msg: string): boolean {
  if (msg.includes('not a valid Firestore document')) return true;
  if (msg.includes('as a Firestore value')) return true;
  if (msg.includes('ignoreUndefinedProperties')) return true;
  return false;
}
