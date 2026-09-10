/// DEBUG ONLY: ホーム画面デザイン提案デモページ
/// - このファイルは設計確認用の一時ファイルです
/// - 色・アイコン・レイアウトの合意が取れたら削除してください
/// - terminalHomePage.dart の AppBar に一時ボタンあり
library;

import 'dart:math' as math;
import 'package:flutter/material.dart';

// ─────────────────────────────────────────────
// データ構造
// ─────────────────────────────────────────────
class _DemoBtn {
  final String label;
  final IconData icon;
  const _DemoBtn(this.label, this.icon);
}

class _DemoCategory {
  final String name;
  final Color bg;
  final Color fg;
  final List<_DemoBtn> buttons;
  const _DemoCategory({
    required this.name,
    required this.bg,
    required this.fg,
    required this.buttons,
  });
}

// ─────────────────────────────────────────────
// データ定義
// ─────────────────────────────────────────────

const _terminalCategories = <_DemoCategory>[
  // [0] 営業
  _DemoCategory(
    name: '⚙️  営業',
    bg: Color(0xFFE3F2FD),
    fg: Color(0xFF1565C0),
    buttons: [
      _DemoBtn('営業管理', Icons.store),
      _DemoBtn('勤怠打刻', Icons.schedule),
      _DemoBtn('メニュー追加', Icons.restaurant_menu),
    ],
  ),
  // [1] ユーザー
  _DemoCategory(
    name: '👤  ユーザー',
    bg: Color(0xFFF3E5F5),
    fg: Color(0xFF6A1B9A),
    buttons: [
      _DemoBtn('ユーザー作成', Icons.person_add),
      _DemoBtn('ユーザーログイン', Icons.login),
      _DemoBtn('入店中ユーザー一覧', Icons.people),
    ],
  ),
  // [2] 会計
  _DemoCategory(
    name: '💴  会計',
    bg: Color(0xFFFFF8E1),
    fg: Color(0xFFE65100),
    buttons: [
      _DemoBtn('会計管理', Icons.receipt_long),
      _DemoBtn('要対応の会計', Icons.warning_amber_rounded),
      _DemoBtn('会計後操作', Icons.post_add),
    ],
  ),
  // [3] 注文
  _DemoCategory(
    name: '🍽️  注文',
    bg: Color(0xFFFBE9E7),
    fg: Color(0xFFB71C1C),
    buttons: [
      _DemoBtn('注文画面', Icons.point_of_sale),
      _DemoBtn('注文管理', Icons.receipt),
    ],
  ),
  // [4] Tournament
  _DemoCategory(
    name: '🏆  Tournament',
    bg: Color(0xFFE8F5E9),
    fg: Color(0xFF1B5E20),
    buttons: [
      _DemoBtn('Tournament作成', Icons.emoji_events),
      _DemoBtn('Tournament Home', Icons.sports_esports),
      _DemoBtn('卓ページ', Icons.table_restaurant),
      _DemoBtn('ブラインドタイマー', Icons.timer),
    ],
  ),
  // [5] SideGame
  _DemoCategory(
    name: '🎲  SideGame',
    bg: Color(0xFFE0F2F1),
    fg: Color(0xFF004D40),
    buttons: [
      _DemoBtn('サイドゲーム', Icons.casino),
    ],
  ),
];

