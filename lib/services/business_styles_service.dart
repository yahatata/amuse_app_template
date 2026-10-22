/// storeMeta/businessStyles の購読サービス（Phase 2 正本）
///
/// 営業時間スタイル + 必要人数を storeMeta/businessStyles から購読する。
/// doc 未存在・不正形式・読取失敗時は fallback しない。

import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../StaffDate/utils/business_hours_style_labels.dart';
import '../StaffDate/utils/required_staff_resolution.dart' as required_staff_resolution;
import 'required_staff_types.dart';

enum BusinessStylesDocStatus {
  loading,
  ready,
  docMissing,
  invalidFormat,
  readError,
}

class BusinessStyleData {
  final String styleId;
  final int openMinute;
  final int closeMinute;
  final bool isClosed;
  final List<Map<String, int>> requiredStaffByTimeSlot;

  const BusinessStyleData({
    required this.styleId,
    required this.openMinute,
    required this.closeMinute,
    required this.isClosed,
    this.requiredStaffByTimeSlot = const [],
  });
}

class BusinessStylesData {
  final int version;
  final Map<String, BusinessStyleData> styles;

  const BusinessStylesData({
    required this.version,
    required this.styles,
  });

  Map<String, Map<String, dynamic>> get businessHoursStyles {
    return styles.map(
      (key, style) => MapEntry(key, {
        'styleId': style.styleId,
        'openMinute': style.openMinute,
        'closeMinute': style.closeMinute,
        'isClosed': style.isClosed,
      }),
    );
  }

  Map<String, List<Map<String, int>>> get requiredStaffByStyle {
    return styles.map(
      (key, style) => MapEntry(
        key,
        style.requiredStaffByTimeSlot
            .map((e) => Map<String, int>.from(e))
            .toList(),
      ),
    );
  }

  RequiredStaffByTimeSlotV2Data toRequiredStaffV2() {
    return RequiredStaffByTimeSlotV2Data(
      version: version,
      byStyle: requiredStaffByStyle,
    );
  }
}

/// storeMeta/businessStyles の購読サービス（シングルトン）
class BusinessStylesService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _subscription;
  final StreamController<BusinessStylesDocStatus> _statusController =
      StreamController<BusinessStylesDocStatus>.broadcast();

  BusinessStylesData? _latest;
  BusinessStylesDocStatus _docStatus = BusinessStylesDocStatus.loading;

  static final BusinessStylesService _instance = BusinessStylesService._();
  static BusinessStylesService get instance => _instance;

  BusinessStylesService._() {
    _initializeListener();
  }

  void _logConfigReadError(String message) {
    debugPrint('[CONFIG_READ_ERROR] configDoc=storeMeta/businessStyles | reason=read_error | message=$message');
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

  static BusinessStylesData? _parseV2(Map<String, dynamic>? raw) {
    if (raw == null) return null;
    if (raw['version'] != 2) return null;
    final stylesRaw = raw['styles'];
    if (stylesRaw is! Map) return null;

    final styles = <String, BusinessStyleData>{};
    for (final styleId in kBusinessHoursStyleIds) {
      final styleRaw = stylesRaw[styleId];
      if (styleRaw is! Map) return null;

      final openMinute = styleRaw['openMinute'];
      final closeMinute = styleRaw['closeMinute'];
      final isClosed = styleRaw['isClosed'];
      if (openMinute is! num || closeMinute is! num || isClosed is! bool) {
        return null;
      }

      final slots = _parseSlots(styleRaw['requiredStaffByTimeSlot']);
      if (styleId == 'closed' && slots.isNotEmpty) {
        return null;
      }

      styles[styleId] = BusinessStyleData(
        styleId: styleId,
        openMinute: openMinute.toInt(),
        closeMinute: closeMinute.toInt(),
        isClosed: isClosed,
        requiredStaffByTimeSlot: styleId == 'closed' ? const [] : slots,
      );
    }

    if (styles.length != kBusinessHoursStyleIds.length) {
      return null;
    }

    return BusinessStylesData(version: 2, styles: styles);
  }

  void _emitStatus(BusinessStylesDocStatus status) {
    _docStatus = status;
    _statusController.add(status);
  }

  RequiredStaffDocStatus _toRequiredStaffDocStatus() {
    switch (_docStatus) {
      case BusinessStylesDocStatus.loading:
        return RequiredStaffDocStatus.loading;
      case BusinessStylesDocStatus.ready:
        return RequiredStaffDocStatus.ready;
      case BusinessStylesDocStatus.docMissing:
        return RequiredStaffDocStatus.docMissing;
      case BusinessStylesDocStatus.invalidFormat:
        return RequiredStaffDocStatus.invalidFormat;
      case BusinessStylesDocStatus.readError:
        return RequiredStaffDocStatus.readError;
    }
  }

  void _initializeListener() {
    _subscription = _firestore
        .collection('storeMeta')
        .doc('businessStyles')
        .snapshots()
        .listen(
      (snapshot) {
        if (!snapshot.exists) {
          _latest = null;
          _emitStatus(BusinessStylesDocStatus.docMissing);
          return;
        }

        final parsed = _parseV2(snapshot.data());
        if (parsed == null) {
          _latest = null;
          _emitStatus(BusinessStylesDocStatus.invalidFormat);
          return;
        }

        _latest = parsed;
        _emitStatus(BusinessStylesDocStatus.ready);
      },
      onError: (error) {
        _logConfigReadError(error.toString());
        _latest = null;
        _emitStatus(BusinessStylesDocStatus.readError);
      },
    );
  }

  BusinessStylesDocStatus get docStatus => _docStatus;

  BusinessStylesData? get latest => _latest;

  Stream<BusinessStylesDocStatus> get statusStream => _statusController.stream;

  Map<String, Map<String, dynamic>> get businessHoursStyles {
    return _latest?.businessHoursStyles ?? const {};
  }

  RequiredStaffByTimeSlotV2Data? get latestRequiredStaffV2 =>
      _latest?.toRequiredStaffV2();

  RequiredStaffDocStatus get requiredStaffDocStatus => _toRequiredStaffDocStatus();

  RequiredStaffStyleResolution resolveRequiredStaffForStyle({
    required String? styleId,
    required bool isClosed,
  }) {
    return required_staff_resolution.resolveRequiredStaffForStyle(
      docStatus: requiredStaffDocStatus,
      v2: latestRequiredStaffV2,
      styleId: styleId,
      isClosed: isClosed,
    );
  }

  void dispose() {
    _subscription?.cancel();
    _statusController.close();
  }
}
