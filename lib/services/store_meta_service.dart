import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:async';

// ========== Step4 追加型（spec §2 / changeSpec §1） ==========

/// 直近のエラー要約（spec §2.1 lastError）
class LastErrorDoc {
  final String? code;
  final String? message;
  final String? failedStep;
  final dynamic at;
  final Map<String, dynamic>? context;

  LastErrorDoc({
    this.code,
    this.message,
    this.failedStep,
    this.at,
    this.context,
  });

  static LastErrorDoc? fromMap(Map<String, dynamic>? map) {
    if (map == null) return null;
    return LastErrorDoc(
      code: map['code'] as String?,
      message: map['message'] as String?,
      failedStep: map['failedStep'] as String?,
      at: map['at'],
      context: map['context'] != null
          ? Map<String, dynamic>.from(map['context'] as Map)
          : null,
    );
  }
}

/// Step3 の lease（spec §2.1 processing）
class ProcessingLeaseDoc {
  final String? runId;
  final Timestamp? startedAt;
  final Timestamp? leaseExpiresAt;
  final String? kind; // 'close' | 'open'

  ProcessingLeaseDoc({
    this.runId,
    this.startedAt,
    this.leaseExpiresAt,
    this.kind,
  });

  static ProcessingLeaseDoc? fromMap(Map<String, dynamic>? map) {
    if (map == null) return null;
    return ProcessingLeaseDoc(
      runId: map['runId'] as String?,
      startedAt: map['startedAt'] as Timestamp?,
      leaseExpiresAt: map['leaseExpiresAt'] as Timestamp?,
      kind: map['kind'] as String?,
    );
  }
}

/// 閉店認定結果（spec §2.2 closeAssessment）
class CloseAssessmentDoc {
  final String? result;
  final List<String> blockers;
  final String? intendedBusinessDateKey;
  final bool suppressedByOverride;
  final Timestamp? decidedAt;
  final String? scheduledAt;

  CloseAssessmentDoc({
    this.result,
    this.blockers = const [],
    this.intendedBusinessDateKey,
    this.suppressedByOverride = false,
    this.decidedAt,
    this.scheduledAt,
  });

  static CloseAssessmentDoc? fromMap(Map<String, dynamic>? map) {
    if (map == null) return null;
    final blockersRaw = map['blockers'];
    List<String> blockers = const [];
    if (blockersRaw is List) {
      blockers = blockersRaw.map((e) => e.toString()).toList();
    }
    return CloseAssessmentDoc(
      result: map['result'] as String?,
      blockers: blockers,
      intendedBusinessDateKey: map['intendedBusinessDateKey'] as String?,
      suppressedByOverride: map['suppressedByOverride'] == true,
      decidedAt: map['decidedAt'] as Timestamp?,
      scheduledAt: map['scheduledAt'] as String?,
    );
  }
}

/// 開店認定結果（spec §2.3 openAssessment）
class OpenAssessmentDoc {
  final String? result;
  final List<String> blockers;
  final String? intendedBusinessDateKey;
  final bool suppressedByOverride;
  final Timestamp? decidedAt;
  final String? scheduledAt;

  OpenAssessmentDoc({
    this.result,
    this.blockers = const [],
    this.intendedBusinessDateKey,
    this.suppressedByOverride = false,
    this.decidedAt,
    this.scheduledAt,
  });

  bool get hasBlockerAlreadyRunningDifferentDate =>
      blockers.contains('already_running_different_date');

  static OpenAssessmentDoc? fromMap(Map<String, dynamic>? map) {
    if (map == null) return null;
    final blockersRaw = map['blockers'];
    List<String> blockers = const [];
    if (blockersRaw is List) {
      blockers = blockersRaw.map((e) => e.toString()).toList();
    }
    return OpenAssessmentDoc(
      result: map['result'] as String?,
      blockers: blockers,
      intendedBusinessDateKey: map['intendedBusinessDateKey'] as String?,
      suppressedByOverride: map['suppressedByOverride'] == true,
      decidedAt: map['decidedAt'] as Timestamp?,
      scheduledAt: map['scheduledAt'] as String?,
    );
  }
}

/// 手動スキップ／営業継続（spec §2.4 manualOverride）
class ManualOverrideDoc {
  final String? type;
  final String? intendedBusinessDateKey;
  final Timestamp? overrideUntil;

  ManualOverrideDoc({
    this.type,
    this.intendedBusinessDateKey,
    this.overrideUntil,
  });

  static ManualOverrideDoc? fromMap(Map<String, dynamic>? map) {
    if (map == null) return null;
    return ManualOverrideDoc(
      type: map['type'] as String?,
      intendedBusinessDateKey: map['intendedBusinessDateKey'] as String?,
      overrideUntil: map['overrideUntil'] as Timestamp?,
    );
  }
}

/// close/open 用に分離した manualOverrides（close/open）
class ManualOverridesDoc {
  final ManualOverrideDoc? close;
  final ManualOverrideDoc? open;

