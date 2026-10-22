import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getCallerDeviceByUid, isActive } from "../../../shared/devices";
import { getStoreConfig } from "../../../shared/config/configLoader";
import { validatePointConfigFromStoreConfig } from "../../../shared/config/validatePointConfig";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import {
  FunctionCustomError,
  mapFunctionCustomErrorToHttpsCode,
} from "../../../shared/logging/functionCustomError";
import { assertUserNotMigrated } from "../helpers/assertUserNotMigrated";
import {
  initialBalancePatchesEqual,
  mergeBalancesAfterInitialPatch,
  validateInitialBalancesPatchAgainstConfig,
  type BalanceSet,
  type InitialBalancesPatch,
} from "../helpers/validateBalanceSet";
import { ALL_BALANCE_IDS } from "../types/pointIds";
import { MIGRATION_TYPE_INITIAL_IMPORT } from "../types/userType";

const NOTE_MAX_LENGTH = 200;

type IdempotencyDoc = {
  balances: InitialBalancesPatch;
  migrationId: string;
};

function normalizeOptionalNote(note: unknown): string | undefined {
  if (note === undefined || note === null) {
    return undefined;
  }
  if (typeof note !== "string") {
    throw new HttpsError("invalid-argument", "note の形式が不正です", {
      errorKey: "INVALID_ARGUMENT",
    });
  }
  const trimmed = note.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > NOTE_MAX_LENGTH) {
    throw new HttpsError("invalid-argument", "note は200文字以内で入力してください", {
      errorKey: "INVALID_ARGUMENT",
    });
  }
  return trimmed;
}

function normalizeClientNonce(clientNonce: unknown): string | undefined {
  if (clientNonce === undefined || clientNonce === null || clientNonce === "") {
    return undefined;
  }
  if (typeof clientNonce !== "string") {
    throw new HttpsError("invalid-argument", "clientNonce の形式が不正です", {
      errorKey: "INVALID_ARGUMENT",
    });
  }
  const trimmed = clientNonce.trim();
  return trimmed || undefined;
}

function toIsoTimestamp(value: unknown): string {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  return new Date().toISOString();
}

function throwMappedCustomError(error: FunctionCustomError): never {
  throw new HttpsError(
    mapFunctionCustomErrorToHttpsCode(error.errorKey),
    error.message,
    { errorKey: error.errorKey },
  );
}

/**
 * 管理者端末からユーザーの初期残高を上書き設定する。
 * 有効スロットのみ更新。無効スロットは保持。
 * 履歴は balanceMigrationLogs（initial_import）に全標準6残高を残す。
 */
