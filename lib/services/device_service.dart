import 'dart:io';
import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/device.dart';
import 'device_options.dart';

/// デバイス管理サービス
class DeviceService {
  static const String _deviceIdKey = 'device_id';
  static const String _deviceNameKey = 'device_name';
  static const String _deviceRoleKey = 'device_role';
  
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;

  /// 直近取得したデバイスの簡易キャッシュ（任意）
  Device? _cachedDevice;


  /// デバイスが登録済みかチェック
  Future<bool> isDeviceRegistered() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final deviceId = prefs.getString(_deviceIdKey);
      
      if (deviceId == null) {
        return false;
      }

      // Firestore でデバイスが存在するかチェック
      final doc = await _firestore.collection('devices').doc(deviceId).get();
      return doc.exists;
    } catch (e) {
      print('デバイス登録チェックエラー: $e');
      return false;
    }
  }

  /// 現在のデバイス情報を取得
  Future<Device?> getCurrentDevice() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final deviceId = prefs.getString(_deviceIdKey);
      
      if (deviceId == null) {
        return null;
      }

      final doc = await _firestore.collection('devices').doc(deviceId).get();
      if (!doc.exists) {
        return null;
      }

      final device = Device.fromFirestore(doc);
      _cachedDevice = device;
      return device;
    } catch (e) {
      print('デバイス情報取得エラー: $e');
      return null;
    }
  }

  /// デバイス登録
  Future<Device?> registerDevice({
    required String name,
    required String role,
  }) async {
    try {
      // 匿名認証
      final userCredential = await _auth.signInAnonymously();
      final uid = userCredential.user?.uid;
      
      if (uid == null) {
        throw Exception('匿名認証に失敗しました');
      }

      // 一意のデバイスIDを生成（UIDと組み合わせ）
      final installationId = _generateInstallationId();

      // プラットフォーム情報を取得
      final platform = _getPlatform();

      // Cloud Function を呼び出してデバイス登録
      final callable = _functions.httpsCallable('registerDevice');
      final result = await callable.call({
        'name': name,
        'role': role,
        'uid': uid,
        'installationId': installationId,
        'platform': platform,
      });

      final deviceData = result.data as Map<String, dynamic>;
      final deviceId = deviceData['deviceId'] as String;

      // ローカルキャッシュに保存
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_deviceIdKey, deviceId);
      await prefs.setString(_deviceNameKey, name);
      await prefs.setString(_deviceRoleKey, role);

      // デバイス情報を取得して返す
      final doc = await _firestore.collection('devices').doc(deviceId).get();
      final device = Device.fromFirestore(doc);
      _cachedDevice = device;
      return device;
    } catch (e) {
      print('デバイス登録エラー: $e');
      
      // 匿名認証が無効化されている場合の分かりやすいエラーメッセージ
      if (e.toString().contains('admin-restricted-operation')) {
        throw Exception('匿名認証が無効化されています。Firebase Console で匿名認証を有効化してください。');
      }
      
      rethrow;
    }
  }

  /// デバイス情報を更新
  Future<void> updateDevice({
    String? name,
    String? role,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final deviceId = prefs.getString(_deviceIdKey);
      
      if (deviceId == null) {
        throw Exception('デバイスIDが見つかりません');
      }

      final updateData = <String, dynamic>{
        'updatedAt': FieldValue.serverTimestamp(),
      };

      if (name != null) {
        updateData['name'] = name;
        await prefs.setString(_deviceNameKey, name);
      }

      if (role != null) {
        updateData['role'] = role;
        await prefs.setString(_deviceRoleKey, role);
      }

      await _firestore.collection('devices').doc(deviceId).update(updateData);
      // 更新後の最新を反映
      final refreshed = await _firestore.collection('devices').doc(deviceId).get();
      if (refreshed.exists) {
        _cachedDevice = Device.fromFirestore(refreshed);
      }
    } catch (e) {
      print('デバイス更新エラー: $e');
      rethrow;
    }
  }

  /// デバイス一覧を取得（管理者用）
  Future<List<Device>> getDevices() async {
    try {
      final snapshot = await _firestore
          .collection('devices')
          .orderBy('createdAt', descending: true)
          .get();

      return snapshot.docs.map((doc) => Device.fromFirestore(doc)).toList();
    } catch (e) {
      print('デバイス一覧取得エラー: $e');
      return [];
    }
  }

  /// デバイスのステータスを更新（管理者用）
  Future<void> updateDeviceStatus(String deviceId, String status) async {
    try {
      await _firestore.collection('devices').doc(deviceId).update({
        'status': status,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      // キャッシュ更新
      final refreshed = await _firestore.collection('devices').doc(deviceId).get();
      if (refreshed.exists) {
        _cachedDevice = Device.fromFirestore(refreshed);
      }
    } catch (e) {
      print('デバイスステータス更新エラー: $e');
      rethrow;
    }
  }

  /// 管理者用：指定デバイスの role を変更する（Cloud Function 経由）。
  /// terminal にする場合は options / optionParams を生成、admin の場合は削除する。
  Future<void> updateDeviceRoleByAdmin({
    required String targetDeviceId,
    required String role,
  }) async {
    try {
      final callable = _functions.httpsCallable('updateDeviceRole');
      await callable.call(<String, dynamic>{
        'deviceId': targetDeviceId,
        'role': role,
      });
      final prefs = await SharedPreferences.getInstance();
      final myId = prefs.getString(_deviceIdKey);
      if (myId == targetDeviceId) {
        await prefs.setString(_deviceRoleKey, role);
        final refreshed = await _firestore.collection('devices').doc(targetDeviceId).get();
        if (refreshed.exists) {
          _cachedDevice = Device.fromFirestore(refreshed);
        }
      }
    } catch (e) {
      print('デバイスrole更新エラー: $e');
      rethrow;
    }
  }

  /// デバイスを削除（管理者用）
  Future<void> deleteDevice(String deviceId) async {
    try {
      await _firestore.collection('devices').doc(deviceId).delete();
      _cachedDevice = null;
    } catch (e) {
      print('デバイス削除エラー: $e');
      rethrow;
    }
  }

  /// ローカルキャッシュをクリア
  Future<void> clearLocalCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_deviceIdKey);
      await prefs.remove(_deviceNameKey);
      await prefs.remove(_deviceRoleKey);
    } catch (e) {
      print('キャッシュクリアエラー: $e');
    }
  }

  /// プラットフォーム情報を取得
  String _getPlatform() {
    if (Platform.isIOS) {
      return 'ios';
    } else if (Platform.isAndroid) {
      return 'android';
    } else if (Platform.isMacOS) {
      return 'macos';
    } else if (Platform.isWindows) {
      return 'windows';
    } else if (Platform.isLinux) {
      return 'linux';
    } else if (Platform.isFuchsia) {
      return 'fuchsia';
    } else {
      return 'web';
    }
  }

  /// 一意のインストールIDを生成
  String _generateInstallationId() {
    final random = Random();
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return List.generate(22, (index) => chars[random.nextInt(chars.length)]).join();
  }

  /// 最新デバイス情報を再取得してキャッシュに反映
  Future<Device?> refreshDevice() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final deviceId = prefs.getString(_deviceIdKey);
      if (deviceId == null) {
        return null;
      }
      final doc = await _firestore.collection('devices').doc(deviceId).get();
      if (!doc.exists) {
        _cachedDevice = null;
        return null;
      }
      final device = Device.fromFirestore(doc);
      _cachedDevice = device;
      return device;
    } catch (e) {
      print('デバイス再取得エラー: $e');
      return null;
    }
  }

  /// デバイスが指定オプションを保持しているかチェック（adminは常に許可する運用）
  /// optionKey は [DeviceOptionKeys] で定義（order, accounting, storeManagement（営業管理）など）。
  Future<bool> hasOption(String optionKey, {bool adminBypass = true}) async {
    try {
      final device = _cachedDevice ?? await getCurrentDevice();
      if (device == null) return false;
      if (adminBypass && device.role == 'admin') return true;
      return device.options[optionKey] == true;
    } catch (e) {
      print('オプションチェックエラー: $e');
      return false;
    }
  }

  /// 管理者用：端末のオプションを更新（CF経由）
  Future<Map<String, bool>> updateDeviceOptions({
    required String targetDeviceId,
    required Map<String, bool> options,
    Map<String, Map<String, dynamic>>? optionParams,
  }) async {
    try {
      final callable = _functions.httpsCallable('updateDeviceOptions');
      final callData = <String, dynamic>{
        'deviceId': targetDeviceId,
        'options': options,
      };
      if (optionParams != null) {
        callData['optionParams'] = optionParams;
      }
      final result = await callable.call(callData);
      final data = (result.data as Map).cast<String, dynamic>();
      final updated = (data['options'] as Map).cast<String, bool>();
      // 自分自身を更新した場合はキャッシュも更新
      final prefs = await SharedPreferences.getInstance();
      final myId = prefs.getString(_deviceIdKey);
      if (myId != null && myId == targetDeviceId) {
        _cachedDevice = await getCurrentDevice();
      }
      return updated;
    } catch (e) {
      print('オプション更新エラー: $e');
      rethrow;
    }
  }

  /// 指定オプションに紐づく卓IDを取得（キャッシュから）
  String? getTableIdForOption(String optionKey) {
    return _cachedDevice?.getTableIdForOption(optionKey);
  }

  /// 全デバイスのoptionParamsを取得（卓除外用）
  Future<List<Map<String, dynamic>>> getAllDeviceOptionParams() async {
    try {
      final snapshot = await _firestore.collection('devices').get();
      return snapshot.docs.map((doc) {
        final data = doc.data();
        return {
          'deviceId': doc.id,
          'optionParams': data['optionParams'] ?? {},
        };
      }).toList();
    } catch (e) {
      print('全デバイスoptionParams取得エラー: $e');
      return [];
    }
  }

  /// デバイスが管理者かチェック
  Future<bool> isAdmin() async {
    try {
      final device = await getCurrentDevice();
      return device?.role == 'admin';
    } catch (e) {
      print('管理者チェックエラー: $e');
      return false;
    }
  }

  /// デバイスがターミナルかチェック
  Future<bool> isTerminal() async {
    try {
      final device = await getCurrentDevice();
      return device?.role == 'terminal';
    } catch (e) {
      print('ターミナルチェックエラー: $e');
      return false;
    }
  }

  /// デバイスがアクティブかチェック
  Future<bool> isActive() async {
    try {
      final device = await getCurrentDevice();
      return device?.status == 'active';
    } catch (e) {
      print('アクティブチェックエラー: $e');
      return false;
    }
  }

  /// Phase6 Step4: store management 端末か（強警告で閉店処理・営業継続を出せる端末）
  /// spec §5.1: role === 'admin' または (role === 'terminal' && options.store_management === true)
  Future<bool> isStoreManagement() async {
    try {
      final device = await getCurrentDevice();
      if (device == null) return false;
      if (device.role == 'admin') return true;
      if (device.role == 'terminal' &&
          device.options[DeviceOptionKeys.storeManagement] == true) {
        return true;
      }
      return false;
    } catch (e) {
      print('store management チェックエラー: $e');
      return false;
    }
  }
}
