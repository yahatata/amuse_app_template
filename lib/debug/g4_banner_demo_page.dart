/// DEBUG ONLY: G4 Terminalモードバナー カラー案・レイアウト確認デモ
/// - このファイルは設計確認用の一時ファイルです
/// - 色・文言の合意が取れたら削除してください
/// - adminHomePage.dart の AppBar に一時ボタンあり（ADMINモード時のみ表示）
library;

import 'package:flutter/material.dart';

// ─────────────────────────────────────────────
// バナーのカラー案データ
// ─────────────────────────────────────────────

class _BannerColorOption {
  final String label;
  final String description;
  final Color bannerBg;
  final Color bannerFg;
  final Color switchBtnBg;
  final Color switchBtnFg;

  const _BannerColorOption({
    required this.label,
    required this.description,
    required this.bannerBg,
    required this.bannerFg,
    required this.switchBtnBg,
    required this.switchBtnFg,
  });
}

const _colorOptions = <_BannerColorOption>[
  _BannerColorOption(
    label: '案A: ティール（現Terminalボタン色と統一）',
    description: '現在の「Terminalモード中」ボタンと同じ色系。一貫性があり、見慣れやすい。',
    bannerBg: Color(0xFF00796B), // teal[700]
    bannerFg: Colors.white,
    switchBtnBg: Colors.white,
    switchBtnFg: Color(0xFF00796B),
  ),
  _BannerColorOption(
    label: '案B: インジゴ（Admin色に近い落ち着き）',
    description: 'Adminモードのボタン（濃い紫）に近い色。「Admin端末が使っている」感が出る。',
    bannerBg: Color(0xFF283593), // indigo[900]
    bannerFg: Colors.white,
    switchBtnBg: Colors.white,
    switchBtnFg: Color(0xFF283593),
  ),
  _BannerColorOption(
    label: '案C: アンバー（一目で分かる警告色）',
    description: '黄色系の目立つ色。「今は普通とは違うモードです」と一番分かりやすく伝わる。',
    bannerBg: Color(0xFFF9A825), // amber[800]
    bannerFg: Color(0xFF212121), // near-black
    switchBtnBg: Color(0xFF212121),
    switchBtnFg: Color(0xFFF9A825),
  ),
  _BannerColorOption(
    label: '案D: ダークグレー（目立ちすぎない）',
    description: '落ち着いた黒寄りのグレー。操作の邪魔にならず、でも存在感は十分。',
    bannerBg: Color(0xFF37474F), // blueGrey[800]
    bannerFg: Colors.white,
    switchBtnBg: Colors.white,
    switchBtnFg: Color(0xFF37474F),
  ),
];

// ─────────────────────────────────────────────
// デモページ本体
// ─────────────────────────────────────────────

class G4BannerDemoPage extends StatelessWidget {
  const G4BannerDemoPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[200],
      appBar: AppBar(
        title: const Text('[DEBUG] G4 バナーカラー案'),
        backgroundColor: Colors.grey[700],
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
        children: [
          // 説明
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('確認ポイント', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                SizedBox(height: 8),
                Text(
                  '• バナー左側：「AdminデバイスTerminalモード中」\n'
                  '• バナー右側：モード切り替えボタン\n'
                  '• 上段 = HOMEにいる時（ボタン有効）\n'
                  '• 下段 = サブページにいる時（ボタン無効・グレー）',
                  style: TextStyle(fontSize: 13, color: Colors.black87, height: 1.6),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // 各カラー案
          ..._colorOptions.map((opt) => _buildOptionSection(opt)),
        ],
      ),
    );
  }

  Widget _buildOptionSection(_BannerColorOption opt) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ラベル
          Text(
            opt.label,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            opt.description,
            style: TextStyle(fontSize: 12, color: Colors.grey[700]),
          ),
          const SizedBox(height: 12),

          // HOME画面プレビュー（ボタン有効）
          _buildPreviewFrame(
            headerLabel: 'HOME画面にいる時（ボタン有効）',
            opt: opt,
            isButtonEnabled: true,
          ),
          const SizedBox(height: 10),

          // サブページプレビュー（ボタン無効）
          _buildPreviewFrame(
            headerLabel: 'HOME以外のページにいる時（ボタン無効）',
            opt: opt,
            isButtonEnabled: false,
          ),
        ],
      ),
    );
  }

  Widget _buildPreviewFrame({
    required String headerLabel,
    required _BannerColorOption opt,
    required bool isButtonEnabled,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 4, left: 2),
          child: Text(
            headerLabel,
            style: TextStyle(fontSize: 11, color: Colors.grey[600]),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.grey[400]!),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.08),
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ① バナー（提案の対象）
              _buildBannerRow(opt: opt, isButtonEnabled: isButtonEnabled),

              // ② AppBar（現状と同じ）
              _buildMockAppBar(),

              // ③ コンテンツ（プレースホルダー）
              _buildMockContent(),
            ],
          ),
        ),
      ],
    );
  }

  // バナー本体
  Widget _buildBannerRow({
    required _BannerColorOption opt,
    required bool isButtonEnabled,
  }) {
    return Container(
      height: 48,
      color: opt.bannerBg,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          // 左：テキスト
          Expanded(
            child: Text(
              'AdminデバイスTerminalモード中',
              style: TextStyle(
                color: opt.bannerFg,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),

          // 右：切り替えボタン（有効 or 無効）
          _buildSwitchButton(
            opt: opt,
            isEnabled: isButtonEnabled,
          ),
        ],
      ),
    );
  }

  Widget _buildSwitchButton({
    required _BannerColorOption opt,
    required bool isEnabled,
  }) {
    if (isEnabled) {
      // 有効状態：通常のボタン
      return TextButton.icon(
        onPressed: () {},
        icon: Icon(Icons.switch_left, color: opt.switchBtnFg, size: 18),
        label: Text(
          'Terminalモード中',
          style: TextStyle(color: opt.switchBtnFg, fontSize: 12),
        ),
        style: TextButton.styleFrom(
          backgroundColor: opt.switchBtnBg,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          minimumSize: Size.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      );
    } else {
      // 無効状態：グレーアウト
      return TextButton.icon(
        onPressed: null, // disabled
        icon: const Icon(Icons.switch_left, color: Colors.grey, size: 18),
        label: const Text(
          'Terminalモード中',
          style: TextStyle(color: Colors.grey, fontSize: 12),
        ),
        style: TextButton.styleFrom(
          backgroundColor: Colors.grey[300],
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          minimumSize: Size.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          disabledForegroundColor: Colors.grey,
          disabledBackgroundColor: Colors.grey[300],
        ),
      );
    }
  }

  // モックAppBar
  Widget _buildMockAppBar() {
    return Container(
      height: 50,
      color: Colors.blueGrey[700],
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          const Text(
            'Terminal',
            style: TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.w500,
            ),
          ),
          const Spacer(),
          const Icon(Icons.home, color: Colors.white70, size: 20),
          const SizedBox(width: 8),
        ],
      ),
    );
  }

  // モックコンテンツ
  Widget _buildMockContent() {
    return Container(
      height: 80,
      color: Colors.grey[100],
      child: const Center(
        child: Text(
          'ページのコンテンツ',
          style: TextStyle(color: Colors.grey, fontSize: 13),
        ),
      ),
    );
  }
}