  ManualOverridesDoc({this.close, this.open});

  static ManualOverridesDoc? fromMap(Map<String, dynamic>? map) {
    if (map == null) return null;
    return ManualOverridesDoc(
      close: ManualOverrideDoc.fromMap(
        map['close'] != null
            ? Map<String, dynamic>.from(map['close'] as Map)
            : null,
      ),
      open: ManualOverrideDoc.fromMap(
        map['open'] != null
            ? Map<String, dynamic>.from(map['open'] as Map)
            : null,
      ),
    );
  }
}

/// storeMeta/currentBusinessDay の1ドキュメント分のスナップショットを保持するデータクラス。
/// 参照: functions/src/helpers/stateDoc/types.ts (CurrentBusinessDayDoc)
/// Step4: closeAssessment / openAssessment / manualOverride / lastError / processing を追加（changeSpec §1）
class StoreMetaData {
  /// 営業状態: 'closed' | 'running' | 'error'
  final String? status;

  /// 現在の営業日キー: 'YYYY-MM-DD'形式、またはnull
  final String? currentBusinessDateKey;

  /// Step4: 直近で閉店した営業日
  final String? lastClosedBusinessDateKey;

  /// Step4: 直近のエラー要約
  final LastErrorDoc? lastError;

  /// Step4: Step3 の lease（閉店／開店処理実行中）
  final ProcessingLeaseDoc? processing;

  /// Step4: 閉店認定結果
  final CloseAssessmentDoc? closeAssessment;

  /// Step4: 開店認定結果
  final OpenAssessmentDoc? openAssessment;

  /// Step4: 手動スキップ／営業継続
  final ManualOverrideDoc? manualOverride;

  /// ToBe: close/open 分離 override
  final ManualOverridesDoc? manualOverrides;

  StoreMetaData({
    this.status,
    this.currentBusinessDateKey,
    this.lastClosedBusinessDateKey,
    this.lastError,
    this.processing,
    this.closeAssessment,
    this.openAssessment,
    this.manualOverride,
    this.manualOverrides,
  });

  factory StoreMetaData.fromDocument(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    if (!doc.exists) return StoreMetaData();
    final data = doc.data();
    if (data == null) return StoreMetaData();

    return StoreMetaData(
      status: data['status'] as String?,
      currentBusinessDateKey: data['currentBusinessDateKey'] as String?,
      lastClosedBusinessDateKey: data['lastClosedBusinessDateKey'] as String?,
      lastError: LastErrorDoc.fromMap(
        data['lastError'] != null
            ? Map<String, dynamic>.from(data['lastError'] as Map)
            : null,
      ),
      processing: ProcessingLeaseDoc.fromMap(
        data['processing'] != null
            ? Map<String, dynamic>.from(data['processing'] as Map)
            : null,
      ),
      closeAssessment: CloseAssessmentDoc.fromMap(
        data['closeAssessment'] != null
            ? Map<String, dynamic>.from(data['closeAssessment'] as Map)
            : null,
      ),
      openAssessment: OpenAssessmentDoc.fromMap(
        data['openAssessment'] != null
            ? Map<String, dynamic>.from(data['openAssessment'] as Map)
            : null,
      ),
      manualOverride: ManualOverrideDoc.fromMap(
        data['manualOverride'] != null
            ? Map<String, dynamic>.from(data['manualOverride'] as Map)
            : null,
      ),
      manualOverrides: ManualOverridesDoc.fromMap(
        data['manualOverrides'] != null
            ? Map<String, dynamic>.from(data['manualOverrides'] as Map)
            : null,
      ),
    );
  }

  bool get isRunning => status == 'running';
  bool get isClosed => status == 'closed';
  bool get isError => status == 'error';
  bool get isUnknownStatus =>
      status != 'running' && status != 'closed' && status != 'error';
}

/// storeMeta/currentBusinessDay をアプリ全体で1本だけの単一長寿命リスナーで購読するサービス（シングルトン）
class StoreMetaService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _subscription;
  final StreamController<StoreMetaData> _streamController =
      StreamController<StoreMetaData>.broadcast();

  StoreMetaData? _latestData;

  static final StoreMetaService _instance = StoreMetaService._();
  static StoreMetaService get instance => _instance;

  StoreMetaService._() {
    _initializeListener();
  }

  void _initializeListener() {
    _subscription = _firestore
        .collection('storeMeta')
        .doc('currentBusinessDay')
        .snapshots()
        .listen(
          (snapshot) {
            final data = StoreMetaData.fromDocument(snapshot);
            _latestData = data;
            _streamController.add(data);
          },
          onError: (error) {
            _streamController.addError(error);
          },
        );
  }

  /// 現在の storeMeta/currentBusinessDay の最新スナップショット（営業継続ダイアログ等で使用）
  StoreMetaData? get latestData => _latestData;

  Stream<StoreMetaData> get stream async* {
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
