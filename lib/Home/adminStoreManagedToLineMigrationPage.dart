import 'dart:math';

import 'package:amuse_app_template/Home/home_list_load_errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/user/a6_callable_errors.dart';
import 'package:amuse_app_template/user/balance_display.dart';
import 'package:amuse_app_template/user/user_balances.dart';
import 'package:amuse_app_template/user/user_type_display.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

/// 管理者向け・店舗管理ユーザーから LINE ユーザーへのポイント移行画面。
/// Callable: `migrateStoreManagedUserToLine`
class AdminStoreManagedToLineMigrationPage extends StatefulWidget {
  const AdminStoreManagedToLineMigrationPage({super.key});

  @override
  State<AdminStoreManagedToLineMigrationPage> createState() =>
      _AdminStoreManagedToLineMigrationPageState();
}

class _AdminStoreManagedToLineMigrationPageState
    extends State<AdminStoreManagedToLineMigrationPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FunctionsClient.instance;
  final TextEditingController _sourceSearchController = TextEditingController();
  final TextEditingController _targetSearchController = TextEditingController();
  final TextEditingController _noteController = TextEditingController();
  final FocusNode _sourceFocusNode = FocusNode();
  final FocusNode _targetFocusNode = FocusNode();
  final _random = Random();

  bool _isLoading = false;
  bool _usersLoading = true;
  bool _samePersonConfirmed = false;
  String? _usersError;
  String _sourceSearchQuery = '';
  String _targetSearchQuery = '';
  int _reloadToken = 0;

  /// 検索欄フォーカス／入力中だけ候補を展開する。
  bool _sourcePickerOpen = false;
  bool _targetPickerOpen = false;

  List<_CandidateUser> _allUsers = const [];
  _CandidateUser? _selectedSource;
  _CandidateUser? _selectedTarget;

  @override
  void initState() {
    super.initState();
    _sourceFocusNode.addListener(_onSourceFocusChanged);
    _targetFocusNode.addListener(_onTargetFocusChanged);
    _loadUsers();
  }

  @override
  void dispose() {
    _sourceFocusNode.removeListener(_onSourceFocusChanged);
    _targetFocusNode.removeListener(_onTargetFocusChanged);
    _sourceFocusNode.dispose();
    _targetFocusNode.dispose();
    _sourceSearchController.dispose();
    _targetSearchController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  void _onSourceFocusChanged() {
    if (_sourceFocusNode.hasFocus) {
      setState(() {
        _sourcePickerOpen = true;
        _targetPickerOpen = false;
      });
      _targetFocusNode.unfocus();
    }
  }

  void _onTargetFocusChanged() {
    if (_targetFocusNode.hasFocus) {
      setState(() {
        _targetPickerOpen = true;
        _sourcePickerOpen = false;
      });
      _sourceFocusNode.unfocus();
    }
  }

  Future<void> _loadUsers() async {
    setState(() {
      _usersLoading = true;
      _usersError = null;
    });
    try {
      final snap = await _firestore.collection('users').get();
      if (!mounted) return;
      final list = snap.docs.map((d) {
        final data = d.data();
        return _CandidateUser(uid: d.id, data: data);
      }).toList()
        ..sort((a, b) {
          final an = (a.data['pokerName'] ?? '').toString();
          final bn = (b.data['pokerName'] ?? '').toString();
          final byName = an.compareTo(bn);
          if (byName != 0) return byName;
          return a.uid.compareTo(b.uid);
        });
      setState(() {
        _allUsers = list;
        _usersLoading = false;
        _reloadToken++;
        _refreshSelectionsFromList();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _usersLoading = false;
        _usersError = kHomeUsersListLoadFailedMessage;
      });
    }
  }

  void _refreshSelectionsFromList() {
    final source = _selectedSource;
    if (source != null) {
      final idx = _allUsers.indexWhere((u) => u.uid == source.uid);
      if (idx >= 0 && isEligibleMigrationSource(_allUsers[idx].data)) {
        _selectedSource = _allUsers[idx];
      } else {
        _selectedSource = null;
      }
    }
    final target = _selectedTarget;
    if (target != null) {
      final idx = _allUsers.indexWhere((u) => u.uid == target.uid);
      if (idx >= 0 && isEligibleMigrationTarget(_allUsers[idx].data)) {
        _selectedTarget = _allUsers[idx];
      } else {
        _selectedTarget = null;
      }
    }
  }

  List<_CandidateUser> get _filteredSources {
    return _filterCandidates(
      eligibility: isEligibleMigrationSource,
      searchQuery: _sourceSearchQuery,
    );
  }

  List<_CandidateUser> get _filteredTargets {
    return _filterCandidates(
      eligibility: isEligibleMigrationTarget,
      searchQuery: _targetSearchQuery,
    );
  }

  /// 適格性は現行どおり。検索は管理者ユーザー一覧と同じ pokerName 一致度順。
  List<_CandidateUser> _filterCandidates({
    required bool Function(Map<String, dynamic> data) eligibility,
    required String searchQuery,
  }) {
    final rows = _allUsers
        .where((u) => eligibility(u.data))
        .map(
          (u) => <String, dynamic>{
            ...u.data,
            'id': u.uid,
          },
        )
        .toList();
    // 適格性で既に絞っているため、移行済み除外トグルは検索 helper 側では無効化。
    final filtered = filterAdminUserListRows(
      rows: rows,
      searchQuery: searchQuery,
      showMigratedStoreManaged: true,
    );
    final byId = {for (final u in _allUsers) u.uid: u};
    return filtered
        .map((row) => byId[(row['id'] ?? '').toString()])
        .whereType<_CandidateUser>()
        .toList();
  }

  void _selectSource(_CandidateUser user) {
    if (_isLoading) return;
    setState(() {
      _selectedSource = user;
      if (_selectedTarget?.uid == user.uid) {
        _selectedTarget = null;
      }
      _samePersonConfirmed = false;
      _sourcePickerOpen = false;
      _sourceSearchQuery = '';
      _sourceSearchController.clear();
    });
    _sourceFocusNode.unfocus();
  }

  void _selectTarget(_CandidateUser user) {
    if (_isLoading) return;
    setState(() {
      _selectedTarget = user;
      if (_selectedSource?.uid == user.uid) {
        _selectedSource = null;
      }
      _samePersonConfirmed = false;
      _targetPickerOpen = false;
      _targetSearchQuery = '';
      _targetSearchController.clear();
    });
    _targetFocusNode.unfocus();
  }

  void _beginChangeSource() {
    if (_isLoading) return;
    setState(() {
      _selectedSource = null;
      _samePersonConfirmed = false;
      _sourcePickerOpen = true;
      _targetPickerOpen = false;
      _sourceSearchQuery = '';
      _sourceSearchController.clear();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _sourceFocusNode.requestFocus();
    });
  }

  void _beginChangeTarget() {
    if (_isLoading) return;
    setState(() {
      _selectedTarget = null;
      _samePersonConfirmed = false;
      _targetPickerOpen = true;
      _sourcePickerOpen = false;
      _targetSearchQuery = '';
      _targetSearchController.clear();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _targetFocusNode.requestFocus();
    });
  }

  String _newClientNonce() {
    final ms = DateTime.now().microsecondsSinceEpoch;
    final r = _random.nextInt(1 << 32);
    return 'migrate_${ms}_$r';
  }

  Future<void> _onMigratePressed() async {
    if (_isLoading) return;
    final source = _selectedSource;
    final target = _selectedTarget;
    if (source == null || target == null) {
      _showSnack('移行元と移行先の両方を選択してください', Colors.orange);
      return;
    }
    if (source.uid == target.uid) {
      _showSnack(kA6ErrorKeyMessages['INVALID_ARGUMENT']!, Colors.red);
      return;
    }
    if (!_samePersonConfirmed) {
      _showSnack('同一人物確認にチェックを入れてください', Colors.orange);
      return;
    }

    final enabledIds = enabledBalanceIdsFromStoreConfig();
    final sourceBalances = _readEnabledBalances(source.data, enabledIds);
    final targetBalances = _readEnabledBalances(target.data, enabledIds);
    final afterBalances = sourceBalances;

    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return AlertDialog(
          title: const Text('ポイントを上書きして移行します'),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  '移行先LINEユーザーの現在のポイントは、'
                  '移行元店舗管理ユーザーのポイントで上書きされます。',
                  style: TextStyle(
                    color: Colors.red,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  '※ データ上は有効・無効にかかわらず全標準残高がコピーされます。',
                  style: TextStyle(fontSize: 12),
                ),
                const SizedBox(height: 12),
                Text('移行元: ${displayOrUnset(source.data['pokerName'])}'),
                Text('移行先: ${displayOrUnset(target.data['pokerName'])}'),
                const SizedBox(height: 12),
                const Text('移行先の現在のポイント（有効分）',
                    style: TextStyle(fontWeight: FontWeight.bold)),
                for (final id in enabledIds)
                  Text(
                    '${balanceDisplayName(id)}: ${formatUserBalance(targetBalances[id])}',
                  ),
                const SizedBox(height: 8),
                const Text('↓', style: TextStyle(fontSize: 18)),
                const SizedBox(height: 8),
                const Text('移行後のポイント（有効分）',
                    style: TextStyle(fontWeight: FontWeight.bold)),
                for (final id in enabledIds)
                  Text(
                    '${balanceDisplayName(id)}: ${formatUserBalance(afterBalances[id])}',
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('キャンセル'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              style: TextButton.styleFrom(foregroundColor: Colors.red),
              child: const Text('上書きして移行'),
            ),
          ],
        );
      },
    );

    if (confirmed != true || !mounted) return;
    await _submit(
      sourceUserId: source.uid,
      targetUserId: target.uid,
    );
  }

  Future<void> _submit({
    required String sourceUserId,
    required String targetUserId,
  }) async {
    setState(() => _isLoading = true);
    final note = _noteController.text.trim();
    String? successMessage;
    String? errorMessage;
    try {
      final callable = _functions.httpsCallable('migrateStoreManagedUserToLine');
      final result = await callable.call({
        'sourceUserId': sourceUserId,
        'targetUserId': targetUserId,
        if (note.isNotEmpty) 'note': note,
        'clientNonce': _newClientNonce(),
        'confirmSamePerson': true,
        'confirmOverwrite': true,
      });

      final data = result.data;
      final reused = data is Map && data['reused'] == true;
      successMessage = reused
          ? '移行が完了しました（冪等・再送）'
          : '移行が完了しました。店舗管理ユーザーは移行済みになりました。';
      await _loadUsers();
      if (mounted) {
        setState(() {
          _samePersonConfirmed = false;
          _noteController.clear();
          _sourcePickerOpen = false;
          _targetPickerOpen = false;
        });
      }
    } catch (e) {
      errorMessage = formatA6CallableError(e);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
    if (!mounted) return;
    if (successMessage != null) {
      _showSnack(successMessage, Colors.green);
    } else if (errorMessage != null) {
      _showSnack(errorMessage, Colors.red);
    }
  }

  void _showSnack(String message, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: color),
    );
  }

  Map<String, int> _readEnabledBalances(
    Map<String, dynamic> data,
    List<String> enabledIds,
  ) {
    final out = <String, int>{};
    for (final id in enabledIds) {
      final result = readBalanceField(data, id);
      out[id] = result.displayValue ?? 0;
    }
    return out;
  }

  bool get _canExecute {
    if (_isLoading) return false;
    if (_selectedSource == null || _selectedTarget == null) return false;
    if (_selectedSource!.uid == _selectedTarget!.uid) return false;
    return _samePersonConfirmed;
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isLoading,
      child: Stack(
        children: [
          Scaffold(
            appBar: AppBar(
              title: const Text('店舗管理→LINE移行'),
              backgroundColor: Colors.deepPurple,
              foregroundColor: Colors.white,
            ),
            body: _buildBody(),
          ),
          if (_isLoading)
            Positioned.fill(
              child: AbsorbPointer(
                child: ColoredBox(
                  color: Colors.black.withValues(alpha: 0.35),
                  child: const Center(child: CircularProgressIndicator()),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_usersLoading && _allUsers.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_usersError != null && _allUsers.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('ユーザー取得に失敗しました\n$_usersError', textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton(onPressed: _loadUsers, child: const Text('再試行')),
            ],
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _buildIntroCard(),
        const SizedBox(height: 20),
        _buildUserPickerSection(
          title: '移行元の店舗管理ユーザー',
          searchHint: 'ユーザーネームで検索',
          searchController: _sourceSearchController,
          searchFocusNode: _sourceFocusNode,
          searchQuery: _sourceSearchQuery,
          pickerOpen: _sourcePickerOpen,
          selected: _selectedSource,
          users: _filteredSources,
          emptyMessage: '移行元候補がいません',
          onSearchChanged: (v) {
            setState(() {
              _sourceSearchQuery = v;
              _sourcePickerOpen = true;
              _targetPickerOpen = false;
            });
          },
          onSelect: _selectSource,
          onChangePressed: _beginChangeSource,
        ),
        const SizedBox(height: 20),
        _buildUserPickerSection(
          title: '移行先のLINEユーザー',
          searchHint: 'ユーザーネームで検索',
          searchController: _targetSearchController,
          searchFocusNode: _targetFocusNode,
          searchQuery: _targetSearchQuery,
          pickerOpen: _targetPickerOpen,
          selected: _selectedTarget,
          users: _filteredTargets,
          emptyMessage: '移行先候補がいません',
          onSearchChanged: (v) {
            setState(() {
              _targetSearchQuery = v;
              _targetPickerOpen = true;
              _sourcePickerOpen = false;
            });
          },
          onSelect: _selectTarget,
          onChangePressed: _beginChangeTarget,
        ),
        if (_selectedSource != null &&
            _selectedTarget == null) ...[
          const SizedBox(height: 16),
          const Text(
            '移行元と移行先の両方を選択してください',
            style: TextStyle(fontSize: 13, color: Colors.black54),
          ),
        ],
        if (_selectedSource == null &&
            _selectedTarget != null) ...[
          const SizedBox(height: 16),
          const Text(
            '移行元と移行先の両方を選択してください',
            style: TextStyle(fontSize: 13, color: Colors.black54),
          ),
        ],
        if (_selectedSource != null && _selectedTarget != null) ...[
          const SizedBox(height: 16),
          _buildComparisonCard(),
        ],
        const SizedBox(height: 16),
        TextFormField(
          controller: _noteController,
          enabled: !_isLoading,
          maxLength: 200,
          decoration: const InputDecoration(
            labelText: 'メモ（任意）',
            border: OutlineInputBorder(),
          ),
        ),
        CheckboxListTile(
          value: _samePersonConfirmed,
          onChanged: (_isLoading ||
                  _selectedSource == null ||
                  _selectedTarget == null)
              ? null
              : (v) => setState(() => _samePersonConfirmed = v ?? false),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          title: const Text('この2名が同一人物であることを確認しました。'),
        ),
        const SizedBox(height: 8),
        ElevatedButton(
          onPressed: _canExecute ? _onMigratePressed : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.deepPurple,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(48),
          ),
          child: const Text('ポイント移行を実行'),
        ),
      ],
    );
  }

  Widget _buildIntroCard() {
    return Card(
      color: Colors.deepPurple.withValues(alpha: 0.04),
      elevation: 0,
      child: const Padding(
        padding: EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '店舗管理ユーザーのポイントおよび必要データを、本人が作成したLINEユーザーへ移行します。',
              style: TextStyle(fontSize: 14, height: 1.4),
            ),
            SizedBox(height: 12),
            Text(
              '操作手順',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
            ),
            SizedBox(height: 6),
            Text('1. 移行元の店舗管理ユーザーを選択します', style: TextStyle(fontSize: 13)),
            Text('2. 移行先のLINEユーザーを選択します', style: TextStyle(fontSize: 13)),
            Text('3. 表示された内容を確認して移行を実行します', style: TextStyle(fontSize: 13)),
          ],
        ),
      ),
    );
  }

  Widget _buildUserPickerSection({
    required String title,
    required String searchHint,
    required TextEditingController searchController,
    required FocusNode searchFocusNode,
    required String searchQuery,
    required bool pickerOpen,
    required _CandidateUser? selected,
    required List<_CandidateUser> users,
    required String emptyMessage,
    required ValueChanged<String> onSearchChanged,
    required ValueChanged<_CandidateUser> onSelect,
    required VoidCallback onChangePressed,
  }) {
    final showSearch = selected == null;
    final showCandidates = showSearch && pickerOpen;
    final searchEmpty = searchQuery.trim().isNotEmpty && users.isEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        if (selected != null)
          Card(
            margin: EdgeInsets.zero,
            elevation: 4,
            color: Colors.deepPurple.withValues(alpha: 0.08),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(4),
              side: const BorderSide(color: Colors.deepPurple, width: 2),
            ),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: Colors.blue[100],
                child: Icon(Icons.person, color: Colors.blue[600]),
              ),
              title: Text(
                displayOrUnset(selected.data['pokerName']),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              trailing: TextButton(
                onPressed: _isLoading ? null : onChangePressed,
                child: const Text('変更'),
              ),
              onTap: _isLoading ? null : onChangePressed,
            ),
          )
        else ...[
          TextField(
            controller: searchController,
            focusNode: searchFocusNode,
            enabled: !_isLoading,
            decoration: InputDecoration(
              hintText: searchHint,
              prefixIcon: const Icon(Icons.search),
              border: const OutlineInputBorder(),
              isDense: true,
            ),
            onTap: () {
              setState(() {
                if (identical(searchFocusNode, _sourceFocusNode)) {
                  _sourcePickerOpen = true;
                  _targetPickerOpen = false;
                } else {
                  _targetPickerOpen = true;
                  _sourcePickerOpen = false;
                }
              });
            },
            onChanged: onSearchChanged,
          ),
          if (showCandidates) ...[
            const SizedBox(height: 8),
            if (users.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  searchEmpty ? '検索条件に一致するユーザーがいません' : emptyMessage,
                  style: const TextStyle(color: Colors.black54),
                ),
              )
            else
              ListView.builder(
                key: ValueKey('${title}_$_reloadToken'),
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: users.length,
                itemBuilder: (context, index) {
                  final u = users[index];
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
                      title: Text(
                        displayOrUnset(u.data['pokerName']),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      onTap: _isLoading ? null : () => onSelect(u),
                    ),
                  );
                },
              ),
          ],
        ],
      ],
    );
  }

  Widget _buildComparisonCard() {
    final source = _selectedSource!;
    final target = _selectedTarget!;
    final enabledIds = enabledBalanceIdsFromStoreConfig();
    final sourceBalances = _readEnabledBalances(source.data, enabledIds);
    final targetBalances = _readEnabledBalances(target.data, enabledIds);
    final afterBalances = sourceBalances;

    Widget balanceRows(
      Map<String, int> balances, {
      bool highlightDiff = false,
    }) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final id in enabledIds)
            _balanceRow(
              id,
              balances[id] ?? 0,
              highlightDiff:
                  highlightDiff && (balances[id] ?? 0) != (targetBalances[id] ?? 0),
            ),
        ],
      );
    }

    final hasDiff = enabledIds.any(
      (id) => (targetBalances[id] ?? 0) != (afterBalances[id] ?? 0),
    );

    return Card(
      color: Colors.deepPurple.withValues(alpha: 0.04),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('比較', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            Text(
              '移行元: ${displayOrUnset(source.data['pokerName'])}',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            const Text('移行元のポイント（有効分）',
                style: TextStyle(fontWeight: FontWeight.w600)),
            if (enabledIds.isEmpty)
              const Text('表示可能な有効ポイントがありません')
            else
              balanceRows(sourceBalances),
            const SizedBox(height: 12),
            const Center(child: Text('↓', style: TextStyle(fontSize: 20))),
            const SizedBox(height: 12),
            Text(
              '移行先: ${displayOrUnset(target.data['pokerName'])}',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            const Text('移行先の現在のポイント（有効分）',
                style: TextStyle(fontWeight: FontWeight.w600)),
            if (enabledIds.isEmpty)
              const Text('表示可能な有効ポイントがありません')
            else
              balanceRows(targetBalances),
            const SizedBox(height: 12),
            const Center(child: Text('↓', style: TextStyle(fontSize: 20))),
            const SizedBox(height: 12),
            const Text('移行後のポイント（有効分）',
                style: TextStyle(fontWeight: FontWeight.bold)),
            if (enabledIds.isEmpty)
              const Text('表示可能な有効ポイントがありません')
            else
              balanceRows(afterBalances, highlightDiff: true),
            if (hasDiff)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  '※ 太字は移行先の現在のポイントから変わる項目です',
                  style: TextStyle(fontSize: 12, color: Colors.red),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _balanceRow(String key, int value, {bool highlightDiff = false}) {
    final style = highlightDiff
        ? const TextStyle(fontWeight: FontWeight.bold, color: Colors.red)
        : null;
    final label = balanceDisplayName(key);
    return Text('$label: ${formatUserBalance(value)}', style: style);
  }
}

class _CandidateUser {
  const _CandidateUser({required this.uid, required this.data});

  final String uid;
  final Map<String, dynamic> data;
}
