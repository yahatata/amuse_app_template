import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getCallerDeviceByUid, isActive } from "../../../shared/devices";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { assertUserNotMigrated } from "../helpers/assertUserNotMigrated";
import {
  balancesEqual,
  validateBalanceTriple,
  type BalanceTriple,
} from "../helpers/validateBalanceTriple";
import { MIGRATION_TYPE_INITIAL_IMPORT } from "../types/userType";

const NOTE_MAX_LENGTH = 200;

type IdempotencyDoc = {
  balances: BalanceTriple;
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

/**
 * 管理者端末からユーザーの初期残高（3 残高）を上書き設定する。
 * 履歴は balanceMigrationLogs（initial_import）にのみ残す。
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
      {errorKey: "PERMISSION_DENIED"},
    );
  }
  if (device.role !== "admin") {
    throw new HttpsError(
      "permission-denied",
      "初期残高の設定には管理者権限が必要です",
      {errorKey: "PERMISSION_DENIED"},
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
    throw new HttpsError(
      "invalid-argument",
      "上書き確認が必要です",
      {errorKey: "CONFIRMATION_REQUIRED"},
    );
  }

  const balances = validateBalanceTriple(balancesRaw);
  const note = normalizeOptionalNote(noteRaw);
  const clientNonce = normalizeClientNonce(clientNonceRaw);

  const logContext: Record<string, unknown> = {targetUserId};
  const db = admin.firestore();
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

      const userData = userSnap.data()!;
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
          if (!balancesEqual(existing.balances, balances)) {
            throw new HttpsError(
              "aborted",
              "同一の再送キーで異なる残高が指定されています",
              {errorKey: "IDEMPOTENCY_CONFLICT"},
            );
          }
          return {
            reused: true as const,
            migrationId: existing.migrationId,
            initialBalanceSetAt: toIsoTimestamp(userData.initialBalanceSetAt),
          };
        }
      }

      const migrationId = migrationRef.id;
      const serverTs = admin.firestore.FieldValue.serverTimestamp();

      tx.update(userRef, {
        pointA: balances.pointA,
        pointB: balances.pointB,
        sideGameChip: balances.sideGameChip,
        initialBalanceSetAt: serverTs,
      });

      const logDoc: Record<string, unknown> = {
        migrationType: MIGRATION_TYPE_INITIAL_IMPORT,
        balances: {
          pointA: balances.pointA,
          pointB: balances.pointB,
          sideGameChip: balances.sideGameChip,
        },
        createdAt: serverTs,
      };
      if (note !== undefined) {
        logDoc.note = note;
      }
      tx.set(migrationRef, logDoc);

      if (idempotencyRef) {
        tx.set(idempotencyRef, {
          balances: {
            pointA: balances.pointA,
            pointB: balances.pointB,
            sideGameChip: balances.sideGameChip,
          },
          migrationId,
          createdAt: serverTs,
        });
      }

      return {
        reused: false as const,
        migrationId,
        initialBalanceSetAt: new Date().toISOString(),
      };
    });

    // serverTimestamp 確定後の表示用。reuse 時は tx 内の既存値を返す
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
      balances,
      initialBalanceSetAt,
      migrationId: result.migrationId,
      ...(result.reused ? {reused: true} : {}),
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logOpsError({
      message: "setInitialUserBalances エラー",
      functionEntry: "setInitialUserBalances",
      cause: error,
      context: logContext,
    });
    throw new HttpsError("internal", "初期残高の設定に失敗しました", {
      errorKey: "INTERNAL",
    });
  }
});
