import 'package:amuse_app_template/core/utils/functions_client.dart';
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
    await callable.call({
      'tableId': tableId,
      'gameName': gameName,
      'allowOverride': allowOverride,
    });
  }

  Future<void> endSideGameSession({required String tableId}) async {
    final callable = _functions.httpsCallable('endSideGameSession');
    await callable.call({'tableId': tableId});
  }

  Future<void> changeSideGameTableGameName({
    required String tableId,
    required String gameName,
  }) async {
    final callable = _functions.httpsCallable('changeSideGameTableGameName');
    await callable.call({
      'tableId': tableId,
      'gameName': gameName,
    });
  }
}