const _adminCategories = <_DemoCategory>[
  // [0] シフト管理
  _DemoCategory(
    name: '📅  シフト管理',
    bg: Color(0xFFE3F2FD),
    fg: Color(0xFF1565C0),
    buttons: [
      _DemoBtn('シフト', Icons.calendar_month),
      _DemoBtn('営業日', Icons.business_center),
    ],
  ),
  // [1] 勤怠
  _DemoCategory(
    name: '⏰  勤怠',
    bg: Color(0xFFF3E5F5),
    fg: Color(0xFF6A1B9A),
    buttons: [
      _DemoBtn('全スタッフ勤怠', Icons.people),
      _DemoBtn('勤怠修正申請', Icons.edit_note),
    ],
  ),
  // [2] スタッフ管理
  _DemoCategory(
    name: '👥  スタッフ管理',
    bg: Color(0xFFE8F5E9),
    fg: Color(0xFF1B5E20),
    buttons: [
      _DemoBtn('スタッフ一覧', Icons.badge),
      _DemoBtn('給与計算', Icons.payments),
    ],
  ),
  // [3] 設定・分析
  _DemoCategory(
    name: '🔧  設定・分析',
    bg: Color(0xFFEFEBE9),
    fg: Color(0xFF3E2723),
    buttons: [
      _DemoBtn('デバイス管理', Icons.devices),
      _DemoBtn('詳細設定', Icons.settings),
      _DemoBtn('売上ダッシュボード', Icons.bar_chart),
    ],
  ),
];

// ─────────────────────────────────────────────
// 行ペア定義（インデックス）
//   Terminal: 3行, Admin: 2行
//   各行に2カテゴリ、最大6ボタン
// ─────────────────────────────────────────────
const _terminalPairs = <(int, int)>[
  (0, 1), // Row1: 営業(3) + ユーザー(3) = 6ボタン
  (2, 3), // Row2: 会計(3) + 注文(2)    = 5ボタン
  (4, 5), // Row3: Tournament(4) + SideGame(1) = 5ボタン
];

const _adminPairs = <(int, int)>[
  (0, 1), // Row1: シフト管理(2) + 勤怠(2) = 4ボタン
  (2, 3), // Row2: スタッフ管理(2) + 設定・分析(3) = 5ボタン
];

// ─────────────────────────────────────────────
// デモページ本体
// ─────────────────────────────────────────────

class HomeDesignDemoPage extends StatefulWidget {
  const HomeDesignDemoPage({super.key});

  @override
  State<HomeDesignDemoPage> createState() => _HomeDesignDemoPageState();
}

