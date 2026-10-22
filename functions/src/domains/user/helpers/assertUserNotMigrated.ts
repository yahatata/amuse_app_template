import { HttpsError } from "firebase-functions/v2/https";
import {
  isUserType,
  USER_TYPE_STORE_MANAGED,
} from "../types/userType";

/**
 * A-6 対象操作向け: userType と isMigrated を検証する。
 * - userType 欠落・不正 → INVALID_USER_TYPE
 * - store_managed かつ isMigrated 欠落 → INVALID_USER_TYPE
 * - store_managed かつ isMigrated === true → USER_MIGRATED
 */
export function assertUserNotMigrated(userData: FirebaseFirestore.DocumentData): void {
  if (!isUserType(userData.userType)) {
    throw new HttpsError(
      "failed-precondition",
      "ユーザー種別が不正、または未設定です",
      {errorKey: "INVALID_USER_TYPE"},
    );
  }

  if (userData.userType === USER_TYPE_STORE_MANAGED) {
    if (typeof userData.isMigrated !== "boolean") {
      throw new HttpsError(
        "failed-precondition",
        "ユーザー種別が不正、または未設定です",
        {errorKey: "INVALID_USER_TYPE"},
      );
    }
    if (userData.isMigrated === true) {
      throw new HttpsError(
        "failed-precondition",
        "移行済みユーザーは操作できません",
        {errorKey: "USER_MIGRATED"},
      );
    }
  }
}
