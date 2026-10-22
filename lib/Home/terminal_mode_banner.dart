import 'package:amuse_app_template/Home/terminal_mode_state.dart';
import 'package:flutter/material.dart';

/// Admin デバイスが Terminal モード中のときのみ全画面最上部に表示するバナー。
///
/// - 色  : 案A ティール (#00796B / teal[700])
/// - 高さ : 48px（ステータスバー領域は呼び出し元が別途確保する）
/// - 左  : "AdminデバイスTerminalモード中" テキスト
/// - 右  : Admin モードに戻すボタン
///         ・HOME 画面（AdminHomePage が最前面）→ 有効（タップで切り替え）
///         ・HOME 以外のサブページ             → グレーアウト（タップでダイアログ）
///
/// 使い方: MaterialApp.builder の中から [TerminalModeBanner] を呼ぶだけ。
/// [isOnHomeScreenNotifier] と [terminalModeNotifier] を自動購読する。
class TerminalModeBanner extends StatelessWidget {
  const TerminalModeBanner({super.key});

  // ─────────────────────────── カラー定数 ───────────────────────────
  static const Color _bannerBg = Color(0xFF00796B); // teal[700]
  static const Color _bannerFg = Colors.white;
  static const Color _btnActiveBg = Colors.white;
  static const Color _btnActiveFg = Color(0xFF00796B);
  static const Color _btnDisabledBg = Color(0xFFB0BEC5); // blueGrey[200]
  static const Color _btnDisabledFg = Color(0xFF78909C); // blueGrey[400]

  // ──────────────────────────── 高さ定数 ────────────────────────────
  static const double bannerContentHeight = 48.0;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: isOnHomeScreenNotifier,
      builder: (context, isOnHome, _) {
        return Container(
          height: bannerContentHeight,
          color: _bannerBg,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              // 左：モード表示テキスト（decoration:none で下線なし）
              const Expanded(
                child: Text(
                  'AdminデバイスTerminalモード中',
                  style: TextStyle(
                    color: _bannerFg,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    decoration: TextDecoration.none, // 下線なし
                    decorationColor: Colors.transparent,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),

              // 右：Admin に戻すボタン
              _buildSwitchButton(context, isOnHome: isOnHome),
            ],
          ),
        );
      },
    );
  }

  // ── AdminHomePage AppBar ボタンに合わせたスタイル定数 ──
  // radius: 8、padding: horizontal 12 / vertical 4（AppBar と同形状・色違い）
  static const EdgeInsets _btnPadding =
      EdgeInsets.symmetric(horizontal: 12, vertical: 4);
  static const RoundedRectangleBorder _btnShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.all(Radius.circular(8)),
  );

  Widget _buildSwitchButton(BuildContext context, {required bool isOnHome}) {
    if (isOnHome) {
      // ── 有効状態（HOME 画面） ──
      return TextButton.icon(
        onPressed: () => terminalModeNotifier.value = false,
        icon: const Icon(Icons.switch_left),
        label: const Text('Terminalモード中'),
        style: TextButton.styleFrom(
          backgroundColor: _btnActiveBg,
          foregroundColor: _btnActiveFg,
          shape: _btnShape,
          padding: _btnPadding,
        ),
      );
    } else {
      // ── 無効状態（サブページ）：グレーアウト＋ダイアログ ──
      return TextButton.icon(
        onPressed: () => _showCannotSwitchDialog(context),
        icon: const Icon(Icons.switch_left),
        label: const Text('Terminalモード中'),
        style: TextButton.styleFrom(
          backgroundColor: _btnDisabledBg,
          foregroundColor: _btnDisabledFg,
          shape: _btnShape,
          padding: _btnPadding,
        ),
      );
    }
  }

  void _showCannotSwitchDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('モード切り替えできません'),
        content: const Text(
          'HOME画面からしかモード切り替えできません。\n'
          'HOMEに戻ってから切り替えボタンを押してください。',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}
