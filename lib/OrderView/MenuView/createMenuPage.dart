import 'dart:io';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';

class CreateMenuPage extends StatefulWidget {
  const CreateMenuPage({super.key});

  @override
  State<CreateMenuPage> createState() => _CreateMenuPageState();
}

class _CreateMenuPageState extends State<CreateMenuPage> {
  final _nameController = TextEditingController();
  final _priceController = TextEditingController();
  final _descriptionController = TextEditingController();

  String _selectedCategory = 'ドリンク';
  bool _isAvailable = true;
  File? _selectedImage;
  String? _uploadedImageUrl;

  final List<String> _categories = ['ドリンク', 'フード', 'その他'];

  final ImagePicker _picker = ImagePicker();

  Future<void> _pickImage() async {
    final picked = await _picker.pickImage(source: ImageSource.gallery);
    if (picked != null) {
      setState(() {
        _selectedImage = File(picked.path);
      });
    }
  }

  Future<String?> _uploadImage(File imageFile) async {
    try {
      final fileName = '${DateTime.now().millisecondsSinceEpoch}.jpg';
      final ref = FirebaseStorage.instance.ref().child('menuImages/$fileName');
      await ref.putFile(imageFile);
      return await ref.getDownloadURL();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('画像のアップロードに失敗しました: $e')),
      );
      return null;
    }
  }

  Future<void> _addMenuItem() async {
    final name = _nameController.text.trim();
    final price = int.tryParse(_priceController.text.trim()) ?? 0;

    if (name.isEmpty || price <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('有効な名前と金額を入力してください')),
      );
      return;
    }

    try {
      String? imageUrl;
      if (_selectedImage != null) {
        imageUrl = await _uploadImage(_selectedImage!);
        if (imageUrl == null) return;
      }

      final docRef = await FirebaseFirestore.instance.collection('menuItems').add({
        'name': name,                                      // ← OK
        'price': price,                                    // ← OK
        'itemCategory': _selectedCategory,                 // ← 修正①: category → itemCategory
        'isArchived': false,                               // ← 修正③: 明示的に追加（仕様に必須）
        'archivedAt': null,                                // ← 修正④: 初期は null を保存（任意）
        'isAvailable': _isAvailable,                       // ← 補足：仕様外。使用するなら仕様に追記必要
        'imageUrl': imageUrl,                              // ← 同上
      });

      // 修正②: menuItemId を明示的に追加
      await docRef.update({'menuItemId': docRef.id});

      _nameController.clear();
      _priceController.clear();
      _descriptionController.clear();
      setState(() {
        _selectedCategory = 'ドリンク';
        _isAvailable = true;
        _selectedImage = null;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('メニューが登録されました')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('メニューの登録に失敗しました: $e')),
      );
    }
  }


  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('メニュー登録')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ① 正方形画像アップロード
            Center(
              child: GestureDetector(
                onTap: _pickImage,
                child: Builder(
                  builder: (context) {
                    final imageSize = MediaQuery.of(context).size.width * 0.15; // ← 画面の50%サイズ
                    return _selectedImage != null
                        ? Image.file(_selectedImage!, width: imageSize, height: imageSize, fit: BoxFit.cover)
                        : Container(
                      width: imageSize,
                      height: imageSize,
                      color: Colors.grey[200],
                      child: const Icon(Icons.add_a_photo, size: 50, color: Colors.grey),
                    );
                  },
                ),
              ),
            ),
            const SizedBox(height: 16),

            // 商品名入力
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: '商品名'),
            ),

            // 価格入力
            TextField(
              controller: _priceController,
              decoration: const InputDecoration(labelText: '価格（円）'),
              keyboardType: TextInputType.number,
            ),

            const SizedBox(height: 10),

            // ② カテゴリ選択（表形式に合わせた表示）
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  const SizedBox(
                    width: 100, // 他フィールドとラベル幅を揃える
                    child: Text('カテゴリー', style: TextStyle(fontSize: 16)),
                  ),
                  const SizedBox(width: 10),
                  SizedBox(
                    width: 200,
                    child: DropdownButtonFormField<String>(
                      value: _selectedCategory,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
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
                  ),
                ],
              ),
            ),

            // 提供可能スイッチ
            SwitchListTile(
              title: const Text('提供可能'),
              value: _isAvailable,
              onChanged: (val) {
                setState(() {
                  _isAvailable = val;
                });
              },
            ),
            const SizedBox(height: 16),

            // 登録ボタン
            Center(
              child: ElevatedButton(
                onPressed: _addMenuItem,
                child: const Text('登録する'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
