import 'package:flutter/material.dart';
import 'package:characters/characters.dart';

/// ページ用のセクション付きユーザーリストを構築
/// 
/// アルファベット（A-Z）→ 日本語（あ-ん）の順でソートし、
/// セクションヘッダー付きリストと左側インデックスを表示
Widget buildSectionedUserListPage({
  required List<Map<String, dynamic>> users,
  required String nameKey,
  required Widget Function(BuildContext, Map<String, dynamic>) itemBuilder,
  ScrollController? scrollController,
}) {
  if (users.isEmpty) {
    return const Center(child: Text('ユーザーがいません'));
  }

  // セクションごとにグループ化
  final sections = _groupBySection(users, nameKey);
  final sectionKeys = sections.keys.toList();
  
  // スクロールコントローラーを作成（未指定の場合）
  final controller = scrollController ?? ScrollController();
  
  return _SectionedUserListView(
    sections: sections,
    sectionKeys: sectionKeys,
    itemBuilder: itemBuilder,
    scrollController: controller,
  );
}

/// セクションごとにユーザーをグループ化
Map<String, List<Map<String, dynamic>>> _groupBySection(
  List<Map<String, dynamic>> users,
  String nameKey,
) {
  final sections = <String, List<Map<String, dynamic>>>{};
  
  for (final user in users) {
    final name = (user[nameKey] ?? '').toString();
    final sectionKey = _getSectionKey(name);
    sections.putIfAbsent(sectionKey, () => []).add(user);
  }
  
  // セクション内のユーザーを名前順にソート
  for (final key in sections.keys) {
    sections[key]!.sort((a, b) {
      final an = (a[nameKey] ?? '').toString();
      final bn = (b[nameKey] ?? '').toString();
      return an.compareTo(bn);
    });
  }
  
  return sections;
}

/// 名前からセクションキーを取得
String _getSectionKey(String name) {
  if (name.isEmpty) return 'その他';
  
  final firstChar = name.characters.first;
  final codeUnit = firstChar.codeUnits.first;
  
  // アルファベット（大文字・小文字）判定
  if ((codeUnit >= 65 && codeUnit <= 90) || (codeUnit >= 97 && codeUnit <= 122)) {
    return firstChar.toUpperCase();
  }
  
  // ひらがな判定（0x3040-0x309F）
  if (codeUnit >= 0x3040 && codeUnit <= 0x309F) {
    return firstChar;
  }
  
  // カタカナ判定（0x30A0-0x30FF）
  if (codeUnit >= 0x30A0 && codeUnit <= 0x30FF) {
    return firstChar;
  }
  
  // その他（漢字など）
  return 'その他';
}

/// セクションキーを比較（A-Z → あ-ん の順）
int _compareSectionKeys(String a, String b) {
  // その他セクションは最後
  if (a == 'その他' && b != 'その他') return 1;
  if (a != 'その他' && b == 'その他') return -1;
  if (a == 'その他' && b == 'その他') return 0;
  
  // アルファベット判定
  final aIsAlpha = a.length == 1 && 
      ((a.codeUnitAt(0) >= 65 && a.codeUnitAt(0) <= 90) ||
       (a.codeUnitAt(0) >= 97 && a.codeUnitAt(0) <= 122));
  final bIsAlpha = b.length == 1 && 
      ((b.codeUnitAt(0) >= 65 && b.codeUnitAt(0) <= 90) ||
       (b.codeUnitAt(0) >= 97 && b.codeUnitAt(0) <= 122));
  
  // アルファベットを先に
  if (aIsAlpha && !bIsAlpha) return -1;
  if (!aIsAlpha && bIsAlpha) return 1;
  
  // 両方アルファベットの場合は通常の比較
  if (aIsAlpha && bIsAlpha) {
    return a.toUpperCase().compareTo(b.toUpperCase());
  }
  
  // 日本語は通常の比較（あいうえお順）
  return a.compareTo(b);
}

/// セクション付きリストビュー（StatefulWidget）
class _SectionedUserListView extends StatefulWidget {
  final Map<String, List<Map<String, dynamic>>> sections;
  final List<String> sectionKeys;
  final Widget Function(BuildContext, Map<String, dynamic>) itemBuilder;
  final ScrollController scrollController;

  const _SectionedUserListView({
    required this.sections,
    required this.sectionKeys,
    required this.itemBuilder,
    required this.scrollController,
  });

  @override
  State<_SectionedUserListView> createState() => _SectionedUserListViewState();
}

class _SectionedUserListViewState extends State<_SectionedUserListView> {
  
  @override
  Widget build(BuildContext context) {
    // セクションキーをソート
    final sortedKeys = List<String>.from(widget.sectionKeys);
    sortedKeys.sort(_compareSectionKeys);
    
    return CustomScrollView(
      controller: widget.scrollController,
      slivers: [
        for (final key in sortedKeys)
          ..._buildSectionSlivers(key, widget.sections[key]!),
      ],
    );
  }
  
  List<Widget> _buildSectionSlivers(
    String sectionKey,
    List<Map<String, dynamic>> users,
  ) {
    return [
      // セクションヘッダー
      SliverPersistentHeader(
        pinned: true,
        delegate: _SectionHeaderDelegate(
          sectionKey: sectionKey,
        ),
      ),
      // アイテムリスト
      SliverList(
        delegate: SliverChildBuilderDelegate(
          (context, index) {
            return widget.itemBuilder(context, users[index]);
          },
          childCount: users.length,
        ),
      ),
    ];
  }
}

/// ｀押下すると下記のエラーが出て処理が止まってしまいます。のデリゲート
class _SectionHeaderDelegate extends SliverPersistentHeaderDelegate {
  final String sectionKey;
  
  _SectionHeaderDelegate({required this.sectionKey});
  
  @override
  double get minExtent => 20; // 50%に変更（40 * 0.5 = 20）
  
  @override
  double get maxExtent => 20; // 50%に変更（40 * 0.5 = 20）
  
  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return Container(
      color: Colors.grey[200],
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4), // verticalも調整
      alignment: Alignment.centerLeft,
      child: Text(
        sectionKey,
        style: const TextStyle(
          fontSize: 9, // 50%に変更（18 * 0.5 = 9）
          fontWeight: FontWeight.bold,
          color: Colors.black87,
        ),
      ),
    );
  }
  
  @override
  bool shouldRebuild(_SectionHeaderDelegate oldDelegate) {
    return oldDelegate.sectionKey != sectionKey;
  }
}

