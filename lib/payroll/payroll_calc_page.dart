// 給与計算画面（2タブ: 計算用 + 結果）
//
// 参照: 06_UI_SPEC §1, §2

import 'package:flutter/material.dart';
import 'widgets/calc_tab.dart';
import 'widgets/result_tab.dart';

class PayrollCalcPage extends StatefulWidget {
  const PayrollCalcPage({super.key});

  @override
  State<PayrollCalcPage> createState() => _PayrollCalcPageState();
}

class _PayrollCalcPageState extends State<PayrollCalcPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('給与計算'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: '計算'),
            Tab(text: '結果'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          CalcTab(tabController: _tabController),
          const ResultTab(),
        ],
      ),
    );
  }
}
