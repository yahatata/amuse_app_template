import 'package:amuse_app_template/services/required_staff_by_time_slot_service.dart';

/// styleId と v2 設定から必要人数スロットを解決（Firestore 非依存）
RequiredStaffStyleResolution resolveRequiredStaffForStyle({
  required RequiredStaffDocStatus docStatus,
  required RequiredStaffByTimeSlotV2Data? v2,
  required String? styleId,
  required bool isClosed,
}) {
  if (isClosed || styleId == 'closed') {
    return const RequiredStaffStyleResolution(
      status: RequiredStaffStyleStatus.notApplicable,
    );
  }

  if (docStatus == RequiredStaffDocStatus.loading) {
    return const RequiredStaffStyleResolution(
      status: RequiredStaffStyleStatus.docNotReady,
    );
  }

  if (docStatus == RequiredStaffDocStatus.docMissing ||
      docStatus == RequiredStaffDocStatus.invalidFormat ||
      docStatus == RequiredStaffDocStatus.readError) {
    return const RequiredStaffStyleResolution(
      status: RequiredStaffStyleStatus.docNotReady,
    );
  }

  if (styleId == null || styleId.isEmpty) {
    return const RequiredStaffStyleResolution(
      status: RequiredStaffStyleStatus.styleNotConfigured,
    );
  }

  final byStyle = v2?.byStyle;
  if (byStyle == null || !byStyle.containsKey(styleId)) {
    return const RequiredStaffStyleResolution(
      status: RequiredStaffStyleStatus.styleNotConfigured,
    );
  }

  final slots = byStyle[styleId] ?? [];
  if (slots.isEmpty) {
    return const RequiredStaffStyleResolution(
      status: RequiredStaffStyleStatus.disabledByEmptyList,
    );
  }

  return RequiredStaffStyleResolution(
    status: RequiredStaffStyleStatus.active,
    slots: slots,
  );
}
