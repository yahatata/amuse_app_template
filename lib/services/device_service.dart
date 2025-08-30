import 'dart:io';
import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/device.dart';

/// デバイス管理サービス
class DeviceService {
  static const String _deviceIdKey = 'device_id';
  static const String _deviceNameKey = 'device_name';
  static const String _deviceRoleKey = 'device_role';
  
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;


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

      return Device.fromFirestore(doc);
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
      return Device.fromFirestore(doc);
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
    } catch (e) {
      print('デバイスステータス更新エラー: $e');
      rethrow;
    }
  }

  /// デバイスを削除（管理者用）
  Future<void> deleteDevice(String deviceId) async {
    try {
      await _firestore.collection('devices').doc(deviceId).delete();
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
}
