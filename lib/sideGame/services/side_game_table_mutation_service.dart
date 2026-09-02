import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/sideGame/side_game_user_facing_errors.dart';
import 'package:cloud_functions/cloud_functions.dart';

class SideGameTableMutationService {
  SideGameTableMutationService({FirebaseFunctions? functions})
      : _functions = functions ?? FunctionsClient.instance;

  final FirebaseFunctions _functions;

  Future<void> registerTableToSideGame({
    required String tableId,
    required String gameName,
    bool allowOverride = false,
  }) async {
    final callable = _functions.httpsCallable('registerTableToSideGame');
    final result = await callable.call({
      'tableId': tableId,
      'gameName': gameName,
      'allowOverride': allowOverride,
    });
    if (!isCallableSuccessResponse(result.data)) {
      throw SideGameCallableSoftFail(result.data);
    }
  }

  Future<void> endSideGameSession({required String tableId}) async {
    final callable = _functions.httpsCallable('endSideGameSession');
    final result = await callable.call({'tableId': tableId});
    if (!isCallableSuccessResponse(result.data)) {
      throw SideGameCallableSoftFail(result.data);
    }
  }

  Future<void> changeSideGameTableGameName({
    required String tableId,
    required String gameName,
  }) async {
    final callable = _functions.httpsCallable('changeSideGameTableGameName');
    final result = await callable.call({
      'tableId': tableId,
      'gameName': gameName,
    });
    if (!isCallableSuccessResponse(result.data)) {
      throw SideGameCallableSoftFail(result.data);
    }
  }
}
