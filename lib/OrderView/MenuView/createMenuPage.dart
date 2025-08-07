import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:image_picker/image_picker.dart';
import '../../globalConstant.dart';
import '../../Utils/menuItemsManager.dart';

class CreateMenuPage extends StatefulWidget {
  final MenuItem? menuItem; // 編集時のみ使用

  const CreateMenuPage({super.key, this.menuItem});

  @override
  State<CreateMenuPage> createState() => _CreateMenuPageState();
}

class _CreateMenuPageState extends State<CreateMenuPage> {
  final _nameController = TextEditingController();
  final _priceController = TextEditingController();
  final _descriptionController = TextEditingController();

  String _selectedCategory = 'フード';
  bool _isArchive = false;
  bool _isSoldOut = false;
  File? _selectedImage;
  String? _existingImageUrl; // 既存の画像URL

  // globalConstant.dartからカテゴリーを取得
  final List<String> _categories = GlobalConstants.menuCategories;

  final ImagePicker _picker = ImagePicker();
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

  @override
  void initState() {
    super.initState();
    // When: ページ初期化時
    // Where: CreateMenuPage
    // What: 編集時は既存データを入力フィールドに設定
    // How: widget.menuItemからデータを取得して各コントローラーに設定
    if (widget.menuItem != null) {
      _nameController.text = widget.menuItem!.name;
      _priceController.text = widget.menuItem!.price.toString();
      _descriptionController.text = widget.menuItem!.description;
      _selectedCategory = widget.menuItem!.category;
      _isArchive = widget.menuItem!.isArchive;
      _isSoldOut = widget.menuItem!.isSoldOut;
      _existingImageUrl = widget.menuItem!.imageUrl;
    }
  }

  Future<void> _pickImage() async {
    final picked = await _picker.pickImage(source: ImageSource.gallery);
    if (picked != null) {
      setState(() {
        _selectedImage = File(picked.path);
      });
    }
  }

  Future<String?> _imageToBase64(File imageFile) async {
    try {
      final bytes = await imageFile.readAsBytes();
      return base64Encode(bytes);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('画像の変換に失敗しました: $e')),
      );
      return null;
    }
  }

  Future<void> _saveMenuItem() async {
    final name = _nameController.text.trim();
    final price = int.tryParse(_priceController.text.trim()) ?? 0;
    final description = _descriptionController.text.trim();

    if (name.isEmpty || price <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('有効な名前と金額を入力してください')),
      );
      return;
    }

    try {
      // When: メニュー保存時
      // Where: CreateMenuPage
      // What: Cloud Functionsを呼び出してメニューを保存
      // How: 新規作成か更新かを判定して適切な関数を呼び出し
      
      String? imageBase64;
      if (_selectedImage != null) {
        imageBase64 = await _imageToBase64(_selectedImage!);
        if (imageBase64 == null) return;
      }

      final data = {
        'name': name,
        'price': price.toString(),
        'category': _selectedCategory,
        'description': description,
        'imageBase64': imageBase64,
        'isArchive': _isArchive,
        'isSoldOut': _isSoldOut,
      };

      HttpsCallable callable;
      if (widget.menuItem != null) {
        // 更新処理
        data['originalId'] = widget.menuItem!.id;
        callable = _functions.httpsCallable('updateMenuItem');
      } else {
        // 新規作成処理
        callable = _functions.httpsCallable('createMenuItem');
      }

      final result = await callable.call(data);
      final response = result.data;

      if (response['success'] == true) {
        // MenuItemsManagerを更新
        await MenuItemsManager.fetchMenuItems();

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(widget.menuItem != null ? 'メニューが更新されました' : 'メニューが登録されました')),
        );

        // 前の画面に戻る
        Navigator.pop(context);
      } else {
        final error = response['error'] ?? 'メニューの保存に失敗しました';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error)),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('メニューの保存に失敗しました: $e')),
      );
    }
  }


  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.menuItem != null ? 'メニュー編集' : 'メニュー登録')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 画像アップロード（コンパクトサイズ）
            Center(
              child: GestureDetector(
                onTap: _pickImage,
                child: Builder(
                  builder: (context) {
                    final imageSize = MediaQuery.of(context).size.width * 0.2; // 画面の20%サイズに縮小
                    if (_selectedImage != null) {
                      return Image.file(_selectedImage!, width: imageSize, height: imageSize, fit: BoxFit.cover);
                    } else if (_existingImageUrl != null && _existingImageUrl!.isNotEmpty) {
                      return Image.network(
                        _existingImageUrl!,
                        width: imageSize,
                        height: imageSize,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) {
                          return Container(
                            width: imageSize,
                            height: imageSize,
                            color: Colors.grey[200],
                            child: const Icon(Icons.image_not_supported, size: 30, color: Colors.grey),
                          );
                        },
                      );
                    } else {
                      return Container(
                        width: imageSize,
                        height: imageSize,
                        color: Colors.grey[200],
                        child: const Icon(Icons.add_a_photo, size: 30, color: Colors.grey),
                      );
                    }
                  },
                ),
              ),
            ),
            const SizedBox(height: 12),



            // 左側：基本情報、右側：設定
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 左側：基本情報（画面の半分）
                Expanded(
                  flex: 1,
                  child: Column(
                    children: [
                      // 商品名入力
                      TextField(
                        controller: _nameController,
                        decoration: const InputDecoration(
                          labelText: '商品名',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // 価格入力
                      TextField(
                        controller: _priceController,
                        decoration: const InputDecoration(
                          labelText: '価格（円）',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                      const SizedBox(height: 12),

                      // カテゴリー選択
                      DropdownButtonFormField<String>(
                        value: _selectedCategory,
                        decoration: const InputDecoration(
                          labelText: 'カテゴリー',
                          border: OutlineInputBorder(),
                        ),
                        onChanged: (value) {
                          if (value != null) {
                            setState(() {
                              _selectedCategory = value;
                            });
                          }
                        },
                        items: _categories.map((cat) {
                          return DropdownMenuItem(value: cat, child: Text(cat));
                        }).toList(),
                      ),
                    ],
                  ),
                ),

                const SizedBox(width: 16),

                // 右側：設定
                Expanded(
                  flex: 1,
                  child: Column(
                    children: [
                      // アーカイブ状態
                      SwitchListTile(
                        title: const Text('アーカイブ'),
                        subtitle: const Text('アーカイブすると通常のメニュー一覧に表示されません'),
                        value: _isArchive,
                        onChanged: (val) {
                          setState(() {
                            _isArchive = val;
                          });
                        },
                      ),

                      // 売り切れ状態
                      SwitchListTile(
                        title: const Text('売り切れ'),
                        subtitle: const Text('売り切れにすると注文時に表示されません'),
                        value: _isSoldOut,
                        onChanged: (val) {
                          setState(() {
                            _isSoldOut = val;
                          });
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // 説明入力（画面全体幅）
            TextField(
              controller: _descriptionController,
              decoration: const InputDecoration(
                labelText: '説明',
                border: OutlineInputBorder(),
              ),
              maxLines: 1,
            ),
            const SizedBox(height: 12),

            // 登録ボタン
            Center(
              child: ElevatedButton(
                onPressed: _saveMenuItem,
                child: Text(widget.menuItem != null ? '更新する' : '登録する'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
