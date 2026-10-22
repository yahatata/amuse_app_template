import 'package:flutter/material.dart';
import 'package:amuse_app_template/StaffDate/shiftHomePage.dart';
import 'package:amuse_app_template/StaffDate/shiftDraftPage.dart';

/// シフトメニュー画面
class ShiftMenuPage extends StatelessWidget {
  const ShiftMenuPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('シフト'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            // トーナメント作成メニュー（4ボタン）と同じボタン高さになるよう計算
            // btnH = (availH - padding上下48 - gap×3相当48) / 4
            final btnH = (constraints.maxHeight - 48 - 48) / 4;
            return Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // シフトカレンダー
                  SizedBox(
                    height: btnH,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const ShiftHomePage(),
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey[100],
                        foregroundColor: Colors.grey[800],
                        elevation: 2,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                          side: BorderSide(color: Colors.grey[300]!, width: 1),
                        ),
                      ),
                      child: const Text(
                        'シフトカレンダー',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w500),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // シフトドラフト
                  SizedBox(
                    height: btnH,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const ShiftDraftPage(),
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey[100],
                        foregroundColor: Colors.grey[800],
                        elevation: 2,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                          side: BorderSide(color: Colors.grey[300]!, width: 1),
                        ),
                      ),
                      child: const Text(
                        'シフトドラフト',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w500),
                      ),
                    ),
                  ),
                  // 残り空間は自然な余白（ボタンは上詰め）
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
