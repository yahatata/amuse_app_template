import 'package:flutter/material.dart';
import 'package:amuse_app_template/StaffDate/businessDayEditPage.dart';
import 'package:amuse_app_template/StaffDate/shift_style_required_staff_settings_page.dart';

/// 営業日メニュー画面
class BusinessDayMenuPage extends StatelessWidget {
  const BusinessDayMenuPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('営業日'),
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
                  // 営業日編集
                  SizedBox(
                    height: btnH,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const BusinessDayEditPage(),
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
                        '営業日編集',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w500),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // 営業スタイル・必要人数設定
                  SizedBox(
                    height: btnH,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) =>
                                const ShiftStyleRequiredStaffSettingsPage(),
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
                        '営業スタイル・必要人数設定',
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