export const setInitialUserBalances = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "認証が必要です", {
      errorKey: "UNAUTHENTICATED",
    });
  }

  const callerUid = request.auth.uid;
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError(
      "permission-denied",
      "デバイスが見つからないか、アクティブではありません",
      { errorKey: "PERMISSION_DENIED" },
    );
  }
  if (device.role !== "admin") {
    throw new HttpsError(
      "permission-denied",
      "初期残高の設定には管理者権限が必要です",
      { errorKey: "PERMISSION_DENIED" },
    );
  }

  const {
    targetUserId: targetUserIdRaw,
    balances: balancesRaw,
    note: noteRaw,
    clientNonce: clientNonceRaw,
    confirmOverwrite,
  } = request.data as {
    targetUserId?: unknown;
    balances?: unknown;
    note?: unknown;
    clientNonce?: unknown;
    confirmOverwrite?: unknown;
  };

  if (typeof targetUserIdRaw !== "string" || !targetUserIdRaw.trim()) {
    throw new HttpsError("invalid-argument", "targetUserId が必要です", {
      errorKey: "INVALID_ARGUMENT",
    });
  }
  const targetUserId = targetUserIdRaw.trim();

  if (confirmOverwrite !== true) {
    throw new HttpsError("invalid-argument", "上書き確認が必要です", {
      errorKey: "CONFIRMATION_REQUIRED",
    });
  }

  const logContext: Record<string, unknown> = { targetUserId };
  const db = admin.firestore();

  let patch: InitialBalancesPatch;
  try {
    const storeConfig = await getStoreConfig(db);
    const validatedConfig = validatePointConfigFromStoreConfig(storeConfig);
    patch = validateInitialBalancesPatchAgainstConfig(balancesRaw, {
      pointSettings: validatedConfig.pointSettings,
      sideGameChipSettings: validatedConfig.sideGameChipSettings,
    });
  } catch (error) {
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: "setInitialUserBalances validation failed",
        functionEntry: "setInitialUserBalances",
        operation: "setInitialValidation",
        cause: error,
        context: {
          targetUserId,
          errorKey: error.errorKey,
        },
      });
      throwMappedCustomError(error);
    }
    throw error;
  }

  const note = normalizeOptionalNote(noteRaw);
  const clientNonce = normalizeClientNonce(clientNonceRaw);

  const userRef = db.collection("users").doc(targetUserId);
  const logsCol = userRef.collection("balanceMigrationLogs");
  const migrationRef = logsCol.doc();
  const idempotencyRef = clientNonce
    ? userRef.collection("balanceMigrationIdempotency").doc(clientNonce)
    : null;

  try {
    const result = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw new HttpsError("not-found", "ユーザーが見つかりません", {
          errorKey: "TARGET_USER_NOT_FOUND",
        });
      }

      const userData = userSnap.data() as Record<string, unknown>;
      assertUserNotMigrated(userData);

      if (idempotencyRef) {
        const idemSnap = await tx.get(idempotencyRef);
        if (idemSnap.exists) {
          const existing = idemSnap.data() as IdempotencyDoc;
          if (!existing?.balances || !existing.migrationId) {
            throw new HttpsError("aborted", "冪等キーの状態が不正です", {
              errorKey: "IDEMPOTENCY_CONFLICT",
            });
          }
          if (!initialBalancePatchesEqual(existing.balances, patch)) {
            throw new HttpsError(
              "aborted",
              "同一の再送キーで異なる残高が指定されています",
              { errorKey: "IDEMPOTENCY_CONFLICT" },
            );
          }
          const reusedBalances = mergeBalancesAfterInitialPatch(userData, patch);
          return {
            reused: true as const,
            migrationId: existing.migrationId,
            initialBalanceSetAt: toIsoTimestamp(userData.initialBalanceSetAt),
            balances: reusedBalances,
          };
        }
      }

      const migrationId = migrationRef.id;
      const serverTs = admin.firestore.FieldValue.serverTimestamp();
      const afterBalances: BalanceSet = mergeBalancesAfterInitialPatch(
        userData,
        patch,
      );

      const userUpdate: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        initialBalanceSetAt: serverTs,
      };
      for (const [id, value] of Object.entries(patch)) {
        userUpdate[id] = value;
      }
      tx.update(userRef, userUpdate);

      const logBalances: Record<string, number> = {};
      for (const id of ALL_BALANCE_IDS) {
        logBalances[id] = afterBalances[id];
      }

      const logDoc: Record<string, unknown> = {
        migrationType: MIGRATION_TYPE_INITIAL_IMPORT,
        balances: logBalances,
        createdAt: serverTs,
      };
      if (note !== undefined) {
        logDoc.note = note;
      }
      tx.set(migrationRef, logDoc);

      if (idempotencyRef) {
        tx.set(idempotencyRef, {
          balances: { ...patch },
          migrationId,
          createdAt: serverTs,
        });
      }

      return {
        reused: false as const,
        migrationId,
        initialBalanceSetAt: new Date().toISOString(),
        balances: afterBalances,
      };
    });

    let initialBalanceSetAt = result.initialBalanceSetAt;
    if (!result.reused) {
      const after = await userRef.get();
      initialBalanceSetAt = toIsoTimestamp(after.data()?.initialBalanceSetAt);
    }

    logContext.migrationId = result.migrationId;
    logOpsSuccess({
      message: "setInitialUserBalances 成功",
      functionEntry: "setInitialUserBalances",
      context: {
        targetUserId,
        migrationId: result.migrationId,
        reused: result.reused,
      },
    });

    return {
      success: true,
      targetUserId,
      balances: result.balances,
      initialBalanceSetAt,
      migrationId: result.migrationId,
      ...(result.reused ? { reused: true } : {}),
    };
  } catch (error) {
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: "setInitialUserBalances failed",
        functionEntry: "setInitialUserBalances",
        operation: "setInitialTransaction",
        cause: error,
        context: { targetUserId, errorKey: error.errorKey },
      });
      throwMappedCustomError(error);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    logOpsError({
      message: "setInitialUserBalances エラー",
      functionEntry: "setInitialUserBalances",
      operation: "setInitialMainCatch",
      cause: error,
      context: logContext,
    });
    throw new HttpsError("internal", "初期残高の設定に失敗しました", {
      errorKey: "INTERNAL",
    });
  }
});
