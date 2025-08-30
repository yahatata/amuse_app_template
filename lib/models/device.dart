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
  });

  /// Firestore ドキュメントから Device オブジェクトを作成
  factory Device.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
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
    };
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
        other.status == status;
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
    );
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
  retired('retired');

  const DeviceStatus(this.value);
  final String value;

  static DeviceStatus fromString(String value) {
    switch (value) {
      case 'active':
        return DeviceStatus.active;
      case 'blocked':
        return DeviceStatus.blocked;
      case 'retired':
        return DeviceStatus.retired;
      default:
        return DeviceStatus.active;
    }
  }
}
