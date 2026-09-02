import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/Home/home_list_load_errors.dart';
import 'package:amuse_app_template/Home/staffDetailPage.dart';

class StaffListPage extends StatefulWidget {
  const StaffListPage({super.key});

  @override
  State<StaffListPage> createState() => _StaffListPageState();
}

class _StaffListPageState extends State<StaffListPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  bool _showRetired = false;
  int _reloadToken = 0;

  bool _isRetired(Map<String, dynamic> data) => data['status'] == 'retired';

  void _retry() {
    setState(() => _reloadToken++);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('スタッフ一覧'),
        backgroundColor: Colors.blue[600],
        foregroundColor: Colors.white,
        actions: [
          TextButton(
            onPressed: () {
              setState(() {
                _showRetired = !_showRetired;
              });
            },
            child: Text(
              _showRetired ? '在籍を表示' : '退職済みを表示',
              style: const TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
      body: StreamBuilder<QuerySnapshot>(
        key: ValueKey('staffs-$_reloadToken'),
        stream: _firestore.collection('staffs').snapshots(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting &&
              !snapshot.hasData) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      kHomeStaffListLoadFailedMessage,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: _retry,
                      child: const Text('再試行'),
                    ),
                  ],
                ),
              ),
            );
          }

          if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
            return const Center(
              child: Text('スタッフが見つかりません'),
            );
          }

          final staffList = snapshot.data!.docs.where((staff) {
            final data = staff.data() as Map<String, dynamic>;
            final retired = _isRetired(data);
            if (_showRetired) {
              return retired;
            }
            return !retired;
          }).toList();

          if (staffList.isEmpty) {
            return Center(
              child: Text(_showRetired ? '退職済みスタッフがいません' : '在籍スタッフがいません'),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: staffList.length,
            itemBuilder: (context, index) {
              final staff = staffList[index];
              final data = staff.data() as Map<String, dynamic>;
              final retired = _isRetired(data);

              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                elevation: 4,
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Colors.blue[100],
                    child: Icon(
                      Icons.person,
                      color: Colors.blue[600],
                    ),
                  ),
                  title: Row(
                    children: [
                      Expanded(
                        child: Text(
                          data['fullName'] ?? '名前不明',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      if (retired)
                        const Chip(
                          label: Text('退職済み'),
                          visualDensity: VisualDensity.compact,
                        ),
                    ],
                  ),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (data['email'] != null)
                        Text('Email: ${data['email']}'),
                      if (data['hourlyWage'] != null)
                        Text('時給: ¥${data['hourlyWage']}'),
                    ],
                  ),
                  trailing: const Icon(Icons.arrow_forward_ios),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => StaffDetailPage(
                          staffId: staff.id,
                          staffData: data,
                        ),
                      ),
                    );
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}
