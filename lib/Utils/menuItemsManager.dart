import 'package:cloud_functions/cloud_functions.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

// メニューアイテムのデータモデル
class MenuItem {
  final String id;
  final String name;
  final int price;
  final String category;
  final String description;
  final String imageUrl;
  final bool isArchive;
  final bool isSoldOut;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? archivedAt;
  final int order;

  MenuItem({
    required this.id,
    required this.name,
    required this.price,
    required this.category,
    required this.description,
    required this.imageUrl,
    required this.isArchive,
    required this.isSoldOut,
    required this.createdAt,
    required this.updatedAt,
    this.archivedAt,
    required this.order,
  });

  factory MenuItem.fromMap(Map<String, dynamic> map) {
    // When: Timestamp変換時
    // Where: MenuItem.fromMap
    // What: FireStoreのTimestampをDateTimeに変換
    // How: 安全な型チェックと変換を実行
    DateTime _parseTimestamp(dynamic timestamp) {
      if (timestamp == null) return DateTime.now();
      
      if (timestamp is Timestamp) {
        return timestamp.toDate();
      } else if (timestamp is Map) {
        // FireStoreのTimestampがMap形式で返される場合
        final seconds = timestamp['_seconds'] as int?;
        final nanoseconds = timestamp['_nanoseconds'] as int?;
        if (seconds != null) {
          return DateTime.fromMillisecondsSinceEpoch(seconds * 1000);
        }
      }
      return DateTime.now();
    }

    return MenuItem(
      id: map['id'] ?? '',
      name: map['name'] ?? '',
      price: map['price']?.toInt() ?? 0,
      category: map['category'] ?? '',
      description: map['description'] ?? '',
      imageUrl: map['imageUrl'] ?? '',
      isArchive: map['isArchive'] ?? false,
      isSoldOut: map['isSoldOut'] ?? false,
      createdAt: _parseTimestamp(map['createdAt']),
      updatedAt: _parseTimestamp(map['updatedAt']),
      archivedAt: map['archivedAt'] != null ? _parseTimestamp(map['archivedAt']) : null,
      order: map['order']?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'price': price,
      'category': category,
      'description': description,
      'imageUrl': imageUrl,
      'isArchive': isArchive,
      'isSoldOut': isSoldOut,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      'archivedAt': archivedAt,
      'order': order,
    };
  }
}

// メニューアイテム管理クラス
class MenuItemsManager {
  static List<MenuItem> _allMenuItems = [];
  static bool _isLoading = false;
  static String? _lastError;

  // 全メニューアイテムを取得
  static List<MenuItem> get allMenuItems => _allMenuItems;
  
  // ローディング状態を取得
  static bool get isLoading => _isLoading;
  
  // エラーメッセージを取得
  static String? get lastError => _lastError;

  // FireStoreからメニューアイテムを取得
  static Future<bool> fetchMenuItems() async {
    try {
      _isLoading = true;
      _lastError = null;

      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('getMenuItems');
      final result = await callable.call();

      final response = result.data;
      
      if (response is Map && response['success'] == true) {
        final data = response['data'];
        if (data is List) {
          _allMenuItems = data.map((item) {
            if (item is Map) {
              final menuItem = MenuItem.fromMap(Map<String, dynamic>.from(item));
              print('Loaded menu item: ${menuItem.name}, imageUrl: ${menuItem.imageUrl}');
              return menuItem;
            } else {
              throw Exception('Invalid item format');
            }
          }).toList();
        } else {
          throw Exception('Data is not a list');
        }
      } else {
        final error = response is Map ? response['error'] : 'メニューアイテムの取得に失敗しました';
        throw Exception(error);
      }

      _isLoading = false;
      return true;
    } catch (e) {
      _isLoading = false;
      _lastError = 'メニューアイテムの取得に失敗しました: $e';
      return false;
    }
  }

  // カテゴリー別のメニューアイテムを取得（表示用）
  static List<MenuItem> getMenuItemsByCategory(String category) {
    return _allMenuItems.where((item) => 
      item.category == category && 
      !item.isArchive && 
      !item.isSoldOut
    ).toList();
  }

  // 全カテゴリーのメニューアイテムを取得（表示用）
  static List<MenuItem> getDisplayableMenuItems() {
    return _allMenuItems.where((item) => 
      !item.isArchive && 
      !item.isSoldOut
    ).toList();
  }

  // エラーをクリア
  static void clearError() {
    _lastError = null;
  }
}
