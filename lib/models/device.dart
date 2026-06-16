import 'package:cloud_firestore/cloud_firestore.dart';

/// デバイス情報を表すモデル
class Device {
  final String id;
  final String name;
  final String role;
  final String uid;
  final String installationId;
  final String platform;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String status;
  final Map<String, bool> options;
  final Map<String, Map<String, dynamic>> optionParams;

  const Device({
    required this.id,
    required this.name,
    required this.role,
    required this.uid,
    required this.installationId,
    required this.platform,
    required this.createdAt,
    required this.updatedAt,
    required this.status,
    this.options = const {},
    this.optionParams = const {},
  });

  /// Firestore ドキュメントから Device オブジェクトを作成
  factory Device.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    final rawOptions = (data['options'] as Map<String, dynamic>?) ?? {};
    final mappedOptions = <String, bool>{};
    rawOptions.forEach((key, value) {
      if (value is bool) {
        mappedOptions[key] = value;
      } else if (value is num) {
        // 0/1 などを受けた場合に防御的にboolへ
        mappedOptions[key] = value != 0;
      } else if (value is String) {
        // "true"/"false" を防御的にboolへ
        mappedOptions[key] = (value.toLowerCase() == 'true');
      }
    });

    // optionParams の読み込み
    final rawOptionParams = (data['optionParams'] as Map<String, dynamic>?) ?? {};
    final mappedOptionParams = <String, Map<String, dynamic>>{};
    rawOptionParams.forEach((key, value) {
      if (value is Map<String, dynamic>) {
        mappedOptionParams[key] = value;
      } else if (value is Map) {
        mappedOptionParams[key] = Map<String, dynamic>.from(value);
      }
    });

    return Device(
      id: doc.id,
      name: data['name'] ?? '',
      role: data['role'] ?? 'terminal',
      uid: data['uid'] ?? '',
      installationId: data['installationId'] ?? '',
      platform: data['platform'] ?? '',
      createdAt: (data['createdAt'] as Timestamp).toDate(),
      updatedAt: (data['updatedAt'] as Timestamp).toDate(),
      status: data['status'] ?? 'active',
      options: mappedOptions,
      optionParams: mappedOptionParams,
    );
  }

  /// Device オブジェクトを Firestore 用の Map に変換
  Map<String, dynamic> toFirestore() {
    return {
      'name': name,
      'role': role,
      'uid': uid,
      'installationId': installationId,
      'platform': platform,
      'createdAt': Timestamp.fromDate(createdAt),
      'updatedAt': Timestamp.fromDate(updatedAt),
      'status': status,
      'options': options,
      'optionParams': optionParams,
    };
  }

  /// 指定オプションに紐づく卓IDを取得（なければnull）
  String? getTableIdForOption(String optionKey) {
    return optionParams[optionKey]?['tableId'] as String?;
  }

  /// デバッグ用の文字列表現
  @override
  String toString() {
    return 'Device(id: $id, name: $name, role: $role, platform: $platform, status: $status)';
  }

  /// コピーを作成（一部フィールドを変更）
  Device copyWith({
    String? id,
    String? name,
    String? role,
    String? uid,
    String? installationId,
    String? platform,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? status,
    Map<String, bool>? options,
    Map<String, Map<String, dynamic>>? optionParams,
  }) {
    return Device(
      id: id ?? this.id,
      name: name ?? this.name,
      role: role ?? this.role,
      uid: uid ?? this.uid,
      installationId: installationId ?? this.installationId,
      platform: platform ?? this.platform,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      status: status ?? this.status,
      options: options ?? this.options,
      optionParams: optionParams ?? this.optionParams,
    );
  }

  /// 等価性の比較
  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Device &&
        other.id == id &&
        other.name == name &&
        other.role == role &&
        other.uid == uid &&
        other.installationId == installationId &&
        other.platform == platform &&
        other.createdAt == createdAt &&
        other.updatedAt == updatedAt &&
        other.status == status &&
        _mapEquals(other.options, options) &&
        _mapEquals(other.optionParams, optionParams);
  }

  /// ハッシュコード
  @override
  int get hashCode {
    return Object.hash(
      id,
      name,
      role,
      uid,
      installationId,
      platform,
      createdAt,
      updatedAt,
      status,
      options.hashCode,
      optionParams.hashCode,
    );
  }

  /// Map の簡易比較（浅い比較）
  static bool _mapEquals(Map a, Map b) {
    if (a.length != b.length) return false;
    for (final key in a.keys) {
      if (!b.containsKey(key) || a[key] != b[key]) return false;
    }
    return true;
  }
}

/// デバイスの役割
enum DeviceRole {
  admin('admin'),
  terminal('terminal');

  const DeviceRole(this.value);
  final String value;

  static DeviceRole fromString(String value) {
    switch (value) {
      case 'admin':
        return DeviceRole.admin;
      case 'terminal':
        return DeviceRole.terminal;
      default:
        return DeviceRole.terminal;
    }
  }
}

/// デバイスのステータス
enum DeviceStatus {
  active('active'),
  blocked('blocked'),
  archived('archived');

  const DeviceStatus(this.value);
  final String value;

  static DeviceStatus fromString(String value) {
    switch (value) {
      case 'active':
        return DeviceStatus.active;
      case 'blocked':
        return DeviceStatus.blocked;
      case 'archived':
        return DeviceStatus.archived;
      // 既存 DB 互換: retired は archived 相当
      case 'retired':
        return DeviceStatus.archived;
      default:
        return DeviceStatus.active;
    }
  }

  /// 管理画面の通常一覧に表示するか
  bool get isVisibleInManagementList =>
      this == DeviceStatus.active || this == DeviceStatus.blocked;

  /// 削除済み（再登録可能）か
  bool get isRemovedFromService =>
      this == DeviceStatus.archived;
}
