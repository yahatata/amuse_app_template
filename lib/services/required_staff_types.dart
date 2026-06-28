/// 必要人数設定の共有型（Firestore 非依存）

enum RequiredStaffDocStatus {
  loading,
  ready,
  docMissing,
  invalidFormat,
  readError,
}

enum RequiredStaffStyleStatus {
  notApplicable,
  docNotReady,
  styleNotConfigured,
  disabledByEmptyList,
  active,
}

class RequiredStaffStyleResolution {
  final RequiredStaffStyleStatus status;
  final List<Map<String, int>> slots;

  const RequiredStaffStyleResolution({
    required this.status,
    this.slots = const [],
  });
}

class RequiredStaffByTimeSlotV2Data {
  final int version;
  final Map<String, List<Map<String, int>>> byStyle;

  const RequiredStaffByTimeSlotV2Data({
    required this.version,
    required this.byStyle,
  });
}
