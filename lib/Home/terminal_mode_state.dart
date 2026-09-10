import 'package:flutter/material.dart';

/// Admin デバイスの Terminal モード状態をアプリ全体で共有するグローバル状態。
///
/// - [terminalModeNotifier] : admin デバイスが Terminal モード中かどうか。
///   AdminHomePage の initState / _toggleMode / dispose で更新する。
///
/// - [isOnHomeScreenNotifier] : AdminHomePage が Navigator の最前面にあるかどうか。
///   AdminHomePage が RouteAware で更新する。
///   バナーのモード切り替えボタンの有効/無効に使用。
///
/// - [appRouteObserver] : Navigator のルート変化を監視するオブザーバー。
///   MaterialApp の navigatorObservers に登録する。

/// Admin デバイスが Terminal モード中かどうか
final ValueNotifier<bool> terminalModeNotifier = ValueNotifier<bool>(false);

/// AdminHomePage が最前面（サブページへの遷移がない）かどうか
final ValueNotifier<bool> isOnHomeScreenNotifier = ValueNotifier<bool>(true);

/// ルート変化を全体で監視するオブザーバー
/// MaterialApp の navigatorObservers に追加する
final RouteObserver<ModalRoute<void>> appRouteObserver =
    RouteObserver<ModalRoute<void>>();
