import 'package:flutter/material.dart';

/// CLN-B1: AlertDialog の title / actions / inset を除いた content 上限。
///
/// [context] は Dialog の内側ではなく、viewInsets が残っている
/// showDialog 配下（親 Stack 等）の BuildContext を渡す。
double sideGameAlertDialogContentMaxHeight(BuildContext context) {
  final media = MediaQuery.of(context);
  const reservedForChrome = 240.0;
  final available = media.size.height -
      media.viewInsets.bottom -
      media.padding.vertical -
      reservedForChrome;
  return available.clamp(96.0, 640.0);
}

/// Dialog 配下の [LayoutBuilder] 用。keyboard は Dialog が padding 済みなので
/// [constraints.maxHeight] を優先する。
double dialogBodyMaxHeightFromConstraints(
  BuildContext context,
  BoxConstraints constraints,
) {
  if (constraints.maxHeight.isFinite && constraints.maxHeight > 0) {
    return constraints.maxHeight;
  }
  return sideGameAlertDialogContentMaxHeight(context);
}

/// 親メニューなど、keyboard で viewport が縮んでも overflow しない Dialog body。
class KeyboardSafeDialogBody extends StatelessWidget {
  final double maxWidth;
  final Widget child;

  const KeyboardSafeDialogBody({
    super.key,
    required this.maxWidth,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: maxWidth,
            maxHeight: dialogBodyMaxHeightFromConstraints(context, constraints),
          ),
          child: SingleChildScrollView(child: child),
        );
      },
    );
  }
}

/// 内容が増えても / keyboard で usable height が減っても overflow しない content。
class SideGameDialogScrollableContent extends StatelessWidget {
  final double maxWidth;
  final Widget child;
  final double? maxHeight;

  const SideGameDialogScrollableContent({
    super.key,
    required this.maxWidth,
    required this.child,
    this.maxHeight,
  });

  @override
  Widget build(BuildContext context) {
    final height = maxHeight ?? sideGameAlertDialogContentMaxHeight(context);
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: maxWidth,
        maxHeight: height,
      ),
      child: SingleChildScrollView(
        child: child,
      ),
    );
  }
}
