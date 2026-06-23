import 'package:flutter/material.dart';
import 'package:amuse_app_template/StaffDate/shiftHomePage.dart';
import 'package:amuse_app_template/StaffDate/shiftDraftPage.dart';
import 'package:amuse_app_template/StaffDate/businessDayEditPage.dart';
import 'package:amuse_app_template/StaffDate/shift_style_required_staff_settings_page.dart';

/// シフトメニュー画面
class ShiftMenuPage extends StatelessWidget {
  const ShiftMenuPage({super.key});

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final buttonHeight = (screenHeight - kToolbarHeight - 48 - 48) / 4 - 12;

    return Scaffold(
      appBar: AppBar(
        title: const Text('シフト'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // シフトカレンダー
              SizedBox(
                height: buttonHeight,
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
                height: buttonHeight,
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
              const SizedBox(height: 16),
              
              // 営業日編集
              SizedBox(
                height: buttonHeight,
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
                height: buttonHeight,
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
            ],
          ),
        ),
      ),
    );
  }
}
