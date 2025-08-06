import 'dart:io';
import 'dart:convert';
import 'package:amuse_app_template/appbarUtils.dart';
import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:image_picker/image_picker.dart';

class CreateMenuPage extends StatefulWidget {
  final Map<String, dynamic>? editItem; // 編集対象のアイテム

  const CreateMenuPage({super.key, this.editItem});

  @override
  State<CreateMenuPage> createState() => _CreateMenuPageState();
}

class _CreateMenuPageState extends State<CreateMenuPage> {
  final _nameController = TextEditingController();
  final _priceController = TextEditingController();
  final _descriptionController = TextEditingController();

  String _selectedCategory = 'ノンアルコール';
  bool _isAvailable = true;
  File? _selectedImage;

  final List<String> _categories = ['アルコール', 'ノンアルコール', 'フード', 'その他'];

  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    
    // 編集対象のアイテムがある場合、フォームに初期値を設定
    if (widget.editItem != null) {
      _nameController.text = widget.editItem!['name'] ?? '';
      _priceController.text = (widget.editItem!['price'] ?? 0).toString();
      _descriptionController.text = widget.editItem!['description'] ?? '';
      _selectedCategory = widget.editItem!['category'] ?? 'ノンアルコール';
      _isAvailable = widget.editItem!['isSoldOut'] == false;
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

  Future<String?> _uploadImage(File imageFile) async {
    try {
      // 画像ファイルをBase64に変換
      final bytes = await imageFile.readAsBytes();
      final base64Data = base64Encode(bytes);
      final fileName = '${DateTime.now().millisecondsSinceEpoch}.jpg';
      
      // Cloud Functionを呼び出し
      final callable = FirebaseFunctions.instance.httpsCallable('uploadImage');
      final result = await callable.call({
        'imageData': base64Data,
        'fileName': fileName,
      });

      final data = result.data;
      if (data['success'] == true) {
        return data['imageUrl'];
      } else {
        throw Exception("画像アップロードに失敗しました");
      }
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

    if (name.isEmpty || price < 0) {
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

      // 編集対象のアイテムがある場合、元のアイテムをアーカイブ
      if (widget.editItem != null) {
        final updateCallable = FirebaseFunctions.instance.httpsCallable('updateMenuItem');
        await updateCallable.call({
          'menuItemId': widget.editItem!['id'],
          'isArchive': true,
        });
      }

      // Cloud Functionを呼び出し
      final callable = FirebaseFunctions.instance.httpsCallable('createMenuItem');
      final result = await callable.call({
        'name': name,
        'price': price,
        'category': _selectedCategory,
        'description': _descriptionController.text.trim(),
        'imageUrl': imageUrl,
        'order': 0,
      });

      final data = result.data;
      
      if (data['success'] == true) {
        _nameController.clear();
        _priceController.clear();
        _descriptionController.clear();
        setState(() {
          _selectedCategory = 'ノンアルコール';
          _isAvailable = true;
          _selectedImage = null;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(widget.editItem != null ? 'メニューが更新されました' : data['message'])),
        );
        
        // 編集モードの場合は前の画面に戻る
        if (widget.editItem != null) {
          Navigator.pop(context);
        }
      } else {
        throw Exception("メニュー登録に失敗しました");
      }
    } on FirebaseFunctionsException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('メニューの登録に失敗しました: ${e.message}')),
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
      appBar: defaultStyledAppBar(
        title: Text(widget.editItem != null ? 'メニュー編集' : 'メニュー登録'),
      ),
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
                    final imageSize = MediaQuery.of(context).size.width * 0.16; // サイズを小さく
                    return _selectedImage != null
                        ? Image.file(_selectedImage!, width: imageSize, height: imageSize, fit: BoxFit.cover)
                        : Container(
                      width: imageSize,
                      height: imageSize,
                      color: Colors.grey[200],
                      child: const Icon(Icons.add_a_photo, size: 40, color: Colors.grey), // アイコンサイズも小さく
                    );
                  },
                ),
              ),
            ),
            const SizedBox(height: 12), // 間隔を縮小

            // 商品名入力
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: '商品名',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.restaurant),
              ),
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return '商品名を入力してください';
                }
                return null;
              },
            ),
            const SizedBox(height: 12), // 間隔を統一

            // 価格入力
            TextFormField(
              controller: _priceController,
              decoration: const InputDecoration(
                labelText: '価格（円）',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.attach_money),
              ),
              keyboardType: TextInputType.number,
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return '価格を入力してください';
                }
                if (int.tryParse(value) == null || int.parse(value) < 0) {
                  return '有効な価格を入力してください';
                }
                return null;
              },
            ),

            const SizedBox(height: 12), // 間隔を統一

            // ② カテゴリ選択
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const SizedBox(
                  width: 100,
                  child: Text('カテゴリー', style: TextStyle(fontSize: 16)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _selectedCategory,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8), // パディングを縮小
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

            const SizedBox(height: 12),

            // 説明入力
            TextFormField(
              controller: _descriptionController,
              decoration: const InputDecoration(
                labelText: '説明（任意）',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.description),
              ),
              maxLines: 1,
            ),
            const SizedBox(height: 6), // 間隔を調整

            // 提供可能スイッチ
            SwitchListTile(
              title: const Text('提供可能'),
              subtitle: const Text('メニューを表示するかどうか'),
              value: _isAvailable,
              onChanged: (val) {
                setState(() {
                  _isAvailable = val;
                });
              },
              contentPadding: const EdgeInsets.symmetric(horizontal: 0), // パディングを削除
            ),
            const SizedBox(height: 6), // 間隔を調整

            // 登録ボタン
            SizedBox(
              width: double.infinity,
              height: 45, // 高さを少し縮小
              child: ElevatedButton(
                onPressed: _addMenuItem,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue,
                  foregroundColor: Colors.white,
                ),
                child: const Text(
                  'メニューを登録',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold), // フォントサイズを縮小
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
