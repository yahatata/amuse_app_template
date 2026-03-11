/// storeMeta/requiredStaffByTimeSlot の購読サービス（config 閲覧サービスの一種）
///
/// snapshot で storeMeta/requiredStaffByTimeSlot を購読し、
/// 時間帯別必要人数の参照が必要な画面に提供する。
/// 未存在時はデフォルトにフォールバック。読み取り失敗時は最後の成功値を維持。
///
/// 参照: docs/運用時資料/設定/storeMeta/configによる設定の詳細/shift.md

import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import 'store_config_defaults.dart';

/// storeMeta/requiredStaffByTimeSlot の購読サービス（シングルトン）
class RequiredStaffByTimeSlotService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _subscription;
  final StreamController<List<Map<String, int>>> _streamController =
      StreamController<List<Map<String, int>>>.broadcast();

  List<Map<String, int>>? _latestData;

  static final RequiredStaffByTimeSlotService _instance =
      RequiredStaffByTimeSlotService._();
  static RequiredStaffByTimeSlotService get instance => _instance;

  RequiredStaffByTimeSlotService._() {
    _initializeListener();
  }

  void _logConfigFallback({
    required String configKey,
    required String reason,
    Object? fallbackValue,
  }) {
    debugPrint(
      '[CONFIG_FALLBACK] configKey=$configKey | reason=$reason | '
      'fallbackValue=$fallbackValue',
    );
  }

  void _logConfigReadError(String message) {
    debugPrint('[CONFIG_READ_ERROR] reason=read_error | message=$message');
  }

  static List<Map<String, int>> _parseData(dynamic v) {
    if (v is! List) return List<Map<String, int>>.from(kDefaultRequiredStaffByTimeSlot);
    final result = v
        .where((e) => e is Map && e['startHour'] != null && e['endHour'] != null)
        .map((e) => {
              'startHour': (e['startHour'] as num).toInt(),
              'endHour': (e['endHour'] as num).toInt(),
              'requiredCount': ((e['requiredCount'] as num?) ?? 0).toInt(),
            })
        .toList();
    // 空配列は「不足判定を行わない」としてそのまま返す
    if (v.isEmpty) return <Map<String, int>>[];
    return result.isNotEmpty ? result : List<Map<String, int>>.from(kDefaultRequiredStaffByTimeSlot);
  }

  void _initializeListener() {
    _subscription = _firestore
        .collection('storeMeta')
        .doc('requiredStaffByTimeSlot')
        .snapshots()
        .listen(
      (snapshot) {
        if (!snapshot.exists) {
          _logConfigFallback(
            configKey: 'requiredStaffByTimeSlot',
            reason: 'document_missing',
            fallbackValue: 'kDefaultRequiredStaffByTimeSlot',
          );
          final data = List<Map<String, int>>.from(kDefaultRequiredStaffByTimeSlot);
          _latestData = data;
          _streamController.add(data);
          return;
        }
        final raw = snapshot.data();
        final dataArr = raw?['data'];
        final data = _parseData(dataArr);
        _latestData = data;
        _streamController.add(data);
      },
      onError: (error) {
        _logConfigReadError(error.toString());
        if (_latestData != null) {
          _streamController.add(_latestData!);
        } else {
          _logConfigFallback(
            configKey: 'requiredStaffByTimeSlot',
            reason: 'read_error_no_cache',
            fallbackValue: 'kDefaultRequiredStaffByTimeSlot',
          );
          final data = List<Map<String, int>>.from(kDefaultRequiredStaffByTimeSlot);
          _latestData = data;
          _streamController.add(data);
        }
      },
    );
  }

  /// 現在の storeMeta/requiredStaffByTimeSlot の最新値
  List<Map<String, int>>? get latestData => _latestData;

  Stream<List<Map<String, int>>> get stream async* {
    if (_latestData != null) {
      yield _latestData!;
    }
    yield* _streamController.stream;
  }

  void dispose() {
    _subscription?.cancel();
    _streamController.close();
  }
}
