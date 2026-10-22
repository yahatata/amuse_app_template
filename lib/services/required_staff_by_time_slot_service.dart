import 'business_styles_service.dart';
import 'required_staff_types.dart';

export 'required_staff_types.dart';

/// 必要人数設定の facade（正本: storeMeta/businessStyles / BusinessStylesService）
class RequiredStaffByTimeSlotService {
  static final RequiredStaffByTimeSlotService _instance =
      RequiredStaffByTimeSlotService._();
  static RequiredStaffByTimeSlotService get instance => _instance;

  RequiredStaffByTimeSlotService._();

  BusinessStylesService get _businessStyles => BusinessStylesService.instance;

  RequiredStaffDocStatus get docStatus => _businessStyles.requiredStaffDocStatus;

  RequiredStaffByTimeSlotV2Data? get latestV2 =>
      _businessStyles.latestRequiredStaffV2;

  Stream<RequiredStaffDocStatus> get statusStream =>
      _businessStyles.statusStream.map((_) => docStatus);

  RequiredStaffStyleResolution resolveForStyle({
    required String? styleId,
    required bool isClosed,
  }) {
    return _businessStyles.resolveRequiredStaffForStyle(
      styleId: styleId,
      isClosed: isClosed,
    );
  }

  void dispose() {
    // BusinessStylesService が購読を保持する
  }
}
