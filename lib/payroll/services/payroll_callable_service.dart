// Callable 呼び出しを一元管理するサービス
//
// 参照: 04_CALLABLE_API_SPEC §2,3,6,7

import 'package:cloud_functions/cloud_functions.dart';

class PayrollCallableService {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

  Future<Map<String, dynamic>> getPayrollCandidates(
    String paymentPeriodKey,
  ) async {
    final callable = _functions.httpsCallable('getPayrollCandidates');
    final result = await callable.call<Map<String, dynamic>>({
      'paymentPeriodKey': paymentPeriodKey,
    });
    return Map<String, dynamic>.from(result.data);
  }

  Future<Map<String, dynamic>> executeMonthlyPayroll({
    required String paymentPeriodKey,
    required List<String> attendanceIds,
    String? deviceId,
  }) async {
    final callable = _functions.httpsCallable('executeMonthlyPayroll');
    final result = await callable.call<Map<String, dynamic>>({
      'paymentPeriodKey': paymentPeriodKey,
      'attendanceIds': attendanceIds,
      if (deviceId != null) 'deviceId': deviceId,
    });
    return Map<String, dynamic>.from(result.data);
  }

  Future<Map<String, dynamic>> retryFailedStaffTasks(
    String paymentPeriodKey,
    String runId,
  ) async {
    final callable = _functions.httpsCallable('retryFailedStaffTasks');
    final result = await callable.call<Map<String, dynamic>>({
      'paymentPeriodKey': paymentPeriodKey,
      'runId': runId,
    });
    return Map<String, dynamic>.from(result.data);
  }

  Future<Map<String, dynamic>> cancelPayrollRun(
    String paymentPeriodKey,
    String runId,
  ) async {
    final callable = _functions.httpsCallable('cancelPayrollRun');
    final result = await callable.call<Map<String, dynamic>>({
      'paymentPeriodKey': paymentPeriodKey,
      'runId': runId,
    });
    return Map<String, dynamic>.from(result.data);
  }

  Future<Map<String, dynamic>> confirmPayrollRun({
    required String paymentPeriodKey,
    String? runId,
  }) async {
    final callable = _functions.httpsCallable('confirmPayrollRun');
    final result = await callable.call<Map<String, dynamic>>({
      'paymentPeriodKey': paymentPeriodKey,
      if (runId != null) 'runId': runId,
    });
    return Map<String, dynamic>.from(result.data);
  }

  Future<Map<String, dynamic>> registerPaymentStatus({
    required String paymentPeriodKey,
    required List<Map<String, String>> entries,
  }) async {
    final callable = _functions.httpsCallable('registerPaymentStatus');
    final result = await callable.call<Map<String, dynamic>>({
      'paymentPeriodKey': paymentPeriodKey,
      'entries': entries,
    });
    return Map<String, dynamic>.from(result.data);
  }
}
