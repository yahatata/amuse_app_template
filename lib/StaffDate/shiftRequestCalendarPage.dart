import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:intl/intl.dart';

import '../globalConstant.dart';

class ShiftRequestCalendarPage extends StatefulWidget {
  const ShiftRequestCalendarPage({super.key});

  @override
  State<ShiftRequestCalendarPage> createState() => _ShiftRequestCalendarPageState();
}

class _ShiftRequestCalendarPageState extends State<ShiftRequestCalendarPage> {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  
  DateTime _selectedDate = DateTime.now();
  List<Map<String, dynamic>> _allStaffs = [];
  Set<String> _selectedStaffIds = {};
  String? _startTime;
  String? _endTime;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    // プランチェック: コミュニケーションプランの場合は機能を無効化
    if (!GlobalConstants.isShiftRequestEnabled) {
      return;
    }
    _loadStaffs();
  }

  Future<void> _loadStaffs() async {
    try {
      final snapshot = await _firestore.collection('staffs').get();
      setState(() {
        _allStaffs = snapshot.docs.map((doc) {
          final data = doc.data();
          return {
            'id': doc.id,
            'fullName': data['fullName'] ?? '不明',
            'fullNameKana': data['fullNameKana'] ?? '',
          };
        }).toList();
        
        // かな順でソート
        _allStaffs.sort((a, b) => (a['fullNameKana'] as String).compareTo(b['fullNameKana'] as String));
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('スタッフ一覧の取得に失敗しました: $e')),
        );
      }
    }
  }

  Future<void> _selectDate(BuildContext context) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null && picked != _selectedDate) {
      setState(() {
        _selectedDate = picked;
      });
    }
  }

  Future<void> _selectTime(BuildContext context, bool isStart) async {
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: isStart 
        ? (_startTime != null 
            ? TimeOfDay(
                hour: int.parse(_startTime!.split(':')[0]),
                minute: int.parse(_startTime!.split(':')[1]),
              )
            : TimeOfDay.now())
        : (_endTime != null
            ? TimeOfDay(
                hour: int.parse(_endTime!.split(':')[0]),
                minute: int.parse(_endTime!.split(':')[1]),
              )
            : TimeOfDay.now()),
    );
    if (picked != null) {
      final timeString = '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
      setState(() {
        if (isStart) {
          _startTime = timeString;
        } else {
          _endTime = timeString;
        }
      });
    }
  }

  Future<void> _sendRequests() async {
    if (_selectedStaffIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('スタッフを選択してください')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final dateString = DateFormat('yyyy-MM-dd').format(_selectedDate);
      
      final requests = _selectedStaffIds.map((staffId) {
        return {
          'staffId': staffId,
          'date': dateString,
          if (_startTime != null) 'start': _startTime,
          if (_endTime != null) 'end': _endTime,
        };
      }).toList();

      final callable = _functions.httpsCallable('createShiftRequest');
      final result = await callable.call({'requests': requests});

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(result.data['message'] ?? '要請を送信しました'),
              backgroundColor: Colors.green,
            ),
          );
        }

        // フォームをリセット
        setState(() {
          _selectedStaffIds.clear();
          _startTime = null;
          _endTime = null;
        });
      } else {
        throw Exception(result.data['error'] ?? '要請の送信に失敗しました');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('要請の送信に失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
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

  @override
  Widget build(BuildContext context) {
    // プランチェック: コミュニケーションプランの場合は機能を無効化
    if (!GlobalConstants.isShiftRequestEnabled) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('希望シフト要請'),
          backgroundColor: Colors.deepPurple,
          foregroundColor: Colors.white,
        ),
        body: const Center(
          child: Text(
            'この機能はライトプラン以上で利用可能です。',
            style: TextStyle(fontSize: 16, color: Colors.grey),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('希望シフト要請'),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 日付選択
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            '希望シフト日付',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          InkWell(
                            onTap: () => _selectDate(context),
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                border: Border.all(color: Colors.grey),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    DateFormat('yyyy年MM月dd日').format(_selectedDate),
                                    style: const TextStyle(fontSize: 16),
                                  ),
                                  const Icon(Icons.calendar_today),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  
                  const SizedBox(height: 16),
                  
                  // 時間選択（任意）
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            '希望シフト時間（任意）',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: InkWell(
                                  onTap: () => _selectTime(context, true),
                                  child: Container(
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      border: Border.all(color: Colors.grey),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(
                                          _startTime ?? '開始時刻',
                                          style: TextStyle(
                                            fontSize: 16,
                                            color: _startTime != null ? Colors.black : Colors.grey,
                                          ),
                                        ),
                                        const Icon(Icons.access_time),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 16),
                              const Text('〜', style: TextStyle(fontSize: 16)),
                              const SizedBox(width: 16),
                              Expanded(
                                child: InkWell(
                                  onTap: () => _selectTime(context, false),
                                  child: Container(
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      border: Border.all(color: Colors.grey),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(
                                          _endTime ?? '終了時刻',
                                          style: TextStyle(
                                            fontSize: 16,
                                            color: _endTime != null ? Colors.black : Colors.grey,
                                          ),
                                        ),
                                        const Icon(Icons.access_time),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          if (_startTime != null || _endTime != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: TextButton(
                                onPressed: () {
                                  setState(() {
                                    _startTime = null;
                                    _endTime = null;
                                  });
                                },
                                child: const Text('時間をクリア'),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  
                  const SizedBox(height: 16),
                  
                  // スタッフ選択
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                '送信先スタッフ',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              if (_allStaffs.isNotEmpty)
                                TextButton(
                                  onPressed: () {
                                    setState(() {
                                      if (_selectedStaffIds.length == _allStaffs.length) {
                                        _selectedStaffIds.clear();
                                      } else {
                                        _selectedStaffIds = _allStaffs.map((s) => s['id'] as String).toSet();
                                      }
                                    });
                                  },
                                  child: Text(
                                    _selectedStaffIds.length == _allStaffs.length
                                        ? '全て解除'
                                        : '全て選択',
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Container(
                            constraints: const BoxConstraints(maxHeight: 300),
                            child: ListView.builder(
                              shrinkWrap: true,
                              itemCount: _allStaffs.length,
                              itemBuilder: (context, index) {
                                final staff = _allStaffs[index];
                                final staffId = staff['id'] as String;
                                final isSelected = _selectedStaffIds.contains(staffId);
                                
                                return CheckboxListTile(
                                  title: Text(staff['fullName'] as String),
                                  subtitle: Text(staff['fullNameKana'] as String),
                                  value: isSelected,
                                  onChanged: (value) {
                                    setState(() {
                                      if (value == true) {
                                        _selectedStaffIds.add(staffId);
                                      } else {
                                        _selectedStaffIds.remove(staffId);
                                      }
                                    });
                                  },
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  
                  const SizedBox(height: 24),
                  
                  // 送信ボタン
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _selectedStaffIds.isEmpty ? null : _sendRequests,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.deepPurple,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: const Text(
                        '要請を送信',
                        style: TextStyle(fontSize: 18),
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

