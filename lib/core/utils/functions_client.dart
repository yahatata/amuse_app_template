import 'package:cloud_functions/cloud_functions.dart';

class FunctionsClient {
  FunctionsClient._();

  static const String region = 'asia-northeast1';
  static final FirebaseFunctions instance =
      FirebaseFunctions.instanceFor(region: region);
}
