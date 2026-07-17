/**
 * ユーザー登録経路による種別（A-6）。
 * - line: LIFF / LINE 連携ユーザー
 * - store_managed: 店舗端末で作成したユーザー
 */
export const USER_TYPE_LINE = "line" as const;
export const USER_TYPE_STORE_MANAGED = "store_managed" as const;

export type UserType = typeof USER_TYPE_LINE | typeof USER_TYPE_STORE_MANAGED;

export const USER_TYPES: readonly UserType[] = [
  USER_TYPE_LINE,
  USER_TYPE_STORE_MANAGED,
];

export function isUserType(value: unknown): value is UserType {
  return value === USER_TYPE_LINE || value === USER_TYPE_STORE_MANAGED;
}

/** balanceMigrationLogs.migrationType */
export const MIGRATION_TYPE_INITIAL_IMPORT = "initial_import" as const;
export const MIGRATION_TYPE_STORE_MANAGED_TO_LINE = "store_managed_to_line" as const;

export type BalanceMigrationType =
  | typeof MIGRATION_TYPE_INITIAL_IMPORT
  | typeof MIGRATION_TYPE_STORE_MANAGED_TO_LINE;
