// このファイルは削除予定です。動作確認後に削除してください。
// 削除理由: Runtime Debug機能/未使用/機能重複のため不要と判断されました。

/*
import 'package:cloud_firestore/cloud_firestore.dart';

/// トーナメントの時間管理状態を表すモデル
/// scheduledTournament/{tid}/views/runtime ドキュメントに対応
class RuntimeMain {
  final String status;
  final Timestamp? startedAt;
  final Timestamp? pausedAt;
  final int shiftSec;
  final Timestamp? regClosedAt;
  final Timestamp? plannedStartAt;
  final Timestamp? plannedRegistAt;
  final Timestamp? registAt;
  final List<Map<String, dynamic>> stages;
  final int lateRegUntilLev;
  final int breakDurationSec;
  final int startRev;
  final int registRev;
  final Timestamp updatedAt;

  const RuntimeMain({
    required this.status,
    this.startedAt,
    this.pausedAt,
    required this.shiftSec,
    this.regClosedAt,
    this.plannedStartAt,
    this.plannedRegistAt,
    this.registAt,
    required this.stages,
    required this.lateRegUntilLev,
    required this.breakDurationSec,
    required this.startRev,
    required this.registRev,
    required this.updatedAt,
  });

  /// FirestoreドキュメントからRuntimeMainを作成
  factory RuntimeMain.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    
    return RuntimeMain(
      status: data['status'] as String? ?? 'scheduled',
      startedAt: data['startedAt'] as Timestamp?,
      pausedAt: data['pausedAt'] as Timestamp?,
      shiftSec: data['shiftSec'] as int? ?? 0,
      regClosedAt: data['regClosedAt'] as Timestamp?,
      plannedStartAt: data['plannedStartAt'] as Timestamp?,
      plannedRegistAt: data['plannedRegistAt'] as Timestamp?,
      registAt: data['registAt'] as Timestamp?,
      stages: (data['stages'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ?? [],
      lateRegUntilLev: data['lateRegUntilLev'] as int? ?? 0,
      breakDurationSec: data['breakDurationSec'] as int? ?? 0,
      startRev: data['startRev'] as int? ?? 1,
      registRev: data['registRev'] as int? ?? 1,
      updatedAt: data['updatedAt'] as Timestamp? ?? Timestamp.now(),
    );
  }

  /// Firestoreに保存するためのMapに変換
  Map<String, dynamic> toFirestore() {
    return {
      'status': status,
      'startedAt': startedAt,
      'pausedAt': pausedAt,
      'shiftSec': shiftSec,
      'regClosedAt': regClosedAt,
      'plannedStartAt': plannedStartAt,
      'plannedRegistAt': plannedRegistAt,
      'registAt': registAt,
      'stages': stages,
      'lateRegUntilLev': lateRegUntilLev,
      'breakDurationSec': breakDurationSec,
      'startRev': startRev,
      'registRev': registRev,
      'updatedAt': updatedAt,
    };
  }

  /// デバッグ用のJSON風表示
  Map<String, dynamic> toDebugMap() {
    return {
      'status': status,
      'startedAt': startedAt?.toDate().toIso8601String(),
      'pausedAt': pausedAt?.toDate().toIso8601String(),
      'shiftSec': shiftSec,
      'regClosedAt': regClosedAt?.toDate().toIso8601String(),
      'plannedStartAt': plannedStartAt?.toDate().toIso8601String(),
      'plannedRegistAt': plannedRegistAt?.toDate().toIso8601String(),
      'registAt': registAt?.toDate().toIso8601String(),
      'stages': stages,
      'lateRegUntilLev': lateRegUntilLev,
      'breakDurationSec': breakDurationSec,
      'startRev': startRev,
      'registRev': registRev,
      'updatedAt': updatedAt.toDate().toIso8601String(),
    };
  }

  /// 初期値でRuntimeMainを作成（新規作成時用）
  factory RuntimeMain.initial() {
    final now = Timestamp.now();
    return RuntimeMain(
      status: 'scheduled',
      startedAt: null,
      pausedAt: null,
      shiftSec: 0,
      regClosedAt: null,
      plannedStartAt: null,
      plannedRegistAt: null,
      registAt: null,
      stages: [],
      lateRegUntilLev: 0,
      breakDurationSec: 0,
      startRev: 1,
      registRev: 1,
      updatedAt: now,
    );
  }

  /// コピーして一部のフィールドを更新
  RuntimeMain copyWith({
    String? status,
    Timestamp? startedAt,
    Timestamp? pausedAt,
    int? shiftSec,
    Timestamp? regClosedAt,
    Timestamp? plannedStartAt,
    Timestamp? plannedRegistAt,
    Timestamp? registAt,
    List<Map<String, dynamic>>? stages,
    int? lateRegUntilLev,
    int? breakDurationSec,
    int? startRev,
    int? registRev,
    Timestamp? updatedAt,
  }) {
    return RuntimeMain(
      status: status ?? this.status,
      startedAt: startedAt ?? this.startedAt,
      pausedAt: pausedAt ?? this.pausedAt,
      shiftSec: shiftSec ?? this.shiftSec,
      regClosedAt: regClosedAt ?? this.regClosedAt,
      plannedStartAt: plannedStartAt ?? this.plannedStartAt,
      plannedRegistAt: plannedRegistAt ?? this.plannedRegistAt,
      registAt: registAt ?? this.registAt,
      stages: stages ?? this.stages,
      lateRegUntilLev: lateRegUntilLev ?? this.lateRegUntilLev,
      breakDurationSec: breakDurationSec ?? this.breakDurationSec,
      startRev: startRev ?? this.startRev,
      registRev: registRev ?? this.registRev,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  String toString() {
    return 'RuntimeMain(status: $status, startedAt: $startedAt, pausedAt: $pausedAt, shiftSec: $shiftSec, regClosedAt: $regClosedAt, plannedStartAt: $plannedStartAt, plannedRegistAt: $plannedRegistAt, registAt: $registAt, stages: $stages, lateRegUntilLev: $lateRegUntilLev, breakDurationSec: $breakDurationSec, startRev: $startRev, registRev: $registRev, updatedAt: $updatedAt)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is RuntimeMain &&
        other.status == status &&
        other.startedAt == startedAt &&
        other.pausedAt == pausedAt &&
        other.shiftSec == shiftSec &&
        other.regClosedAt == regClosedAt &&
        other.plannedStartAt == plannedStartAt &&
        other.plannedRegistAt == plannedRegistAt &&
        other.registAt == registAt &&
        other.stages == stages &&
        other.lateRegUntilLev == lateRegUntilLev &&
        other.breakDurationSec == breakDurationSec &&
        other.startRev == startRev &&
        other.registRev == registRev &&
        other.updatedAt == updatedAt;
  }

  @override
  int get hashCode {
    return Object.hash(
      status,
      startedAt,
      pausedAt,
      shiftSec,
      regClosedAt,
      plannedStartAt,
      plannedRegistAt,
      registAt,
      stages,
      lateRegUntilLev,
      breakDurationSec,
      startRev,
      registRev,
      updatedAt,
    );
  }
}
*/