class _HomeDesignDemoPageState extends State<HomeDesignDemoPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;
  bool _fitMode = true;
  bool _showEmptyCat = false; // SideGame + 設定・分析 を非表示シミュレーション
  bool _compensateTabBar = false; // デモの余分なTabBar分を補正して実ページ相当で確認

  // ─── レイアウト定数（実ページでも同じ値を採用予定） ───────────────
  static const _hPad = 14.0; // 左右パディング
  static const _vPad = 10.0; // 上下パディング
  static const _btnGap = 10.0; // カテゴリ内ボタン間隔
  static const _catDividerGap = 22.0; // カテゴリ間隔（行内の2カテゴリを区切る）
  static const _rowGap = 16.0; // 行間（ペア行同士の間隔）
  static const _headerH = 18.0; // カテゴリヘッダー高さ
  static const _headerGap = 6.0; // ヘッダー→ボタン間隔
  // デモ専用定数
  static const _demoTabBarH = 48.0; // デモのTabBar（実ページには存在しない）
  static const _bannerH = 34.0; // 計算情報バナー高さ

  // ─── 幅計算: numSlots個のボタン ─────────────────────────────────────
  // スロット間ギャップ: (numSlots-2)個の_btnGap + 1個の_catDividerGap
  // Terminal: 6スロット → totalGap = 4*10 + 22 = 62
  // Admin   : 5スロット → totalGap = 3*10 + 22 = 52

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  // カテゴリ表示判定（デモ用シミュレーション）
  bool _catVisible(_DemoCategory cat) {
    if (!_showEmptyCat) return true;
    return !cat.name.contains('SideGame') && !cat.name.contains('設定');
  }

  // 可視ペアのリストを返す（両カテゴリが非表示の場合はその行を除外）
  List<(int, int)> _visiblePairs(
    List<_DemoCategory> cats,
    List<(int, int)> pairs,
  ) =>
      pairs
          .where((p) => _catVisible(cats[p.$1]) || _catVisible(cats[p.$2]))
          .toList();

  // ─── ボタン幅計算 ──────────────────────────────────────────────────
  // numSlots: Terminal=6, Admin=5
  double _calcBtnW(double layoutW, {int numSlots = 6}) {
    final totalGap = (numSlots - 2) * _btnGap + _catDividerGap;
    return (layoutW - _hPad * 2 - totalGap) / numSlots;
  }

  // ─── ボタン高さ計算（行数と利用可能高さから動的計算） ──────────────
  double _calcBtnH(double rawLayoutH, int numRows) {
    final layoutH = rawLayoutH.isFinite ? rawLayoutH : 580.0;
    final effectiveH = layoutH + (_compensateTabBar ? _demoTabBarH : 0.0);
    final bannerH = _fitMode ? _bannerH + 8.0 : 0.0;
    final fixed = _vPad * 2
        + bannerH
        + numRows * (_headerH + _headerGap)
        + (numRows - 1) * _rowGap;
    return math.max(48.0, (effectiveH - fixed) / numRows);
  }

  // ─── カテゴリセクション幅（ヘッダー幅の計算に使用） ──────────────
  double _sectionW(int numBtns, double btnW) =>
      numBtns * btnW + math.max(0, numBtns - 1) * _btnGap;

  // ─────────────────────────────────────────────────────────────────
  // build
  // ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: const Color(0xFF37474F),
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.close),
          tooltip: 'デモを閉じる',
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          '🎨 ホームデザインデモ',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
        ),
        centerTitle: false,
        actions: [
          _modeToggle(),
          const SizedBox(width: 6),
          _compensateToggle(),
          const SizedBox(width: 6),
          _emptySimToggle(),
          const SizedBox(width: 12),
        ],
        bottom: TabBar(
          controller: _tab,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white54,
          indicatorColor: Colors.amber,
          indicatorWeight: 3,
          tabs: const [
            Tab(icon: Icon(Icons.smartphone, size: 16), text: 'Terminal'),
            Tab(icon: Icon(Icons.admin_panel_settings, size: 16), text: 'Admin'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          _buildBody(_terminalCategories, _terminalPairs),
          // Admin: 5スロット幅 + 正方形上限 + 余白センタリング
          _buildBody(
            _adminCategories,
            _adminPairs,
            squareBtnCap: true,
            numSlots: 5,
          ),
        ],
      ),
    );
  }

  // ─── AppBar ウィジェット ──────────────────────────────────────────

  Widget _modeToggle() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: SegmentedButton<bool>(
          style: _segStyle(),
          segments: const [
            ButtonSegment(
              value: true,
              label: Text('1ページ収め', style: TextStyle(fontSize: 11)),
              icon: Icon(Icons.fit_screen, size: 14),
            ),
            ButtonSegment(
              value: false,
              label: Text('スクロール確認', style: TextStyle(fontSize: 11)),
              icon: Icon(Icons.swap_vert, size: 14),
            ),
          ],
          selected: {_fitMode},
          onSelectionChanged: (s) => setState(() => _fitMode = s.first),
        ),
      );

  Widget _compensateToggle() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: SegmentedButton<bool>(
          style: _segStyle(),
          segments: const [
            ButtonSegment(
              value: false,
              label: Text('デモ高さ', style: TextStyle(fontSize: 11)),
            ),
            ButtonSegment(
              value: true,
              label: Text('実ページ相当', style: TextStyle(fontSize: 11)),
              icon: Icon(Icons.phone_android, size: 14),
            ),
          ],
          selected: {_compensateTabBar},
          onSelectionChanged: (s) =>
              setState(() => _compensateTabBar = s.first),
        ),
      );

  Widget _emptySimToggle() => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'カテゴリ消去',
            style: TextStyle(
              fontSize: 10,
              color: _showEmptyCat ? Colors.amber : Colors.white54,
            ),
          ),
          Switch(
            value: _showEmptyCat,
            onChanged: (v) => setState(() => _showEmptyCat = v),
            activeColor: Colors.amber,
            inactiveThumbColor: Colors.white38,
            inactiveTrackColor: Colors.white12,
          ),
        ],
      );

  ButtonStyle _segStyle() => SegmentedButton.styleFrom(
        foregroundColor: Colors.white,
        selectedForegroundColor: const Color(0xFF37474F),
        selectedBackgroundColor: Colors.white,
        side: const BorderSide(color: Colors.white38),
        minimumSize: const Size(0, 32),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      );

  // ─────────────────────────────────────────────────────────────────
  // コンテンツ
  // ─────────────────────────────────────────────────────────────────

  Widget _buildBody(
    List<_DemoCategory> cats,
    List<(int, int)> pairs, {
    // true = Admin用: ボタン高さを正方形（btnW）で上限キャップし
    //        余った縦スペースを上下に均等分配してセンタリング
    bool squareBtnCap = false,
    // numSlots: Terminal=6スロット, Admin=5スロット
    int numSlots = 6,
  }) {
    final visible = _visiblePairs(cats, pairs);

    return LayoutBuilder(
      builder: (context, constraints) {
        final btnW = _calcBtnW(constraints.maxWidth, numSlots: numSlots);
        final rawBtnH = _calcBtnH(constraints.maxHeight, visible.length);

        // 案A: squareBtnCap=true のときは正方形（btnW）が上限
        //      それ以外は 1.4倍を上限（横長になりすぎ防止）
        final capH = squareBtnCap ? btnW : btnW * 1.4;
        final btnH = math.min(rawBtnH, capH);
        final isCapped = rawBtnH > capH;

        // キャップにより余った縦スペースを上下に均等配分してセンタリング
        final bannerH = _fitMode ? _bannerH + 8.0 : 0.0;
        final contentH = _vPad * 2
            + bannerH
            + visible.length * (_headerH + _headerGap + btnH)
            + (visible.length - 1) * _rowGap;
        final effectiveAvailH = constraints.maxHeight.isFinite
            ? constraints.maxHeight + (_compensateTabBar ? _demoTabBarH : 0.0)
            : contentH;
        final extraVPad = (isCapped && _fitMode)
            ? math.max(0.0, (effectiveAvailH - contentH) / 2)
            : 0.0;

        return SingleChildScrollView(
          physics: _fitMode
              ? const NeverScrollableScrollPhysics()
              : const AlwaysScrollableScrollPhysics(),
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              _hPad,
              _vPad + extraVPad, // 余剰スペースを上に加算
              _hPad,
              _vPad + extraVPad, // 余剰スペースを下に加算
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 計算情報バナー（フィットモード時のみ）
                if (_fitMode) ...[
                  _calcInfoBanner(
                    visible.length,
                    btnW,
                    btnH,
                    constraints.maxHeight,
                    isCapped: isCapped,
                    extraVPad: extraVPad,
                  ),
                  const SizedBox(height: 8),
                ],

                // ペア行
                for (int i = 0; i < visible.length; i++) ...[
                  if (i > 0) const SizedBox(height: _rowGap),
                  _buildPairRow(cats, visible[i], btnW, btnH),
                ],

                // カテゴリ消去メモ
                if (_showEmptyCat) ...[
                  const SizedBox(height: 12),
                  _emptyNote(visible.length),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  // ─── ペア行（2カテゴリ横並び） ──────────────────────────────────

  Widget _buildPairRow(
    List<_DemoCategory> allCats,
    (int, int) pair,
    double btnW,
    double btnH,
  ) {
    final cat1 = allCats[pair.$1];
    final cat2 = allCats[pair.$2];
    final show1 = _catVisible(cat1);
    final show2 = _catVisible(cat2);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // カテゴリ1
        if (show1) _buildCatSection(cat1, btnW, btnH),

        // カテゴリ間の仕切り
        if (show1 && show2)
          SizedBox(
            width: _catDividerGap,
            height: _headerH + _headerGap + btnH,
            child: Center(
              child: Container(
                width: 1,
                height: btnH * 0.7,
                color: Colors.grey.shade300,
              ),
            ),
          ),

        // カテゴリ2
        if (show2) _buildCatSection(cat2, btnW, btnH),
      ],
    );
  }

  // ─── カテゴリセクション（ヘッダー + ボタン行） ────────────────────

  Widget _buildCatSection(
    _DemoCategory cat,
    double btnW,
    double btnH,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // カテゴリヘッダー
        SizedBox(
          width: _sectionW(cat.buttons.length, btnW),
          height: _headerH,
          child: Row(
            children: [
              Container(
                width: 4,
                height: 14,
                decoration: BoxDecoration(
                  color: cat.fg,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  cat.name,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Colors.grey.shade600,
                    letterSpacing: 0.2,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: _headerGap),

        // ボタン行
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (int i = 0; i < cat.buttons.length; i++) ...[
              if (i > 0) const SizedBox(width: _btnGap),
              SizedBox(
                width: btnW,
                height: btnH,
                child: _buildButton(cat.buttons[i], cat, btnW, btnH),
              ),
            ],
          ],
        ),
      ],
    );
  }

  // ─── ボタン1個 ───────────────────────────────────────────────────

  Widget _buildButton(
    _DemoBtn btn,
    _DemoCategory cat,
    double btnW,
    double btnH,
  ) {
    final shorter = math.min(btnW, btnH);
    final iconSize = (shorter * 0.30).clamp(20.0, 38.0);
    final fontSize = (shorter * 0.115).clamp(10.0, 14.0);

    return Material(
      color: cat.bg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: Colors.grey.shade300),
      ),
      child: InkWell(
        customBorder: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        onTap: () => _snack(btn.label),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(btn.icon, color: cat.fg, size: iconSize),
              SizedBox(height: (shorter * 0.05).clamp(3.0, 8.0)),
              Text(
                btn.label,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: cat.fg,
                  fontSize: fontSize,
                  fontWeight: FontWeight.w600,
                  height: 1.2,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ─── 計算情報バナー ───────────────────────────────────────────────

  Widget _calcInfoBanner(
    int numRows,
    double btnW,
    double btnH,
    double rawH, {
    bool isCapped = false,
    double extraVPad = 0.0,
  }) {
    final effectiveH = (rawH.isFinite ? rawH : 580.0) +
        (_compensateTabBar ? _demoTabBarH : 0.0);
    final tag = _compensateTabBar ? '実ページ相当' : 'デモ';
    final capNote = isCapped
        ? '  ｜  🎨上下余白: ${extraVPad.toStringAsFixed(0)}pt'
        : '';
    return Container(
      height: _bannerH,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF37474F),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        children: [
          const Icon(Icons.fit_screen, color: Colors.white70, size: 14),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              '[$tag] 高さ: ${effectiveH.toStringAsFixed(0)}pt  ｜  '
              '$numRows行ペア  ｜  ボタン: ${btnW.toStringAsFixed(0)}×${btnH.toStringAsFixed(0)}pt$capNote',
              style: const TextStyle(color: Colors.white70, fontSize: 11),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            isCapped ? '🎨 余白デザイン' : (btnH < 72 ? '⚠️ 少し狭い' : '✅ 余裕あり'),
            style: TextStyle(
              color: isCapped
                  ? Colors.amber
                  : (btnH < 72 ? Colors.orange : Colors.greenAccent),
              fontSize: 11,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptyNote(int visibleRows) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.amber.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.amber.shade200),
      ),
      child: Row(
        children: [
          Icon(Icons.check_circle_outline, color: Colors.amber.shade700, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'SideGame と 設定・分析 を非表示 → 行ごと消え、スペースが残らない ✅\n'
              '（$visibleRows行に再計算されボタンが大きくなります）',
              style: const TextStyle(fontSize: 11, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }

  void _snack(String label) {
    ScaffoldMessenger.of(context).removeCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$label（デモ）'),
        duration: const Duration(milliseconds: 700),
        behavior: SnackBarBehavior.floating,
        width: 320,
      ),
    );
  }
}
