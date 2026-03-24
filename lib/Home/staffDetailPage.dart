import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

class StaffDetailPage extends StatefulWidget {
  final String staffId;
  final Map<String, dynamic> staffData;

  const StaffDetailPage({
    super.key,
    required this.staffId,
    required this.staffData,
  });

  @override
  State<StaffDetailPage> createState() => _StaffDetailPageState();
}

class _StaffDetailPageState extends State<StaffDetailPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  final TextEditingController _hourlyWageController = TextEditingController();
  
  // 銀行口座情報用のコントローラー
  final TextEditingController _bankNameController = TextEditingController();
  final TextEditingController _branchNameController = TextEditingController();
  final TextEditingController _accountNumberController = TextEditingController();
  final TextEditingController _accountHolderController = TextEditingController();
  String _accountType = '普通'; // 普通 or 当座
  
  bool _isEditing = false;
  bool _isEditingBankInfo = false;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _hourlyWageController.text = widget.staffData['hourlyWage']?.toString() ?? '';
    
    // 銀行口座情報の初期化
    final bankInfo = widget.staffData['bankInfo'] as Map<String, dynamic>?;
    if (bankInfo != null) {
      _bankNameController.text = bankInfo['bankName']?.toString() ?? '';
      _branchNameController.text = bankInfo['branchName']?.toString() ?? '';
      _accountNumberController.text = bankInfo['accountNumber']?.toString() ?? '';
      _accountHolderController.text = bankInfo['accountHolder']?.toString() ?? '';
      _accountType = bankInfo['accountType']?.toString() ?? '普通';
    }
  }

  @override
  void dispose() {
    _hourlyWageController.dispose();
    _bankNameController.dispose();
    _branchNameController.dispose();
    _accountNumberController.dispose();
    _accountHolderController.dispose();
    super.dispose();
  }

  // 銀行口座情報を更新する関数（Cloud Function経由）
  Future<void> _updateBankInfo() async {
    if (_bankNameController.text.isEmpty ||
        _branchNameController.text.isEmpty ||
        _accountNumberController.text.isEmpty ||
        _accountHolderController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('すべての項目を入力してください')),
      );
      return;
    }

    // 口座番号のバリデーション（7桁の数字）
    if (_accountNumberController.text.length != 7 || 
        int.tryParse(_accountNumberController.text) == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('口座番号は7桁の数字で入力してください')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // Cloud Functionを呼び出して銀行口座情報を更新
      final result = await _functions.httpsCallable('updateStaffBankInfo').call({
        'staffId': widget.staffId,
        'bankInfo': {
          'bankName': _bankNameController.text,
          'branchName': _branchNameController.text,
          'accountNumber': _accountNumberController.text,
          'accountHolder': _accountHolderController.text,
          'accountType': _accountType,
        },
      });

      if (mounted) {
        if (result.data['success'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(result.data['message'] ?? '銀行口座情報を更新しました')),
          );
          setState(() {
            _isEditingBankInfo = false;
          });
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('更新に失敗しました')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('更新に失敗しました: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _updateHourlyWage() async {
    if (_hourlyWageController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('時給を入力してください')),
      );
      return;
    }

    final hourlyWage = int.tryParse(_hourlyWageController.text);
    if (hourlyWage == null || hourlyWage < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('有効な時給を入力してください')),
      );
      return;
    }

    if (hourlyWage > 10000) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('時給は10,000円以下で入力してください')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final callable = _functions.httpsCallable('updateStaffHourlyWage');
      
      final result = await callable.call({
        'staffId': widget.staffId,
        'hourlyWage': hourlyWage,
      });

      final response = result.data as Map<String, dynamic>;
      
      if (response['success'] == true) {
        setState(() {
          widget.staffData['hourlyWage'] = hourlyWage;
          _isEditing = false;
          _isLoading = false;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(response['message'] ?? '時給を更新しました'),
            backgroundColor: Colors.green,
          ),
        );
      } else {
        throw Exception(response['error'] ?? '更新に失敗しました');
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('更新に失敗しました: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }


  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isLoading,
      child: Stack(
        children: [
          Scaffold(
      appBar: AppBar(
        title: Text(widget.staffData['fullName'] ?? 'スタッフ詳細'),
        backgroundColor: Colors.blue[600],
        foregroundColor: Colors.white,
        actions: [],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 基本情報カード
            Card(
              elevation: 4,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 30,
                          backgroundColor: Colors.blue[100],
                          child: Icon(
                            Icons.person,
                            size: 30,
                            color: Colors.blue[600],
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.staffData['fullName'] ?? '名前不明',
                                style: const TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'ID: ${widget.staffId}',
                                style: TextStyle(
                                  color: Colors.grey[600],
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _buildInfoRow('Email', widget.staffData['email'] ?? '未設定'),
                    _buildInfoRow('電話番号', widget.staffData['phone'] ?? '未設定'),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 16),
            
            // 時給設定カード
            Card(
              elevation: 4,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          '時給設定',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        IconButton(
                          onPressed: _isLoading ? null : () {
                            setState(() {
                              _isEditing = !_isEditing;
                              if (!_isEditing) {
                                _hourlyWageController.text = widget.staffData['hourlyWage']?.toString() ?? '';
                              }
                            });
                          },
                          icon: Icon(_isEditing ? Icons.close : Icons.edit),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (_isEditing)
                      Column(
                        children: [
                          TextField(
                            controller: _hourlyWageController,
                            readOnly: _isLoading,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: '時給（円）',
                              border: OutlineInputBorder(),
                              prefixText: '¥',
                            ),
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: ElevatedButton(
                                  onPressed: _isLoading ? null : _updateHourlyWage,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.green,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(vertical: 12),
                                  ),
                                  child: const Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.save),
                                      SizedBox(width: 8),
                                      Text('保存'),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: _isLoading ? null : () {
                                    setState(() {
                                      _isEditing = false;
                                      _hourlyWageController.text = widget.staffData['hourlyWage']?.toString() ?? '';
                                    });
                                  },
                                  icon: const Icon(Icons.cancel),
                                  label: const Text('キャンセル'),
                                  style: OutlinedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(vertical: 12),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      )
                    else
                      Text(
                        '¥${widget.staffData['hourlyWage'] ?? '未設定'}',
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: Colors.blue,
                        ),
                      ),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 16),
            
            // 銀行口座情報カード
            Card(
              elevation: 4,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          '銀行口座情報',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        IconButton(
                          onPressed: _isLoading ? null : () {
                            setState(() {
                              _isEditingBankInfo = !_isEditingBankInfo;
                              if (!_isEditingBankInfo) {
                                // キャンセル時に元の値に戻す
                                final bankInfo = widget.staffData['bankInfo'] as Map<String, dynamic>?;
                                if (bankInfo != null) {
                                  _bankNameController.text = bankInfo['bankName']?.toString() ?? '';
                                  _branchNameController.text = bankInfo['branchName']?.toString() ?? '';
                                  _accountNumberController.text = bankInfo['accountNumber']?.toString() ?? '';
                                  _accountHolderController.text = bankInfo['accountHolder']?.toString() ?? '';
                                  _accountType = bankInfo['accountType']?.toString() ?? '普通';
                                }
                              }
                            });
                          },
                          icon: Icon(_isEditingBankInfo ? Icons.close : Icons.edit),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (_isEditingBankInfo)
                      Column(
                        children: [
                          TextField(
                            controller: _bankNameController,
                            readOnly: _isLoading,
                            decoration: const InputDecoration(
                              labelText: '銀行名',
                              border: OutlineInputBorder(),
                              hintText: '例: ○○銀行',
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _branchNameController,
                            readOnly: _isLoading,
                            decoration: const InputDecoration(
                              labelText: '支店名',
                              border: OutlineInputBorder(),
                              hintText: '例: ○○支店',
                            ),
                          ),
                          const SizedBox(height: 12),
                          DropdownButtonFormField<String>(
                            value: _accountType,
                            decoration: const InputDecoration(
                              labelText: '口座種別',
                              border: OutlineInputBorder(),
                            ),
                            items: const [
                              DropdownMenuItem(value: '普通', child: Text('普通')),
                              DropdownMenuItem(value: '当座', child: Text('当座')),
                            ],
                            onChanged: _isLoading
                                ? null
                                : (value) {
                                    setState(() {
                                      _accountType = value ?? '普通';
                                    });
                                  },
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _accountNumberController,
                            readOnly: _isLoading,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: '口座番号',
                              border: OutlineInputBorder(),
                              hintText: '7桁の数字',
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _accountHolderController,
                            readOnly: _isLoading,
                            decoration: const InputDecoration(
                              labelText: '口座名義（カタカナ）',
                              border: OutlineInputBorder(),
                              hintText: '例: ヤマダタロウ',
                            ),
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: ElevatedButton(
                                  onPressed: _isLoading ? null : _updateBankInfo,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.green,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(vertical: 12),
                                  ),
                                  child: const Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.save),
                                      SizedBox(width: 8),
                                      Text('保存'),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: _isLoading ? null : () {
                                    setState(() {
                                      _isEditingBankInfo = false;
                                      final bankInfo = widget.staffData['bankInfo'] as Map<String, dynamic>?;
                                      if (bankInfo != null) {
                                        _bankNameController.text = bankInfo['bankName']?.toString() ?? '';
                                        _branchNameController.text = bankInfo['branchName']?.toString() ?? '';
                                        _accountNumberController.text = bankInfo['accountNumber']?.toString() ?? '';
                                        _accountHolderController.text = bankInfo['accountHolder']?.toString() ?? '';
                                        _accountType = bankInfo['accountType']?.toString() ?? '普通';
                                      }
                                    });
                                  },
                                  icon: const Icon(Icons.cancel),
                                  label: const Text('キャンセル'),
                                  style: OutlinedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(vertical: 12),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      )
                    else
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildBankInfoRow('銀行名', _bankNameController.text.isEmpty ? '未設定' : _bankNameController.text),
                          const SizedBox(height: 8),
                          _buildBankInfoRow('支店名', _branchNameController.text.isEmpty ? '未設定' : _branchNameController.text),
                          const SizedBox(height: 8),
                          _buildBankInfoRow('口座種別', _accountType),
                          const SizedBox(height: 8),
                          _buildBankInfoRow('口座番号', _accountNumberController.text.isEmpty ? '未設定' : _accountNumberController.text),
                          const SizedBox(height: 8),
                          _buildBankInfoRow('口座名義', _accountHolderController.text.isEmpty ? '未設定' : _accountHolderController.text),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
          ),
          if (_isLoading)
            Positioned.fill(
              child: AbsorbPointer(
                child: ColoredBox(
                  color: Colors.black.withValues(alpha: 0.35),
                  child: const Center(
                    child: CircularProgressIndicator(),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildBankInfoRow(String label, String value) {
    return Row(
      children: [
        SizedBox(
          width: 100,
          child: Text(
            label,
            style: const TextStyle(
              fontWeight: FontWeight.w500,
              color: Colors.grey,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontSize: 16),
          ),
        ),
      ],
    );
  }

  Widget _buildInfoRow(String label, String value, {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              '$label:',
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                color: valueColor ?? Colors.black87,
                fontWeight: valueColor != null ? FontWeight.w500 : FontWeight.normal,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
