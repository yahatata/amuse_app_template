/// storeMeta/requiredStaffByTimeSlot の購読サービス（v2 byStyle のみ）
///
/// doc 未存在・不正形式・読取失敗時は fallback しない。
/// 読取失敗時のキャッシュは不足判定に使わない。

import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../StaffDate/utils/required_staff_resolution.dart';

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

/// storeMeta/requiredStaffByTimeSlot の購読サービス（シングルトン）
class RequiredStaffByTimeSlotService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _subscription;
  final StreamController<RequiredStaffDocStatus> _statusController =
      StreamController<RequiredStaffDocStatus>.broadcast();

  RequiredStaffByTimeSlotV2Data? _latestV2;
  RequiredStaffDocStatus _docStatus = RequiredStaffDocStatus.loading;

  static final RequiredStaffByTimeSlotService _instance =
      RequiredStaffByTimeSlotService._();
  static RequiredStaffByTimeSlotService get instance => _instance;

  RequiredStaffByTimeSlotService._() {
    _initializeListener();
  }

  void _logConfigReadError(String message) {
    debugPrint('[CONFIG_READ_ERROR] reason=read_error | message=$message');
  }

  static List<Map<String, int>> _parseSlots(dynamic raw) {
    if (raw is! List) return [];
    return raw
        .where(
          (e) =>
              e is Map &&
              e['startHour'] != null &&
              e['endHour'] != null &&
              e['requiredCount'] != null,
        )
        .map(
          (e) => {
            'startHour': (e['startHour'] as num).toInt(),
            'endHour': (e['endHour'] as num).toInt(),
            'requiredCount': (e['requiredCount'] as num).toInt(),
          },
        )
        .toList();
  }

  static RequiredStaffByTimeSlotV2Data? _parseV2(Map<String, dynamic>? raw) {
    if (raw == null) return null;
    if (raw['version'] != 2) return null;
    final byStyleRaw = raw['byStyle'];
    if (byStyleRaw is! Map) return null;

    final byStyle = <String, List<Map<String, int>>>{};
    for (final entry in byStyleRaw.entries) {
      byStyle[entry.key] = _parseSlots(entry.value);
    }
    return RequiredStaffByTimeSlotV2Data(version: 2, byStyle: byStyle);
  }

  void _emitStatus(RequiredStaffDocStatus status) {
    _docStatus = status;
    _statusController.add(status);
  }

  void _initializeListener() {
    _subscription = _firestore
        .collection('storeMeta')
        .doc('requiredStaffByTimeSlot')
        .snapshots()
        .listen(
      (snapshot) {
        if (!snapshot.exists) {
          _latestV2 = null;
          _emitStatus(RequiredStaffDocStatus.docMissing);
          return;
        }

        final parsed = _parseV2(snapshot.data());
        if (parsed == null) {
          _latestV2 = null;
          _emitStatus(RequiredStaffDocStatus.invalidFormat);
          return;
        }

        _latestV2 = parsed;
        _emitStatus(RequiredStaffDocStatus.ready);
      },
      onError: (error) {
        _logConfigReadError(error.toString());
        _latestV2 = null;
        _emitStatus(RequiredStaffDocStatus.readError);
      },
    );
  }

  RequiredStaffDocStatus get docStatus => _docStatus;

  RequiredStaffByTimeSlotV2Data? get latestV2 => _latestV2;

  Stream<RequiredStaffDocStatus> get statusStream => _statusController.stream;

  RequiredStaffStyleResolution resolveForStyle({
    required String? styleId,
    required bool isClosed,
  }) {
    return resolveRequiredStaffForStyle(
      docStatus: _docStatus,
      v2: _latestV2,
      styleId: styleId,
      isClosed: isClosed,
    );
  }

  void dispose() {
    _subscription?.cancel();
    _statusController.close();
  }
}
