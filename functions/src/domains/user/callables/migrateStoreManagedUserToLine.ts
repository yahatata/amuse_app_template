import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getCallerDeviceByUid, isActive } from "../../../shared/devices";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { assertUserFreeForMigration } from "../helpers/assertUserFreeForMigration";
import {
  balancesEqual,
  type BalanceTriple,
} from "../helpers/validateBalanceTriple";
import {
  isUserType,
  MIGRATION_TYPE_STORE_MANAGED_TO_LINE,
  USER_TYPE_LINE,
  USER_TYPE_STORE_MANAGED,
} from "../types/userType";

const NOTE_MAX_LENGTH = 200;

type MigrateIdempotencyDoc = {
  sourceUserId: string;
  targetUserId: string;
  migrationId: string;
  balances: BalanceTriple;
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

function requireNonEmptyId(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${field} が必要です`, {
      errorKey: "INVALID_ARGUMENT",
      field,
    });
  }
  return value.trim();
}

function toIsoTimestamp(value: unknown): string {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  return new Date().toISOString();
}

function readBalanceTriple(data: FirebaseFirestore.DocumentData): BalanceTriple {
  const pointA = data.pointA;
  const pointB = data.pointB;
  const sideGameChip = data.sideGameChip;
  if (
    typeof pointA !== "number" ||
    typeof pointB !== "number" ||
    typeof sideGameChip !== "number" ||
    !Number.isInteger(pointA) ||
    !Number.isInteger(pointB) ||
    !Number.isInteger(sideGameChip) ||
    pointA < 0 ||
    pointB < 0 ||
    sideGameChip < 0
  ) {
    throw new HttpsError(
      "failed-precondition",
      "移行元の残高が不正です",
      {errorKey: "INVALID_BALANCE"},
    );
  }
  return {pointA, pointB, sideGameChip};
}

/**
 * 店舗管理ユーザーの残高を LINE ユーザーへ上書き移行する。
 */
export const migrateStoreManagedUserToLine = onCall(async (request) => {
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
      "後日LINE化には管理者権限が必要です",
      {errorKey: "PERMISSION_DENIED"},
    );
  }

  const {
    sourceUserId: sourceUserIdRaw,
    targetUserId: targetUserIdRaw,
    note: noteRaw,
    clientNonce: clientNonceRaw,
    confirmSamePerson,
    confirmOverwrite,
  } = request.data as {
    sourceUserId?: unknown;
    targetUserId?: unknown;
    note?: unknown;
    clientNonce?: unknown;
    confirmSamePerson?: unknown;
    confirmOverwrite?: unknown;
  };

  const sourceUserId = requireNonEmptyId(sourceUserIdRaw, "sourceUserId");
  const targetUserId = requireNonEmptyId(targetUserIdRaw, "targetUserId");

  if (sourceUserId === targetUserId) {
    throw new HttpsError(
      "invalid-argument",
      "移行元と移行先は異なるユーザーである必要があります",
      {errorKey: "INVALID_ARGUMENT"},
    );
  }

  if (confirmSamePerson !== true) {
    throw new HttpsError(
      "invalid-argument",
      "同一人物確認が必要です",
      {errorKey: "CONFIRMATION_REQUIRED"},
    );
  }
  if (confirmOverwrite !== true) {
    throw new HttpsError(
      "invalid-argument",
      "上書き確認が必要です",
      {errorKey: "CONFIRMATION_REQUIRED"},
    );
  }

  const note = normalizeOptionalNote(noteRaw);
  const clientNonce = normalizeClientNonce(clientNonceRaw);
  const logContext: Record<string, unknown> = {sourceUserId, targetUserId};
  const db = admin.firestore();
  const sourceRef = db.collection("users").doc(sourceUserId);
  const targetRef = db.collection("users").doc(targetUserId);

  try {
    // 同一 source→target 済みは進行中検査より先に reused（再送時の誤拒否を防ぐ）
    const sourcePreSnap = await sourceRef.get();
    if (sourcePreSnap.exists) {
      const sourcePre = sourcePreSnap.data()!;
      if (
        sourcePre.isMigrated === true &&
        sourcePre.migratedToUserId === targetUserId
      ) {
        const targetPreSnap = await targetRef.get();
        const targetPre = targetPreSnap.exists ? targetPreSnap.data()! : {};
        let migrationId = "reused";
        const existingLog = await targetRef
          .collection("balanceMigrationLogs")
          .where("migrationType", "==", MIGRATION_TYPE_STORE_MANAGED_TO_LINE)
          .where("sourceUserId", "==", sourceUserId)
          .limit(1)
          .get();
        if (!existingLog.empty) {
          migrationId = existingLog.docs[0].id;
        }
        const balances = {
          pointA: typeof targetPre.pointA === "number" ? targetPre.pointA : 0,
          pointB: typeof targetPre.pointB === "number" ? targetPre.pointB : 0,
          sideGameChip:
            typeof targetPre.sideGameChip === "number" ? targetPre.sideGameChip : 0,
        };
        logOpsSuccess({
          message: "migrateStoreManagedUserToLine 成功（reused）",
          functionEntry: "migrateStoreManagedUserToLine",
          context: {sourceUserId, targetUserId, migrationId, reused: true},
        });
        return {
          success: true,
          sourceUserId,
          targetUserId,
          balances,
          migrationId,
          migratedAt: toIsoTimestamp(sourcePre.migratedAt),
          reused: true,
        };
      }
    }

    // tx 前のフル進行中業務検査（双方）
    await assertUserFreeForMigration(sourceUserId, {db});
    await assertUserFreeForMigration(targetUserId, {db});

    const migrationRef = targetRef.collection("balanceMigrationLogs").doc();
    const idempotencyRef = clientNonce
      ? targetRef.collection("balanceMigrationIdempotency").doc(clientNonce)
      : null;

    const result = await db.runTransaction(async (tx) => {
      const sourceSnap = await tx.get(sourceRef);
      const targetSnap = await tx.get(targetRef);
      const sourceStaySnap = await tx.get(db.collection("activeStays").doc(sourceUserId));
      const targetStaySnap = await tx.get(db.collection("activeStays").doc(targetUserId));

      if (!sourceSnap.exists) {
        throw new HttpsError("not-found", "移行元ユーザーが見つかりません", {
          errorKey: "SOURCE_USER_NOT_FOUND",
        });
      }
      if (!targetSnap.exists) {
        throw new HttpsError("not-found", "移行先ユーザーが見つかりません", {
          errorKey: "TARGET_USER_NOT_FOUND",
        });
      }

      const sourceData = sourceSnap.data()!;
      const targetData = targetSnap.data()!;

      if (!isUserType(sourceData.userType)) {
        throw new HttpsError(
          "failed-precondition",
          "移行元のユーザー種別が不正、または未設定です",
          {errorKey: "INVALID_USER_TYPE"},
        );
      }
      if (sourceData.userType !== USER_TYPE_STORE_MANAGED) {
        throw new HttpsError(
          "failed-precondition",
          "移行元は店舗管理ユーザーである必要があります",
          {errorKey: "SOURCE_USER_NOT_STORE_MANAGED"},
        );
      }
      if (typeof sourceData.isMigrated !== "boolean") {
        throw new HttpsError(
          "failed-precondition",
          "移行元のユーザー種別が不正、または未設定です",
          {errorKey: "INVALID_USER_TYPE"},
        );
      }

      if (!isUserType(targetData.userType)) {
        throw new HttpsError(
          "failed-precondition",
          "移行先のユーザー種別が不正、または未設定です",
          {errorKey: "INVALID_USER_TYPE"},
        );
      }
      if (targetData.userType !== USER_TYPE_LINE) {
        throw new HttpsError(
          "failed-precondition",
          "移行先はLINEユーザーである必要があります",
          {errorKey: "TARGET_USER_NOT_LINE"},
        );
      }

      // 冪等: 同一 source → 同一 target
      if (sourceData.isMigrated === true) {
        if (sourceData.migratedToUserId === targetUserId) {
          const balances = {
            pointA: typeof targetData.pointA === "number" ? targetData.pointA : 0,
            pointB: typeof targetData.pointB === "number" ? targetData.pointB : 0,
            sideGameChip:
              typeof targetData.sideGameChip === "number" ? targetData.sideGameChip : 0,
          };
          return {
            reused: true as const,
            migrationId: "reused",
            balances,
            migratedAt: toIsoTimestamp(sourceData.migratedAt),
          };
        }
        throw new HttpsError(
          "failed-precondition",
          "この店舗管理ユーザーは既に別のLINEユーザーへ移行済みです",
          {errorKey: "USER_ALREADY_MIGRATED"},
        );
      }

      if (idempotencyRef) {
        const idemSnap = await tx.get(idempotencyRef);
        if (idemSnap.exists) {
          const existing = idemSnap.data() as MigrateIdempotencyDoc;
          const samePayload =
            existing?.sourceUserId === sourceUserId &&
            existing?.targetUserId === targetUserId &&
            existing?.balances &&
            balancesEqual(existing.balances, readBalanceTriple(sourceData));
          if (samePayload) {
            return {
              reused: true as const,
              migrationId: existing.migrationId,
              balances: existing.balances,
              migratedAt: toIsoTimestamp(sourceData.migratedAt),
            };
          }
          throw new HttpsError(
            "aborted",
            "同一の再送キーで異なる移行内容が指定されています",
            {errorKey: "IDEMPOTENCY_CONFLICT"},
          );
        }
      }

      // tx 内再検査（レース抑止）
      await assertUserFreeForMigration(sourceUserId, {
        db,
        includeRemoteScans: false,
        userSnapshot: sourceData,
        activeStaySnapshot: sourceStaySnap,
      });
      await assertUserFreeForMigration(targetUserId, {
        db,
        includeRemoteScans: false,
        userSnapshot: targetData,
        activeStaySnapshot: targetStaySnap,
      });

      const balances = readBalanceTriple(sourceData);
      const migrationId = migrationRef.id;
      const serverTs = admin.firestore.FieldValue.serverTimestamp();

      tx.update(targetRef, {
        pointA: balances.pointA,
        pointB: balances.pointB,
        sideGameChip: balances.sideGameChip,
      });

      const logDoc: Record<string, unknown> = {
        migrationType: MIGRATION_TYPE_STORE_MANAGED_TO_LINE,
        sourceUserId,
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

      tx.update(sourceRef, {
        isMigrated: true,
        migratedToUserId: targetUserId,
        migratedAt: serverTs,
      });

      if (idempotencyRef) {
        tx.set(idempotencyRef, {
          sourceUserId,
          targetUserId,
          migrationId,
          balances: {
            pointA: balances.pointA,
            pointB: balances.pointB,
            sideGameChip: balances.sideGameChip,
          },
          createdAt: serverTs,
        });
      }

      return {
        reused: false as const,
        migrationId,
        balances,
        migratedAt: new Date().toISOString(),
      };
    });

    let migratedAt = result.migratedAt;
    let migrationId = result.migrationId;
    if (!result.reused) {
      const sourceAfter = await sourceRef.get();
      migratedAt = toIsoTimestamp(sourceAfter.data()?.migratedAt);
    } else if (migrationId === "reused") {
      // 同一移行済みの最小復元: 既存ログがあればその ID を返す
      const existingLog = await targetRef
        .collection("balanceMigrationLogs")
        .where("migrationType", "==", MIGRATION_TYPE_STORE_MANAGED_TO_LINE)
        .where("sourceUserId", "==", sourceUserId)
        .limit(1)
        .get();
      if (!existingLog.empty) {
        migrationId = existingLog.docs[0].id;
      }
    }

    logContext.migrationId = migrationId;
    logOpsSuccess({
      message: "migrateStoreManagedUserToLine 成功",
      functionEntry: "migrateStoreManagedUserToLine",
      context: {
        sourceUserId,
        targetUserId,
        migrationId,
        reused: result.reused,
      },
    });

    return {
      success: true,
      sourceUserId,
      targetUserId,
      balances: result.balances,
      migrationId,
      migratedAt,
      ...(result.reused ? {reused: true} : {}),
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logOpsError({
      message: "migrateStoreManagedUserToLine エラー",
      functionEntry: "migrateStoreManagedUserToLine",
      cause: error,
      context: logContext,
    });
    throw new HttpsError("internal", "後日LINE化に失敗しました", {
      errorKey: "INTERNAL",
    });
  }
});
